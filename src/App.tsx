import { Provider } from 'react-redux';
import { store } from './store';
import Workspace from './components/Workspace/Workspace';
import './App.css';

function App() {
  return (
    <Provider store={store}>
      <Workspace />
    </Provider>
  );
}

export default App;
