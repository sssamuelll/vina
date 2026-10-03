/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import DockToolPicker from '../DockToolPicker';
import { DOCK_2D_CATALOG } from '../dock2dTools';

afterEach(cleanup);

function setup(selectedIds: string[]) {
  const onAdd = vi.fn(), onRemove = vi.fn(), onReset = vi.fn();
  const { container } = render(
    <DockToolPicker
      catalog={DOCK_2D_CATALOG} selectedIds={selectedIds} onAdd={onAdd} onRemove={onRemove} onReset={onReset}
      ancla={{ left: 72, bottom: 24 }}
    />,
  );
  return { onAdd, onRemove, onReset, container };
}

describe('DockToolPicker', () => {
  it('se monta en <body>, donde dice su ancla: dentro del dock, el scroll lo recortaba', () => {
    const { container } = setup(['select']);
    expect(container.querySelector('.dock-picker'), 'sigue colgando del dock').toBeNull();
    const menu = document.body.querySelector('.dock-picker') as HTMLElement;
    expect(menu).not.toBeNull();
    expect(menu.style.left).toBe('72px');
    expect(menu.style.bottom).toBe('24px');
  });

  it('renders one row per catalog tool', () => {
    setup(['select']);
    for (const tool of DOCK_2D_CATALOG) {
      expect(screen.getByText(tool.label)).toBeTruthy();
    }
  });

  it('an unselected tool is labeled Add and calls onAdd', () => {
    const { onAdd } = setup(['select']);
    fireEvent.click(screen.getByRole('button', { name: 'Añadir Piquete al dock' }));
    expect(onAdd).toHaveBeenCalledWith('notch');
  });

  it('a selected tool is labeled Remove and calls onRemove', () => {
    const { onRemove } = setup(['select', 'pen']);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Pluma del dock' }));
    expect(onRemove).toHaveBeenCalledWith('pen');
  });

  it('the only selected tool cannot be removed (disabled, no onRemove)', () => {
    const { onRemove } = setup(['select']);
    const btn = screen.getByRole('button', { name: 'Quitar Seleccionar del dock' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('«Restablecer valores» llama a onReset', () => {
    const { onReset } = setup(['select', 'notch']);
    fireEvent.click(screen.getByRole('button', { name: /restablecer valores/i }));
    expect(onReset).toHaveBeenCalled();
  });
});
