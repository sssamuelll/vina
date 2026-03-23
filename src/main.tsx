import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './components/ErrorBoundary/AppErrorBoundary';
import { ShortcutProvider } from './shortcuts';
import './index.css';

// Initialize tool registry
import './tools';

// Security: clear any API keys from legacy localStorage fallback storage
import { clearLegacyFallbackKeys } from './copilot/errorRecovery';
clearLegacyFallbackKeys();

// ─── Block browser zoom (Cmd+/-, Cmd+0, Ctrl+wheel, pinch) ───
// Zoom gestures are reserved for the 2D canvas and 3D viewport.
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
    e.preventDefault();
  }
});
document.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) e.preventDefault();
}, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('gestureend', (e) => e.preventDefault());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <ShortcutProvider>
        <App />
      </ShortcutProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
