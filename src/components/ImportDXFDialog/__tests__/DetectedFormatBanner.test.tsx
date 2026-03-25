// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import DetectedFormatBanner from '../DetectedFormatBanner';
import type { DetectionResult } from '../../../utils/dxf/types';

afterEach(() => {
  cleanup();
});

const confidentResults: DetectionResult[] = [
  { profileId: 'aama' as const, name: 'AAMA / DXF-AAMA', confidence: 95 },
  { profileId: 'astm' as const, name: 'ASTM D6673', confidence: 30 },
];

const ambiguousResults: DetectionResult[] = [
  { profileId: 'aama' as const, name: 'AAMA / DXF-AAMA', confidence: 72 },
  { profileId: 'gerber' as const, name: 'Gerber AccuMark', confidence: 58 },
  { profileId: 'astm' as const, name: 'ASTM D6673', confidence: 31 },
];

describe('DetectedFormatBanner', () => {
  it('confident banner — renders detected text when top confidence >= 80%', () => {
    render(
      <DetectedFormatBanner
        results={confidentResults}
        selectedFormat="aama"
        onFormatChange={vi.fn()}
        onAlwaysUse={vi.fn()}
        rememberedFormat={null}
        onClearRemembered={vi.fn()}
      />
    );
    expect(screen.getByText('Detected: AAMA / DXF-AAMA (95%)')).toBeTruthy();
  });

  it('ambiguous selector — renders radio buttons and heading when top confidence < 80%', () => {
    render(
      <DetectedFormatBanner
        results={ambiguousResults}
        selectedFormat="aama"
        onFormatChange={vi.fn()}
        onAlwaysUse={vi.fn()}
        rememberedFormat={null}
        onClearRemembered={vi.fn()}
      />
    );
    expect(screen.getByText('Multiple formats detected')).toBeTruthy();
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBe(3);
  });

  it('"Always use" checkbox — calls onAlwaysUse(selectedFormat) when checked, not when unchecked', () => {
    const onAlwaysUse = vi.fn();
    render(
      <DetectedFormatBanner
        results={ambiguousResults}
        selectedFormat="gerber"
        onFormatChange={vi.fn()}
        onAlwaysUse={onAlwaysUse}
        rememberedFormat={null}
        onClearRemembered={vi.fn()}
      />
    );
    const checkbox = screen.getByRole('checkbox');

    // Check it — should call onAlwaysUse with the selected format
    fireEvent.click(checkbox);
    expect(onAlwaysUse).toHaveBeenCalledTimes(1);
    expect(onAlwaysUse).toHaveBeenCalledWith('gerber');

    // Uncheck it — should NOT call onAlwaysUse again
    fireEvent.click(checkbox);
    expect(onAlwaysUse).toHaveBeenCalledTimes(1);
  });

  it('remembered label — shows "Remembered" text when rememberedFormat is set', () => {
    render(
      <DetectedFormatBanner
        results={confidentResults}
        selectedFormat="aama"
        onFormatChange={vi.fn()}
        onAlwaysUse={vi.fn()}
        rememberedFormat="aama"
        onClearRemembered={vi.fn()}
      />
    );
    expect(screen.getByText(/Remembered/)).toBeTruthy();
  });

  it('clear link — clicking Clear button calls onClearRemembered', () => {
    const onClearRemembered = vi.fn();
    render(
      <DetectedFormatBanner
        results={confidentResults}
        selectedFormat="aama"
        onFormatChange={vi.fn()}
        onAlwaysUse={vi.fn()}
        rememberedFormat="aama"
        onClearRemembered={onClearRemembered}
      />
    );
    fireEvent.click(screen.getByText('Clear'));
    expect(onClearRemembered).toHaveBeenCalledTimes(1);
  });
});
