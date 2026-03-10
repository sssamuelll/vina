import { useState, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { X } from 'lucide-react';
import * as THREE from 'three';
import type { RootState } from '../../store';
import type { SimRecorderHandle } from '../../hooks/useSimulationRecorder';
import { exportAnimation } from '../../utils/export/animationExporter';

export interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  renderer: THREE.WebGLRenderer | null;
  scene: THREE.Scene | null;
  camera: THREE.PerspectiveCamera | null;
  clothMesh: THREE.Mesh | null;
  recorder: SimRecorderHandle | null;
}

type Resolution = '720p' | '1080p' | '4k';

const RESOLUTION_MAP: Record<Resolution, { width: number; height: number; label: string }> = {
  '720p': { width: 1280, height: 720, label: '720p (1280 x 720)' },
  '1080p': { width: 1920, height: 1080, label: '1080p (1920 x 1080)' },
  '4k': { width: 3840, height: 2160, label: '4K (3840 x 2160)' },
};

export default function ExportDialog({
  open,
  onClose,
  renderer,
  scene,
  camera,
  clothMesh,
  recorder,
}: ExportDialogProps) {
  const { tracks, fps, duration } = useSelector((s: RootState) => s.animation);
  const [resolution, setResolution] = useState<Resolution>('1080p');
  const [transparent, setTransparent] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState({ frame: 0, total: 0 });
  const abortRef = useRef<AbortController | null>(null);

  const canExport = renderer && scene && camera;

  const handleExport = useCallback(async () => {
    if (!renderer || !scene || !camera) return;

    const abort = new AbortController();
    abortRef.current = abort;
    setExporting(true);
    setProgress({ frame: 0, total: 0 });

    const { width, height } = RESOLUTION_MAP[resolution];

    try {
      const blob = await exportAnimation({
        renderer,
        scene,
        camera,
        tracks,
        fps,
        duration,
        width,
        height,
        transparent,
        recorder,
        clothMesh,
        onProgress: (frame, total) => setProgress({ frame, total }),
        abortSignal: abort.signal,
      });

      if (!abort.signal.aborted) {
        // Trigger download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `animation-${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        console.error('Export failed:', err);
      }
    } finally {
      setExporting(false);
      abortRef.current = null;
    }
  }, [renderer, scene, camera, tracks, fps, duration, resolution, transparent, recorder, clothMesh]);

  const handleCancel = useCallback(() => {
    if (exporting) {
      abortRef.current?.abort();
      setExporting(false);
    } else {
      onClose();
    }
  }, [exporting, onClose]);

  if (!open) return null;

  const totalFrames = Math.floor(duration * fps);
  const progressPct = progress.total > 0 ? (progress.frame / progress.total) * 100 : 0;

  return (
    <div style={styles.backdrop} onClick={exporting ? undefined : onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.title}>Export Animation</span>
          {!exporting && (
            <button style={styles.closeBtn} onClick={onClose} title="Close">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Body */}
        <div style={styles.body}>
          {/* Resolution */}
          <label style={styles.label}>
            Resolution
            <select
              style={styles.select}
              value={resolution}
              onChange={(e) => setResolution(e.target.value as Resolution)}
              disabled={exporting}
            >
              {(Object.keys(RESOLUTION_MAP) as Resolution[]).map((key) => (
                <option key={key} value={key}>
                  {RESOLUTION_MAP[key].label}
                </option>
              ))}
            </select>
          </label>

          {/* Transparent background */}
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={transparent}
              onChange={(e) => setTransparent(e.target.checked)}
              disabled={exporting}
              style={styles.checkbox}
            />
            Transparent background
          </label>

          {/* Info */}
          <div style={styles.info}>
            {totalFrames} frames at {fps} fps ({duration}s)
          </div>

          {/* Progress bar */}
          {exporting && (
            <div style={styles.progressSection}>
              <div style={styles.progressText}>
                Rendering frame {progress.frame} / {progress.total}
              </div>
              <div style={styles.progressTrack}>
                <div
                  style={{
                    ...styles.progressBar,
                    width: `${progressPct}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button style={styles.cancelBtn} onClick={handleCancel}>
            {exporting ? 'Cancel Export' : 'Cancel'}
          </button>
          {!exporting && (
            <button
              style={{
                ...styles.exportBtn,
                ...(canExport ? {} : styles.exportBtnDisabled),
              }}
              onClick={handleExport}
              disabled={!canExport}
            >
              Export
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Inline styles (dark theme, matching timeline CSS vars) ---------- */

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  panel: {
    background: 'var(--panel-bg, #1e1e1e)',
    border: '1px solid var(--separator, #333)',
    borderRadius: 8,
    width: 360,
    maxWidth: '90vw',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--separator, #333)',
  },
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary, #eee)',
  },
  closeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    background: 'none',
    border: 'none',
    borderRadius: 4,
    color: 'var(--text-secondary, #aaa)',
    cursor: 'pointer',
  },
  body: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 12,
    color: 'var(--text-secondary, #aaa)',
  },
  select: {
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid var(--separator, #333)',
    borderRadius: 4,
    color: 'var(--text-primary, #eee)',
    fontSize: 12,
    padding: '6px 8px',
    outline: 'none',
    cursor: 'pointer',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: 'var(--text-secondary, #aaa)',
    cursor: 'pointer',
  },
  checkbox: {
    accentColor: 'var(--accent, #4a9eff)',
    cursor: 'pointer',
  },
  info: {
    fontSize: 11,
    color: 'var(--text-muted, #666)',
  },
  progressSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  progressText: {
    fontSize: 11,
    color: 'var(--text-secondary, #aaa)',
  },
  progressTrack: {
    height: 4,
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    background: 'var(--accent, #4a9eff)',
    borderRadius: 2,
    transition: 'width 0.15s ease-out',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    padding: '12px 16px',
    borderTop: '1px solid var(--separator, #333)',
  },
  cancelBtn: {
    padding: '6px 16px',
    fontSize: 12,
    border: '1px solid var(--separator, #333)',
    borderRadius: 4,
    background: 'none',
    color: 'var(--text-secondary, #aaa)',
    cursor: 'pointer',
  },
  exportBtn: {
    padding: '6px 16px',
    fontSize: 12,
    border: 'none',
    borderRadius: 4,
    background: 'var(--accent, #4a9eff)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
  },
  exportBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
};
