from __future__ import annotations

import hashlib
from io import BytesIO
import logging
from pathlib import Path
import sqlite3
import unicodedata
from zipfile import BadZipFile, ZipFile

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from backend.rag.config import (
    CHUNK_OVERLAP,
    CHUNK_SIZE,
    MAX_UPLOAD_BYTES,
)
from backend.rag.database import (
    delete_document_record_if_exists,
    find_document_by_hash,
    get_document_file_data,
    insert_document,
    update_chunk_count,
)
from backend.rag.loaders import (
    SUPPORTED_EXTENSIONS,
    get_mime_type,
    load_documents_from_bytes,
    validate_file_path,
)
from backend.rag.vector_store import (
    delete_document_vectors,
    get_vector_store,
)


_WINDOWS_RESERVED_FILENAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{number}" for number in range(1, 10)),
    *(f"LPT{number}" for number in range(1, 10)),
}

logger = logging.getLogger(__name__)


def sanitize_filename(filename: str) -> str:
    """Return a safe leaf filename or reject ambiguous path input."""
    if not isinstance(filename, str):
        raise TypeError("Filename must be a string.")

    cleaned = unicodedata.normalize("NFC", filename).strip()

    if not cleaned:
        raise ValueError("Filename cannot be empty.")

    if len(cleaned) > 255:
        raise ValueError("Filename cannot exceed 255 characters.")

    if cleaned in {".", ".."}:
        raise ValueError("Filename must identify a file.")

    if any(
        character in cleaned
        for character in {"/", "\\", ":"}
    ):
        raise ValueError(
            "Filename must not contain path separators or a drive."
        )

    if cleaned.endswith((".", " ")):
        raise ValueError(
            "Filename must not end with a dot or space."
        )

    if any(
        ord(character) < 32 or ord(character) == 127
        for character in cleaned
    ):
        raise ValueError(
            "Filename contains unsupported control characters."
        )

    device_name = cleaned.split(".", maxsplit=1)[0].upper()

    if device_name in _WINDOWS_RESERVED_FILENAMES:
        raise ValueError("Filename is reserved by the operating system.")

    suffix = Path(cleaned).suffix.lower()

    if suffix not in SUPPORTED_EXTENSIONS:
        supported = ", ".join(sorted(SUPPORTED_EXTENSIONS))
        raise ValueError(
            f"Unsupported file type: {suffix or 'none'}. "
            f"Supported types: {supported}"
        )

    return cleaned


def validate_file_content(
    filename: str,
    file_data: bytes,
) -> None:
    """Check that content agrees with its supported file extension."""
    suffix = Path(filename).suffix.lower()

    if suffix == ".pdf":
        if b"%PDF-" not in file_data[:1024]:
            raise ValueError(
                "The uploaded file is not a valid PDF document."
            )

        return

    if suffix == ".pptx":
        if file_data.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
            raise ValueError(
                "Legacy .ppt and protected PowerPoint files are not "
                "supported. Upload an unprotected .pptx file."
            )

        try:
            with ZipFile(BytesIO(file_data)) as archive:
                member_names = set(archive.namelist())

        except BadZipFile as error:
            raise ValueError(
                "The uploaded file is not a valid .pptx presentation."
            ) from error

        required_members = {
            "[Content_Types].xml",
            "ppt/presentation.xml",
        }

        if not required_members.issubset(member_names):
            raise ValueError(
                "The uploaded archive is not a valid .pptx "
                "presentation."
            )

        return

    if suffix == ".txt":
        starts_with_unicode_bom = file_data.startswith(
            (
                b"\xff\xfe",
                b"\xfe\xff",
                b"\xef\xbb\xbf",
            )
        )

        if b"\x00" in file_data[:8192] and not starts_with_unicode_bom:
            raise ValueError(
                "The uploaded .txt file appears to contain binary data."
            )

        return

    raise ValueError("The uploaded file type is not supported.")


def calculate_sha256(file_data: bytes) -> str:
    return hashlib.sha256(file_data).hexdigest()


def create_text_splitter() -> RecursiveCharacterTextSplitter:
    return RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=[
            "\n\n",
            "\n",
            ". ",
            " ",
            "",
        ],
        length_function=len,
        add_start_index=True,
    )


def clean_metadata(
    metadata: dict,
) -> dict[str, str | int | float | bool]:
    cleaned: dict[str, str | int | float | bool] = {}

    for key, value in metadata.items():
        if isinstance(value, (str, int, float, bool)):
            cleaned[str(key)] = value

    return cleaned


def prepare_chunks(
    documents: list[Document],
    document_id: int,
    filename: str,
    mime_type: str | None = None,
) -> list[Document]:
    splitter = create_text_splitter()
    split_chunks = splitter.split_documents(documents)

    prepared_chunks: list[Document] = []

    resolved_mime_type = mime_type or get_mime_type(
        Path(filename)
    )

    for chunk in split_chunks:
        text = chunk.page_content.strip()

        if not text:
            continue

        raw_page = chunk.metadata.get("page")
        raw_slide = chunk.metadata.get("slide_number")

        metadata = clean_metadata(
            dict(chunk.metadata)
        )

        for private_or_location_key in {
            "source",
            "page",
            "page_number",
            "slide_number",
            "document_id",
            "mime_type",
            "chunk_index",
        }:
            metadata.pop(
                private_or_location_key,
                None,
            )

        metadata.update(
            {
                "document_id": document_id,
                "filename": filename,
                "mime_type": resolved_mime_type,
                "chunk_index": len(prepared_chunks),
            }
        )

        if (
            isinstance(raw_slide, int)
            and not isinstance(raw_slide, bool)
            and raw_slide > 0
        ):
            metadata["slide_number"] = raw_slide

        elif (
            isinstance(raw_page, int)
            and not isinstance(raw_page, bool)
        ):
            metadata["page_number"] = raw_page + 1

        prepared_chunks.append(
            Document(
                page_content=text,
                metadata=metadata,
            )
        )

    return prepared_chunks


def create_chunk_ids(
    document_id: int,
    chunks: list[Document],
) -> list[str]:
    return [
        f"document-{document_id}-chunk-{index}"
        for index in range(len(chunks))
    ]


def index_file(
    file_path_string: str,
    *,
    max_bytes: int = MAX_UPLOAD_BYTES,
) -> dict[str, str | int]:
    if max_bytes <= 0:
        raise ValueError("Maximum upload size must be greater than zero.")

    if not file_path_string.strip():
        raise ValueError("File path cannot be empty.")

    file_path = Path(
        file_path_string.strip().strip('"').strip("'")
    ).expanduser().resolve()

    validate_file_path(file_path)

    try:
        file_size = file_path.stat().st_size
    except OSError as error:
        raise RuntimeError(
            "Could not inspect the selected file."
        ) from error

    if file_size > max_bytes:
        raise ValueError(
            f"The selected file exceeds the {max_bytes} byte limit."
        )

    try:
        file_data = file_path.read_bytes()
    except OSError as error:
        raise RuntimeError(
            "Could not read the selected file."
        ) from error

    return index_file_bytes(
        filename=file_path.name,
        file_data=file_data,
        max_bytes=max_bytes,
    )


def index_file_bytes(
    filename: str,
    file_data: bytes,
    max_bytes: int = MAX_UPLOAD_BYTES,
) -> dict[str, str | int]:
    """Validate, store, parse, chunk, and index an uploaded file."""
    if max_bytes <= 0:
        raise ValueError("Maximum upload size must be greater than zero.")

    if not isinstance(file_data, bytes):
        raise TypeError("File data must be bytes.")

    safe_filename = sanitize_filename(filename)

    if not file_data:
        raise ValueError("The uploaded file is empty.")

    if len(file_data) > max_bytes:
        raise ValueError(
            f"The uploaded file exceeds the {max_bytes} byte limit."
        )

    validate_file_content(
        filename=safe_filename,
        file_data=file_data,
    )

    file_hash = calculate_sha256(file_data)

    existing_document = find_document_by_hash(file_hash)

    if existing_document is not None:
        return {
            "status": "duplicate",
            "document_id": existing_document.id,
            "filename": existing_document.filename,
            "mime_type": existing_document.mime_type,
            "chunk_count": existing_document.chunk_count,
        }

    mime_type = get_mime_type(
        Path(safe_filename)
    )

    try:
        document_id = insert_document(
            filename=safe_filename,
            mime_type=mime_type,
            file_hash=file_hash,
            file_data=file_data,
        )

    except sqlite3.IntegrityError:
        concurrent_document = find_document_by_hash(
            file_hash
        )

        if concurrent_document is None:
            raise

        return {
            "status": "duplicate",
            "document_id": concurrent_document.id,
            "filename": concurrent_document.filename,
            "mime_type": concurrent_document.mime_type,
            "chunk_count": concurrent_document.chunk_count,
        }

    try:
        stored_filename, stored_file_data = (
            get_document_file_data(document_id)
        )

        loaded_documents = load_documents_from_bytes(
            filename=stored_filename,
            file_data=stored_file_data,
        )

        if not loaded_documents:
            raise ValueError(
                "No readable content was extracted from the file."
            )

        chunks = prepare_chunks(
            documents=loaded_documents,
            document_id=document_id,
            filename=stored_filename,
            mime_type=mime_type,
        )

        if not chunks:
            raise ValueError(
                "The document produced no usable text chunks."
            )

        chunk_ids = create_chunk_ids(
            document_id=document_id,
            chunks=chunks,
        )

        vector_store = get_vector_store()

        vector_store.add_documents(
            documents=chunks,
            ids=chunk_ids,
        )

        update_chunk_count(
            document_id=document_id,
            chunk_count=len(chunks),
        )

        return {
            "status": "indexed",
            "document_id": document_id,
            "filename": stored_filename,
            "mime_type": mime_type,
            "pages": len(loaded_documents),
            "chunk_count": len(chunks),
        }

    except Exception:
        try:
            delete_document_vectors(document_id)
        except Exception as cleanup_error:
            logger.warning(
                "Failed to remove partial document vectors "
                "during ingestion rollback (%s).",
                type(cleanup_error).__name__,
            )

        delete_document_record_if_exists(document_id)
        raise
