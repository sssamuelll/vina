/**
 * PluginCard — displays a single plugin's info with controls.
 *
 * Shows plugin name, author, version, permissions as badges,
 * an enable/disable toggle, and a remove button.
 *
 * @module components/PluginManager/PluginCard
 */

import { useState } from 'react';

/** Props for the PluginCard component */
interface PluginCardProps {
  /** Plugin unique id */
  id: string;
  /** Display name */
  name: string;
  /** Author name */
  author: string;
  /** Semver version */
  version: string;
  /** Description text */
  description: string;
  /** Whether the plugin is currently enabled */
  enabled: boolean;
  /** Permissions requested by this plugin */
  permissions: string[];
  /** Optional error message */
  error?: string;
  /** Called when enable/disable toggle is clicked */
  onToggle: (id: string, enabled: boolean) => void;
  /** Called when remove button is clicked */
  onRemove: (id: string) => void;
}

/** Human-readable labels for permission badges */
const PERMISSION_LABELS: Record<string, string> = {
  'read-pieces': '📐 Read Pieces',
  'write-pieces': '✏️ Write Pieces',
  'read-measurements': '📏 Measurements',
  'export': '📤 Export',
  'simulation': '🧵 Simulation',
  'network': '🌐 Network',
  'storage': '💾 Storage',
};

/**
 * Individual plugin display card with toggle, remove, and expandable details.
 */
export default function PluginCard({
  id,
  name,
  author,
  version,
  description,
  enabled,
  permissions,
  error,
  onToggle,
  onRemove,
}: PluginCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`plugin-card ${enabled ? 'plugin-card--enabled' : ''} ${error ? 'plugin-card--error' : ''}`}>
      <div className="plugin-card__header">
        <div className="plugin-card__info" onClick={() => setExpanded(!expanded)}>
          <span className="plugin-card__name">{name}</span>
          <span className="plugin-card__version">v{version}</span>
          <span className="plugin-card__author">by {author}</span>
        </div>
        <div className="plugin-card__actions">
          <label className="plugin-card__toggle" title={enabled ? 'Disable' : 'Enable'}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={() => onToggle(id, !enabled)}
            />
            <span className="plugin-card__toggle-slider" />
          </label>
          <button
            className="plugin-card__remove"
            onClick={() => onRemove(id)}
            title="Remove plugin"
          >
            ✕
          </button>
        </div>
      </div>

      {error && (
        <div className="plugin-card__error">⚠️ {error}</div>
      )}

      {expanded && (
        <div className="plugin-card__details">
          <p className="plugin-card__description">{description}</p>
          <div className="plugin-card__permissions">
            {permissions.map(perm => (
              <span key={perm} className="plugin-card__permission-badge">
                {PERMISSION_LABELS[perm] ?? perm}
              </span>
            ))}
          </div>
          <div className="plugin-card__id">ID: {id}</div>
        </div>
      )}
    </div>
  );
}
