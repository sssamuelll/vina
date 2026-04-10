import { useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { store } from './store';
import AppShell from './components/shell/AppShell';
import SolverMetrics from './components/Debug/SolverMetrics';
import { SkillRegistry } from './copilot/action/skills/skillRegistry';
import { isStorageAvailable } from './utils/safeStorage';
import { showToast } from './store/copilotUISlice';
import './App.css';

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

  if (!ready) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0c0c14', color: '#4a4a6a', fontFamily: "'Inter', system-ui, sans-serif",
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
