import { Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { ProcessingPage } from './pages/ProcessingPage';
import { NotePage } from './pages/NotePage';
import { ArchivePage } from './pages/ArchivePage';
import { ToolsPage } from './pages/ToolsPage';
import { ConfigPage } from './pages/ConfigPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/processing/:id" element={<ProcessingPage />} />
      <Route path="/note/:id" element={<NotePage />} />
      <Route path="/archive" element={<ArchivePage />} />
      <Route path="/tools" element={<ToolsPage />} />
      <Route path="/config" element={<ConfigPage />} />
    </Routes>
  );
}
