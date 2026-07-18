import { Route, Routes } from "react-router-dom";

import { AppShell } from "./layouts";
import {
  ChatPage,
  DashboardPage,
  DocumentDetailPage,
  MemoryPage,
  NotebookDetailPage,
  NotebooksPage,
  NotFoundPage,
  ProgressPage,
  StudyActionsPage,
  SystemPage,
  TopicWorkspacePage,
} from "./pages";

export function App() {
  return (
    <Routes>
      <Route
        element={
          <AppShell
            footer={<p className="app-sidebar__note">Local-only workspace</p>}
          />
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="notebooks" element={<NotebooksPage />} />
        <Route path="notebooks/:notebookId" element={<NotebookDetailPage />} />
        <Route path="documents/:documentId" element={<DocumentDetailPage />} />
        <Route path="topics/:topicId" element={<TopicWorkspacePage />} />
        <Route path="study-actions" element={<StudyActionsPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="memory" element={<MemoryPage />} />
        <Route path="system" element={<SystemPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default App;
