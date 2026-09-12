// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import TrazosLayer from '../TrazosLayer';
import type { Trazo } from '../../../../types/types';

afterEach(cleanup);

const t = (id: string): Trazo => ({ id, createdAt: 1, path: [
  { type: 'M', values: [0, 0] }, { type: 'L', values: [100, 0] }, { type: 'L', values: [100, 100] },
] });

describe('TrazosLayer (spec 2026-09-12 § 4)', () => {
  it('pinta cada trazo con la tinta de referencia y sus dos puntas, sin color literal', () => {
    const { container } = render(<svg><TrazosLayer trazos={[t('a')]} seleccion={null} zoom2D={1} /></svg>);
    const path = container.querySelector('[data-trazo-id="a"] path')!;
    expect(path.getAttribute('stroke')).toBe('var(--ink-on-light-3)');
    expect(path.getAttribute('fill')).toBe('none');
    expect(container.querySelectorAll('[data-trazo-id="a"] [data-anchor-role]')).toHaveLength(2);
  });

  it('con un tramo seleccionado resalta solo ese tramo en acento y enseña todas las anclas', () => {
    const { container } = render(<svg><TrazosLayer trazos={[t('a')]} seleccion={{ trazoId: 'a', segmentIndex: 2 }} zoom2D={1} /></svg>);
    const sel = container.querySelector('.trazo__tramo--seleccionado')!;
    expect(sel.getAttribute('stroke')).toBe('var(--accent-2d)');
    expect(sel.getAttribute('d')).toBe('M100,0 L100,100');
    expect(container.querySelectorAll('[data-trazo-id="a"] [data-anchor-role]')).toHaveLength(3);
  });

  it('sin trazos no pinta nada', () => {
    const { container } = render(<svg><TrazosLayer trazos={[]} seleccion={null} zoom2D={1} /></svg>);
    expect(container.querySelector('.trazos')).toBeNull();
  });
});
