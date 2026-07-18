import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../api/client";
import { MemoryPage } from "../pages/MemoryPage";
import { StudyActionsPage } from "../pages/StudyActionsPage";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function requestUrl(input: RequestInfo | URL): string {
  return String(input);
}

describe("recoverable study workflows", () => {
  beforeEach(() => apiClient.invalidate());

  afterEach(() => vi.unstubAllGlobals());

  it("preserves memory form input after a recoverable API failure", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = requestUrl(input);
        if (init?.method === "GET" && url.includes("/api/memories?include_archived=true")) {
          return jsonResponse({ items: [], total: 0 });
        }
        if (init?.method === "POST" && url.endsWith("/api/memories")) {
          return jsonResponse(
            {
              error: {
                code: "memory_write_failed",
                message: "Memory could not be saved.",
              },
            },
            { status: 503 },
          );
        }
        throw new Error(`Unexpected request: ${init?.method} ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <MemoryPage />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", {
      name: "What your companion remembers",
    });
    const content = screen.getByLabelText("Memory content") as HTMLTextAreaElement;
    const draft = "Begin explanations with one concrete example.";
    await user.type(content, draft);
    await user.click(screen.getByRole("button", { name: "Save memory" }));

    expect(await screen.findByText("Memory could not be saved.")).toBeTruthy();
    expect(content.value).toBe(draft);

    const createCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        init?.method === "POST" && requestUrl(input).endsWith("/api/memories"),
    );
    expect(createCall).toBeTruthy();
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({ content: draft });
  });

  it("keeps quiz answers secret before submit and renders server-scored feedback", async () => {
    const secretExplanation = "SERVER_SECRET_EXPLANATION";
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = requestUrl(input);
        if (init?.method === "GET" && url.endsWith("/api/study/actions/review-queue")) {
          return jsonResponse({
            items: [],
            total: 0,
            completed_session_count: 0,
            scanned_interaction_count: 0,
          });
        }
        if (init?.method === "POST" && url.endsWith("/api/study/actions/quizzes/generate")) {
          return jsonResponse({
            quiz_id: "quiz-secret-1",
            requested_topic: "plant energy",
            topic: "Plant Energy",
            confidence: 0.9,
            questions: [
              {
                question_number: 1,
                question: "Which molecule captures light?",
                options: ["Water", "Chlorophyll", "Oxygen", "Soil"],
              },
            ],
          });
        }
        if (
          init?.method === "POST" &&
          url.endsWith("/api/study/actions/quizzes/quiz-secret-1/submit")
        ) {
          return jsonResponse({
            attempt_id: 77,
            status: "completed",
            total_questions: 1,
            presented_questions: 1,
            answered_questions: 1,
            skipped_questions: 0,
            correct_answers: 1,
            score_percentage: 100,
            accuracy_percentage: 100,
            feedback: [
              {
                question_number: 1,
                question: "Which molecule captures light?",
                selected_option: 2,
                correct_option: 2,
                is_correct: true,
                skipped: false,
                explanation: secretExplanation,
                sources: [
                  {
                    index: 1,
                    document_id: 9,
                    notebook_id: null,
                    filename: "plants.pdf",
                    mime_type: "application/pdf",
                    page_number: 3,
                    slide_number: null,
                    chunk_index: 0,
                    distance: 0.1,
                    excerpt: "Chlorophyll captures light.",
                  },
                ],
              },
            ],
          });
        }
        throw new Error(`Unexpected request: ${init?.method} ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <StudyActionsPage />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("tab", { name: "Quiz" }));
    await user.type(screen.getByLabelText("Quiz topic"), "plant energy");
    await user.selectOptions(screen.getByLabelText("Number of questions"), "1");
    await user.click(screen.getByRole("button", { name: "Generate quiz" }));

    expect(
      await screen.findByRole("heading", { name: "Which molecule captures light?" }),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain(secretExplanation);
    expect(document.body.textContent).not.toContain("Correct option:");

    await user.click(screen.getByRole("button", { name: /B\s*Chlorophyll/ }));
    expect(await screen.findByRole("heading", { name: "Ready to submit" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Submit answers" }));

    expect(await screen.findByText(secretExplanation)).toBeTruthy();
    expect(document.body.textContent).toContain("Correct option: 2");

    const submitCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        init?.method === "POST" && requestUrl(input).endsWith("/quiz-secret-1/submit"),
    );
    expect(submitCall).toBeTruthy();
    const submitted = JSON.parse(String(submitCall?.[1]?.body));
    expect(submitted).toEqual({
      responses: [{ question_number: 1, selected_option: 2 }],
    });
    expect(JSON.stringify(submitted)).not.toContain("correct_option");
    expect(JSON.stringify(submitted)).not.toContain("explanation");
  });
});
