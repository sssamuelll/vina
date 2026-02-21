/**
 * PluginManager — UI panel for managing OpenClo plugins.
 *
 * Lists installed plugins, allows enabling/disabling, installing from URL,
 * and removing plugins. Accessible from the ActivityBar (puzzle piece icon).
 *
 * @module components/PluginManager/PluginManager
 */

import { useState, useCallback } from 'react';
import PluginCard from './PluginCard';
import type { InstalledPlugin } from '../../copilot/plugins/types';
import {
  listInstalledPlugins,
  enablePlugin,
  disablePlugin,
  removePlugin,
  installPluginFromManifest,
} from '../../copilot/plugins/pluginManager';

import './PluginManager.css';

/**
 * Main plugin management panel.
 *
 * Provides a list of installed plugins with controls, and an install
 * form for adding new plugins from a manifest URL.
 */
export default function PluginManager() {
  const [plugins, setPlugins] = useState<InstalledPlugin[]>(() => listInstalledPlugins());
  const [installUrl, setInstallUrl] = useState('');
  const [installError, setInstallError] = useState<string | null>(null);
  const [pluginErrors, setPluginErrors] = useState<Record<string, string>>({});

  const refreshPlugins = useCallback(() => {
    setPlugins(listInstalledPlugins());
  }, []);

  const handleToggle = useCallback((id: string, enabled: boolean) => {
    try {
      if (enabled) {
        enablePlugin(id);
      } else {
        disablePlugin(id);
      }
      refreshPlugins();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPluginErrors(prev => ({ ...prev, [id]: msg }));
    }
  }, [refreshPlugins]);

  const handleRemove = useCallback((id: string) => {
    try {
      removePlugin(id);
      refreshPlugins();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPluginErrors(prev => ({ ...prev, [id]: msg }));
    }
  }, [refreshPlugins]);

  const handleInstall = useCallback(async () => {
    setInstallError(null);
    const url = installUrl.trim();
    if (!url) {
      setInstallError('Please enter a plugin URL');
      return;
    }

    try {
      // For now we support installing from a manifest URL
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const manifest = await response.json();
      installPluginFromManifest(manifest, url);
      setInstallUrl('');
      refreshPlugins();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setInstallError(msg);
    }
  }, [installUrl, refreshPlugins]);

  return (
    <div className="plugin-manager">
      <div className="plugin-manager__header">
        <h2>Plugins</h2>
        <span className="plugin-manager__count">{plugins.length} installed</span>
      </div>

      <div className="plugin-manager__install">
        <input
          type="text"
          className="plugin-manager__install-input"
          placeholder="Plugin manifest URL..."
          value={installUrl}
          onChange={e => setInstallUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleInstall()}
        />
        <button
          className="plugin-manager__install-btn"
          onClick={handleInstall}
        >
          Install
        </button>
      </div>

      {installError && (
        <div className="plugin-manager__error">⚠️ {installError}</div>
      )}

      <div className="plugin-manager__list">
        {plugins.length === 0 ? (
          <div className="plugin-manager__empty">
            <p>No plugins installed</p>
            <p className="plugin-manager__hint">
              Enter a plugin manifest URL above to install your first plugin.
            </p>
          </div>
        ) : (
          plugins.map(p => (
            <PluginCard
              key={p.manifest.id}
              id={p.manifest.id}
              name={p.manifest.name}
              author={p.manifest.author}
              version={p.manifest.version}
              description={p.manifest.description}
              enabled={p.enabled}
              permissions={p.manifest.permissions}
              error={pluginErrors[p.manifest.id]}
              onToggle={handleToggle}
              onRemove={handleRemove}
            />
          ))
        )}
      </div>
    </div>
  );
}
