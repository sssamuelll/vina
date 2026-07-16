import { Component, type ReactNode } from 'react';
import './ErrorBoundary.css';

interface Props {
  panelName: string;
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[PanelErrorBoundary:${this.props.panelName}]`, error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
    this.props.onReset?.();
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
          <button className="panel-error-reset" onClick={this.handleReset}>
            Reiniciar el panel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
