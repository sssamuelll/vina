import { describe, it, expect, vi } from 'vitest';
import {
  COPILOT_SHORTCUTS,
  formatShortcut,
  createCopilotKeyHandler,
  getCopilotCommands,
} from '../keyboardShortcuts';

describe('COPILOT_SHORTCUTS', () => {
  it('should have 3 shortcuts', () => {
    expect(COPILOT_SHORTCUTS.length).toBe(3);
  });

  it('should include focus input shortcut', () => {
    const focus = COPILOT_SHORTCUTS[0];
    expect(focus.key).toBe('/');
    expect(focus.meta).toBe(true);
    expect(focus.shift).toBe(false);
  });

  it('should include toggle panel shortcut', () => {
    const toggle = COPILOT_SHORTCUTS[1];
    expect(toggle.key).toBe('/');
    expect(toggle.meta).toBe(true);
    expect(toggle.shift).toBe(true);
  });

  it('should include escape shortcut', () => {
    const esc = COPILOT_SHORTCUTS[2];
    expect(esc.key).toBe('Escape');
    expect(esc.meta).toBe(false);
    expect(esc.shift).toBe(false);
  });
});

describe('formatShortcut', () => {
  it('should format focus shortcut', () => {
    const text = formatShortcut(COPILOT_SHORTCUTS[0]);
    // Should contain "/" and some meta key indicator
    expect(text).toContain('/');
    expect(text.length).toBeGreaterThan(1);
  });

  it('should format toggle shortcut with shift', () => {
    const text = formatShortcut(COPILOT_SHORTCUTS[1]);
    expect(text).toContain('/');
  });
});

describe('createCopilotKeyHandler', () => {
  const handlers = {
    onFocusInput: vi.fn(),
    onTogglePanel: vi.fn(),
    onBlurInput: vi.fn(),
  };

  it('should call onFocusInput on Cmd/Ctrl+/', () => {
    const handler = createCopilotKeyHandler(handlers);
    // Use both metaKey and ctrlKey to work on all platforms
    const event = {
      key: '/',
      ctrlKey: true,
      metaKey: true,
      shiftKey: false,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;

    handler(event);
    expect(handlers.onFocusInput).toHaveBeenCalled();
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
    expect(handlers.onTogglePanel).toHaveBeenCalled();
  });
});

describe('getCopilotCommands', () => {
  it('should return 3 commands', () => {
    const handlers = {
      onFocusInput: vi.fn(),
      onTogglePanel: vi.fn(),
      onBlurInput: vi.fn(),
    };
    const commands = getCopilotCommands(handlers);
    expect(commands.length).toBe(3);
  });

  it('should have Chat category', () => {
    const handlers = {
      onFocusInput: vi.fn(),
      onTogglePanel: vi.fn(),
      onBlurInput: vi.fn(),
    };
    const commands = getCopilotCommands(handlers);
    expect(commands.every(c => c.category === 'Chat')).toBe(true);
  });

  it('should have action functions', () => {
    const handlers = {
      onFocusInput: vi.fn(),
      onTogglePanel: vi.fn(),
      onBlurInput: vi.fn(),
    };
    const commands = getCopilotCommands(handlers);
    commands[0].action();
    expect(handlers.onFocusInput).toHaveBeenCalled();
  });
});
