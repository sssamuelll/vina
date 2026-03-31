import { useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { store } from './store';
import { showToast } from './store/copilotUISlice';
import Workspace from './components/Workspace/Workspace';
import SolverMetrics from './components/Debug/SolverMetrics';
import SetupWizard from './components/SetupWizard/SetupWizard';
import { SkillRegistry } from './copilot/action/skills/skillRegistry';
import { loadProviderConfigSync } from './copilot/providers/types';
import { isStorageAvailable } from './utils/safeStorage';
import './App.css';

function App() {
  const [ready, setReady] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);

  useEffect(() => {
    async function init() {
      const registry = SkillRegistry.getInstance();
      await registry.initialize();

      // Check if LLM provider is configured
      const config = loadProviderConfigSync();
      const hasProvider = !!(config?.apiKey) || config?.provider === 'ollama' || config?.provider === 'claude-bridge';
      // Show wizard every launch until provider is configured; skip flag only lasts this session
      const skippedThisSession = sessionStorage.getItem('openclo-setup-skipped') === 'true';
      setSetupComplete(hasProvider || skippedThisSession);

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

  if (!setupComplete) {
    return <SetupWizard onComplete={() => setSetupComplete(true)} />;
  }

  return (
    <Provider store={store}>
      <Workspace />
      <SolverMetrics />
    </Provider>
  );
}

export default App;
