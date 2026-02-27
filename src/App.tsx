import { Provider } from 'react-redux';
import { store } from './store';
import Workspace from './components/Workspace/Workspace';
import SolverMetrics from './components/Debug/SolverMetrics';
import './App.css';

function App() {
  return (
    <Provider store={store}>
      <Workspace />
      <SolverMetrics />
    </Provider>
  );
}

export default App;
