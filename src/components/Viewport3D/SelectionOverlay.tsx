import { useSelector } from 'react-redux';
import { RootState } from '../../store';

export default function SelectionOverlay() {
  const selectBox = useSelector((s: RootState) => s.simulation.selectBox3D);
  const selectLasso = useSelector((s: RootState) => s.simulation.selectLasso3D);

  return (
    <>
      {selectBox && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(selectBox.startX, selectBox.currentX),
            top: Math.min(selectBox.startY, selectBox.currentY),
            width: Math.abs(selectBox.currentX - selectBox.startX),
            height: Math.abs(selectBox.currentY - selectBox.startY),
            border: '1px dashed #00e5ff',
            backgroundColor: 'rgba(0, 229, 255, 0.08)',
            pointerEvents: 'none',
            isolation: 'isolate',
            '--capa-box': 10,
            zIndex: 'var(--capa-box)',
          } as React.CSSProperties}
        />
      )}
      {selectLasso && selectLasso.length > 1 && (
        <svg
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', isolation: 'isolate', '--capa-lasso': 10, zIndex: 'var(--capa-lasso)' } as React.CSSProperties}
        >
          <polyline
            points={selectLasso.map(p => `${p.x},${p.y}`).join(' ')}
            fill="rgba(0, 229, 255, 0.08)"
            stroke="#00e5ff"
            strokeWidth={1}
            strokeDasharray="4 2"
          />
        </svg>
      )}
    </>
  );
}
