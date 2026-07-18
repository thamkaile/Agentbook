export type JsonPrimitive = string | number | boolean | null;

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ErrorResponse {
  error: ApiErrorBody;
}

export interface ServiceHealth {
  status: 'ok' | 'error';
  collection_present?: boolean | null;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  database: ServiceHealth;
  documents_vector_store: ServiceHealth;
  memory_vector_store: ServiceHealth;
  llm_provider: string;
}

export interface NotebookCreate {
  name: string;
  description?: string | null;
}

export interface NotebookUpdate {
  name?: string;
  description?: string | null;
}

export interface Notebook {
  id: number | null;
  name: string;
  description: string;
  document_count: number;
  created_at: string | null;
  updated_at: string | null;
  is_virtual: boolean;
}

export interface NotebookList {
  items: Notebook[];
  total: number;
  unsorted: Notebook;
}

export interface DocumentRecord {
  id: number;
  filename: string;
  mime_type: string;
  chunk_count: number;
  created_at: string;
  updated_at: string;
  notebook_id: number | null;
}

export interface DocumentList {
  items: DocumentRecord[];
  total: number;
}

export interface DocumentAssignment {
  notebook_id: number | null;
}

export interface DocumentUploadResult {
  status: 'indexed' | 'duplicate';
  duplicate: boolean;
  document: DocumentRecord;
}

export interface DeleteResult {
  deleted: boolean;
}

export type RetrievalScope =
  | { notebook_id: number; document_ids?: never; topic_id?: never }
  | { notebook_id?: never; document_ids: number[]; topic_id?: never }
  | { notebook_id?: never; document_ids?: never; topic_id: string };

export interface SourceLineage {
  index: number;
  document_id: number | null;
  notebook_id: number | null;
  filename: string;
  mime_type: string | null;
  page_number: number | null;
  slide_number: number | null;
  chunk_index: number | null;
  distance: number | null;
  excerpt: string;
}

export interface SummaryKeyPoint {
  text: string;
  source_indexes: number[];
}

export interface SummaryContent {
  title: string;
  overview: string;
  key_points: SummaryKeyPoint[];
  confidence: number;
}

export interface Summary {
  kind: 'document' | 'notebook' | 'topic';
  scope_id: string;
  summary: SummaryContent;
  sources: SourceLineage[];
  generated_at: string;
  stale: boolean;
}

export interface Topic {
  id: string;
  name: string;
  description: string;
  sources: SourceLineage[];
  generated_at: string;
  stale: boolean;
}

export interface TopicList {
  items: Topic[];
  total: number;
}

export type MemoryType =
  | 'profile'
  | 'learning_state'
  | 'episodic'
  | 'procedural';
export type MemoryStatus = 'active' | 'archived';
export type MemoryDecision =
  | 'accept'
  | 'replace'
  | 'keep_both'
  | 'reject'
  | 'cancel';
export type StudyOutcome = 'unrated' | 'understood' | 'partial' | 'confused';

export interface MemoryProposal {
  proposal_id: string;
  memory_type: MemoryType;
  content: string;
  confidence: number;
  importance: number;
  conflict_type: 'new' | 'refinement' | 'contradiction';
  conflict_confidence: number;
  existing_memory_id: number | null;
  existing_memory_content: string | null;
  allowed_decisions: MemoryDecision[];
  reason: string;
  created_at: string;
}

type NoRetrievalScope = {
  notebook_id?: never;
  document_ids?: never;
  topic_id?: never;
};

export type OptionalRetrievalScope = RetrievalScope | NoRetrievalScope;

export type ChatRequest = {
  question: string;
} & OptionalRetrievalScope;

export interface ChatResponse {
  session_id: number;
  interaction_id: number;
  answer: string;
  sources: SourceLineage[];
  memory_proposal: MemoryProposal | null;
}

export interface StudySession {
  id: number;
  status: 'active' | 'completed';
  started_at: string;
  ended_at: string | null;
}

export interface StudySessionList {
  items: StudySession[];
  total: number;
}

export interface StudyInteraction {
  id: number;
  session_id: number;
  question: string;
  answer: string;
  outcome: StudyOutcome;
  created_at: string;
  sources: SourceLineage[];
}

export interface SessionDetail {
  session: StudySession;
  interactions: StudyInteraction[];
}

export interface MemoryCreate {
  memory_type: MemoryType;
  content: string;
  confidence?: number;
  importance?: number;
}

export interface MemoryUpdate {
  memory_type?: MemoryType;
  content?: string;
  confidence?: number;
  importance?: number;
}

export interface MemoryRecord {
  id: number;
  memory_type: MemoryType;
  content: string;
  confidence: number;
  importance: number;
  status: MemoryStatus;
  created_at: string;
  updated_at: string;
}

export interface MemoryList {
  items: MemoryRecord[];
  total: number;
}

export interface MemorySearchItem {
  memory_id: number;
  memory_type: MemoryType;
  content: string;
  confidence: number;
  importance: number;
  distance: number;
}

export interface MemorySearchResult {
  items: MemorySearchItem[];
  total: number;
}

export interface MemoryProposalDecisionRequest {
  decision: MemoryDecision;
  replace_memory_id?: number | null;
}

export interface MemoryProposalDecisionResult {
  proposal_id: string;
  decision: MemoryDecision;
  consumed: boolean;
  saved_memory: MemoryRecord | null;
  archived_memory: MemoryRecord | null;
}

export interface ConsolidationProposal {
  proposal_id: string;
  should_consolidate: boolean;
  memory_type: string;
  content: string;
  confidence: number;
  importance: number;
  reason: string;
  source_memories: MemoryRecord[];
  created_at: string;
}

export interface ConsolidationApplyResult {
  proposal_id: string;
  consolidated_memory: MemoryRecord;
  archived_source_memories: MemoryRecord[];
}

export type QuizGenerateRequest = {
  topic: string;
  question_count?: number;
} & OptionalRetrievalScope;

export interface PresentedQuizQuestion {
  question_number: number;
  question: string;
  options: [string, string, string, string] | string[];
}

export interface PresentedQuiz {
  quiz_id: string;
  requested_topic: string;
  topic: string;
  confidence: number;
  questions: PresentedQuizQuestion[];
}

export interface QuizAnswer {
  question_number: number;
  selected_option: number | null;
}

export interface QuizQuestionFeedback {
  question_number: number;
  question: string;
  selected_option: number | null;
  correct_option: number;
  is_correct: boolean;
  skipped: boolean;
  explanation: string;
  sources: SourceLineage[];
}

export interface QuizSubmission {
  attempt_id: number;
  status: 'completed' | 'aborted';
  total_questions: number;
  presented_questions: number;
  answered_questions: number;
  skipped_questions: number;
  correct_answers: number;
  score_percentage: number;
  accuracy_percentage: number | null;
  feedback: QuizQuestionFeedback[];
}

export interface OutcomeCounts {
  understood: number;
  partial: number;
  confused: number;
  unrated: number;
}

export interface InteractionReport {
  id: number;
  session_id: number;
  question: string;
  answer: string;
  outcome: StudyOutcome;
  created_at: string;
  sources: SourceLineage[];
}

export interface SessionReport {
  id: number;
  status: 'active' | 'completed';
  started_at: string;
  ended_at: string | null;
  interaction_count: number;
  outcome_counts: OutcomeCounts;
  source_filenames: string[];
  interactions: InteractionReport[];
}

export interface SessionSummary {
  session: SessionReport;
  summary: {
    overview: string;
    strengths: string[];
    review_topics: string[];
    next_steps: string[];
    confidence: number;
  };
}

export interface ProgressSession {
  session_id: number;
  started_at: string;
  ended_at: string;
  interaction_count: number;
  outcome_counts: OutcomeCounts;
}

export interface ProgressReport {
  sessions: ProgressSession[];
  session_count: number;
  total_questions: number;
  rated_question_count: number;
  understanding_rate: number | null;
  outcome_counts: OutcomeCounts;
  source_filenames: string[];
}

export interface StoredQuizAttempt {
  id: number;
  requested_topic: string;
  quiz_topic: string;
  status: 'completed' | 'aborted';
  total_questions: number;
  presented_questions: number;
  answered_questions: number;
  skipped_questions: number;
  correct_answers: number;
  score_percentage: number;
  accuracy_percentage: number | null;
  confidence: number;
  created_at: string;
}

export type StoredQuizQuestionStatus =
  | 'not_presented'
  | 'skipped'
  | 'correct'
  | 'incorrect';

export interface StoredQuizQuestion {
  id: number;
  question_number: number;
  question: string;
  options: string[];
  presented: boolean;
  selected_option: number | null;
  correct_option: number | null;
  is_correct: boolean;
  skipped: boolean;
  status: StoredQuizQuestionStatus;
  explanation: string | null;
  sources: SourceLineage[];
}

export interface QuizAttemptReport {
  attempt: StoredQuizAttempt;
  questions: StoredQuizQuestion[];
}

export interface QuizTopicPerformance {
  topic: string;
  attempt_count: number;
  total_questions: number;
  answered_questions: number;
  correct_answers: number;
  score_percentage: number;
  accuracy_percentage: number | null;
}

export interface QuizPerformance {
  attempts: StoredQuizAttempt[];
  attempt_count: number;
  completed_attempt_count: number;
  aborted_attempt_count: number;
  total_questions: number;
  presented_questions: number;
  answered_questions: number;
  correct_answers: number;
  overall_score_percentage: number;
  answered_accuracy_percentage: number | null;
  topic_performance: QuizTopicPerformance[];
  source_filenames: string[];
}

export interface ReviewRecommendation {
  interaction_id: number;
  session_id: number;
  question: string;
  outcome: 'partial' | 'confused';
  priority_score: number;
  unresolved_count: number;
  source_filenames: string[];
  source_document_ids: number[];
  created_at: string;
  reason: string;
}

export interface ReviewQueue {
  items: ReviewRecommendation[];
  total: number;
  completed_session_count: number;
  scanned_interaction_count: number;
}

export interface ReviewAction {
  recommendation: ReviewRecommendation;
  should_generate: boolean;
  review_mode: string;
  topic: string;
  explanation: string;
  worked_example: string;
  check_question: string;
  expected_answer: string;
  source_indexes: number[];
  confidence: number;
  reason: string;
  sources: SourceLineage[];
}

export interface StudyPlanRequest {
  total_minutes?: number;
  max_items?: number;
  session_limit?: number | null;
  attempt_limit?: number | null;
  scope?: RetrievalScope | null;
}

export interface StudyPlanEvidence {
  evidence_type: 'study_outcome' | 'quiz_result';
  status: string;
  reference_id: number;
  detail: string;
}

export interface StudyPlanItem {
  rank: number;
  title: string;
  action: string;
  priority_score: number;
  estimated_minutes: number;
  evidence: StudyPlanEvidence[];
  source_filenames: string[];
  source_document_ids: number[];
}

export interface StudyPlan {
  requested_minutes: number;
  allocated_minutes: number;
  remaining_minutes: number;
  item_count: number;
  completed_sessions_scanned: number;
  interactions_scanned: number;
  quiz_attempts_scanned: number;
  items: StudyPlanItem[];
}

export interface CoachingActivity {
  plan_item: StudyPlanItem;
  should_generate: boolean;
  coaching_mode: string;
  topic: string;
  objective: string;
  review_step: string;
  practice_step: string;
  reassessment_question: string;
  expected_answer: string;
  completion_criteria: string;
  source_indexes: number[];
  confidence: number;
  reason: string;
  sources: SourceLineage[];
}

export interface CoachingPlan {
  plan: StudyPlan;
  generated_count: number;
  rejected_count: number;
  items: CoachingActivity[];
}

export interface IntegrityIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  record_type: string;
  record_id: number | string | null;
}

export interface IntegrityReport {
  passed: boolean;
  error_count: number;
  warning_count: number;
  table_counts: Record<string, number>;
  issues: IntegrityIssue[];
}

export interface DashboardCounts {
  documents: number;
  notebooks: number;
  unsorted_documents: number;
  active_memories: number;
  archived_memories: number;
  study_sessions: number;
  completed_sessions: number;
  interactions: number;
  quiz_attempts: number;
  topics: number;
}

export interface DashboardSession extends StudySession {
  interaction_count: number;
}

export interface DashboardQuizAttempt {
  id: number;
  quiz_topic: string;
  status: 'completed' | 'aborted';
  score_percentage: number;
  accuracy_percentage: number | null;
  created_at: string;
}

export interface DashboardQuizStats {
  total: number;
  completed: number;
  aborted: number;
  average_score_percentage: number | null;
  average_accuracy_percentage: number | null;
}

export interface Dashboard {
  counts: DashboardCounts;
  active_session: DashboardSession | null;
  recent_sessions: DashboardSession[];
  outcomes: OutcomeCounts;
  quiz: DashboardQuizStats;
  recent_quizzes: DashboardQuizAttempt[];
}

export type SummaryKind = 'document' | 'notebook' | 'topic';
export type NotebookFilter = number | 'unsorted';

export interface TopicExtractionRequest {
  scope: RetrievalScope;
}

export interface QuizSubmitRequest {
  responses: QuizAnswer[];
}

export interface InteractionOutcomeUpdate {
  outcome: StudyOutcome;
}

export interface ConsolidationProposeRequest {
  memory_ids: number[];
}

export interface ConsolidationApplyRequest {
  proposal_id: string;
}

export interface ReviewGenerateRequest {
  interaction_id: number;
  scope?: RetrievalScope | null;
}

export type CoachingRequest = StudyPlanRequest;

export type NotebookResponse = Notebook;
export type NotebookListResponse = NotebookList;
export type DocumentResponse = DocumentRecord;
export type DocumentListResponse = DocumentList;
export type DocumentUploadResponse = DocumentUploadResult;
export type DeleteResponse = DeleteResult;
export type SummaryResponse = Summary;
export type TopicResponse = Topic;
export type TopicListResponse = TopicList;
export type StudySourceResponse = SourceLineage;
export type StudySessionResponse = StudySession;
export type StudySessionListResponse = StudySessionList;
export type StudyInteractionResponse = StudyInteraction;
export type SessionDetailResponse = SessionDetail;
export type MemoryResponse = MemoryRecord;
export type MemoryListResponse = MemoryList;
export type MemorySearchResponse = MemorySearchResult;
export type MemoryProposalResponse = MemoryProposal;
export type PresentedQuizResponse = PresentedQuiz;
export type QuizSubmissionResponse = QuizSubmission;
export type SessionReportResponse = SessionReport;
export type SessionSummaryResponse = SessionSummary;
export type ProgressReportResponse = ProgressReport;
export type QuizAttemptReportResponse = QuizAttemptReport;
export type QuizPerformanceResponse = QuizPerformance;
export type ReviewQueueResponse = ReviewQueue;
export type ReviewActionResponse = ReviewAction;
export type StudyPlanResponse = StudyPlan;
export type CoachingPlanResponse = CoachingPlan;
export type IntegrityResponse = IntegrityReport;
export type DashboardResponse = Dashboard;
