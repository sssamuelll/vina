import { lazy, Suspense, useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { store } from './store';
import AppShell from './components/shell/AppShell';
import SolverMetrics from './components/Debug/SolverMetrics';
import { SkillRegistry } from './copilot/action/skills/skillRegistry';
import { isStorageAvailable } from './utils/safeStorage';
import { showToast } from './store/copilotUISlice';
import './App.css';

// DEV-only Cusick gate harness (plan drape-profesional §B2) — lazy: chunk aparte, jamás cargado en prod.
const CusickHarness = lazy(() => import('./components/testScenes/CusickHarness'));

function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function init() {
      const registry = SkillRegistry.getInstance();
      await registry.initialize();
      setReady(true);

      if (!isStorageAvailable()) {
        store.dispatch(showToast({
          type: 'error',
          message: 'Local storage is unavailable. Settings will not persist.',
          duration: 8000,
        }));
      }
    }
    init();
  }, []);

  // DEV-only: ?testScene=cusick reemplaza la app entera por el harness del
  // gate Cusick @gpu-local (tests/e2e/cusick-gate.spec.ts, corre Samuel).
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('testScene') === 'cusick') {
    return (
      <Suspense fallback={null}>
        <CusickHarness fabricId={new URLSearchParams(window.location.search).get('fabric') ?? 'chiffon'} />
      </Suspense>
    );
  }

  if (!ready) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0c0c14', color: '#4a4a6a', fontFamily: 'var(--font-sans)',
      }}>
        Loading...
      </div>
    );
  }

  return (
    <Provider store={store}>
      <AppShell />
      <SolverMetrics />
    </Provider>
  );
}

export default App;
