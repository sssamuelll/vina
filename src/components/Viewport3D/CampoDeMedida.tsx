import { useState } from 'react';

interface CampoDeMedidaProps {
  id: string;
  label: string;
  /** El valor guardado, en cm. Sin valor, el campo sale vacío: Vina no adivina números. */
  valor: number | undefined;
  min: number;
  max: number;
  alFijar(valor: number): void;
}

/** Con coma, como se escribe en Venezuela; lo que llegue con punto también vale. */
const mostrar = (v: number | undefined) => (v === undefined ? '' : String(v).replace('.', ','));

/**
 * Una medida del cuerpo, un campo (spec 2026-10-02 § 6.1: «siete medidas como
 * siete campos; hoy son 21 controles»). Lo tecleado se fija con Enter o al
 * salir del campo, no con cada tecla: escribiendo 170, el cuerpo pasaba por 1
 * y por 17 cm. Vacío, sin número o fuera de [min, max], vuelve al de antes
 * sin escribir nada: Vina no cambia el número que ella teclea por otro (la
 * revisión final de P4 vio que recortar al borde reescribía las medidas de
 * niño). Esc deshace lo tecleado.
 */
export default function CampoDeMedida({ id, label, valor, min, max, alFijar }: CampoDeMedidaProps) {
  const [borrador, setBorrador] = useState<string | null>(null);

  const fijar = () => {
    if (borrador === null) return;
    const texto = borrador.trim();
    setBorrador(null);
    const n = Number(texto.replace(',', '.'));
    if (texto === '' || !Number.isFinite(n) || n < min || n > max) return;
    if (n !== valor) alFijar(n);
  };

  return (
    <div className="ap-medida">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="ap-medida__campo"
        type="text"
        inputMode="decimal"
        aria-describedby={`${id}-unidad`}
        value={borrador ?? mostrar(valor)}
        onChange={(e) => setBorrador(e.target.value)}
        onBlur={fijar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') fijar();
          // Con algo tecleado, Esc lo deshace y se queda aquí; sin nada,
          // sigue su camino por la escalera de lo que se llama.
          if (e.key === 'Escape' && borrador !== null) {
            e.stopPropagation();
            setBorrador(null);
          }
        }}
      />
      <span id={`${id}-unidad`} className="ap-medida__unidad">cm</span>
    </div>
  );
}
