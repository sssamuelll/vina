/**
 * ImportSeamlyModal — UI for importing Seamly2D .sm2d files as skills.
 *
 * Provides a drag-and-drop interface for uploading .sm2d pattern files,
 * previewing the conversion result, and editing metadata before import.
 */
import { useState, useCallback, useRef } from 'react';
import { X, Upload, AlertTriangle, Check } from 'lucide-react';
import { convertSeamlyToSkill, type ConversionResult } from '../../copilot/skills/seamlyToSkill';
import { SkillRegistry } from '../../copilot/skills/skillRegistry';
import './ImportSeamlyModal.css';

interface ImportSeamlyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ImportState = 'idle' | 'parsed' | 'importing' | 'success' | 'error';

export default function ImportSeamlyModal({ isOpen, onClose }: ImportSeamlyModalProps) {
  const [state, setState] = useState<ImportState>('idle');
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');

  // Editable fields
  const [name, setName] = useState('');
  const [author, setAuthor] = useState('');
  const [triggers, setTriggers] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setState('idle');
    setResult(null);
    setError(null);
    setFileName('');
    setName('');
    setAuthor('');
    setTriggers([]);
    setTags([]);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.sm2d') && !file.name.endsWith('.val')) {
      setError('Please select a .sm2d or .val file');
      setState('error');
      return;
    }

    try {
      const content = await file.text();
      const patternName = file.name.replace(/\.(sm2d|val)$/, '');
      const conversionResult = convertSeamlyToSkill(content, patternName);

      setResult(conversionResult);
      setFileName(file.name);
      setName(conversionResult.skill.metadata.name);
      setAuthor(conversionResult.skill.metadata.author);
      setTriggers([...conversionResult.skill.skill.triggers]);
      setTags([...conversionResult.skill.metadata.tags]);
      setState('parsed');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
      setState('error');
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleImport = useCallback(async () => {
    if (!result) return;

    setState('importing');

    try {
      // Update skill with edited values
      const skill = structuredClone(result.skill);
      skill.metadata.name = name;
      skill.metadata.author = author;
      skill.metadata.tags = tags;
      skill.metadata.id = `local:${name.toLowerCase().replace(/\s+/g, '-')}`;
      skill.skill.name = name;
      skill.skill.triggers = triggers.filter((t) => t.trim() !== '');

      const registry = SkillRegistry.getInstance();
      await registry.register(skill, 'local');

      setState('success');
      setTimeout(handleClose, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import skill');
      setState('error');
    }
  }, [result, name, author, triggers, tags, handleClose]);

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

  return (
    <div className="import-modal-overlay" onClick={handleClose}>
      <div className="import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="import-modal__header">
          <h2>Import Seamly2D Pattern</h2>
          <button className="import-modal__close" onClick={handleClose}>
            <X size={18} />
          </button>
        </div>

        <div className="import-modal__content">
          {state === 'idle' && (
            <div
              className="import-modal__dropzone"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={32} />
              <p>Drop .sm2d file here or click to browse</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".sm2d,.val"
                onChange={handleFileInput}
                style={{ display: 'none' }}
              />
            </div>
          )}

          {state === 'error' && error && (
            <div className="import-modal__error">
              <AlertTriangle size={18} />
              <span>{error}</span>
              <button onClick={reset}>Try Again</button>
            </div>
          )}

          {(state === 'parsed' || state === 'importing') && result && (
            <>
              <div className="import-modal__file">
                <span>{fileName}</span>
              </div>

              <div className="import-modal__form">
                <label>
                  Name
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={state === 'importing'}
                  />
                </label>

                <label>
                  Author
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    disabled={state === 'importing'}
                  />
                </label>

                <label>
                  Triggers (how users will ask for this)
                  <div className="import-modal__list">
                    {triggers.map((t, i) => (
                      <div key={i} className="import-modal__list-item">
                        <input
                          type="text"
                          value={t}
                          onChange={(e) => updateTrigger(i, e.target.value)}
                          disabled={state === 'importing'}
                          placeholder="e.g., bodice block"
                        />
                        <button
                          onClick={() => removeTrigger(i)}
                          disabled={state === 'importing'}
                          type="button"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      className="import-modal__add-btn"
                      onClick={addTrigger}
                      disabled={state === 'importing'}
                      type="button"
                    >
                      + Add trigger
                    </button>
                  </div>
                </label>

                <label>
                  Tags
                  <div className="import-modal__list">
                    {tags.map((tag, i) => (
                      <div key={i} className="import-modal__list-item">
                        <input
                          type="text"
                          value={tag}
                          onChange={(e) => updateTag(i, e.target.value)}
                          disabled={state === 'importing'}
                          placeholder="e.g., bodice"
                        />
                        <button
                          onClick={() => removeTag(i)}
                          disabled={state === 'importing'}
                          type="button"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      className="import-modal__add-btn"
                      onClick={addTag}
                      disabled={state === 'importing'}
                      type="button"
                    >
                      + Add tag
                    </button>
                  </div>
                </label>
              </div>

              <div className="import-modal__preview">
                <strong>Preview:</strong>
                <p>
                  {result.validation.stats.totalSteps} construction steps,{' '}
                  {result.validation.stats.pieces} pieces
                </p>
                {result.validation.warnings.length > 0 && (
                  <p className="import-modal__warnings">
                    {result.validation.warnings.length} warning(s)
                  </p>
                )}
              </div>
            </>
          )}

          {state === 'success' && (
            <div className="import-modal__success">
              <Check size={24} />
              <span>Skill imported successfully!</span>
            </div>
          )}
        </div>

        <div className="import-modal__footer">
          <button className="import-modal__cancel" onClick={handleClose}>
            Cancel
          </button>
          <button
            className="import-modal__import"
            onClick={handleImport}
            disabled={state !== 'parsed' || !name.trim()}
          >
            {state === 'importing' ? 'Importing...' : 'Import Skill'}
          </button>
        </div>
      </div>
    </div>
  );
}
