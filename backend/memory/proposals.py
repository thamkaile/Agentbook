from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from threading import RLock
from typing import Literal
from uuid import UUID, uuid4

from backend.memory.conflict_detector import (
    MemoryConflictResult,
    detect_memory_conflict,
)
from backend.memory.database import StoredMemory, get_memory
from backend.memory.extractor import propose_memory_candidate
from backend.memory.models import MemoryCandidate
from backend.memory.service import (
    add_memory,
    replace_memory_with_candidate,
)
from backend.memory.validator import validate_memory_candidate
from backend.rag.config import ENABLE_MEMORY_PROPOSALS


MemoryProposalDecision = Literal[
    "accept",
    "replace",
    "keep_both",
    "reject",
    "cancel",
]
MAX_PENDING_MEMORY_PROPOSALS = 128


class MemoryProposalNotFoundError(LookupError):
    """Raised when a pending proposal is absent or already consumed."""


class MemoryProposalDecisionError(ValueError):
    """Raised when a decision is incompatible with a proposal."""


@dataclass(frozen=True)
class PendingMemoryProposal:
    id: str
    candidate: MemoryCandidate
    conflict: MemoryConflictResult
    created_at: str

    @property
    def existing_memory_id(self) -> int | None:
        existing = self.conflict.existing_memory
        return (
            existing.memory_id
            if existing is not None
            else None
        )

    @property
    def allowed_decisions(self) -> tuple[MemoryProposalDecision, ...]:
        if self.conflict.conflict_type == "new":
            return (
                "accept",
                "reject",
                "cancel",
            )

        return (
            "replace",
            "keep_both",
            "reject",
            "cancel",
        )


@dataclass(frozen=True)
class MemoryProposalDecisionResult:
    proposal_id: str
    decision: MemoryProposalDecision
    consumed: bool
    saved_memory: StoredMemory | None = None
    archived_memory: StoredMemory | None = None


_pending_proposals: dict[str, PendingMemoryProposal] = {}
_proposal_lock = RLock()


def create_memory_proposal(
    *,
    user_message: str,
    assistant_answer: str,
) -> PendingMemoryProposal | None:
    """Run the noninteractive proposal pipeline and store safe candidates."""
    if not ENABLE_MEMORY_PROPOSALS:
        return None

    candidate = propose_memory_candidate(
        user_message=user_message,
        assistant_answer=assistant_answer,
    )
    validation = validate_memory_candidate(candidate)

    if not validation.accepted:
        return None

    conflict = detect_memory_conflict(candidate)

    # Equivalent active memory already exists; no user decision can
    # safely create additional value.
    if conflict.conflict_type == "duplicate":
        return None

    pending = PendingMemoryProposal(
        id=str(uuid4()),
        candidate=candidate,
        conflict=conflict,
        created_at=datetime.now(timezone.utc).isoformat(),
    )

    with _proposal_lock:
        while len(_pending_proposals) >= MAX_PENDING_MEMORY_PROPOSALS:
            oldest_id = next(iter(_pending_proposals))
            del _pending_proposals[oldest_id]
        _pending_proposals[pending.id] = pending

    return pending


def get_memory_proposal(
    proposal_id: str,
) -> PendingMemoryProposal | None:
    normalized_id = _normalize_proposal_id(proposal_id)

    with _proposal_lock:
        return _pending_proposals.get(normalized_id)


def decide_memory_proposal(
    proposal_id: str,
    decision: MemoryProposalDecision,
    *,
    replace_memory_id: int | None = None,
) -> MemoryProposalDecisionResult:
    """Apply a decision using only the registry-held candidate."""
    normalized_id = _normalize_proposal_id(proposal_id)

    with _proposal_lock:
        pending = _pending_proposals.get(normalized_id)

        if pending is None:
            raise MemoryProposalNotFoundError(
                "The memory proposal does not exist or was already "
                "consumed."
            )

        if decision not in pending.allowed_decisions:
            raise MemoryProposalDecisionError(
                f"Decision '{decision}' is not valid for this proposal."
            )

        if decision != "replace" and replace_memory_id is not None:
            raise MemoryProposalDecisionError(
                "replace_memory_id is only valid for replacement."
            )

        if decision == "cancel":
            return MemoryProposalDecisionResult(
                proposal_id=pending.id,
                decision=decision,
                consumed=False,
            )

        if decision == "reject":
            del _pending_proposals[pending.id]
            return MemoryProposalDecisionResult(
                proposal_id=pending.id,
                decision=decision,
                consumed=True,
            )

        candidate = pending.candidate

        if candidate.memory_type == "none":
            raise MemoryProposalDecisionError(
                "The pending proposal has no durable memory type."
            )

        if decision == "replace":
            existing_memory_id = pending.existing_memory_id

            if existing_memory_id is None:
                raise MemoryProposalDecisionError(
                    "The pending proposal has no memory to replace."
                )

            if (
                replace_memory_id is not None
                and replace_memory_id != existing_memory_id
            ):
                raise MemoryProposalDecisionError(
                    "Replacement memory ID does not match the "
                    "server-held proposal."
                )

            _validate_replacement_snapshot(pending)

            replacement = replace_memory_with_candidate(
                existing_memory_id=existing_memory_id,
                memory_type=candidate.memory_type,
                content=candidate.content,
                confidence=candidate.confidence,
                importance=candidate.importance,
            )
            result = MemoryProposalDecisionResult(
                proposal_id=pending.id,
                decision=decision,
                consumed=True,
                saved_memory=replacement.new_memory,
                archived_memory=replacement.archived_memory,
            )

        else:
            saved_memory = add_memory(
                memory_type=candidate.memory_type,
                content=candidate.content,
                confidence=candidate.confidence,
                importance=candidate.importance,
            )
            result = MemoryProposalDecisionResult(
                proposal_id=pending.id,
                decision=decision,
                consumed=True,
                saved_memory=saved_memory,
            )

        # Consume only after every required persistence operation succeeds.
        del _pending_proposals[pending.id]
        return result


def clear_memory_proposals() -> None:
    """Clear ephemeral state, primarily for isolated tests."""
    with _proposal_lock:
        _pending_proposals.clear()


def _validate_replacement_snapshot(
    pending: PendingMemoryProposal,
) -> None:
    snapshot = pending.conflict.existing_memory

    if snapshot is None:
        raise MemoryProposalDecisionError(
            "The pending proposal has no memory to replace."
        )

    current = get_memory(snapshot.memory_id)

    if current is None or current.status != "active":
        raise MemoryProposalDecisionError(
            "The proposed replacement target is no longer active."
        )

    if (
        current.memory_type != snapshot.memory_type
        or current.content != snapshot.content
        or current.confidence != snapshot.confidence
        or current.importance != snapshot.importance
    ):
        raise MemoryProposalDecisionError(
            "The proposed replacement target changed after the "
            "proposal was generated."
        )


def _normalize_proposal_id(proposal_id: str) -> str:
    try:
        normalized = str(UUID(proposal_id))
    except (ValueError, AttributeError, TypeError) as error:
        raise MemoryProposalNotFoundError(
            "The memory proposal does not exist or was already "
            "consumed."
        ) from error

    return normalized
