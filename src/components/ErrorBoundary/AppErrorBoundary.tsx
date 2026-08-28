import { Component, type ReactNode } from 'react';
import { store } from '../../store';
import { saveToStorage } from '../../utils/projectIO';
import { pushError } from '../../utils/errorTracker';
import { downloadDiagnosticBundle } from '../../utils/export/diagnosticExporter';
import './ErrorBoundary.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  didAutoSave: boolean | null; // null = not attempted, true/false = result
  exportFailed: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    errorMessage: '',
    didAutoSave: null,
    exportFailed: false,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary] Fatal error', error, info.componentStack);
    pushError({
      message: error.message,
      source: 'AppErrorBoundary',
      timestamp: Date.now(),
      stack: [error.stack, info.componentStack]
        .filter(Boolean)
        .join('\n') || undefined,
    }, { persistForReload: true });

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

  handleExportDiagnostic = () => {
    try {
      downloadDiagnosticBundle(store.getState());
      this.setState({ exportFailed: false });
    } catch {
      this.setState({ exportFailed: true });
    }
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
          <div className="error-boundary-actions">
            <button className="app-error-reload" onClick={this.handleExportDiagnostic}>
              Exportar diagnóstico
            </button>
            <button className="app-error-reload" onClick={this.handleReload}>
              Recargar la aplicación
            </button>
          </div>
          {this.state.exportFailed && (
            <div className="app-error-save-status app-error-save-fail" role="alert">
              No pude crear el archivo de diagnóstico. Inténtalo de nuevo antes de recargar.
            </div>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
