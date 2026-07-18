from __future__ import annotations

from backend.rag.scope import ResolvedRetrievalScope


def source_matches_scope(
    *,
    document_id: int | None,
    chunk_index: int | None,
    resolved_scope: ResolvedRetrievalScope | None,
) -> bool:
    """Return whether one persisted lineage row belongs to a scope."""
    if resolved_scope is None or resolved_scope.is_global:
        return True

    if resolved_scope.is_empty or document_id is None:
        return False

    if resolved_scope.kind == "topic":
        return (
            chunk_index is not None
            and (document_id, chunk_index) in resolved_scope.source_pairs
        )

    return document_id in resolved_scope.document_ids
