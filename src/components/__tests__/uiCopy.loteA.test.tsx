/**
 * @vitest-environment jsdom
 */
import { configureStore } from '@reduxjs/toolkit';
import { cleanup, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import collisionBodyReducer from '../../store/collisionBodySlice';
import type { CollisionBody } from '../../types/collisionBody';
import type { ReferenceImage } from '../../types/types';
import SolverMetrics from '../Debug/SolverMetrics';
import ReferenceImageSettings from '../PatternEditor/ReferenceImageSettings';
import CollisionBodyPanel from '../Viewport3D/CollisionBodyPanel';
import ContextPanel from '../shell/ContextPanel';

afterEach(cleanup);

const BODY: CollisionBody = {
  id: 'body-1',
  name: 'Maniquí',
  meshUrl: 'blob:test',
  format: 'obj',
  transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  collision: { enabled: true, friction: 0.3, offset: 0.005 },
  animation: { clipIndex: null, playing: false, time: 0, loop: true },
  visible: true,
};

const IMAGE: ReferenceImage = {
  id: 'image-1',
  filename: 'molde.png',
  width: 100,
  height: 100,
  position: { x: 0, y: 0 },
  scale: 1,
  rotation: 0,
  opacity: 0.5,
  locked: false,
  visible: true,
  pixelsPerMm: null,
};

describe('copy visible en español', () => {
  it('traduce el panel de cuerpos de colisión y sus nombres accesibles', () => {
    const store = configureStore({
      reducer: { collisionBody: collisionBodyReducer },
      preloadedState: { collisionBody: { bodies: [BODY], selectedBodyId: BODY.id } },
    });

    render(
      <Provider store={store}>
        <CollisionBodyPanel open onClose={vi.fn()} />
      </Provider>,
    );

    expect(screen.getByRole('heading', { name: 'Cuerpos de colisión' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /importar cuerpo de colisión/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ocultar cuerpo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Desactivar colisión' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Eliminar cuerpo' })).toBeTruthy();
    expect(screen.getByText('Fricción')).toBeTruthy();
    expect(screen.getByText('Separación')).toBeTruthy();
  });

  it('traduce los controles de imagen de referencia', () => {
    render(
      <ReferenceImageSettings
        referenceImages={[IMAGE]}
        onImport={vi.fn()}
        onCalibrate={vi.fn()}
        onToggleVisible={vi.fn()}
        onToggleLocked={vi.fn()}
        onOpacityChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Importar imagen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ocultar imagen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bloquear imagen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Calibrar escala' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Eliminar imagen' })).toBeTruthy();
    expect(screen.getByText('Opacidad')).toBeTruthy();
  });

  it('traduce nombres accesibles y la píldora de métricas', () => {
    const { unmount } = render(
      <ContextPanel title="Prueba" onClose={vi.fn()}>
        contenido
      </ContextPanel>,
    );
    expect(screen.getByRole('button', { name: 'Cerrar panel' })).toBeTruthy();
    unmount();

    render(<SolverMetrics />);
    expect(screen.getByTitle('Métricas del solver')).toBeTruthy();
  });
});
