from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from langchain_chroma import Chroma

from backend.rag.config import (
    MEMORY_CHROMA_COLLECTION,
    MEMORY_CHROMA_PATH,
)
from backend.rag.vector_store import get_embedding_model
from backend.rag.vector_store import probe_chroma_store


@lru_cache(maxsize=1)
def get_memory_vector_store() -> "Chroma":
    from langchain_chroma import Chroma

    return Chroma(
        collection_name=MEMORY_CHROMA_COLLECTION,
        embedding_function=get_embedding_model(),
        persist_directory=str(MEMORY_CHROMA_PATH),
    )


def make_memory_vector_id(memory_id: int) -> str:
    return f"memory-{memory_id}"


def delete_memory_vector(memory_id: int) -> None:
    vector_store = get_memory_vector_store()

    vector_store.delete(
        ids=[make_memory_vector_id(memory_id)]
    )


def probe_memory_vector_store() -> dict[str, Any]:
    """Verify memory Chroma persistence without embeddings."""
    return probe_chroma_store(
        MEMORY_CHROMA_PATH,
        MEMORY_CHROMA_COLLECTION,
    )
