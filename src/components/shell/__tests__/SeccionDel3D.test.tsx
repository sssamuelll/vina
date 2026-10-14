// @vitest-environment jsdom
/**
 * La sección del 3D de la línea al pie (spec 2026-10-02 «la interfaz en papel»
 * § 5.3, P5): la VOZ, el nombre de la herramienta activa y una frase de cómo se
 * usa; sin herramienta, cómo se mueve la vista. Antes era un rótulo azul sobre el
 * visor («MODO EDICIÓN — …»).
 *
 * El estado de la simulación ya no está aquí: desde la enmienda del 2026-10-11 es
 * un icono al pie del margen del 3D (`EstadoDeLaSimulacion`, con sus pruebas), y
 * la línea al pie es papel, como los márgenes.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../../store';
import { ShortcutProvider } from '../../../shortcuts/ShortcutProvider';
import { startSimulation, resetSimulation, setSolverTier, setFrameTime, setBodyCollision, marcarTelaEnMovimiento } from '../../../store/simulationSlice';
import { setActiveTool3D } from '../../../store/toolSlice';
import { togglePoseEditor } from '../../../store/avatarSlice';
import { setUserScheme } from '../../../store/inputSchemeSlice';
import SeccionDel3D from '../SeccionDel3D';

afterEach(() => {
  cleanup();
  act(() => {
    store.dispatch(resetSimulation());
    store.dispatch(setSolverTier('none'));
    store.dispatch(setFrameTime(0));
    store.dispatch(setBodyCollision(false));
    store.dispatch(setActiveTool3D('camera'));
    store.dispatch(setUserScheme('mouse'));
    if (store.getState().avatar.poseEditorOpen) store.dispatch(togglePoseEditor());
  });
});

const montar = () => render(<Provider store={store}><ShortcutProvider><SeccionDel3D /></ShortcutProvider></Provider>);

describe('SeccionDel3D ▸ la sección', () => {
  it('es un grupo con nombre y de contexto 3D', () => {
    montar();
    const g = screen.getByRole('group', { name: 'Vista 3D' });
    expect(g.getAttribute('data-shortcut-context')).toBe('3d');
  });

  it('simulando y con avisos, el pie no dice el estado: vive al pie del margen del 3D', () => {
    act(() => {
      store.dispatch(startSimulation());
      // Ya dio su primer cuadro: sin esto el estado sería «Preparando la tela», y
      // «Simulando» y los fps no tendrían cómo aparecer aunque el pie los dijera.
      store.dispatch(marcarTelaEnMovimiento(true));
      store.dispatch(setSolverTier('webgpu'));
      store.dispatch(setFrameTime(16.7));
    });
    montar();
    const g = screen.getByRole('group', { name: 'Vista 3D' });
    expect(g.querySelector('button'), 'la sección no tiene botones: es solo la voz').toBeNull();
    expect(g.textContent).not.toMatch(/Simulando|fps|WebGPU|⚠/);
    expect(screen.queryByRole('group', { name: 'Detalle de la simulación' })).toBeNull();
  });

  it('con una herramienta sin soporte en reposo, tampoco: el aviso es del margen', () => {
    act(() => { store.dispatch(setActiveTool3D('steamBrush')); });
    montar();
    expect(screen.getByRole('group', { name: 'Vista 3D' }).textContent).not.toMatch(/En reposo|⚠/);
  });

  it('con la pose abierta no se enseña la tecla de la herramienta de debajo', () => {
    act(() => { store.dispatch(setActiveTool3D('pin')); store.dispatch(togglePoseEditor()); });
    const { container } = montar();
    expect(container.querySelector('.seccion-del-3d__tecla')).toBeNull();
  });
});

describe('SeccionDel3D ▸ la voz', () => {
  it('sin herramienta, dice cómo se mueve la vista y no nombra nada', () => {
    const { container } = montar();
    expect(screen.getByText('Clic derecho orbita · clic central o Alt + arrastrar panea')).toBeTruthy();
    expect(container.querySelector('.seccion-del-3d__nombre')).toBeNull();
  });

  it('con trackpad dice el gesto del trackpad', () => {
    act(() => { store.dispatch(setUserScheme('trackpad')); });
    montar();
    expect(screen.getByText('Dos dedos orbitan · pellizco acerca · Alt + arrastrar panea')).toBeTruthy();
  });

  it('con Colocar activo lo nombra, con la tecla que dé el registro, y dice qué hacer', () => {
    act(() => { store.dispatch(setActiveTool3D('arrangement')); });
    const { container } = montar();
    expect(container.querySelector('.seccion-del-3d__nombre')?.textContent).toBe('Colocar');
    expect(container.querySelector('.seccion-del-3d__tecla')?.textContent).toBe('Shift+F');
    expect(screen.getByText('Clic en la pieza y luego en el punto del cuerpo donde va')).toBeTruthy();
  });

  it('con Fijar activo, la frase solo dice cómo fijar: Ctrl+W lo reserva el navegador y no se anuncia', () => {
    act(() => { store.dispatch(setActiveTool3D('pin')); });
    const { container } = montar();
    expect(container.querySelector('.seccion-del-3d__nombre')?.textContent).toBe('Fijar');
    expect(container.querySelector('.seccion-del-3d__tecla')?.textContent).toBe('W');
    expect(screen.getByText('Clic en la tela para fijar un punto')).toBeTruthy();
    expect(container.textContent).not.toContain('quita todas');
  });

  it('una herramienta sin tecla (Coser) se nombra sin tecla', () => {
    act(() => { store.dispatch(setActiveTool3D('sew3d')); });
    const { container } = montar();
    expect(container.querySelector('.seccion-del-3d__nombre')?.textContent).toBe('Coser');
    expect(container.querySelector('.seccion-del-3d__tecla')).toBeNull();
  });

  it('con la pose abierta gana la pose', () => {
    act(() => { store.dispatch(setActiveTool3D('pin')); store.dispatch(togglePoseEditor()); });
    const { container } = montar();
    expect(container.querySelector('.seccion-del-3d__nombre')?.textContent).toBe('Pose');
    expect(screen.getByText('Arrastra una articulación para cambiar la pose')).toBeTruthy();
  });

  it('una herramienta sin entrada no enseña su id', () => {
    act(() => { store.dispatch(setActiveTool3D('algo-que-no-existe')); });
    const { container } = montar();
    expect(container.querySelector('.seccion-del-3d__nombre')?.textContent).toBe('Herramienta del 3D');
    expect(container.textContent).not.toContain('algo-que-no-existe');
  });

  it('la frase es una pista, se corta con puntos suspensivos y queda entera en el título y en la región viva', () => {
    const { container } = montar();
    const frase = screen.getByText('Clic derecho orbita · clic central o Alt + arrastrar panea');
    expect(frase.getAttribute('data-superficie')).toBe('pista');
    expect(frase.getAttribute('title')).toBe('Clic derecho orbita · clic central o Alt + arrastrar panea');
    expect(frase.closest('[aria-live="polite"]'), 'la región viva debe estar montada siempre').not.toBeNull();
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});

describe('SeccionDel3D no trae colores sueltos', () => {
  const lee = (r: string) => readFileSync(join(process.cwd(), r), 'utf8');
  // Sin comentarios: «#608» es el número de un issue, no un color.
  const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  it.each([['.css', lee('src/components/shell/SeccionDel3D.css')], ['.tsx', lee('src/components/shell/SeccionDel3D.tsx')]])('el %s no escribe colores a mano', (_n, src) => {
    expect(sinComentarios(src).match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d/g) ?? []).toEqual([]);
  });
});
