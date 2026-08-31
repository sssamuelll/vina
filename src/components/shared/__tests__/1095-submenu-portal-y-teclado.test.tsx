// @vitest-environment jsdom
/**
 * #1095 ronda 2 — hallazgo del review adversarial (Serrano + Halberg,
 * verificado con sondas Chromium reales):
 *
 * 1. `.submenu-panel` era `position:absolute; left:100%` DENTRO de
 *    `.context-menu`, que tiene `overflow-y:auto` — por la regla de CSS
 *    overflow (un eje no-visible fuerza el otro a computar `auto` también),
 *    el flyout quedaba recortado por el scrollport del propio menú.
 *    "Duplicar" (antes un botón plano, ahora detrás de este submenú) pasó
 *    de ser siempre alcanzable a estar oculto con el mouse.
 * 2. El trigger no abría con teclado: sin `onKeyDown`, Enter/Espacio/flecha
 *    derecha no hacían nada, y las tres acciones plegadas (que ANTES eran
 *    botones directos, alcanzables por teclado) se volvieron inalcanzables.
 *
 * El arreglo: portal a `document.body` (mismo patrón que `ToolTooltip.tsx`,
 * "Portal-rendered to escape overflow:hidden") + teclado real.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import SubMenu, { type SubMenuItem } from '../SubMenu';

afterEach(cleanup);

const items = (): SubMenuItem[] => [
  { label: 'Uno', action: vi.fn() },
  { label: 'Dos', action: vi.fn() },
];

describe('#1095 ronda 2 — SubMenu escapa por portal (no queda recortado)', () => {
  it('el panel abierto NO es descendiente de .submenu-trigger en el DOM (portal real)', () => {
    vi.useFakeTimers();
    const { container } = render(<SubMenu label="Duplicar" items={items()} />);
    const trigger = screen.getByRole('button', { name: /duplicar/i });
    fireEvent.mouseEnter(trigger.closest('.submenu-trigger')!);
    vi.advanceTimersByTime(250);

    const panel = document.querySelector('.submenu-panel');
    expect(panel).not.toBeNull();
    expect(container.contains(panel), 'el panel sigue dentro del contenedor clippeable — no escapó por portal').toBe(false);
    expect(document.body.contains(panel)).toBe(true);
    vi.useRealTimers();
  });

  it('el hover sigue abriendo tras 200ms (no se rompió el camino existente)', () => {
    vi.useFakeTimers();
    render(<SubMenu label="Orden" items={items()} />);
    const trigger = screen.getByRole('button', { name: /orden/i });
    fireEvent.mouseEnter(trigger.closest('.submenu-trigger')!);
    expect(document.querySelector('.submenu-panel')).toBeNull(); // aún no, faltan los 200ms
    vi.advanceTimersByTime(200);
    expect(document.querySelector('.submenu-panel')).not.toBeNull();
    vi.useRealTimers();
  });
});

describe('#1095 ronda 2 — SubMenu se abre y se navega con teclado', () => {
  it('el trigger declara aria-haspopup y aria-expanded', () => {
    render(<SubMenu label="Duplicar" items={items()} />);
    const trigger = screen.getByRole('button', { name: /duplicar/i });
    expect(trigger.getAttribute('aria-haspopup')).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('Enter en el trigger abre el panel de inmediato (sin esperar el delay del hover)', () => {
    render(<SubMenu label="Duplicar" items={items()} />);
    const trigger = screen.getByRole('button', { name: /duplicar/i });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(document.querySelector('.submenu-panel')).not.toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('Espacio abre el panel', () => {
    render(<SubMenu label="A" items={items()} />);
    fireEvent.keyDown(screen.getByRole('button', { name: /a/i }), { key: ' ' });
    expect(document.querySelector('.submenu-panel')).not.toBeNull();
  });

  it('ArrowRight abre el panel', () => {
    render(<SubMenu label="B" items={items()} />);
    fireEvent.keyDown(screen.getByRole('button', { name: /b/i }), { key: 'ArrowRight' });
    expect(document.querySelector('.submenu-panel')).not.toBeNull();
  });

  it('Escape cierra el panel y devuelve el foco al trigger', () => {
    render(<SubMenu label="Duplicar" items={items()} />);
    const trigger = screen.getByRole('button', { name: /duplicar/i });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(document.querySelector('.submenu-panel')).not.toBeNull();

    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(document.querySelector('.submenu-panel')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('con el panel abierto, Enter sobre un ítem lo ejecuta (el portal no rompe los clics)', () => {
    const accion = vi.fn();
    render(<SubMenu label="Duplicar" items={[{ label: 'Duplicar', action: accion }]} />);
    fireEvent.keyDown(screen.getByRole('button', { name: /duplicar/i }), { key: 'Enter' });
    const panel = document.querySelector('.submenu-panel')!;
    const item = within(panel as HTMLElement).getByRole('button', { name: 'Duplicar' });
    fireEvent.click(item);
    expect(accion).toHaveBeenCalledTimes(1);
  });
});
