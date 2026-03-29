import { useState, useMemo, useCallback } from 'react';
import { TRIM_LIBRARY, searchTrimPresets } from '../../utils/trim/trimLibrary';
import type { TrimPreset, TrimType } from '../../types/trim';
import './TrimLibraryPanel.css';

// Group presets by type
const TRIM_TYPE_LABELS: Record<TrimType, string> = {
  button: 'Buttons',
  zipper: 'Zippers',
  snap: 'Snaps',
  rivet: 'Rivets',
  buckle: 'Buckles',
  ring: 'Rings',
  'hook-eye': 'Hook & Eye',
  'drawstring-stop': 'Drawstring',
  custom: 'Custom',
};

interface TrimLibraryPanelProps {
  selectedPresetId: string | null;
  onSelectPreset: (preset: TrimPreset) => void;
}

export default function TrimLibraryPanel({ selectedPresetId, onSelectPreset }: TrimLibraryPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());

  const filteredPresets = useMemo(() => {
    if (!searchQuery.trim()) return TRIM_LIBRARY as readonly TrimPreset[];
    return searchTrimPresets(searchQuery);
  }, [searchQuery]);

  const groupedPresets = useMemo(() => {
    const groups = new Map<TrimType, TrimPreset[]>();
    for (const preset of filteredPresets) {
      const list = groups.get(preset.type) ?? [];
      list.push(preset);
      groups.set(preset.type, list);
    }
    return groups;
  }, [filteredPresets]);

  const toggleType = useCallback((type: string) => {
    setCollapsedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  return (
    <div className="trim-library-panel">
      <div className="trim-library-header">Trim Library</div>
      <input
        className="trim-library-search"
        type="text"
        placeholder="Search trims..."
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
      />
      <div className="trim-library-list">
        {[...groupedPresets.entries()].map(([type, presets]) => {
          const collapsed = collapsedTypes.has(type);
          return (
            <div key={type} className="trim-library-group">
              <div className="trim-library-group-header" onClick={() => toggleType(type)}>
                {collapsed ? '\u25B8' : '\u25BE'} {TRIM_TYPE_LABELS[type] ?? type} ({presets.length})
              </div>
              {!collapsed && presets.map(preset => (
                <div
                  key={preset.id}
                  className={`trim-library-item ${selectedPresetId === preset.id ? 'selected' : ''}`}
                  onClick={() => onSelectPreset(preset)}
                >
                  <span
                    className="trim-library-swatch"
                    style={{ backgroundColor: preset.color }}
                  />
                  <span className="trim-library-name">{preset.name}</span>
                  <span className="trim-library-cost">${preset.unitCost.toFixed(2)}</span>
                </div>
              ))}
            </div>
          );
        })}
        {groupedPresets.size === 0 && (
          <div className="trim-library-empty">No trims match &ldquo;{searchQuery}&rdquo;</div>
        )}
      </div>
    </div>
  );
}
