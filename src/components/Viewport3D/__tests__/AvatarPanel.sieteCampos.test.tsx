// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import projectReducer from '../../../store/projectSlice';
import avatarReducer from '../../../store/avatarSlice';
import AvatarPanel from '../AvatarPanel';

afterEach(cleanup);

const SIETE = ['Estatura', 'Pecho', 'Cintura', 'Cadera', 'Ancho de hombros', 'Largo de brazo', 'Entrepierna'];

function panel() {
  const store = configureStore({ reducer: { project: projectReducer, avatar: avatarReducer } });
  const utils = render(<Provider store={store}><AvatarPanel /></Provider>);
  return { store, ...utils };
}

describe('el Avatar: siete medidas, siete campos (spec 2026-10-02 § 6.1)', () => {
  it('cada medida es un campo, sin deslizador ni lectura repetida', () => {
    const { container } = panel();
    for (const nombre of SIETE) {
      expect((screen.getByLabelText(nombre) as HTMLInputElement).type, nombre).toBe('text');
    }
    const medidas = container.querySelector('.ap-medidas')!;
    expect(medidas.querySelectorAll('input')).toHaveLength(7);
    expect(medidas.querySelectorAll('input[type="range"]')).toHaveLength(0);
  });

  it('Enter escribe la medida en el proyecto', () => {
    const { store } = panel();
    const estatura = screen.getByLabelText('Estatura');
    fireEvent.change(estatura, { target: { value: '170' } });
    fireEvent.keyDown(estatura, { key: 'Enter' });
    expect(store.getState().project.avatar.measurements.height).toBe(170);
  });

  it('al cerrarse el panel se apaga el modo pose: sin él no queda puerta para apagarlo', () => {
    const { store, unmount } = panel();
    expect(store.getState().avatar.poseEditorOpen).toBe(true);
    unmount();
    expect(store.getState().avatar.poseEditorOpen).toBe(false);
  });
});
