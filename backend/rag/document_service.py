from __future__ import annotations

import logging
from typing import Any

import backend.rag.vector_store as vector_store_service

from backend.rag.database import (
    StoredDocument,
    delete_document_record,
    get_document,
)


logger = logging.getLogger(__name__)


class DocumentDeletionError(RuntimeError):
    """Raised when coordinated document deletion cannot complete safely."""


def _capture_vector_snapshot(
    document_id: int,
) -> tuple[Any, dict[str, Any]]:
    vector_store = vector_store_service.get_vector_store()

    try:
        snapshot = vector_store.get(
            where={
                "document_id": document_id,
            },
            include=[
                "documents",
                "metadatas",
            ],
        )

    except TypeError:
        # Minimal test/local adapters may not implement Chroma's optional
        # include argument. Successful deletion still remains supported.
        snapshot = vector_store.get(
            where={
                "document_id": document_id,
            }
        )

    return vector_store, snapshot


def _restore_vector_snapshot(
    vector_store: Any,
    snapshot: dict[str, Any],
) -> None:
    raw_ids = snapshot.get("ids") or []

    if not raw_ids:
        return

    raw_documents = snapshot.get("documents") or []
    raw_metadatas = snapshot.get("metadatas") or []

    if (
        len(raw_ids) != len(raw_documents)
        or len(raw_ids) != len(raw_metadatas)
    ):
        raise RuntimeError(
            "The document vector snapshot is incomplete."
        )

    ids = [str(vector_id) for vector_id in raw_ids]
    texts = [str(document) for document in raw_documents]
    metadatas = [
        dict(metadata) if metadata is not None else {}
        for metadata in raw_metadatas
    ]

    vector_store.add_texts(
        texts=texts,
        metadatas=metadatas,
        ids=ids,
    )


def delete_document(
    document_id: int,
) -> StoredDocument:
    """Delete SQLite and Chroma state with compensating vector restore."""
    if (
        not isinstance(document_id, int)
        or isinstance(document_id, bool)
        or document_id <= 0
    ):
        raise ValueError(
            "Document ID must be a positive integer."
        )

    document = get_document(document_id)

    if document is None:
        raise ValueError(
            f"Document ID {document_id} does not exist."
        )

    vector_store, vector_snapshot = _capture_vector_snapshot(
        document_id
    )

    # Keep SQLite as the source of truth when vector deletion fails.
    try:
        vector_store_service.delete_document_vectors(
            document_id
        )

    except Exception as vector_deletion_error:
        try:
            _restore_vector_snapshot(
                vector_store,
                vector_snapshot,
            )

        except Exception as restoration_error:
            logger.error(
                "Vector deletion and compensation failed (%s, %s).",
                type(vector_deletion_error).__name__,
                type(restoration_error).__name__,
            )

            raise DocumentDeletionError(
                "Document vector deletion failed and the previous "
                "index could not be restored."
            ) from vector_deletion_error

        raise DocumentDeletionError(
            "Document vector deletion failed; SQLite was retained "
            "and the previous vector index was restored."
        ) from vector_deletion_error

    try:
        deleted = delete_document_record(document_id)

    except Exception as deletion_error:
        try:
            _restore_vector_snapshot(
                vector_store,
                vector_snapshot,
            )

        except Exception as restoration_error:
            logger.error(
                "Document deletion and vector compensation failed "
                "(%s, %s).",
                type(deletion_error).__name__,
                type(restoration_error).__name__,
            )

            raise DocumentDeletionError(
                "Document deletion failed and its vector index "
                "could not be restored."
            ) from deletion_error

        raise DocumentDeletionError(
            "Document deletion failed; its vector index was restored."
        ) from deletion_error

    if not deleted:
        # Another local request completed the record deletion after the
        # initial existence check. Vector deletion is already idempotent.
        logger.info(
            "Document record was already absent during deletion."
        )

    return document
