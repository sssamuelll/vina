/**
 * SkillMarketplace — main view for browsing and managing skills.
 */
import { useState, useEffect, useCallback } from 'react';
import { Upload } from 'lucide-react';
import { SkillRegistry } from '../../copilot/action/skills/skillRegistry';
import { fetchAvailableSkills, getSkillRegistryUrl } from '../../copilot/action/skills/marketplace';
import type { CommunitySkill } from '../../copilot/action/skills/communityFormat';
import type { RegisteredSkill } from '../../copilot/action/skills/registryTypes';
import SkillCard from './SkillCard';
import SkillCardInstalled from './SkillCardInstalled';
import ImportSeamlyModal from './ImportSeamlyModal';
import './SkillMarketplace.css';

type Tab = 'browse' | 'installed';

export default function SkillMarketplace() {
  const [activeTab, setActiveTab] = useState<Tab>('installed');
  const [searchQuery, setSearchQuery] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);

  // Browse state
  const [availableSkills, setAvailableSkills] = useState<CommunitySkill[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set());

  // Installed state
  const [installedSkills, setInstalledSkills] = useState<RegisteredSkill[]>([]);

  const registry = SkillRegistry.getInstance();

  // Load installed skills
  const loadInstalled = useCallback(() => {
    setInstalledSkills(registry.getAll());
  }, [registry]);

  // Subscribe to registry events
  useEffect(() => {
    loadInstalled();

    const unsub1 = registry.on('skill:registered', loadInstalled);
    const unsub2 = registry.on('skill:unregistered', loadInstalled);
    const unsub3 = registry.on('skill:enabled', loadInstalled);
    const unsub4 = registry.on('skill:disabled', loadInstalled);

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [registry, loadInstalled]);

  // Fetch available skills
  const loadAvailable = useCallback(async () => {
    const url = getSkillRegistryUrl();
    if (!url) {
      setBrowseError('Registry URL not configured. Set it in Settings.');
      return;
    }

    setBrowseLoading(true);
    setBrowseError(null);

    try {
      const skills = await fetchAvailableSkills(searchQuery || undefined);
      setAvailableSkills(skills);
    } catch (err) {
      setBrowseError(err instanceof Error ? err.message : 'Failed to load skills');
    } finally {
      setBrowseLoading(false);
    }
  }, [searchQuery]);

  // Load available when switching to browse tab
  useEffect(() => {
    if (activeTab === 'browse') {
      loadAvailable();
    }
  }, [activeTab, loadAvailable]);

  // Install skill
  const handleInstall = useCallback(async (skill: CommunitySkill) => {
    const id = skill.metadata.id;
    setInstallingIds(prev => new Set(prev).add(id));

    try {
      await registry.register(skill);
    } catch (err) {
      console.error('Install failed:', err);
    } finally {
      setInstallingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [registry]);

  // Toggle enable/disable
  const handleToggle = useCallback(async (nsid: string, enabled: boolean) => {
    if (enabled) {
      await registry.enable(nsid);
    } else {
      await registry.disable(nsid);
    }
  }, [registry]);

  // Uninstall
  const handleRemove = useCallback(async (nsid: string) => {
    await registry.unregister(nsid);
  }, [registry]);

  // Filter skills
  const filteredInstalled = installedSkills.filter(s =>
    s.skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.nsid.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredAvailable = availableSkills.filter(s =>
    s.metadata.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.metadata.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const installedCount = installedSkills.length;

  return (
    <div className="skill-marketplace">
      <div className="skill-marketplace__tabs">
        <button
          className={`skill-marketplace__tab ${activeTab === 'browse' ? 'skill-marketplace__tab--active' : ''}`}
          onClick={() => setActiveTab('browse')}
        >
          Browse
        </button>
        <button
          className={`skill-marketplace__tab ${activeTab === 'installed' ? 'skill-marketplace__tab--active' : ''}`}
          onClick={() => setActiveTab('installed')}
        >
          Installed
          <span className="skill-marketplace__tab-count">{installedCount}</span>
        </button>
      </div>

      <div className="skill-marketplace__content">
        <div className="skill-marketplace__search">
          <input
            type="text"
            className="skill-marketplace__search-input"
            placeholder="Search skills..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {activeTab === 'browse' && (
          <>
            {browseError && (
              <div className="skill-marketplace__error">
                <span>{browseError}</span>
                <button className="skill-marketplace__retry-btn" onClick={loadAvailable}>
                  Retry
                </button>
              </div>
            )}

            {browseLoading ? (
              <div className="skill-marketplace__loading">
                <div className="skill-marketplace__skeleton" />
                <div className="skill-marketplace__skeleton" />
                <div className="skill-marketplace__skeleton" />
              </div>
            ) : filteredAvailable.length === 0 ? (
              <div className="skill-marketplace__empty">
                <p>No skills found</p>
                <p className="skill-marketplace__empty-hint">
                  {searchQuery ? 'Try a different search term' : 'Configure a registry URL in Settings'}
                </p>
              </div>
            ) : (
              <div className="skill-marketplace__list">
                {filteredAvailable.map(skill => (
                  <SkillCard
                    key={skill.metadata.id}
                    metadata={skill.metadata}
                    isInstalled={registry.has(skill.metadata.id)}
                    isInstalling={installingIds.has(skill.metadata.id)}
                    onInstall={() => handleInstall(skill)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'installed' && (
          <>
            <div className="skill-marketplace__actions">
              <button
                className="skill-marketplace__import-btn"
                onClick={() => setShowImportModal(true)}
              >
                <Upload size={14} />
                Import .sm2d
              </button>
            </div>
            {filteredInstalled.length === 0 ? (
              <div className="skill-marketplace__empty">
                <p>No skills installed</p>
                <p className="skill-marketplace__empty-hint">
                  Browse the marketplace to find skills
                </p>
              </div>
            ) : (
              <div className="skill-marketplace__list">
                {filteredInstalled.map(skill => (
                  <SkillCardInstalled
                    key={skill.nsid}
                    skill={skill}
                    onToggle={enabled => handleToggle(skill.nsid, enabled)}
                    onRemove={() => handleRemove(skill.nsid)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <ImportSeamlyModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
      />
    </div>
  );
}
