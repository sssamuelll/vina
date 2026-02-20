import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  COPILOT_SHORTCUTS,
  formatShortcut,
  createCopilotKeyHandler,
  getCopilotCommands,
} from '../keyboardShortcuts';

/** Helper to create mock handlers with spy tracking. */
function makeMockHandlers() {
  return {
    onFocusInput: vi.fn() as unknown as (() => void) & ReturnType<typeof vi.fn>,
    onTogglePanel: vi.fn() as unknown as (() => void) & ReturnType<typeof vi.fn>,
    onBlurInput: vi.fn() as unknown as (() => void) & ReturnType<typeof vi.fn>,
  };
}

// ─── COPILOT_SHORTCUTS ──────────────────────────────────────────────────────

describe('COPILOT_SHORTCUTS', () => {
  it('should have 3 shortcuts', () => {
    expect(COPILOT_SHORTCUTS.length).toBe(3);
  });

  it('should include focus input shortcut', () => {
    const focus = COPILOT_SHORTCUTS[0];
    expect(focus.key).toBe('/');
    expect(focus.meta).toBe(true);
    expect(focus.shift).toBe(false);
    expect(focus.description).toContain('Focus');
  });

  it('should include toggle panel shortcut', () => {
    const toggle = COPILOT_SHORTCUTS[1];
    expect(toggle.key).toBe('/');
    expect(toggle.meta).toBe(true);
    expect(toggle.shift).toBe(true);
    expect(toggle.description).toContain('Toggle');
  });

  it('should include escape shortcut', () => {
    const esc = COPILOT_SHORTCUTS[2];
    expect(esc.key).toBe('Escape');
    expect(esc.meta).toBe(false);
    expect(esc.shift).toBe(false);
    expect(esc.description).toContain('Blur');
  });

  it('should have display strings for all shortcuts', () => {
    for (const shortcut of COPILOT_SHORTCUTS) {
      expect(shortcut.display.length).toBeGreaterThan(0);
    }
  });
});

// ─── formatShortcut ─────────────────────────────────────────────────────────

describe('formatShortcut', () => {
  it('should format focus shortcut', () => {
    const text = formatShortcut(COPILOT_SHORTCUTS[0]);
    expect(text).toContain('/');
    expect(text.length).toBeGreaterThan(1);
  });

  it('should format toggle shortcut with shift', () => {
    const text = formatShortcut(COPILOT_SHORTCUTS[1]);
    expect(text).toContain('/');
  });

  it('should format escape shortcut (no meta)', () => {
    const text = formatShortcut(COPILOT_SHORTCUTS[2]);
    expect(text).toContain('Escape');
  });

  it('should produce non-empty strings for all shortcuts', () => {
    for (const shortcut of COPILOT_SHORTCUTS) {
      const formatted = formatShortcut(shortcut);
      expect(formatted.length).toBeGreaterThan(0);
    }
  });
});

// ─── createCopilotKeyHandler ────────────────────────────────────────────────

describe('createCopilotKeyHandler', () => {
  let handlers: ReturnType<typeof makeMockHandlers>;

  beforeEach(() => {
    handlers = makeMockHandlers();
  });

  it('should call onFocusInput on Cmd/Ctrl+/', () => {
    const handler = createCopilotKeyHandler(handlers);
    const event = {
      key: '/',
      ctrlKey: true,
      metaKey: true,
      shiftKey: false,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;

    handler(event);
    expect(handlers.onFocusInput).toHaveBeenCalledTimes(1);
    expect((event as unknown as { preventDefault: ReturnType<typeof vi.fn> }).preventDefault).toHaveBeenCalled();
  });

  it('should call onTogglePanel on Cmd/Ctrl+Shift+/', () => {
    const handler = createCopilotKeyHandler(handlers);
    const event = {
      key: '/',
      ctrlKey: true,
      metaKey: true,
      shiftKey: true,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;

    handler(event);
    expect(handlers.onTogglePanel).toHaveBeenCalledTimes(1);
  });

  it('should call onBlurInput on Escape when copilot-input is focused', () => {
    const handler = createCopilotKeyHandler(handlers);

    // Create a minimal fake element with classList.contains
    const fakeInput = { classList: { contains: (c: string) => c === 'copilot-input' } };
    // Temporarily provide `document` with the fake activeElement
    const origDoc = globalThis.document;
    (globalThis as Record<string, unknown>).document = { activeElement: fakeInput };

    const event = {
      key: 'Escape',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;

    handler(event);
    expect(handlers.onBlurInput).toHaveBeenCalledTimes(1);

    (globalThis as Record<string, unknown>).document = origDoc;
  });

  it('should NOT call onBlurInput on Escape when non-copilot element is focused', () => {
    const handler = createCopilotKeyHandler(handlers);

    const fakeDiv = { classList: { contains: () => false } };
    const origDoc = globalThis.document;
    (globalThis as Record<string, unknown>).document = { activeElement: fakeDiv };

    const event = {
      key: 'Escape',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;

    handler(event);
    expect(handlers.onBlurInput).not.toHaveBeenCalled();

    (globalThis as Record<string, unknown>).document = origDoc;
  });

  it('should not trigger on random keys', () => {
    const handler = createCopilotKeyHandler(handlers);
    const event = {
      key: 'a',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;

    handler(event);
    expect(handlers.onFocusInput).not.toHaveBeenCalled();
    expect(handlers.onTogglePanel).not.toHaveBeenCalled();
    expect(handlers.onBlurInput).not.toHaveBeenCalled();
  });

  it('should not trigger on / without meta/ctrl', () => {
    const handler = createCopilotKeyHandler(handlers);
    const event = {
      key: '/',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;

    handler(event);
    expect(handlers.onFocusInput).not.toHaveBeenCalled();
  });

  it('should prioritize toggle (Shift+/) over focus (/)', () => {
    const handler = createCopilotKeyHandler(handlers);
    const event = {
      key: '/',
      ctrlKey: true,
      metaKey: true,
      shiftKey: true,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;

    handler(event);
    expect(handlers.onTogglePanel).toHaveBeenCalledTimes(1);
    expect(handlers.onFocusInput).not.toHaveBeenCalled();
  });
});

// ─── getCopilotCommands ─────────────────────────────────────────────────────

describe('getCopilotCommands', () => {
  it('should return 3 commands', () => {
    const commands = getCopilotCommands(makeMockHandlers());
    expect(commands.length).toBe(3);
  });

  it('should have Chat category for all', () => {
    const commands = getCopilotCommands(makeMockHandlers());
    expect(commands.every(c => c.category === 'Chat')).toBe(true);
  });

  it('should have correct command IDs', () => {
    const commands = getCopilotCommands(makeMockHandlers());
    expect(commands[0].id).toBe('copilot-focus');
    expect(commands[1].id).toBe('copilot-toggle');
    expect(commands[2].id).toBe('copilot-blur');
  });

  it('should have non-empty names', () => {
    const commands = getCopilotCommands(makeMockHandlers());
    for (const cmd of commands) {
      expect(cmd.name.length).toBeGreaterThan(0);
    }
  });

  it('should map focus action correctly', () => {
    const h = makeMockHandlers();
    const commands = getCopilotCommands(h);
    commands[0].action();
    expect(h.onFocusInput).toHaveBeenCalled();
  });

  it('should map toggle action correctly', () => {
    const h = makeMockHandlers();
    const commands = getCopilotCommands(h);
    commands[1].action();
    expect(h.onTogglePanel).toHaveBeenCalled();
  });

  it('should map blur action correctly', () => {
    const h = makeMockHandlers();
    const commands = getCopilotCommands(h);
    commands[2].action();
    expect(h.onBlurInput).toHaveBeenCalled();
  });

  it('should include shortcut strings', () => {
    const commands = getCopilotCommands(makeMockHandlers());
    expect(commands[0].shortcut).toBeDefined();
    expect(commands[1].shortcut).toBeDefined();
    expect(commands[2].shortcut).toBe('Esc');
  });
});
