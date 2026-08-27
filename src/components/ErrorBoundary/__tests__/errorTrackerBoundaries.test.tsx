/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ErrorInfo } from 'react';

const {
  downloadDiagnosticBundleMock,
  pushErrorMock,
  saveToStorageMock,
} = vi.hoisted(() => ({
  downloadDiagnosticBundleMock: vi.fn(),
  pushErrorMock: vi.fn(),
  saveToStorageMock: vi.fn(() => new Promise<void>(() => {})),
}));

vi.mock('../../../utils/export/diagnosticExporter', () => ({
  downloadDiagnosticBundle: downloadDiagnosticBundleMock,
}));
vi.mock('../../../utils/errorTracker', () => ({
  pushError: pushErrorMock,
}));
vi.mock('../../../utils/projectIO', () => ({
  saveToStorage: saveToStorageMock,
}));

import { store } from '../../../store';
import { AppErrorBoundary } from '../AppErrorBoundary';
import { PanelErrorBoundary } from '../PanelErrorBoundary';
import { SimulationErrorBoundary } from '../../Viewport3D/SimulationErrorBoundary';
import { Viewport3DErrorBoundary } from '../../Viewport3D/Viewport3D';

const errorInfo = { componentStack: '\n at Probe' } as ErrorInfo;

function Bomb(): never {
  throw new Error('renderer exploded');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('AppErrorBoundary persiste el fatal antes de iniciar el auto-guardado', () => {
  const boundary = new AppErrorBoundary({ children: null });

  boundary.componentDidCatch(new Error('renderer exploded'), errorInfo);

  expect(pushErrorMock).toHaveBeenCalledWith(
    expect.objectContaining({
      message: 'renderer exploded',
      source: 'AppErrorBoundary',
      stack: expect.stringContaining('at Probe'),
    }),
    { persistForReload: true },
  );
  expect(pushErrorMock.mock.invocationCallOrder[0])
    .toBeLessThan(saveToStorageMock.mock.invocationCallOrder[0]);
});

it('PanelErrorBoundary conserva una fuente que identifica el panel', () => {
  const boundary = new PanelErrorBoundary({
    panelName: 'Propiedades',
    children: null,
  });

  boundary.componentDidCatch(new Error('renderer exploded'), errorInfo);

  expect(pushErrorMock).toHaveBeenCalledWith(
    expect.objectContaining({ source: 'PanelErrorBoundary:Propiedades' }),
    { persistForReload: true },
  );
});

it('SimulationErrorBoundary conserva su fuente exacta', () => {
  const boundary = new SimulationErrorBoundary({ children: null });

  boundary.componentDidCatch(new Error('renderer exploded'), errorInfo);

  expect(pushErrorMock).toHaveBeenCalledWith(
    expect.objectContaining({ source: 'SimulationErrorBoundary' }),
    { persistForReload: true },
  );
});

it('Viewport3DErrorBoundary captura el error exterior del visor', () => {
  const boundary = new Viewport3DErrorBoundary({ children: null });
  const catchBoundary = boundary as typeof boundary & {
    componentDidCatch: (error: Error, info: ErrorInfo) => void;
  };

  catchBoundary.componentDidCatch(new Error('renderer exploded'), errorInfo);

  expect(pushErrorMock).toHaveBeenCalledWith(
    expect.objectContaining({ source: 'Viewport3DErrorBoundary' }),
    { persistForReload: true },
  );
});

it('el fallback de app exporta después del crash sin AppShell ni Provider', () => {
  render(<AppErrorBoundary><Bomb /></AppErrorBoundary>);

  fireEvent.click(screen.getByRole('button', { name: 'Exportar diagnóstico' }));

  expect(screen.getByText('renderer exploded')).toBeTruthy();
  expect(downloadDiagnosticBundleMock).toHaveBeenCalledWith(store.getState());
});

it('el fallback de panel exporta después del crash sin AppShell ni Provider', () => {
  render(
    <PanelErrorBoundary panelName="Propiedades">
      <Bomb />
    </PanelErrorBoundary>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Exportar diagnóstico' }));

  expect(screen.getByText('renderer exploded')).toBeTruthy();
  expect(downloadDiagnosticBundleMock).toHaveBeenCalledWith(store.getState());
});

it('mantiene la puerta y explica qué hacer si falla la descarga del fallback', () => {
  downloadDiagnosticBundleMock.mockImplementationOnce(() => {
    throw new Error('descarga bloqueada');
  });
  render(<AppErrorBoundary><Bomb /></AppErrorBoundary>);

  fireEvent.click(screen.getByRole('button', { name: 'Exportar diagnóstico' }));

  expect(screen.getByRole('alert').textContent).toContain(
    'No pude crear el archivo de diagnóstico. Inténtalo de nuevo antes de recargar.',
  );
  expect(screen.getByRole('button', { name: 'Exportar diagnóstico' }))
    .toBeTruthy();
});

it('el panel mantiene la puerta y explica qué hacer si falla la descarga', () => {
  downloadDiagnosticBundleMock.mockImplementationOnce(() => {
    throw new Error('descarga bloqueada');
  });
  render(
    <PanelErrorBoundary panelName="Propiedades">
      <Bomb />
    </PanelErrorBoundary>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Exportar diagnóstico' }));

  expect(screen.getByRole('alert').textContent).toContain(
    'No pude crear el archivo de diagnóstico. Inténtalo de nuevo antes de reiniciar.',
  );
  expect(screen.getByRole('button', { name: 'Exportar diagnóstico' }))
    .toBeTruthy();
});
