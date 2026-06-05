import { forwardRef } from 'react';

/**
 * Center-of-viewport crosshair shown while the pan button is held.
 * OrbitControls keeps the camera looking at the orbit target, so the focus
 * point is always at the exact center of the viewport — the crosshair marks
 * where orbit/zoom will pivot. Hidden by default; the pan pointer handlers
 * toggle `style.display` directly via ref (no re-render in the drag hot path,
 * same pattern as the box-select overlay).
 */
const PanCrosshair = forwardRef<HTMLDivElement>(function PanCrosshair(_props, ref) {
  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-testid="pan-crosshair"
      style={{
        display: 'none',
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 20,
        filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.6))',
      }}
    >
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="var(--accent)" strokeWidth="1.5">
        <line x1="14" y1="2" x2="14" y2="10" />
        <line x1="14" y1="18" x2="14" y2="26" />
        <line x1="2" y1="14" x2="10" y2="14" />
        <line x1="18" y1="14" x2="26" y2="14" />
        <circle cx="14" cy="14" r="2" />
      </svg>
    </div>
  );
});

export default PanCrosshair;
