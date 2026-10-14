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
// DEV-only: la tela nueva en la GPU (spec 2026-10-13 §4.4.3) — lazy, como la de arriba.
const TelaImplicitaHarness = lazy(() => import('./components/testScenes/TelaImplicitaHarness'));

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
          message: 'El navegador bloqueó el almacenamiento local: los ajustes no van a persistir. Revisa los permisos de almacenamiento para este sitio.',
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

  // DEV-only: ?testScene=tela-implicita reemplaza la app entera por el banco de la tela nueva en la GPU
  // (tests/e2e/tela-implicita.spec.ts, @gpu-local).
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('testScene') === 'tela-implicita') {
    return (
      <Suspense fallback={null}>
        <TelaImplicitaHarness />
      </Suspense>
    );
  }

  if (!ready) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0c0c14', color: '#4a4a6a', fontFamily: 'var(--font-sans)',
      }}>
        Cargando...
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
