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
          <div className="app-error-title">Something went wrong</div>
          <div className="app-error-message">
            {this.state.errorMessage || 'An unexpected error crashed the application.'}
          </div>
          {this.state.didAutoSave === true && (
            <div className="app-error-save-status app-error-save-ok">
              Your project was auto-saved.
            </div>
          )}
          {this.state.didAutoSave === false && (
            <div className="app-error-save-status app-error-save-fail">
              Auto-save failed. Your recent changes may be lost.
            </div>
          )}
          <button className="app-error-reload" onClick={this.handleReload}>
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
