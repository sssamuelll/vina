import { useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { store } from './store';
import { showToast } from './store/copilotUISlice';
import Workspace from './components/Workspace/Workspace';
import SolverMetrics from './components/Debug/SolverMetrics';
import { SkillRegistry } from './copilot/action/skills/skillRegistry';
import { isStorageAvailable } from './utils/safeStorage';
import './App.css';

function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function init() {
      const registry = SkillRegistry.getInstance();
      await registry.initialize();
      setReady(true);

      // One-time warning if localStorage is unavailable
      if (!isStorageAvailable()) {
        store.dispatch(showToast({
          type: 'error',
          message: 'Local storage is unavailable. Settings will not persist after this session.',
          duration: 8000,
        }));
      }
    }
    init();
  }, []);

  if (!ready) {
    return <div className="app-loading">Loading skills...</div>;
  }

  return (
    <Provider store={store}>
      <Workspace />
      <SolverMetrics />
    </Provider>
  );
}

export default App;
