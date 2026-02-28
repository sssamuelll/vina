import { useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { store } from './store';
import Workspace from './components/Workspace/Workspace';
import SolverMetrics from './components/Debug/SolverMetrics';
import { SkillRegistry } from './copilot/skills/skillRegistry';
import './App.css';

function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function init() {
      const registry = SkillRegistry.getInstance();
      await registry.initialize();
      setReady(true);
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
