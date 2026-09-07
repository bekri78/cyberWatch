import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { SituationPage } from './pages/SituationPage';
const ExplorationPage = lazy(() => import('./pages/ExplorationPage'));

/**
 * HashRouter (pas BrowserRouter) : GitHub Pages ne sait pas reecrire une
 * URL profonde vers index.html sans config supplementaire (404.html,
 * etc.) -- le hash evite completement le probleme, au prix d'un # dans
 * l'URL.
 */
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/situation" replace />} />
        <Route path="/situation" element={<SituationPage />} />
        <Route path="/carte" element={<Navigate to="/exploration" replace />} />
        <Route path="/exploration" element={<Suspense fallback={<p className="p-6 text-secondary">Chargement de l’exploration…</p>}><ExplorationPage /></Suspense>} />
      </Routes>
    </HashRouter>
  );
}
