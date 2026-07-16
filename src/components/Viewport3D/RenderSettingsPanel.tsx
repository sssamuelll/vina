import { useState } from 'react';
import EnvironmentSection from './renderSections/EnvironmentSection';
import RenderQualitySection from './renderSections/RenderQualitySection';
import BackgroundSection from './renderSections/BackgroundSection';
import GroundSection from './renderSections/GroundSection';
import LightingSection from './renderSections/LightingSection';
import AvatarStyleSection from './renderSections/AvatarStyleSection';
import ResolutionSection from './renderSections/ResolutionSection';
import ExportSection from './renderSections/ExportSection';
import type { RenderSettingsPanelProps } from './renderSections/types';
import './RenderSettingsPanel.css';

export default function RenderSettingsPanel({
  open,
  onClose,
  onExportStill,
  onExportTurntable,
  onExportAllViews,
  onExport3D,
  onCopyToClipboard,
}: RenderSettingsPanelProps) {
  const [envOpen,        setEnvOpen]        = useState(true);
  const [renderingOpen,  setRenderingOpen]  = useState(true);
  const [bgOpen,         setBgOpen]         = useState(true);
  const [groundOpen,     setGroundOpen]     = useState(true);
  const [lightingOpen,   setLightingOpen]   = useState(true);
  const [avatarOpen,     setAvatarOpen]     = useState(true);
  const [resolutionOpen, setResolutionOpen] = useState(true);
  const [exportOpen,     setExportOpen]     = useState(true);

  if (!open) return null;

  return (
    <div className="render-panel-wrapper">
      <div className="render-panel">
        <div className="render-panel-header">
          <h3>Render y export 3D</h3>
          <button className="render-panel-close" onClick={onClose} title="Cerrar">&times;</button>
        </div>

        <div className="render-panel-scroll">
          <EnvironmentSection
            open={envOpen}
            onToggle={() => setEnvOpen(v => !v)}
          />

          <RenderQualitySection
            open={renderingOpen}
            onToggle={() => setRenderingOpen(v => !v)}
          />

          <BackgroundSection
            open={bgOpen}
            onToggle={() => setBgOpen(v => !v)}
          />

          <GroundSection
            open={groundOpen}
            onToggle={() => setGroundOpen(v => !v)}
          />

          <LightingSection
            open={lightingOpen}
            onToggle={() => setLightingOpen(v => !v)}
          />

          <AvatarStyleSection
            open={avatarOpen}
            onToggle={() => setAvatarOpen(v => !v)}
          />

          <ResolutionSection
            open={resolutionOpen}
            onToggle={() => setResolutionOpen(v => !v)}
          />

          <ExportSection
            open={exportOpen}
            onToggle={() => setExportOpen(v => !v)}
            onExportStill={onExportStill}
            onExportTurntable={onExportTurntable}
            onExportAllViews={onExportAllViews}
            onExport3D={onExport3D}
            onCopyToClipboard={onCopyToClipboard}
          />
        </div>
      </div>
    </div>
  );
}
