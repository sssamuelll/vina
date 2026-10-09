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

  it('con «Pose» plegada, cerrar el panel no enciende el modo pose', () => {
    const { store, unmount } = panel();
    fireEvent.click(screen.getByRole('button', { name: /Pose$/ }));
    expect(store.getState().avatar.poseEditorOpen).toBe(false);
    unmount();
    expect(store.getState().avatar.poseEditorOpen).toBe(false);
  });

  it('una medida de niño se escribe tal cual: los límites son los de los perfiles, no los del deslizador de adulto', () => {
    const { store } = panel();
    const hombros = screen.getByLabelText('Ancho de hombros');
    fireEvent.change(hombros, { target: { value: '30' } });
    fireEvent.keyDown(hombros, { key: 'Enter' });
    expect(store.getState().project.avatar.measurements.shoulder).toBe(30);
  });

  it('cada campo enseña y escribe su propia medida', () => {
    const { store } = panel();
    const CLAVES: Record<string, string> = {
      Estatura: 'height', Pecho: 'chest', Cintura: 'waist', Cadera: 'hips',
      'Ancho de hombros': 'shoulder', 'Largo de brazo': 'armLength', Entrepierna: 'inseam',
    };
    for (const [nombre, clave] of Object.entries(CLAVES)) {
      const m = store.getState().project.avatar.measurements as unknown as Record<string, number>;
      const campo = screen.getByLabelText(nombre) as HTMLInputElement;
      expect(campo.value, nombre).toBe(String(m[clave]).replace('.', ','));
      fireEvent.change(campo, { target: { value: '50,5' } });
      fireEvent.keyDown(campo, { key: 'Enter' });
      const despues = store.getState().project.avatar.measurements as unknown as Record<string, number>;
      expect(despues[clave], nombre).toBe(50.5);
    }
  });
});
