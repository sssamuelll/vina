import { Component, type ReactNode } from 'react';
import { store } from '../../store';
import { pushError } from '../../utils/errorTracker';
import { downloadDiagnosticBundle } from '../../utils/export/diagnosticExporter';
import './ErrorBoundary.css';

interface Props {
  panelName: string;
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  exportFailed: boolean;
}

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: '', exportFailed: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[PanelErrorBoundary:${this.props.panelName}]`, error, info.componentStack);
    pushError({
      message: error.message,
      source: `PanelErrorBoundary:${this.props.panelName}`,
      timestamp: Date.now(),
      stack: [error.stack, info.componentStack]
        .filter(Boolean)
        .join('\n') || undefined,
    }, { persistForReload: true });
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '', exportFailed: false });
    this.props.onReset?.();
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
        <div className="panel-error-boundary">
          <div className="panel-error-icon">⚠️</div>
          <div className="panel-error-title">Error en {this.props.panelName}</div>
          <div className="panel-error-message">
            {this.state.errorMessage || 'Un error inesperado ocurrió en este panel.'}
          </div>
          <div className="error-boundary-actions">
            <button className="panel-error-reset" onClick={this.handleExportDiagnostic}>
              Exportar diagnóstico
            </button>
            <button className="panel-error-reset" onClick={this.handleReset}>
              Reiniciar el panel
            </button>
          </div>
          {this.state.exportFailed && (
            <div className="app-error-save-status app-error-save-fail" role="alert">
              No pude crear el archivo de diagnóstico. Inténtalo de nuevo antes de reiniciar.
            </div>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
