import { Download, RefreshCw, ShieldCheck, ShieldX } from 'lucide-react';

import { apiClient } from '../api/client';
import type { HealthResponse, IntegrityReport } from '../api/types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  PageHeader,
  SectionHeader,
} from '../components';
import { useApiQuery } from '../hooks';
import { errorMessage, titleCase } from '../utils/format';

export function SystemPage() {
  const health = useApiQuery<HealthResponse>(
    'system-health',
    (signal) => apiClient.get('/api/health', { signal }),
  );
  const integrity = useApiQuery<IntegrityReport>(
    'system-integrity',
    (signal) => apiClient.get('/api/system/integrity', { signal }),
  );

  const reloadAll = () => {
    apiClient.invalidate({ prefix: '/api/' });
    void Promise.all([health.reload(), integrity.reload()]);
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Local system"
        title="System health"
        description="Inspect local storage and index consistency. These checks never call the language model."
        actions={
          <Button
            variant="secondary"
            icon={<RefreshCw size={18} aria-hidden="true" />}
            onClick={reloadAll}
            loading={health.isRefreshing || integrity.isRefreshing}
            loadingText="Checking…"
          >
            Check again
          </Button>
        }
      />

      <section aria-labelledby="service-health-title">
        <SectionHeader headingId="service-health-title" title="Service health" />
        {health.isLoading ? <LoadingState message="Checking local services…" /> : null}
        {health.error ? (
          <ErrorState message={errorMessage(health.error)} onRetry={() => void health.reload()} />
        ) : null}
        {health.data ? (
          <div className="metric-grid">
            <Card>
              <p className="metric-label">Application</p>
              <p className="metric-value">v{health.data.version}</p>
              <Badge tone={health.data.status === 'ok' ? 'success' : 'warning'}>
                {titleCase(health.data.status)}
              </Badge>
            </Card>
            <Card>
              <p className="metric-label">SQLite</p>
              <p className="metric-value">{titleCase(health.data.database.status)}</p>
              <p className="supporting-text">Local source of truth</p>
            </Card>
            <Card>
              <p className="metric-label">Document index</p>
              <p className="metric-value">
                {health.data.documents_vector_store.collection_present ? 'Available' : 'Ready'}
              </p>
              <p className="supporting-text">Chroma collection</p>
            </Card>
            <Card>
              <p className="metric-label">Provider</p>
              <p className="metric-value metric-value--compact">
                {titleCase(health.data.llm_provider)}
              </p>
              <p className="supporting-text">Credentials remain private</p>
            </Card>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="integrity-title">
        <SectionHeader
          headingId="integrity-title"
          title="Data integrity"
          actions={
            integrity.data ? (
              <Badge tone={integrity.data.passed ? 'success' : 'danger'}>
                {integrity.data.passed ? 'Checks passed' : 'Attention needed'}
              </Badge>
            ) : null
          }
        />
        {integrity.isLoading ? <LoadingState message="Reading integrity records…" /> : null}
        {integrity.error ? (
          <ErrorState
            message={errorMessage(integrity.error)}
            onRetry={() => void integrity.reload()}
          />
        ) : null}
        {integrity.data ? (
          <Card className="integrity-card">
            <div className="integrity-summary">
              {integrity.data.passed ? (
                <ShieldCheck aria-hidden="true" />
              ) : (
                <ShieldX aria-hidden="true" />
              )}
              <div>
                <h3>{integrity.data.passed ? 'Local records are consistent' : 'Issues were found'}</h3>
                <p>
                  {integrity.data.error_count} errors and {integrity.data.warning_count} warnings.
                </p>
              </div>
            </div>
            {integrity.data.issues.length ? (
              <ul className="issue-list">
                {integrity.data.issues.map((issue, index) => (
                  <li key={`${issue.code}-${issue.record_id ?? index}`}>
                    <Badge tone={issue.severity === 'error' ? 'danger' : 'warning'}>
                      {titleCase(issue.severity)}
                    </Badge>
                    <div>
                      <strong>{titleCase(issue.code)}</strong>
                      <p>{issue.message}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                compact
                title="No integrity issues"
                description="SQLite relationships and stored lineage passed the read-only checks."
              />
            )}
          </Card>
        ) : null}
      </section>

      <section aria-labelledby="backup-title">
        <SectionHeader headingId="backup-title" title="Local backup" />
        <Card className="backup-card">
          <div>
            <h3>Export study data</h3>
            <p>
              Create a checksum manifest with SQLite and both Chroma stores. Secrets and temporary
              registries are excluded.
            </p>
          </div>
          <a className="button button--primary" href="/api/system/export" download>
            <Download size={18} aria-hidden="true" />
            <span>Download safe backup</span>
          </a>
        </Card>
        <Notice tone="info">
          Restore is intentionally not included in this local MVP. Keep the downloaded ZIP somewhere
          safe.
        </Notice>
      </section>
    </div>
  );
}
