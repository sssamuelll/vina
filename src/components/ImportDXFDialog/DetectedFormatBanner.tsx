import type { DetectionResult, FormatId } from '../../utils/dxf/types';

const CONFIDENT_THRESHOLD = 80;

interface DetectedFormatBannerProps {
  results: DetectionResult[];
  selectedFormat: FormatId;
  onFormatChange: (id: FormatId) => void;
  onAlwaysUse: (id: FormatId) => void;
  rememberedFormat: FormatId | null;
  onClearRemembered: () => void;
}

export default function DetectedFormatBanner({
  results, selectedFormat, onFormatChange, onAlwaysUse, rememberedFormat, onClearRemembered,
}: DetectedFormatBannerProps) {
  // If user has a remembered format preference, show that
  if (rememberedFormat) {
    const profile = results.find(r => r.profileId === rememberedFormat);
    return (
      <div className="dxf-format-banner dxf-format-remembered">
        <span>Remembered: {profile?.name ?? rememberedFormat}</span>
        <button onClick={onClearRemembered} className="dxf-clear-btn">Clear</button>
      </div>
    );
  }

  const top = results[0];
  if (!top) return null;

  // Confident: simple info banner with dropdown to change
  if (top.confidence >= CONFIDENT_THRESHOLD) {
    return (
      <div className="dxf-format-banner dxf-format-confident">
        <span>Detected: {top.name} ({top.confidence}%)</span>
        <select
          value={selectedFormat}
          onChange={e => onFormatChange(e.target.value as FormatId)}
        >
          {results.map(r => (
            <option key={r.profileId} value={r.profileId}>
              {r.name} ({r.confidence}%)
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Ambiguous: full selector with radio buttons and confidence bars
  return (
    <div className="dxf-format-banner dxf-format-ambiguous">
      <div className="dxf-format-title">Multiple formats detected</div>
      {results.filter(r => r.confidence > 0).map(r => (
        <label key={r.profileId} className="dxf-format-option">
          <input
            type="radio"
            name="dxf-format"
            value={r.profileId}
            checked={selectedFormat === r.profileId}
            onChange={() => onFormatChange(r.profileId)}
          />
          <span className="dxf-format-name">{r.name}</span>
          <span className="dxf-format-confidence">{r.confidence}%</span>
          <div className="dxf-format-bar">
            <div className="dxf-format-bar-fill" style={{ width: `${r.confidence}%` }} />
          </div>
        </label>
      ))}
      <label className="dxf-format-always">
        <input
          type="checkbox"
          onChange={e => {
            if (e.target.checked) onAlwaysUse(selectedFormat);
          }}
        />
        Always use this format
      </label>
    </div>
  );
}

export { CONFIDENT_THRESHOLD };
