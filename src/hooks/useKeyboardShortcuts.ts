import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { setActiveTool } from '../store/editorSlice';
import { Tool2D } from '../types/types';

const SHORTCUTS: Record<string, Tool2D> = {
  'v': 'select',
  'p': 'pen',
  'l': 'line',
  'r': 'rectangle',
  's': 'seam',
  'n': 'notch',
  'g': 'grainline',
  'm': 'measure',
  'h': 'hand',
};

export function useKeyboardShortcuts() {
  const dispatch = useDispatch();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const tool = SHORTCUTS[e.key.toLowerCase()];
      if (tool) {
        dispatch(setActiveTool(tool));
      }

      // Space = temporary hand tool (handled separately in PatternEditor)
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch]);
}
