/**
 * SkillCard — displays a single skill in the Browse tab.
 */
import { Download, Check, Loader2 } from 'lucide-react';
import type { CommunitySkillMetadata } from '../../copilot/action/skills/communityFormat';

interface SkillCardProps {
  metadata: CommunitySkillMetadata;
  isInstalled: boolean;
  isInstalling: boolean;
  onInstall: () => void;
}

export default function SkillCard({
  metadata,
  isInstalled,
  isInstalling,
  onInstall,
}: SkillCardProps) {
  return (
    <div className="skill-card">
      <div className="skill-card__header">
        <div className="skill-card__info">
          <span className="skill-card__name">{metadata.name}</span>
          <span className="skill-card__version">v{metadata.version}</span>
        </div>
        <div className="skill-card__actions">
          {isInstalled ? (
            <span className="skill-card__installed">
              <Check size={14} /> Installed
            </span>
          ) : (
            <button
              className="skill-card__install-btn"
              onClick={onInstall}
              disabled={isInstalling}
            >
              {isInstalling ? (
                <Loader2 size={14} className="skill-card__spinner" />
              ) : (
                <Download size={14} />
              )}
              {isInstalling ? 'Installing...' : 'Install'}
            </button>
          )}
        </div>
      </div>
      <div className="skill-card__meta">
        <span className="skill-card__author">by {metadata.author}</span>
        {metadata.tags.length > 0 && (
          <div className="skill-card__tags">
            {metadata.tags.slice(0, 3).map(tag => (
              <span key={tag} className="skill-card__tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
      <p className="skill-card__description">{metadata.description}</p>
    </div>
  );
}
