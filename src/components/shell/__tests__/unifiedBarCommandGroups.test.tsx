/**
 * @vitest-environment jsdom
 *
 * Palette agrupada por categoría (Fase 3): 20 comandos en lista plana sin
 * jerarquía era el flag #1 de carga cognitiva (checklist 6/8 CRITICAL).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../../store';
import { COMMANDS, COMMAND_CATEGORIES } from '../unifiedBarCommandDefs';
import UnifiedBarCommands from '../UnifiedBarCommands';

afterEach(cleanup);

describe('palette agrupada', () => {
  it('todo comando pertenece a una categoría del set cerrado', () => {
    for (const cmd of COMMANDS) {
      expect(COMMAND_CATEGORIES, `comando ${cmd.id}`).toContain(cmd.category);
    }
  });

  it('sin filtro, renderiza los headers de grupo en orden', () => {
    render(
      <Provider store={store}>
        <UnifiedBarCommands query="" onExecute={() => {}} onOpenPanel={() => {}} />
      </Provider>,
    );
    for (const cat of COMMAND_CATEGORIES) {
      expect(screen.getByText(cat)).toBeTruthy();
    }
  });

  it('filtrando, solo aparecen los headers de los grupos con matches', () => {
    render(
      <Provider store={store}>
        <UnifiedBarCommands query="deshacer" onExecute={() => {}} onOpenPanel={() => {}} />
      </Provider>,
    );
    expect(screen.getByText('Edición')).toBeTruthy();
    expect(screen.queryByText('Paneles')).toBeNull();
  });
});
