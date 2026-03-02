/**
 * SkillCardInstalled — displays an installed skill with enable/disable toggle.
 */
import { Trash2 } from 'lucide-react';
import type { RegisteredSkill } from '../../copilot/action/skills/registryTypes';
import { isCoreSkill } from '../../copilot/action/skills/coreSkills';

interface SkillCardInstalledProps {
  skill: RegisteredSkill;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
}

export default function SkillCardInstalled({
  skill,
  onToggle,
  onRemove,
}: SkillCardInstalledProps) {
  const isCore = isCoreSkill(skill.nsid);

  return (
    <div className={`skill-card skill-card--installed ${skill.enabled ? 'skill-card--enabled' : ''}`}>
      <div className="skill-card__header">
        <div className="skill-card__info">
          <span className="skill-card__name">{skill.skill.name}</span>
          <span className="skill-card__version">v{skill.version}</span>
        </div>
        <div className="skill-card__actions">
          <label className="skill-card__toggle">
            <input
              type="checkbox"
              checked={skill.enabled}
              onChange={e => onToggle(e.target.checked)}
            />
            <span className="skill-card__toggle-slider" />
          </label>
          {!isCore && (
            <button
              className="skill-card__remove"
              onClick={onRemove}
              title="Uninstall skill"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="skill-card__meta">
        <span className="skill-card__nsid">{skill.nsid}</span>
        <span className="skill-card__source">{skill.source}</span>
      </div>
    </div>
  );
}
