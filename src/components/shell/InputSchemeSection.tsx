import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { setUserScheme } from '../../store/inputSchemeSlice';
import type { InputSchemeId } from '../../input/wheelIntents';
import { displayShortcut } from './shortcutDisplay';

const OPTIONS: Array<{ id: InputSchemeId; label: string; hint: string }> = [
  { id: 'mouse',    label: 'Ratón',          hint: 'botón derecho: orbitar · botón central: desplazar · rueda: zoom' },
  { id: 'trackpad', label: 'Panel táctil',   hint: `dos dedos: orbitar (3D) / desplazar (2D) · pellizco: zoom · ${displayShortcut('⌥')}arrastrar: desplazar` },
];

/** Input scheme picker — UnifiedBar settings mode (spec 2026-06-04 § UI). */
export default function InputSchemeSection() {
  const dispatch = useDispatch<AppDispatch>();
  const scheme = useSelector((s: RootState) => s.inputScheme.scheme);

  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Entrada</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => dispatch(setUserScheme(opt.id))}
            aria-pressed={scheme === opt.id}
            title={opt.hint}
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 6,
              border: scheme === opt.id ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: scheme === opt.id ? 'var(--accent-dim)' : 'var(--bg-primary)',
              // Elegida: el borde y el relleno de acento dicen el estado; el texto va
              // en tinta plena. En --accent sobre --accent-dim daba 4,04:1 (contraste-del-cromo).
              color: scheme === opt.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontSize: 12,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ fontWeight: 600 }}>{opt.label}</div>
            <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{opt.hint}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
