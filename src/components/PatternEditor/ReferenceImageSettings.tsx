import { useRef } from 'react';
import { Eye, EyeOff, Lock, Unlock, X, Ruler, Upload } from 'lucide-react';
import type { ReferenceImage } from '../../types/types';
import './ReferenceImageSettings.css';

export interface ReferenceImageSettingsProps {
  referenceImages: ReferenceImage[];
  onImport: (file: File) => Promise<void>;
  onCalibrate: (imageId: string) => void;
  onToggleVisible: (imageId: string) => void;
  onToggleLocked: (imageId: string) => void;
  onOpacityChange: (imageId: string, opacity: number) => void;
  onRemove: (imageId: string) => void;
}

const MAX_IMAGES = 10;
const TRUNCATE_LENGTH = 20;

function truncate(name: string, max: number): string {
  if (name.length <= max) return name;
  return name.slice(0, max - 1) + '…';
}

export default function ReferenceImageSettings({
  referenceImages,
  onImport,
  onCalibrate,
  onToggleVisible,
  onToggleLocked,
  onOpacityChange,
  onRemove,
}: ReferenceImageSettingsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const atLimit = referenceImages.length >= MAX_IMAGES;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onImport(file).catch(() => {
        // import errors are handled by the parent
      });
    }
    e.target.value = '';
  }

  return (
    <div className="ref-img-settings">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,.svg"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <button
        className="ref-img-import-btn"
        onClick={() => fileInputRef.current?.click()}
        disabled={atLimit}
        title={atLimit ? 'Máximo 10 imágenes' : 'Importar imagen de referencia'}
        aria-label="Importar imagen"
      >
        <Upload size={12} />
        <span>Importar imagen</span>
      </button>

      {referenceImages.length > 0 && (
        <ul className="ref-img-list">
          {referenceImages.map(img => (
            <li key={img.id} className="ref-img-item">
              <div className="ref-img-row ref-img-row-top">
                <span className="ref-img-name" title={img.filename}>
                  {truncate(img.filename, TRUNCATE_LENGTH)}
                </span>
                <div className="ref-img-actions">
                  <button
                    className={`ref-img-btn ${img.visible ? 'active' : ''}`}
                    onClick={() => onToggleVisible(img.id)}
                    title={img.visible ? 'Ocultar imagen' : 'Mostrar imagen'}
                    aria-label={img.visible ? 'Ocultar imagen' : 'Mostrar imagen'}
                  >
                    {img.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                  <button
                    className={`ref-img-btn ${img.locked ? 'active' : ''}`}
                    onClick={() => onToggleLocked(img.id)}
                    title={img.locked ? 'Desbloquear imagen' : 'Bloquear imagen'}
                    aria-label={img.locked ? 'Desbloquear imagen' : 'Bloquear imagen'}
                  >
                    {img.locked ? <Lock size={12} /> : <Unlock size={12} />}
                  </button>
                  <button
                    className="ref-img-btn ref-img-btn-calibrate"
                    onClick={() => onCalibrate(img.id)}
                    title="Calibrar escala"
                    aria-label="Calibrar escala"
                  >
                    <Ruler size={12} />
                  </button>
                  <button
                    className="ref-img-btn ref-img-btn-remove"
                    onClick={() => onRemove(img.id)}
                    title="Eliminar imagen"
                    aria-label="Eliminar imagen"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>

              <div className="ref-img-row ref-img-row-opacity">
                <span className="ref-img-label">Opacidad</span>
                <input
                  type="range"
                  aria-label={`Opacidad de ${img.filename}`}
                  min={0}
                  max={100}
                  value={Math.round(img.opacity * 100)}
                  onChange={e => onOpacityChange(img.id, Number(e.target.value) / 100)}
                  className="ref-img-slider"
                />
                <span className="ref-img-value">{Math.round(img.opacity * 100)}%</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
