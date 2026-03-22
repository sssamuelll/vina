export interface SectionProps {
  open: boolean;
  onToggle: () => void;
}

export interface RenderSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onExportStill?: (w: number, h: number, transparent: boolean) => void;
  onExportTurntable?: () => void;
  onExportAllViews?: (w: number, h: number, transparent: boolean) => void;
  onExport3D?: (format: '3d-glb' | '3d-gltf' | '3d-usdz', includeAvatar: boolean, scale: number) => void;
  onCopyToClipboard?: () => void;
}
