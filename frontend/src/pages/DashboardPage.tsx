import {
  BookOpen,
  Brain,
  FileText,
  MessageSquareText,
  NotebookTabs,
  Play,
  Target,
} from "lucide-react";
import { Link } from "react-router-dom";

import { api, getErrorMessage } from "../api";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  ProgressBar,
  SectionHeader,
} from "../components";
import { useApiQuery } from "../hooks";

function formatDate(value: string | null) {
  if (!value) return "Not finished";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatPercent(value: number | null) {
  return value == null ? "No attempts yet" : `${Math.round(value)}%`;
}

export function DashboardPage() {
  const dashboard = useApiQuery(["dashboard", 5], (signal) =>
    api.getDashboard(5, { signal }),
  );

  if (dashboard.isLoading && !dashboard.data) {
    return <LoadingState message="Preparing your study dashboard…" />;
  }

  if (dashboard.error && !dashboard.data) {
    return (
      <ErrorState
        title="Dashboard unavailable"
        message={getErrorMessage(dashboard.error)}
        onRetry={dashboard.retry}
      />
    );
  }

  if (!dashboard.data) return null;

  const data = dashboard.data;
  const ratedOutcomes =
    data.outcomes.understood +
    data.outcomes.partial +
    data.outcomes.confused;
  const totalOutcomes = ratedOutcomes + data.outcomes.unrated;
  const metrics = [
    {
      label: "Documents",
      value: data.counts.documents,
      detail: `${data.counts.unsorted_documents} unsorted`,
      icon: FileText,
      to: "/notebooks",
    },
    {
      label: "Notebooks",
      value: data.counts.notebooks,
      detail: "Organized study spaces",
      icon: NotebookTabs,
      to: "/notebooks",
    },
    {
      label: "Study sessions",
      value: data.counts.study_sessions,
      detail: `${data.counts.completed_sessions} completed`,
      icon: MessageSquareText,
      to: "/progress",
    },
    {
      label: "Active memories",
      value: data.counts.active_memories,
      detail: `${data.counts.archived_memories} archived`,
      icon: Brain,
      to: "/memory",
    },
  ];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Today’s workspace"
        title="Study dashboard"
        description="A local, deterministic snapshot of your materials and recent learning activity."
        actions={
          <Link className="button button--primary" to="/chat">
            <Play size={18} aria-hidden="true" />
            <span>Start studying</span>
          </Link>
        }
      />

      {dashboard.isRefreshing ? (
        <LoadingState compact message="Refreshing dashboard…" />
      ) : null}

      <section aria-labelledby="library-overview-heading">
        <h2 id="library-overview-heading" className="visually-hidden">
          Library overview
        </h2>
        <div className="metric-grid">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <Link
                className="metric-card"
                key={metric.label}
                to={metric.to}
                aria-label={`${metric.label}: ${metric.value}. ${metric.detail}`}
              >
                <span className="metric-card__icon" aria-hidden="true">
                  <Icon size={22} />
                </span>
                <span className="metric-card__value">{metric.value}</span>
                <span className="metric-card__label">{metric.label}</span>
                <span className="metric-card__detail">{metric.detail}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {data.active_session ? (
        <Card tone="accent" className="active-session-card">
          <div>
            <p className="eyebrow">Active session</p>
            <h2>Continue where you left off</h2>
            <p>
              Started {formatDate(data.active_session.started_at)} ·{" "}
              {data.active_session.interaction_count} interaction
              {data.active_session.interaction_count === 1 ? "" : "s"}
            </p>
          </div>
          <Link className="button button--primary" to="/chat">
            Continue session
          </Link>
        </Card>
      ) : (
        <Card tone="muted" className="active-session-card">
          <div>
            <p className="eyebrow">Ready when you are</p>
            <h2>No active study session</h2>
            <p>Ask a grounded question to begin a fresh session.</p>
          </div>
          <Link className="button button--secondary" to="/chat">
            Open chat
          </Link>
        </Card>
      )}

      <div className="dashboard-grid">
        <Card>
          <SectionHeader
            title="Learning outcomes"
            description={`${ratedOutcomes} rated of ${totalOutcomes} interactions`}
            actions={
              <Link className="text-link" to="/progress">
                View progress
              </Link>
            }
          />
          {totalOutcomes === 0 ? (
            <EmptyState
              compact
              title="No outcomes yet"
              description="Rate chat answers to build a useful learning signal."
              icon={<Target />}
            />
          ) : (
            <div className="outcome-summary">
              <ProgressBar
                label="Understood"
                value={data.outcomes.understood}
                max={Math.max(ratedOutcomes, 1)}
              />
              <ProgressBar
                label="Partly understood"
                value={data.outcomes.partial}
                max={Math.max(ratedOutcomes, 1)}
              />
              <ProgressBar
                label="Needs review"
                value={data.outcomes.confused}
                max={Math.max(ratedOutcomes, 1)}
              />
              {data.outcomes.unrated > 0 ? (
                <p className="muted-copy">
                  {data.outcomes.unrated} interaction
                  {data.outcomes.unrated === 1 ? " is" : "s are"} still unrated.
                </p>
              ) : null}
            </div>
          )}
        </Card>

        <Card>
          <SectionHeader
            title="Quiz performance"
            description={`${data.quiz.completed} completed of ${data.quiz.total} attempts`}
            actions={
              <Link className="text-link" to="/study-actions">
                Study actions
              </Link>
            }
          />
          {data.quiz.total === 0 ? (
            <EmptyState
              compact
              title="No quiz attempts yet"
              description="Generate a grounded quiz when you are ready to check recall."
              icon={<BookOpen />}
            />
          ) : (
            <dl className="stat-list">
              <div>
                <dt>Average score</dt>
                <dd>{formatPercent(data.quiz.average_score_percentage)}</dd>
              </div>
              <div>
                <dt>Answered accuracy</dt>
                <dd>{formatPercent(data.quiz.average_accuracy_percentage)}</dd>
              </div>
              <div>
                <dt>Aborted attempts</dt>
                <dd>{data.quiz.aborted}</dd>
              </div>
            </dl>
          )}
        </Card>
      </div>

      <div className="dashboard-grid">
        <section>
          <SectionHeader
            title="Recent sessions"
            description="Your latest grounded study conversations."
          />
          {data.recent_sessions.length === 0 ? (
            <EmptyState
              compact
              title="No sessions recorded"
              description="Your recent sessions will appear here."
            />
          ) : (
            <div className="list-stack">
              {data.recent_sessions.map((session) => (
                <Card key={session.id} padding="small">
                  <div className="list-row">
                    <div>
                      <p className="list-row__title">Session {session.id}</p>
                      <p className="list-row__meta">
                        {formatDate(session.started_at)} ·{" "}
                        {session.interaction_count} interaction
                        {session.interaction_count === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Badge tone={session.status === "active" ? "info" : "neutral"}>
                      {session.status === "active" ? "Active" : "Completed"}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionHeader
            title="Recent quizzes"
            description="Latest recall checks and trusted server scores."
          />
          {data.recent_quizzes.length === 0 ? (
            <EmptyState
              compact
              title="No quizzes recorded"
              description="Completed quiz attempts will appear here."
            />
          ) : (
            <div className="list-stack">
              {data.recent_quizzes.map((quiz) => (
                <Card key={quiz.id} padding="small">
                  <div className="list-row">
                    <div>
                      <p className="list-row__title">{quiz.quiz_topic}</p>
                      <p className="list-row__meta">{formatDate(quiz.created_at)}</p>
                    </div>
                    <div className="list-row__end">
                      <strong>{Math.round(quiz.score_percentage)}%</strong>
                      <Badge tone={quiz.status === "completed" ? "success" : "warning"}>
                        {quiz.status === "completed" ? "Completed" : "Aborted"}
                      </Badge>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default DashboardPage;
