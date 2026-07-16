import { Component, type ReactNode } from 'react';
import { store } from '../../store';
import { saveToStorage } from '../../utils/projectIO';
import './ErrorBoundary.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  didAutoSave: boolean | null; // null = not attempted, true/false = result
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: '', didAutoSave: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary] Fatal error', error, info.componentStack);

    // Attempt emergency auto-save
    try {
      const project = store.getState().project;
      saveToStorage(project)
        .then(() => this.setState({ didAutoSave: true }))
        .catch(() => this.setState({ didAutoSave: false }));
    } catch {
      this.setState({ didAutoSave: false });
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-error-boundary">
          <div className="app-error-icon">⚠️</div>
          <div className="app-error-title">Algo salió mal</div>
          <div className="app-error-message">
            {this.state.errorMessage || 'Un error inesperado tumbó la aplicación.'}
          </div>
          {this.state.didAutoSave === true && (
            <div className="app-error-save-status app-error-save-ok">
              Tu proyecto quedó auto-guardado.
            </div>
          )}
          {this.state.didAutoSave === false && (
            <div className="app-error-save-status app-error-save-fail">
              El auto-guardado falló: los últimos cambios pueden perderse.
            </div>
          )}
          <button className="app-error-reload" onClick={this.handleReload}>
            Recargar la aplicación
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
