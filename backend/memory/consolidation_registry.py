from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from threading import RLock
from uuid import UUID, uuid4

from backend.memory.consolidator import (
    MemoryConsolidationProposal,
    propose_memory_consolidation,
)
from backend.memory.service import (
    MemoryConsolidationResult,
    apply_memory_consolidation,
)


MAX_PENDING_MEMORY_CONSOLIDATIONS = 128


class MemoryConsolidationNotFoundError(LookupError):
    """Raised when an ephemeral consolidation proposal is absent."""


@dataclass(frozen=True)
class PendingMemoryConsolidation:
    id: str
    proposal: MemoryConsolidationProposal
    created_at: str


_pending_consolidations: dict[
    str,
    PendingMemoryConsolidation,
] = {}
_consolidation_lock = RLock()


def create_memory_consolidation(
    memory_ids: list[int],
) -> PendingMemoryConsolidation:
    """Generate and retain a server-authoritative proposal snapshot."""
    proposal = propose_memory_consolidation(
        memory_ids
    )
    pending = PendingMemoryConsolidation(
        id=str(uuid4()),
        proposal=proposal,
        created_at=datetime.now(timezone.utc).isoformat(),
    )

    with _consolidation_lock:
        while (
            len(_pending_consolidations)
            >= MAX_PENDING_MEMORY_CONSOLIDATIONS
        ):
            oldest_id = next(iter(_pending_consolidations))
            del _pending_consolidations[oldest_id]
        _pending_consolidations[pending.id] = pending

    return pending


def get_memory_consolidation(
    proposal_id: str,
) -> PendingMemoryConsolidation | None:
    normalized_id = _normalize_proposal_id(proposal_id)

    with _consolidation_lock:
        return _pending_consolidations.get(normalized_id)


def apply_pending_memory_consolidation(
    proposal_id: str,
) -> MemoryConsolidationResult:
    """Apply the registry snapshot and consume it only on success."""
    normalized_id = _normalize_proposal_id(proposal_id)

    with _consolidation_lock:
        pending = _pending_consolidations.get(normalized_id)

        if pending is None:
            raise MemoryConsolidationNotFoundError(
                "The consolidation proposal does not exist or was "
                "already consumed."
            )

        result = apply_memory_consolidation(
            pending.proposal
        )
        del _pending_consolidations[pending.id]
        return result


def clear_memory_consolidations() -> None:
    """Clear ephemeral state, primarily for isolated tests."""
    with _consolidation_lock:
        _pending_consolidations.clear()


def _normalize_proposal_id(proposal_id: str) -> str:
    try:
        return str(UUID(proposal_id))
    except (ValueError, AttributeError, TypeError) as error:
        raise MemoryConsolidationNotFoundError(
            "The consolidation proposal does not exist or was "
            "already consumed."
        ) from error
