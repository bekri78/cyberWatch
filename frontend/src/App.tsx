import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MapPage } from './pages/MapPage';
import { SituationPage } from './pages/SituationPage';

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
        <Route path="/carte" element={<MapPage />} />
      </Routes>
    </HashRouter>
  );
}
