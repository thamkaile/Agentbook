import { BarChart3, BookCheck, CircleHelp, Trophy } from 'lucide-react';

import { apiClient } from '../api/client';
import type { ProgressReport, QuizPerformance, SessionReport } from '../api/types';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  OutcomeBadge,
  PageHeader,
  ProgressBar,
  SectionHeader,
} from '../components';
import { useApiQuery } from '../hooks';
import {
  errorMessage,
  formatDateTime,
  formatPercent,
  formatRatioPercent,
} from '../utils/format';

export function ProgressPage() {
  const progress = useApiQuery<ProgressReport>(
    'progress-report',
    (signal) => apiClient.get('/api/reports/study/progress', { signal }),
  );
  const sessions = useApiQuery<SessionReport[]>(
    'session-reports',
    (signal) => apiClient.get('/api/reports/study/sessions', { signal }),
  );
  const quizzes = useApiQuery<QuizPerformance>(
    'quiz-performance',
    (signal) => apiClient.get('/api/reports/quizzes/performance', { signal }),
  );
  const loading = progress.isLoading || sessions.isLoading || quizzes.isLoading;
  const firstError = progress.error ?? sessions.error ?? quizzes.error;

  if (loading && !progress.data && !sessions.data && !quizzes.data) {
    return <LoadingState message="Assembling stored progress…" />;
  }

  if (firstError && !progress.data) {
    return (
      <ErrorState
        message={errorMessage(firstError)}
        onRetry={() => {
          void progress.reload();
          void sessions.reload();
          void quizzes.reload();
        }}
      />
    );
  }

  const report = progress.data;
  const performance = quizzes.data;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Stored progress"
        title="Learning progress"
        description="See what is becoming clear, where uncertainty remains, and which study work to revisit."
      />

      {firstError && progress.data ? (
        <Notice tone="warning">
          Some progress details could not be refreshed. Stored results that remain available are
          shown below.
        </Notice>
      ) : null}

      <section className="metric-grid" aria-label="Progress overview">
        <Card>
          <BookCheck className="metric-icon" aria-hidden="true" />
          <p className="metric-label">Completed sessions</p>
          <p className="metric-value">{report?.session_count ?? 0}</p>
        </Card>
        <Card>
          <CircleHelp className="metric-icon" aria-hidden="true" />
          <p className="metric-label">Questions recorded</p>
          <p className="metric-value">{report?.total_questions ?? 0}</p>
        </Card>
        <Card>
          <Trophy className="metric-icon" aria-hidden="true" />
          <p className="metric-label">Understanding rate</p>
          <p className="metric-value">{formatRatioPercent(report?.understanding_rate)}</p>
        </Card>
        <Card>
          <BarChart3 className="metric-icon" aria-hidden="true" />
          <p className="metric-label">Quiz attempts</p>
          <p className="metric-value">{performance?.attempt_count ?? 0}</p>
        </Card>
      </section>

      <section aria-labelledby="outcomes-title">
        <SectionHeader headingId="outcomes-title" title="Understanding outcomes" />
        <Card>
          {report?.rated_question_count ? (
            <div className="outcome-breakdown">
              <ProgressBar
                label="Understood"
                value={report.outcome_counts.understood}
                max={report.total_questions}
              />
              <ProgressBar
                label="Partly understood"
                value={report.outcome_counts.partial}
                max={report.total_questions}
              />
              <ProgressBar
                label="Needs review"
                value={report.outcome_counts.confused}
                max={report.total_questions}
              />
              <ProgressBar
                label="Unrated"
                value={report.outcome_counts.unrated}
                max={report.total_questions}
              />
            </div>
          ) : (
            <EmptyState
              compact
              title="No rated questions yet"
              description="Rate a chat answer to begin tracking understanding."
            />
          )}
        </Card>
      </section>

      <section aria-labelledby="quiz-title">
        <SectionHeader headingId="quiz-title" title="Quiz performance" />
        <div className="split-grid">
          <Card>
            <p className="metric-label">Overall score</p>
            <p className="metric-value">
              {performance?.attempt_count
                ? formatPercent(performance.overall_score_percentage)
                : 'Not enough data'}
            </p>
            {performance?.attempt_count ? (
              <ProgressBar value={performance.overall_score_percentage} showValue={false} />
            ) : (
              <p className="supporting-text">Complete a quiz to establish a score.</p>
            )}
          </Card>
          <Card>
            <p className="metric-label">Answered accuracy</p>
            <p className="metric-value">
              {formatPercent(performance?.answered_accuracy_percentage)}
            </p>
            <p className="supporting-text">Skipped and unreached questions stay distinct.</p>
          </Card>
        </div>
        {performance?.topic_performance.length ? (
          <div className="table-list" role="list" aria-label="Performance by topic">
            {performance.topic_performance.map((topic) => (
              <Card key={topic.topic} className="table-list__row" role="listitem">
                <div>
                  <h3>{topic.topic}</h3>
                  <p>
                    {topic.attempt_count} attempt{topic.attempt_count === 1 ? '' : 's'}
                  </p>
                </div>
                <div>
                  <span className="metric-label">Score</span>
                  <strong>{formatPercent(topic.score_percentage)}</strong>
                </div>
                <div>
                  <span className="metric-label">Accuracy</span>
                  <strong>{formatPercent(topic.accuracy_percentage)}</strong>
                </div>
              </Card>
            ))}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="sessions-title">
        <SectionHeader headingId="sessions-title" title="Session history" />
        {sessions.data?.length ? (
          <div className="session-list">
            {sessions.data.map((session) => (
              <details className="session-disclosure" key={session.id}>
                <summary>
                  <span>
                    <strong>Session {session.id}</strong>
                    <small>{formatDateTime(session.started_at)}</small>
                  </span>
                  <span className="summary-badges">
                    <Badge tone={session.status === 'completed' ? 'success' : 'info'}>
                      {session.status}
                    </Badge>
                    <span>
                      {session.interaction_count} question
                      {session.interaction_count === 1 ? '' : 's'}
                    </span>
                  </span>
                </summary>
                <div className="session-disclosure__body">
                  {session.interactions.length ? (
                    session.interactions.map((interaction) => (
                      <article key={interaction.id} className="history-item">
                        <div className="history-item__header">
                          <h3>{interaction.question}</h3>
                          <OutcomeBadge outcome={interaction.outcome} />
                        </div>
                        <p>{interaction.answer}</p>
                      </article>
                    ))
                  ) : (
                    <p>No interactions were recorded.</p>
                  )}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No completed sessions"
            description="Your chat history will appear here after a study session."
          />
        )}
      </section>
    </div>
  );
}
