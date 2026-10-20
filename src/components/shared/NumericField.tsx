import { useEffect, useRef, useState } from 'react';
import { formatNumber, parseNumber } from '../../i18n/format';
import { useT } from '../../i18n';

export interface NumericFieldProps {
  value: number;
  onCommit: (value: number) => void;
  decimals: number;
  trim?: boolean;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string | readonly string[];
  id?: string;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

/**
 * A number typed in the person's locale: a text spinbutton. Never commits 0 for an empty or
 * invalid entry, clamps to min/max, steps with the arrows. No wheel handler on purpose.
 */
export function NumericField({
  value, onCommit, decimals, trim, step, min, max, suffix, id, className, disabled,
  'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy,
}: NumericFieldProps) {
  useT(); // re-render on locale change so the separator follows it

  const seed = Number.isFinite(value) ? formatNumber(value, { decimals, trim }) : '';
  const [draft, setDraft] = useState(seed);
  const [invalid, setInvalid] = useState(false);
  const dirty = useRef(false);

  // Re-seed from the parent's value (or locale) unless the person is mid-edit.
  useEffect(() => {
    if (!dirty.current) setDraft(seed);
  }, [seed]);

  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));

  const commit = (n: number) => {
    const c = clamp(n);
    dirty.current = false;
    setInvalid(false);
    setDraft(formatNumber(c, { decimals, trim }));
    if (c !== value) onCommit(c);
  };

  const commitDraft = () => {
    if (!dirty.current) return; // untouched: keep the exact stored value
    const n = parseNumber(draft, { suffix });
    if (n === null) setInvalid(true);
    else commit(n);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitDraft();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const base = parseNumber(draft, { suffix }) ?? value;
      if (!Number.isFinite(base)) return;
      const next = base + (step ?? 1) * (e.key === 'ArrowUp' ? 1 : -1);
      commit(Number(next.toFixed(Math.max(0, decimals)))); // drop float noise like 0.1 + 0.2
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      role="spinbutton"
      id={id}
      className={className}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Number.isFinite(value) ? value : undefined}
      aria-invalid={invalid || undefined}
      value={draft}
      onChange={(e) => { dirty.current = true; setInvalid(false); setDraft(e.target.value); }}
      onKeyDown={onKeyDown}
      onBlur={commitDraft}
    />
  );
}
