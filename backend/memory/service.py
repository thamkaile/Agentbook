from __future__ import annotations

from dataclasses import dataclass

from langchain_core.documents import Document

from backend.memory.consolidator import (
    MemoryConsolidationProposal,
)

from backend.memory.database import (
    StoredMemory,
    activate_memory_record,
    archive_memory_record,
    delete_memory_record,
    delete_relationships_for_target,
    get_memories_by_ids,
    get_memory,
    insert_memory,
    insert_memory_relationships,
    list_memories,
    update_memory_record,
)
from backend.memory.vector_store import (
    delete_memory_vector,
    get_memory_vector_store,
    make_memory_vector_id,
)
from backend.rag.config import (
    MAX_MEMORY_DISTANCE,
    MEMORY_RETRIEVAL_K,
)

@dataclass(frozen=True)
class MemoryConsolidationResult:
    """
    Result of successfully applying a consolidation proposal.
    """

    source_memories: tuple[StoredMemory, ...]
    consolidated_memory: StoredMemory

@dataclass(frozen=True)
class MemoryReplacementResult:
    archived_memory: StoredMemory
    new_memory: StoredMemory

@dataclass(frozen=True)
class MemorySearchResult:
    memory_id: int
    memory_type: str
    content: str
    confidence: float
    importance: float
    distance: float


def memory_to_document(memory: StoredMemory) -> Document:
    """
    Convert a SQLite memory record into a LangChain Document
    that can be embedded and stored in Chroma.
    """
    return Document(
        page_content=memory.content,
        metadata={
            "memory_id": memory.id,
            "memory_type": memory.memory_type,
            "confidence": memory.confidence,
            "importance": memory.importance,
            "status": memory.status,
        },
    )


def add_memory(
    memory_type: str,
    content: str,
    confidence: float = 1.0,
    importance: float = 0.5,
) -> StoredMemory:
    """
    Add a memory to SQLite, then embed and store it in Chroma.
    """
    memory_id = insert_memory(
        memory_type=memory_type,
        content=content,
        confidence=confidence,
        importance=importance,
    )

    memory = get_memory(memory_id)

    if memory is None:
        delete_memory_record(memory_id)

        raise RuntimeError(
            "Memory was inserted into SQLite but could not be loaded."
        )

    try:
        vector_store = get_memory_vector_store()

        vector_store.add_documents(
            documents=[memory_to_document(memory)],
            ids=[make_memory_vector_id(memory.id)],
        )

        return memory

    except Exception:
        # Roll back SQLite if vector indexing fails.
        delete_memory_record(memory_id)
        raise


def search_memories(
    query: str,
    k: int = MEMORY_RETRIEVAL_K,
) -> list[MemorySearchResult]:
    """
    Search active memories using semantic similarity.
    """
    cleaned_query = query.strip()

    if not cleaned_query:
        raise ValueError("Search query cannot be empty.")

    if k <= 0:
        raise ValueError("Search result count must be greater than zero.")

    vector_store = get_memory_vector_store()

    results = vector_store.similarity_search_with_score(
        query=cleaned_query,
        k=k,
        filter={
            "status": "active",
        },
    )

    search_results: list[MemorySearchResult] = []

    for document, distance in results:
        numeric_distance = float(distance)

        if numeric_distance > MAX_MEMORY_DISTANCE:
            continue

        memory_id_value = document.metadata.get("memory_id")

        if memory_id_value is None:
            continue

        try:
            memory_id = int(memory_id_value)
        except (TypeError, ValueError):
            continue

        current_memory = get_memory(memory_id)

        if current_memory is None:
            continue

        if current_memory.status != "active":
            continue

        search_results.append(
            MemorySearchResult(
                memory_id=current_memory.id,
                memory_type=current_memory.memory_type,
                content=current_memory.content,
                confidence=current_memory.confidence,
                importance=current_memory.importance,
                distance=numeric_distance,
            )
        )

    return search_results


def get_all_memories(
    include_archived: bool = False,
) -> list[StoredMemory]:
    """
    Return stored memories from SQLite.
    """
    return list_memories(
        include_archived=include_archived,
    )


def update_memory(
    memory_id: int,
    memory_type: str,
    content: str,
    confidence: float,
    importance: float,
) -> StoredMemory:
    """
    Update a memory in SQLite and replace its Chroma vector.
    """
    existing_memory = get_memory(memory_id)

    if existing_memory is None:
        raise ValueError(
            f"Memory ID {memory_id} does not exist."
        )

    updated = update_memory_record(
        memory_id=memory_id,
        memory_type=memory_type,
        content=content,
        confidence=confidence,
        importance=importance,
    )

    if not updated:
        raise RuntimeError(
            f"Memory ID {memory_id} could not be updated."
        )

    updated_memory = get_memory(memory_id)

    if updated_memory is None:
        raise RuntimeError(
            "Memory was updated but could not be loaded."
        )

    vector_store = get_memory_vector_store()
    vector_id = make_memory_vector_id(memory_id)

    try:
        vector_store.delete(
            ids=[vector_id],
        )

        vector_store.add_documents(
            documents=[memory_to_document(updated_memory)],
            ids=[vector_id],
        )

    except Exception as error:
        raise RuntimeError(
            "SQLite was updated, but the memory vector "
            f"could not be replaced: {error}"
        ) from error

    return updated_memory


def archive_memory(memory_id: int) -> bool:
    """
    Mark a memory as archived and remove it from semantic search.

    The vector is removed first. If the SQLite update fails,
    the vector is restored so both stores remain consistent.
    """
    existing_memory = get_memory(memory_id)

    if existing_memory is None:
        return False

    if existing_memory.status == "archived":
        return True

    vector_store = get_memory_vector_store()
    vector_id = make_memory_vector_id(memory_id)

    # Remove the active vector first.
    try:
        vector_store.delete(
            ids=[vector_id],
        )

    except Exception as error:
        raise RuntimeError(
            "The memory vector could not be removed, so the "
            f"SQLite record was not archived: {error}"
        ) from error

    # Archive the SQLite record.
    try:
        archived = archive_memory_record(memory_id)

    except Exception as error:
        try:
            vector_store.add_documents(
                documents=[
                    memory_to_document(existing_memory)
                ],
                ids=[vector_id],
            )

        except Exception as restore_error:
            raise RuntimeError(
                "SQLite archiving failed and the original "
                "memory vector could not be restored. "
                f"Archive error: {error}. "
                f"Restore error: {restore_error}"
            ) from error

        raise RuntimeError(
            "SQLite archiving failed. The original vector "
            "was restored."
        ) from error

    if not archived:
        try:
            vector_store.add_documents(
                documents=[
                    memory_to_document(existing_memory)
                ],
                ids=[vector_id],
            )

        except Exception as restore_error:
            raise RuntimeError(
                "The memory record was not archived and its "
                f"vector could not be restored: {restore_error}"
            ) from restore_error

        return False

    return True

def restore_archived_memory(
    memory_id: int,
) -> StoredMemory:
    """
    Restore an archived SQLite memory and recreate its active
    Chroma vector.

    Used for compensating rollback.
    """
    existing_memory = get_memory(
        memory_id
    )

    if existing_memory is None:
        raise ValueError(
            f"Memory ID {memory_id} does not exist."
        )

    if existing_memory.status == "active":
        return existing_memory

    activated = activate_memory_record(
        memory_id
    )

    if not activated:
        raise RuntimeError(
            f"Memory ID {memory_id} could not be reactivated."
        )

    active_memory = get_memory(
        memory_id
    )

    if active_memory is None:
        raise RuntimeError(
            "The memory was reactivated but could not be loaded."
        )

    vector_store = get_memory_vector_store()
    vector_id = make_memory_vector_id(
        memory_id
    )

    try:
        # Remove any stale copy before recreating the vector.
        vector_store.delete(
            ids=[vector_id],
        )

        vector_store.add_documents(
            documents=[
                memory_to_document(active_memory)
            ],
            ids=[vector_id],
        )

    except Exception as vector_error:
        # Return SQLite to archived status if vector restoration
        # fails.
        try:
            archive_memory_record(
                memory_id
            )

        except Exception as status_error:
            raise RuntimeError(
                "The memory vector could not be restored, and "
                "SQLite could not be returned to archived "
                f"status. Vector error: {vector_error}. "
                f"Status error: {status_error}"
            ) from vector_error

        raise RuntimeError(
            "The memory vector could not be restored. "
            "SQLite was returned to archived status."
        ) from vector_error

    return active_memory

def validate_current_consolidation_sources(
    proposal: MemoryConsolidationProposal,
) -> list[StoredMemory]:
    """
    Revalidate source memories immediately before applying a
    consolidation proposal.

    This prevents an old proposal from being applied after one
    of its source memories was edited, archived, or deleted.
    """
    source_snapshots = list(
        proposal.source_memories
    )

    if len(source_snapshots) < 2:
        raise ValueError(
            "A consolidation requires at least two source "
            "memories."
        )

    source_ids = [
        memory.id
        for memory in source_snapshots
    ]

    if len(source_ids) != len(set(source_ids)):
        raise ValueError(
            "A consolidation proposal contains duplicate "
            "source IDs."
        )

    current_memories = get_memories_by_ids(
        source_ids
    )

    if len(current_memories) != len(source_ids):
        raise RuntimeError(
            "One or more consolidation source memories no "
            "longer exist."
        )

    current_by_id = {
        memory.id: memory
        for memory in current_memories
    }

    ordered_current_memories: list[
        StoredMemory
    ] = []

    for snapshot in source_snapshots:
        current = current_by_id[
            snapshot.id
        ]

        if current.status != "active":
            raise RuntimeError(
                f"Memory ID {current.id} is no longer active."
            )

        if current.memory_type != snapshot.memory_type:
            raise RuntimeError(
                f"Memory ID {current.id} changed type after "
                "the consolidation proposal was generated."
            )

        if current.content != snapshot.content:
            raise RuntimeError(
                f"Memory ID {current.id} changed content after "
                "the consolidation proposal was generated."
            )

        if current.updated_at != snapshot.updated_at:
            raise RuntimeError(
                f"Memory ID {current.id} was updated after the "
                "consolidation proposal was generated."
            )

        ordered_current_memories.append(
            current
        )

    memory_types = {
        memory.memory_type
        for memory in ordered_current_memories
    }

    if len(memory_types) != 1:
        raise RuntimeError(
            "The consolidation sources no longer share one "
            "memory type."
        )

    candidate = proposal.candidate

    if not candidate.should_consolidate:
        raise ValueError(
            "A rejected consolidation proposal cannot be "
            "applied."
        )

    expected_type = (
        ordered_current_memories[0].memory_type
    )

    if candidate.memory_type != expected_type:
        raise ValueError(
            "The consolidated memory type does not match its "
            "source memories."
        )

    if not candidate.content.strip():
        raise ValueError(
            "The consolidated memory content cannot be empty."
        )

    return ordered_current_memories

def apply_memory_consolidation(
    proposal: MemoryConsolidationProposal,
) -> MemoryConsolidationResult:
    """
    Apply one approved consolidation proposal.

    Success flow:

    1. Revalidate source memories.
    2. Create and index the consolidated memory.
    3. Archive every source memory.
    4. Record lineage relationships.

    Failure flow:

    1. Remove any partial lineage.
    2. Restore archived source memories and vectors.
    3. Delete the newly created consolidated memory.
    """
    source_memories = (
        validate_current_consolidation_sources(
            proposal
        )
    )

    candidate = proposal.candidate

    # Create the target first. If this fails, the source
    # memories remain untouched.
    consolidated_memory = add_memory(
        memory_type=candidate.memory_type,
        content=candidate.content,
        confidence=candidate.confidence,
        importance=candidate.importance,
    )

    archived_source_ids: list[int] = []

    try:
        # Archive each source and remove its active vector.
        for source_memory in source_memories:
            archived = archive_memory(
                source_memory.id
            )

            if not archived:
                raise RuntimeError(
                    "Could not archive source memory ID "
                    f"{source_memory.id}."
                )

            archived_source_ids.append(
                source_memory.id
            )

        # Record lineage only after every source archive
        # succeeds.
        insert_memory_relationships(
            source_memory_ids=[
                memory.id
                for memory in source_memories
            ],
            target_memory_id=(
                consolidated_memory.id
            ),
            relationship_type=(
                "consolidated_into"
            ),
        )

    except Exception as consolidation_error:
        rollback_errors: list[str] = []

        # Remove any partially created lineage before deleting
        # the consolidation target.
        lineage_cleanup_succeeded = True

        try:
            delete_relationships_for_target(
                consolidated_memory.id
            )

        except Exception as lineage_error:
            lineage_cleanup_succeeded = False

            rollback_errors.append(
                "Lineage cleanup failed: "
                f"{lineage_error}"
            )

        # Restore source memories that were already archived.
        for memory_id in reversed(
            archived_source_ids
        ):
            try:
                restore_archived_memory(
                    memory_id
                )

            except Exception as restore_error:
                rollback_errors.append(
                    "Could not restore source memory "
                    f"{memory_id}: {restore_error}"
                )

        # Do not delete the target while unresolved lineage
        # might still reference it.
        if lineage_cleanup_succeeded:
            try:
                deleted = delete_memory(
                    consolidated_memory.id
                )

                if not deleted:
                    rollback_errors.append(
                        "The consolidated target memory could "
                        "not be deleted."
                    )

            except Exception as target_error:
                rollback_errors.append(
                    "Could not delete consolidated target "
                    f"memory {consolidated_memory.id}: "
                    f"{target_error}"
                )

        else:
            rollback_errors.append(
                "The consolidated target memory was retained "
                "because lineage cleanup did not succeed."
            )

        if rollback_errors:
            details = "\n- ".join(
                rollback_errors
            )

            raise RuntimeError(
                "Consolidation failed and rollback was only "
                "partially successful.\n"
                f"Original error: {consolidation_error}\n"
                f"Rollback problems:\n- {details}"
            ) from consolidation_error

        raise RuntimeError(
            "Consolidation failed. The source memories were "
            "restored and the temporary consolidated memory "
            "was removed."
        ) from consolidation_error

    return MemoryConsolidationResult(
        source_memories=tuple(
            source_memories
        ),
        consolidated_memory=(
            consolidated_memory
        ),
    )

def replace_memory_with_candidate(
    existing_memory_id: int,
    memory_type: str,
    content: str,
    confidence: float,
    importance: float,
) -> MemoryReplacementResult:
    """
    Save a new active memory and archive the existing memory.

    The old record remains in SQLite as history, but its vector
    is removed from active semantic retrieval.
    """
    existing_memory = get_memory(
        existing_memory_id
    )

    if existing_memory is None:
        raise ValueError(
            f"Memory ID {existing_memory_id} does not exist."
        )

    if existing_memory.status != "active":
        raise ValueError(
            f"Memory ID {existing_memory_id} is not active."
        )

    if existing_memory.memory_type != memory_type:
        raise ValueError(
            "The replacement memory must have the same type "
            "as the existing memory."
        )

    # Save the new memory first. If this fails, the existing
    # memory remains untouched.
    new_memory = add_memory(
        memory_type=memory_type,
        content=content,
        confidence=confidence,
        importance=importance,
    )

    try:
        archived = archive_memory(
            existing_memory_id
        )

        if not archived:
            raise RuntimeError(
                "The existing memory could not be archived."
            )

    except Exception as archive_error:
        # Remove the newly created memory if replacement fails.
        try:
            delete_memory(new_memory.id)

        except Exception as cleanup_error:
            raise RuntimeError(
                "Replacement failed and cleanup of the new "
                f"memory also failed. New memory ID: "
                f"{new_memory.id}. Archive error: "
                f"{archive_error}. Cleanup error: "
                f"{cleanup_error}"
            ) from archive_error

        raise RuntimeError(
            "Replacement failed. The newly created memory was "
            "removed and the existing memory was retained."
        ) from archive_error

    return MemoryReplacementResult(
        archived_memory=existing_memory,
        new_memory=new_memory,
    )

def delete_memory(memory_id: int) -> bool:
    """
    Permanently delete a memory from Chroma and SQLite.
    """
    existing_memory = get_memory(memory_id)

    if existing_memory is None:
        return False

    # Remove vector first. If this fails, retain the SQLite record.
    delete_memory_vector(memory_id)

    return delete_memory_record(memory_id)