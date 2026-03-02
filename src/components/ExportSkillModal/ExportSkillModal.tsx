/**
 * ExportSkillModal — UI for exporting project as .oskill file.
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { X, Download, Check, AlertTriangle } from 'lucide-react';
import type { RootState } from '../../store';
import { SkillBuilder } from '../../copilot/action/skills/SkillBuilder';
import { SkillRegistry } from '../../copilot/action/skills/skillRegistry';
import './ExportSkillModal.css';

interface ExportSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ExportState = 'editing' | 'exporting' | 'success' | 'error';

const LICENSE_OPTIONS = ['MIT', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'Apache-2.0', 'GPL-3.0'];

export default function ExportSkillModal({ isOpen, onClose }: ExportSkillModalProps) {
  const construction = useSelector((s: RootState) => s.construction);
  const projectName = useSelector((s: RootState) => s.project.name);

  const [state, setState] = useState<ExportState>('editing');
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [name, setName] = useState('');
  const [author, setAuthor] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [license, setLicense] = useState('MIT');
  const [description, setDescription] = useState('');
  const [triggers, setTriggers] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [registerLocally, setRegisterLocally] = useState(true);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setState('editing');
      setError(null);
      setName(projectName || '');
      setDescription(projectName ? `Parametric pattern: ${projectName}` : '');
      setAuthor('');
      setVersion('1.0.0');
      setLicense('MIT');
      setTriggers([]);
      setTags([]);
    }
  }, [isOpen, projectName]);

  // Build preview
  const builder = useMemo(() => {
    if (!construction || !isOpen) return null;
    return new SkillBuilder()
      .fromConstruction(construction)
      .withMetadata({ name, author, description, version, license, tags });
  }, [construction, isOpen, name, author, description, version, license, tags]);

  const preview = builder?.getPreview();
  const validation = builder?.validate();

  // Auto-generate triggers when name changes
  useEffect(() => {
    if (name && triggers.length === 0 && builder) {
      const skill = builder.generateTriggers(name).build();
      setTriggers(skill.skill.triggers);
    }
  }, [name, builder, triggers.length]);

  const handleClose = useCallback(() => {
    setState('editing');
    setError(null);
    onClose();
  }, [onClose]);

  const handleExport = useCallback(async () => {
    if (!builder || !validation?.valid) return;

    setState('exporting');

    try {
      // Build final skill with edited triggers
      const finalBuilder = new SkillBuilder()
        .fromConstruction(construction)
        .withMetadata({ name, author, description, version, license, tags })
        .generateTriggers(name);

      const skill = finalBuilder.build();
      // Override with custom triggers if edited
      skill.skill.triggers = triggers.filter((t) => t.trim() !== '');

      // Download file
      const json = JSON.stringify(skill, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name.toLowerCase().replace(/\s+/g, '-')}.oskill`;
      a.click();
      URL.revokeObjectURL(url);

      // Register locally if checked
      if (registerLocally) {
        const registry = SkillRegistry.getInstance();
        await registry.register(skill, 'local');
      }

      setState('success');
      setTimeout(handleClose, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
      setState('error');
    }
  }, [
    builder,
    validation,
    construction,
    name,
    author,
    description,
    version,
    license,
    tags,
    triggers,
    registerLocally,
    handleClose,
  ]);

  const addTrigger = useCallback(() => {
    setTriggers([...triggers, '']);
  }, [triggers]);

  const updateTrigger = useCallback(
    (index: number, value: string) => {
      const newTriggers = [...triggers];
      newTriggers[index] = value;
      setTriggers(newTriggers);
    },
    [triggers],
  );

  const removeTrigger = useCallback(
    (index: number) => {
      setTriggers(triggers.filter((_, i) => i !== index));
    },
    [triggers],
  );

  const addTag = useCallback(() => {
    setTags([...tags, '']);
  }, [tags]);

  const updateTag = useCallback(
    (index: number, value: string) => {
      const newTags = [...tags];
      newTags[index] = value;
      setTags(newTags);
    },
    [tags],
  );

  const removeTag = useCallback(
    (index: number) => {
      setTags(tags.filter((_, i) => i !== index));
    },
    [tags],
  );

  if (!isOpen) return null;

  const canExport = validation?.valid && name.trim() && author.trim();

  return (
    <div className="export-modal-overlay" onClick={handleClose}>
      <div className="export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="export-modal__header">
          <h2>Export as Skill</h2>
          <button className="export-modal__close" onClick={handleClose}>
            <X size={18} />
          </button>
        </div>

        <div className="export-modal__content">
          {state === 'error' && error && (
            <div className="export-modal__error">
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          )}

          {state === 'success' ? (
            <div className="export-modal__success">
              <Check size={24} />
              <span>Skill exported successfully!</span>
            </div>
          ) : (
            <>
              <div className="export-modal__form">
                <label>
                  Name *
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={state === 'exporting'}
                    placeholder="e.g., Bodice Block"
                  />
                </label>

                <label>
                  Author *
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    disabled={state === 'exporting'}
                    placeholder="Your name"
                  />
                </label>

                <div className="export-modal__row">
                  <label>
                    Version
                    <input
                      type="text"
                      value={version}
                      onChange={(e) => setVersion(e.target.value)}
                      disabled={state === 'exporting'}
                    />
                  </label>

                  <label>
                    License
                    <select
                      value={license}
                      onChange={(e) => setLicense(e.target.value)}
                      disabled={state === 'exporting'}
                    >
                      {LICENSE_OPTIONS.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label>
                  Description
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={state === 'exporting'}
                    rows={2}
                    placeholder="Describe this pattern skill..."
                  />
                </label>

                <label>
                  Triggers (how users will ask for this)
                  <div className="export-modal__list">
                    {triggers.map((t, i) => (
                      <div key={i} className="export-modal__list-item">
                        <input
                          type="text"
                          value={t}
                          onChange={(e) => updateTrigger(i, e.target.value)}
                          disabled={state === 'exporting'}
                        />
                        <button
                          onClick={() => removeTrigger(i)}
                          disabled={state === 'exporting'}
                          type="button"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      className="export-modal__add-btn"
                      onClick={addTrigger}
                      disabled={state === 'exporting'}
                      type="button"
                    >
                      + Add trigger
                    </button>
                  </div>
                </label>

                <label>
                  Tags
                  <div className="export-modal__list">
                    {tags.map((tag, i) => (
                      <div key={i} className="export-modal__list-item">
                        <input
                          type="text"
                          value={tag}
                          onChange={(e) => updateTag(i, e.target.value)}
                          disabled={state === 'exporting'}
                        />
                        <button
                          onClick={() => removeTag(i)}
                          disabled={state === 'exporting'}
                          type="button"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      className="export-modal__add-btn"
                      onClick={addTag}
                      disabled={state === 'exporting'}
                      type="button"
                    >
                      + Add tag
                    </button>
                  </div>
                </label>
              </div>

              {preview && (
                <div className="export-modal__preview">
                  <strong>Preview</strong>
                  <ul>
                    <li>{preview.stepCount} construction steps</li>
                    <li>{preview.formulaCount} formulas</li>
                    <li>{preview.pieceCount} pieces</li>
                  </ul>
                  {validation?.warnings.map((w, i) => (
                    <p key={i} className="export-modal__warning">
                      {w}
                    </p>
                  ))}
                </div>
              )}

              <label className="export-modal__checkbox">
                <input
                  type="checkbox"
                  checked={registerLocally}
                  onChange={(e) => setRegisterLocally(e.target.checked)}
                  disabled={state === 'exporting'}
                />
                Also register to local SkillRegistry
              </label>
            </>
          )}
        </div>

        <div className="export-modal__footer">
          <button className="export-modal__cancel" onClick={handleClose}>
            Cancel
          </button>
          <button
            className="export-modal__export"
            onClick={handleExport}
            disabled={!canExport || state === 'exporting'}
          >
            <Download size={14} />
            {state === 'exporting' ? 'Exporting...' : 'Export .oskill'}
          </button>
        </div>
      </div>
    </div>
  );
}
