from __future__ import annotations

import sqlite3
from dataclasses import dataclass

from backend.rag.database import get_connection


@dataclass(frozen=True)
class DashboardCounts:
    documents: int
    notebooks: int
    unsorted_documents: int
    active_memories: int
    archived_memories: int
    study_sessions: int
    completed_sessions: int
    interactions: int
    quiz_attempts: int
    topics: int


@dataclass(frozen=True)
class DashboardOutcomeCounts:
    unrated: int
    understood: int
    partial: int
    confused: int


@dataclass(frozen=True)
class DashboardSession:
    id: int
    status: str
    started_at: str
    ended_at: str | None
    interaction_count: int


@dataclass(frozen=True)
class DashboardQuizAttempt:
    id: int
    quiz_topic: str
    status: str
    score_percentage: float
    accuracy_percentage: float | None
    created_at: str


@dataclass(frozen=True)
class DashboardQuizStats:
    total: int
    completed: int
    aborted: int
    average_score_percentage: float | None
    average_accuracy_percentage: float | None


@dataclass(frozen=True)
class DashboardSnapshot:
    counts: DashboardCounts
    active_session: DashboardSession | None
    recent_sessions: tuple[DashboardSession, ...]
    outcomes: DashboardOutcomeCounts
    quiz: DashboardQuizStats
    recent_quizzes: tuple[DashboardQuizAttempt, ...]


def build_dashboard(recent_limit: int = 5) -> DashboardSnapshot:
    """Build one deterministic, SQLite-only dashboard snapshot."""
    if isinstance(recent_limit, bool) or not 1 <= recent_limit <= 50:
        raise ValueError("recent_limit must be between 1 and 50.")

    with get_connection() as connection:
        connection.execute("BEGIN")
        tables = _existing_tables(connection)
        counts = DashboardCounts(
            documents=_table_count(connection, tables, "documents"),
            notebooks=_table_count(connection, tables, "notebooks"),
            unsorted_documents=_unsorted_document_count(
                connection,
                tables,
            ),
            active_memories=_memory_count(
                connection,
                tables,
                "active",
            ),
            archived_memories=_memory_count(
                connection,
                tables,
                "archived",
            ),
            study_sessions=_table_count(
                connection,
                tables,
                "study_sessions",
            ),
            completed_sessions=_session_status_count(
                connection,
                tables,
                "completed",
            ),
            interactions=_table_count(
                connection,
                tables,
                "study_interactions",
            ),
            quiz_attempts=_table_count(
                connection,
                tables,
                "quiz_attempts",
            ),
            topics=_table_count(connection, tables, "topics"),
        )
        active_session = _active_session(connection, tables)
        recent_sessions = _recent_sessions(
            connection,
            tables,
            recent_limit,
        )
        outcomes = _outcome_counts(connection, tables)
        quiz = _quiz_stats(connection, tables)
        recent_quizzes = _recent_quizzes(
            connection,
            tables,
            recent_limit,
        )

    return DashboardSnapshot(
        counts=counts,
        active_session=active_session,
        recent_sessions=recent_sessions,
        outcomes=outcomes,
        quiz=quiz,
        recent_quizzes=recent_quizzes,
    )


def _existing_tables(connection: sqlite3.Connection) -> set[str]:
    rows = connection.execute(
        """
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
        """
    ).fetchall()
    return {str(row["name"]) for row in rows}


def _table_count(
    connection: sqlite3.Connection,
    tables: set[str],
    table_name: str,
) -> int:
    if table_name not in tables:
        return 0
    row = connection.execute(
        f"SELECT COUNT(*) AS total FROM {table_name}"
    ).fetchone()
    return int(row["total"]) if row is not None else 0


def _unsorted_document_count(
    connection: sqlite3.Connection,
    tables: set[str],
) -> int:
    if not {"documents", "notebook_documents"}.issubset(tables):
        return _table_count(connection, tables, "documents")
    row = connection.execute(
        """
        SELECT COUNT(*) AS total
        FROM documents AS d
        LEFT JOIN notebook_documents AS nd
            ON nd.document_id = d.id
        WHERE nd.document_id IS NULL
        """
    ).fetchone()
    return int(row["total"]) if row is not None else 0


def _memory_count(
    connection: sqlite3.Connection,
    tables: set[str],
    status: str,
) -> int:
    if "memories" not in tables:
        return 0
    row = connection.execute(
        "SELECT COUNT(*) AS total FROM memories WHERE status = ?",
        (status,),
    ).fetchone()
    return int(row["total"]) if row is not None else 0


def _session_status_count(
    connection: sqlite3.Connection,
    tables: set[str],
    status: str,
) -> int:
    if "study_sessions" not in tables:
        return 0
    row = connection.execute(
        """
        SELECT COUNT(*) AS total
        FROM study_sessions
        WHERE status = ?
        """,
        (status,),
    ).fetchone()
    return int(row["total"]) if row is not None else 0


def _active_session(
    connection: sqlite3.Connection,
    tables: set[str],
) -> DashboardSession | None:
    if "study_sessions" not in tables:
        return None
    interaction_join = (
        "LEFT JOIN study_interactions AS i ON i.session_id = s.id"
        if "study_interactions" in tables
        else ""
    )
    row = connection.execute(
        f"""
        SELECT
            s.id,
            s.status,
            s.started_at,
            s.ended_at,
            {('COUNT(i.id)' if interaction_join else '0')} AS interaction_count
        FROM study_sessions AS s
        {interaction_join}
        WHERE s.status = 'active'
        GROUP BY s.id
        ORDER BY s.started_at DESC, s.id DESC
        LIMIT 1
        """
    ).fetchone()
    return _session_from_row(row) if row is not None else None


def _recent_sessions(
    connection: sqlite3.Connection,
    tables: set[str],
    limit: int,
) -> tuple[DashboardSession, ...]:
    if "study_sessions" not in tables:
        return ()
    interaction_join = (
        "LEFT JOIN study_interactions AS i ON i.session_id = s.id"
        if "study_interactions" in tables
        else ""
    )
    rows = connection.execute(
        f"""
        SELECT
            s.id,
            s.status,
            s.started_at,
            s.ended_at,
            {('COUNT(i.id)' if interaction_join else '0')} AS interaction_count
        FROM study_sessions AS s
        {interaction_join}
        GROUP BY s.id
        ORDER BY s.started_at DESC, s.id DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    return tuple(_session_from_row(row) for row in rows)


def _outcome_counts(
    connection: sqlite3.Connection,
    tables: set[str],
) -> DashboardOutcomeCounts:
    values = {
        "unrated": 0,
        "understood": 0,
        "partial": 0,
        "confused": 0,
    }
    if "study_interactions" in tables:
        rows = connection.execute(
            """
            SELECT outcome, COUNT(*) AS total
            FROM study_interactions
            GROUP BY outcome
            """
        ).fetchall()
        for row in rows:
            outcome = str(row["outcome"])
            if outcome in values:
                values[outcome] = int(row["total"])
    return DashboardOutcomeCounts(**values)


def _quiz_stats(
    connection: sqlite3.Connection,
    tables: set[str],
) -> DashboardQuizStats:
    if "quiz_attempts" not in tables:
        return DashboardQuizStats(0, 0, 0, None, None)
    row = connection.execute(
        """
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN status = 'aborted' THEN 1 ELSE 0 END) AS aborted,
            AVG(score_percentage) AS average_score,
            AVG(accuracy_percentage) AS average_accuracy
        FROM quiz_attempts
        """
    ).fetchone()
    if row is None:
        return DashboardQuizStats(0, 0, 0, None, None)
    return DashboardQuizStats(
        total=int(row["total"]),
        completed=int(row["completed"] or 0),
        aborted=int(row["aborted"] or 0),
        average_score_percentage=(
            float(row["average_score"])
            if row["average_score"] is not None
            else None
        ),
        average_accuracy_percentage=(
            float(row["average_accuracy"])
            if row["average_accuracy"] is not None
            else None
        ),
    )


def _recent_quizzes(
    connection: sqlite3.Connection,
    tables: set[str],
    limit: int,
) -> tuple[DashboardQuizAttempt, ...]:
    if "quiz_attempts" not in tables:
        return ()
    rows = connection.execute(
        """
        SELECT
            id,
            quiz_topic,
            status,
            score_percentage,
            accuracy_percentage,
            created_at
        FROM quiz_attempts
        ORDER BY created_at DESC, id DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    return tuple(
        DashboardQuizAttempt(
            id=int(row["id"]),
            quiz_topic=str(row["quiz_topic"]),
            status=str(row["status"]),
            score_percentage=float(row["score_percentage"]),
            accuracy_percentage=(
                float(row["accuracy_percentage"])
                if row["accuracy_percentage"] is not None
                else None
            ),
            created_at=str(row["created_at"]),
        )
        for row in rows
    )


def _session_from_row(row: sqlite3.Row) -> DashboardSession:
    return DashboardSession(
        id=int(row["id"]),
        status=str(row["status"]),
        started_at=str(row["started_at"]),
        ended_at=(
            str(row["ended_at"])
            if row["ended_at"] is not None
            else None
        ),
        interaction_count=int(row["interaction_count"]),
    )
