from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


# ============================================================
# MEMORY CANDIDATE
# ============================================================

MemoryCandidateType = Literal[
    "none",
    "profile",
    "learning_state",
    "episodic",
    "procedural",
]


class MemoryCandidate(BaseModel):
    """
    Structured proposal produced by the memory extractor.

    This is only a candidate. It has not yet passed application
    validation and has not been saved.
    """

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    should_store: bool = Field(
        description=(
            "Whether this interaction contains one durable "
            "learner memory worth proposing."
        )
    )

    memory_type: MemoryCandidateType = Field(
        description=(
            "The proposed memory category. Use 'none' when "
            "should_store is false."
        )
    )

    content: str = Field(
        max_length=500,
        description=(
            "A concise third-person memory statement. "
            "Use an empty string when should_store is false."
        ),
    )

    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description=(
            "Confidence that the memory is directly supported "
            "by the user's message."
        ),
    )

    importance: float = Field(
        ge=0.0,
        le=1.0,
        description=(
            "How useful this memory is likely to be for future "
            "study assistance."
        ),
    )

    reason: str = Field(
        max_length=500,
        description=(
            "A concise explanation of why the memory should or "
            "should not be stored."
        ),
    )


# ============================================================
# MEMORY RELATIONSHIP / CONFLICT CLASSIFICATION
# ============================================================

MemoryConflictType = Literal[
    "duplicate",
    "new",
    "refinement",
    "contradiction",
]

MemoryRelationshipType = Literal[
    "duplicate",
    "new",
    "refinement",
    "contradiction",
]


class MemoryRelationshipAssessment(BaseModel):
    """
    LLM assessment of the relationship between a proposed
    memory and one existing active memory.
    """

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    relationship_type: MemoryRelationshipType = Field(
        description=(
            "How the proposed memory relates to the existing "
            "memory: duplicate, new, refinement, or "
            "contradiction."
        )
    )

    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description=(
            "Confidence in the relationship classification."
        ),
    )

    reason: str = Field(
        min_length=1,
        max_length=500,
        description=(
            "A concise explanation grounded only in the two "
            "memory statements."
        ),
    )


# ============================================================
# MEMORY CONSOLIDATION
# ============================================================

MemoryConsolidationType = Literal[
    "none",
    "profile",
    "learning_state",
    "episodic",
    "procedural",
]


class MemoryConsolidationCandidate(BaseModel):
    """
    Proposed result of consolidating several related memories.

    This is only a proposal. No memory has been saved,
    archived, or modified yet.
    """

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    should_consolidate: bool = Field(
        description=(
            "Whether the selected memories can safely be "
            "combined into one durable memory."
        )
    )

    memory_type: MemoryConsolidationType = Field(
        description=(
            "The type of the consolidated memory. Use 'none' "
            "when consolidation should not occur."
        )
    )

    content: str = Field(
        max_length=500,
        description=(
            "A concise consolidated learner memory. Use an "
            "empty string when consolidation is rejected."
        ),
    )

    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description=(
            "Confidence that the consolidated statement is "
            "fully supported by the selected memories."
        ),
    )

    importance: float = Field(
        ge=0.0,
        le=1.0,
        description=(
            "Expected usefulness of the consolidated memory "
            "for future study assistance."
        ),
    )

    reason: str = Field(
        min_length=1,
        max_length=500,
        description=(
            "Why the memories can or cannot be safely "
            "consolidated."
        ),
    )