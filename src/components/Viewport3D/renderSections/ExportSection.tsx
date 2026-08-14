import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../../store';
import {
  setImageFormat,
  setJpegQuality,
  setExportTransparent,
  setVideoFormat,
  setVideoFps,
  setTurntableFrameCount,
  setTurntableDirection,
} from '../../../store/renderSettingsSlice';
import type { ImageFormat, VideoFormat } from '../../../store/renderSettingsSlice';
import type { SectionProps, RenderSettingsPanelProps } from './types';

type ExportSectionProps = SectionProps &
  Pick<
    RenderSettingsPanelProps,
    | 'onExportStill'
    | 'onExportTurntable'
    | 'onExportAllViews'
    | 'onExport3D'
    | 'onCopyToClipboard'
  >;

const mp4Supported =
  typeof MediaRecorder !== 'undefined' &&
  MediaRecorder.isTypeSupported('video/mp4; codecs=avc1');

export default function ExportSection({
  open,
  onToggle,
  onExportStill,
  onExportTurntable,
  onExportAllViews,
  onExport3D,
  onCopyToClipboard,
}: ExportSectionProps) {
  const dispatch = useDispatch<AppDispatch>();
  const {
    exportWidth,
    exportHeight,
    exportTransparent,
    imageFormat,
    jpegQuality,
    videoFormat,
    videoFps,
    turntableFrameCount,
    turntableDirection,
  } = useSelector((s: RootState) => s.renderSettings);

  // Local state for copy toast + 3D export options (not persisted)
  const [copied, setCopied] = useState(false);
  const [export3DFormat, setExport3DFormat] = useState<'3d-glb' | '3d-gltf' | '3d-usdz'>('3d-glb');
  const [export3DScale, setExport3DScale] = useState(0.001); // mm → m
  const [export3DIncludeAvatar, setExport3DIncludeAvatar] = useState(true);

  function handleCopy() {
    onCopyToClipboard?.();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="ap-section">
      <button className="ap-section-header" onClick={onToggle}>
        <span className={`ap-chevron ${open ? 'open' : ''}`}>&#9656;</span>
        Exportar
      </button>
      {open && (
        <div className="ap-section-body">

          {/* ── Still ── */}
          <div style={{ fontSize: 11, fontWeight: 600, color: '#999', marginBottom: 4 }}>Imagen</div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <label style={{ fontSize: 10, color: '#888' }}>Formato</label>
            <select
              className="ap-select"
              style={{ width: 'auto' }}
              value={imageFormat}
              onChange={e => dispatch(setImageFormat(e.target.value as ImageFormat))}
            >
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="webp">WebP</option>
            </select>
          </div>

          {imageFormat === 'jpeg' && (
            <div>
              <div className="ap-slider-label">
                <span>Calidad JPEG</span>
                <span>{Math.round(jpegQuality * 100)}%</span>
              </div>
              <div className="ap-slider-control">
                <input
                  type="range"
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  value={jpegQuality}
                  onChange={e => dispatch(setJpegQuality(Number(e.target.value)))}
                />
              </div>
            </div>
          )}

          <label
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={exportTransparent}
              onChange={e => dispatch(setExportTransparent(e.target.checked))}
            />
            Fondo transparente
          </label>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              className="ap-btn accent"
              disabled={!onExportStill}
              onClick={() => onExportStill?.(exportWidth, exportHeight, exportTransparent)}
            >
              Exportar imagen
            </button>
            <button
              className="ap-btn"
              onClick={handleCopy}
              title="Copiar al portapapeles"
            >
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>

          {/* ── Turntable ── */}
          <div style={{ fontSize: 11, fontWeight: 600, color: '#999', marginTop: 10, marginBottom: 4 }}>
            Vuelta 360&deg;
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 10, color: '#888' }}>Fotogramas</label>
            <select
              className="ap-select"
              style={{ width: 'auto' }}
              value={turntableFrameCount}
              onChange={e => dispatch(setTurntableFrameCount(Number(e.target.value)))}
            >
              <option value={12}>12</option>
              <option value={24}>24</option>
              <option value={36}>36</option>
              <option value={72}>72</option>
            </select>

            <label style={{ fontSize: 10, color: '#888' }}>fps</label>
            <select
              className="ap-select"
              style={{ width: 'auto' }}
              value={videoFps}
              onChange={e => dispatch(setVideoFps(Number(e.target.value)))}
            >
              <option value={24}>24</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div className="ap-mode-toggle" style={{ flex: 1 }}>
              <button
                className={turntableDirection === 'cw' ? 'active' : ''}
                onClick={() => dispatch(setTurntableDirection('cw'))}
              >
                Horario
              </button>
              <button
                className={turntableDirection === 'ccw' ? 'active' : ''}
                onClick={() => dispatch(setTurntableDirection('ccw'))}
              >
                Antihorario
              </button>
            </div>

            <select
              className="ap-select"
              style={{ width: 'auto' }}
              value={videoFormat}
              onChange={e => dispatch(setVideoFormat(e.target.value as VideoFormat))}
            >
              <option value="webm">WebM</option>
              <option value="mp4" disabled={!mp4Supported}>
                MP4{!mp4Supported ? ' (no compatible)' : ''}
              </option>
            </select>
          </div>

          <button
            className="ap-btn accent"
            disabled={!onExportTurntable}
            onClick={() => onExportTurntable?.()}
          >
            Generar vuelta 360&deg;
          </button>

          {/* ── Batch ── */}
          <div style={{ fontSize: 11, fontWeight: 600, color: '#999', marginTop: 10, marginBottom: 4 }}>
            Lote
          </div>
          <button
            className="ap-btn accent"
            disabled={!onExportAllViews}
            onClick={() => onExportAllViews?.(exportWidth, exportHeight, exportTransparent)}
          >
            Exportar todas las vistas
          </button>

          {/* ── 3D Model ── */}
          <div style={{ fontSize: 11, fontWeight: 600, color: '#999', marginTop: 10, marginBottom: 4 }}>
            Modelo 3D
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 10, color: '#888' }}>Formato</label>
            <select
              className="ap-select"
              style={{ width: 'auto' }}
              value={export3DFormat}
              onChange={e => setExport3DFormat(e.target.value as '3d-glb' | '3d-gltf' | '3d-usdz')}
            >
              <option value="3d-glb">GLB</option>
              <option value="3d-gltf">glTF</option>
              <option value="3d-usdz">USDZ</option>
            </select>

            <label style={{ fontSize: 10, color: '#888' }}>Escala</label>
            <select
              className="ap-select"
              style={{ width: 'auto' }}
              value={export3DScale}
              onChange={e => setExport3DScale(Number(e.target.value))}
            >
              <option value={1.0}>mm</option>
              <option value={0.1}>cm</option>
              <option value={0.001}>m</option>
              <option value={0.03937}>pulgadas</option>
            </select>
          </div>

          <label
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={export3DIncludeAvatar}
              onChange={e => setExport3DIncludeAvatar(e.target.checked)}
            />
            Incluir avatar
          </label>

          <button
            className="ap-btn accent"
            disabled={!onExport3D}
            onClick={() => onExport3D?.(export3DFormat, export3DIncludeAvatar, export3DScale)}
          >
            Exportar modelo 3D
          </button>
        </div>
      )}
    </div>
  );
}
