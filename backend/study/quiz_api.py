from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from threading import RLock
from typing import Any
from uuid import uuid4

from backend.rag.scope import RetrievalScope
from backend.study.quiz_generator import GeneratedGroundedQuiz, generate_grounded_quiz
from backend.study.quiz_history import save_quiz_run_result
from backend.study.quiz_runner import QuizQuestionAttempt, QuizRunResult


MAX_PENDING_QUIZZES = 128


class PendingQuizNotFoundError(LookupError):
    """Raised when a pending quiz expired, was submitted, or never existed."""


class QuizGenerationRejectedError(ValueError):
    """Raised when scoped evidence cannot support a quiz."""


@dataclass(frozen=True)
class QuizResponse:
    question_number: int
    selected_option: int | None


@dataclass(frozen=True)
class PresentedQuizQuestion:
    question_number: int
    question: str
    options: tuple[str, str, str, str]


@dataclass(frozen=True)
class PresentedQuiz:
    quiz_id: str
    requested_topic: str
    topic: str
    confidence: float
    questions: tuple[PresentedQuizQuestion, ...]


@dataclass(frozen=True)
class QuizFeedbackSource:
    index: int
    document_id: int | None
    notebook_id: int | None
    filename: str
    mime_type: str | None
    page_number: int | None
    slide_number: int | None
    chunk_index: int | None
    distance: float
    excerpt: str


@dataclass(frozen=True)
class QuizQuestionFeedback:
    question_number: int
    question: str
    selected_option: int | None
    correct_option: int
    is_correct: bool
    skipped: bool
    explanation: str
    sources: tuple[QuizFeedbackSource, ...]


@dataclass(frozen=True)
class QuizSubmissionResult:
    attempt_id: int
    status: str
    total_questions: int
    presented_questions: int
    answered_questions: int
    skipped_questions: int
    correct_answers: int
    score_percentage: float
    accuracy_percentage: float | None
    feedback: tuple[QuizQuestionFeedback, ...]


_registry_lock = RLock()
_pending_quizzes: OrderedDict[str, GeneratedGroundedQuiz] = OrderedDict()


def clear_quiz_registry() -> None:
    with _registry_lock:
        _pending_quizzes.clear()


def pending_quiz_count() -> int:
    with _registry_lock:
        return len(_pending_quizzes)


def generate_quiz_for_api(
    topic: str,
    question_count: int,
    scope: RetrievalScope | None = None,
) -> PresentedQuiz:
    generated = generate_grounded_quiz(
        topic,
        question_count,
        scope=scope,
    )
    if not generated.quiz.should_generate:
        raise QuizGenerationRejectedError(generated.quiz.reason)

    quiz_id = str(uuid4())
    with _registry_lock:
        _pending_quizzes[quiz_id] = generated
        _pending_quizzes.move_to_end(quiz_id)
        while len(_pending_quizzes) > MAX_PENDING_QUIZZES:
            _pending_quizzes.popitem(last=False)

    questions = tuple(
        PresentedQuizQuestion(
            question_number=number,
            question=question.question,
            options=(
                question.options[0],
                question.options[1],
                question.options[2],
                question.options[3],
            ),
        )
        for number, question in enumerate(generated.quiz.questions, start=1)
    )
    return PresentedQuiz(
        quiz_id=quiz_id,
        requested_topic=generated.requested_topic,
        topic=generated.quiz.topic,
        confidence=generated.quiz.confidence,
        questions=questions,
    )


def score_quiz(
    generated: GeneratedGroundedQuiz,
    responses: list[QuizResponse],
) -> QuizRunResult:
    """Purely derive trusted correctness from a generated server quiz."""
    questions = generated.quiz.questions
    if len(responses) > len(questions):
        raise ValueError("Response count exceeds quiz question count.")

    expected_numbers = list(range(1, len(responses) + 1))
    actual_numbers = [response.question_number for response in responses]
    if actual_numbers != expected_numbers:
        raise ValueError(
            "Responses must be a contiguous presented-question prefix starting at 1."
        )

    attempts: list[QuizQuestionAttempt] = []
    for response in responses:
        selected_option = response.selected_option
        if selected_option is not None and (
            isinstance(selected_option, bool)
            or not 1 <= selected_option <= 4
        ):
            raise ValueError("Selected option must be null or between 1 and 4.")

        question = questions[response.question_number - 1]
        skipped = selected_option is None
        attempts.append(
            QuizQuestionAttempt(
                question_number=response.question_number,
                question=question.question,
                selected_option=selected_option,
                correct_option=question.correct_option,
                is_correct=(
                    selected_option is not None
                    and selected_option == question.correct_option
                ),
                skipped=skipped,
            )
        )

    return QuizRunResult(
        generated_quiz=generated,
        attempts=tuple(attempts),
        aborted=len(responses) < len(questions),
    )


def submit_quiz(
    quiz_id: str,
    responses: list[QuizResponse],
) -> QuizSubmissionResult:
    with _registry_lock:
        generated = _pending_quizzes.get(quiz_id)
        if generated is None:
            raise PendingQuizNotFoundError(
                "Pending quiz was not found. It may have expired or been submitted."
            )

        run_result = score_quiz(generated, responses)
        stored_attempt, _stored_questions = save_quiz_run_result(run_result)
        del _pending_quizzes[quiz_id]

    sources_by_index = {source.index: source for source in generated.sources}
    feedback: list[QuizQuestionFeedback] = []
    for attempt in run_result.attempts:
        question = generated.quiz.questions[attempt.question_number - 1]
        question_sources: list[QuizFeedbackSource] = []
        for source_index in question.source_indexes:
            source = sources_by_index[source_index]
            notebook_id: int | None = None
            if source.document_id is not None:
                from backend.rag.notebooks import get_document_record

                record = get_document_record(source.document_id)
                notebook_id = record.notebook_id if record is not None else None
            question_sources.append(
                QuizFeedbackSource(
                    index=source.index,
                    document_id=source.document_id,
                    notebook_id=notebook_id,
                    filename=source.filename,
                    mime_type=source.mime_type,
                    page_number=source.page_number,
                    slide_number=source.slide_number,
                    chunk_index=source.chunk_index,
                    distance=source.distance,
                    excerpt=source.text[:800],
                )
            )
        feedback.append(
            QuizQuestionFeedback(
                question_number=attempt.question_number,
                question=attempt.question,
                selected_option=attempt.selected_option,
                correct_option=attempt.correct_option,
                is_correct=attempt.is_correct,
                skipped=attempt.skipped,
                explanation=question.explanation,
                sources=tuple(question_sources),
            )
        )

    return QuizSubmissionResult(
        attempt_id=stored_attempt.id,
        status=stored_attempt.status,
        total_questions=stored_attempt.total_questions,
        presented_questions=stored_attempt.presented_questions,
        answered_questions=stored_attempt.answered_questions,
        skipped_questions=stored_attempt.skipped_questions,
        correct_answers=stored_attempt.correct_answers,
        score_percentage=stored_attempt.score_percentage,
        accuracy_percentage=stored_attempt.accuracy_percentage,
        feedback=tuple(feedback),
    )
