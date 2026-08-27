/**
 * Error Boundary for the simulation/3D viewport.
 *
 * Catches WebGL/WebGPU/worker crashes and shows a recoverable fallback
 * instead of crashing the entire app.
 */

import React, { Component, type ReactNode } from 'react';
import { pushError } from '../../utils/errorTracker';

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class SimulationErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[SimulationErrorBoundary]', error, info.componentStack);
    pushError({
      message: error.message,
      source: 'SimulationErrorBoundary',
      timestamp: Date.now(),
      stack: [error.stack, info.componentStack]
        .filter(Boolean)
        .join('\n') || undefined,
    }, { persistForReload: true });
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100%', padding: 24,
          color: '#e0d8cc', background: '#1a1a1a', borderRadius: 8,
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Error del visor 3D
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 16, textAlign: 'center', maxWidth: 300 }}>
            {this.state.errorMessage || 'Ocurrió un error en el motor de renderizado 3D.'}
          </div>
          <button
            onClick={this.handleReset}
            style={{
              padding: '6px 16px', borderRadius: 4, border: '1px solid #555',
              background: '#2a2a2a', color: '#e0d8cc', cursor: 'pointer', fontSize: 12,
            }}
          >
            Restablecer visor
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
