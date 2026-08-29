import { useRef, useState } from 'react';
import './NextPointPanel.css';

/**
 * "Siguiente punto" (spec 2026-08-29 § 7.2, María #195 y #193): largo y
 * ángulo del próximo nodo de la pluma o de la línea interna. Hermano de
 * NotchPrecisionModal — flotante al borde derecho, sin velo, el lienzo sigue
 * vivo — con dos diferencias dichas en el spec:
 *
 * - Sin oyente en `window`. Las teclas se manejan en React y detienen la
 *   propagación de TODO `keydown`: ni el router de herramientas ni los
 *   atajos globales ven lo que se teclea dentro (§ 8). Tab navega nativo.
 * - Enter coloca y el panel se QUEDA abierto con los mismos valores y el
 *   foco en Largo: 80/−90, Enter, 50/0, Enter. Escape lo cierra; el trazo
 *   sigue.
 *
 * Convención: 0° a la derecha, 90° hacia arriba tal como se ve en pantalla.
 * Estado en string: un campo vaciado lee inválido, no "0 mm".
 */
interface NextPointPanelProps {
  initialLengthMm: number;
  initialAngleDeg: number;
  onPlace: (lengthMm: number, angleDeg: number) => void;
  onClose: () => void;
}

export default function NextPointPanel({ initialLengthMm, initialAngleDeg, onPlace, onClose }: NextPointPanelProps) {
  const [lengthStr, setLengthStr] = useState(() => initialLengthMm.toFixed(1));
  const [angleStr, setAngleStr] = useState(() => initialAngleDeg.toFixed(1));
  const lengthRef = useRef<HTMLInputElement>(null);

  const length = parseFloat(lengthStr);
  const angle = parseFloat(angleStr);
  const lengthValid = Number.isFinite(length) && length > 0;
  const angleValid = Number.isFinite(angle) && angle >= -360 && angle <= 360;
  const valid = lengthValid && angleValid;

  const place = () => {
    if (!valid) return;
    onPlace(length, angle);
    lengthRef.current?.focus();
    lengthRef.current?.select();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Las teclas que nacen aquí son del panel: nada de lo que se teclea llega
    // al trazo ni a los atajos globales.
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      place();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="next-point-panel" role="dialog" aria-label="Siguiente punto" onKeyDown={handleKeyDown}>
      <h3>Siguiente punto</h3>
      <p>Desde el último punto. 0° a la derecha, 90° hacia arriba.</p>
      <div className="next-point-row">
        <label htmlFor="next-point-length">Largo (mm)</label>
        <input
          id="next-point-length"
          ref={lengthRef}
          type="number"
          min={0.1}
          step={0.1}
          autoFocus
          value={lengthStr}
          className={lengthValid ? '' : 'invalid'}
          onChange={e => setLengthStr(e.target.value)}
          onFocus={e => e.target.select()}
        />
      </div>
      <div className="next-point-row">
        <label htmlFor="next-point-angle">Ángulo (°)</label>
        <input
          id="next-point-angle"
          type="number"
          min={-360}
          max={360}
          step={0.1}
          value={angleStr}
          className={angleValid ? '' : 'invalid'}
          onChange={e => setAngleStr(e.target.value)}
          onFocus={e => e.target.select()}
        />
      </div>
      <div className="next-point-actions">
        <button type="button" onClick={onClose}>Cerrar</button>
        <button type="button" className="primary" onClick={place} disabled={!valid}>Colocar punto</button>
      </div>
    </div>
  );
}
