// @vitest-environment jsdom
/**
 * Integration test: DXF file selection → ImportDXFDialog → import with options.
 *
 * We test the wiring between FileExplorerView, ImportDXFDialog, and dxfToPatternPieces.
 * A full render requires many Redux slices; we set up a minimal store that satisfies
 * the component's useSelector calls.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import projectReducer from '../../../store/projectSlice';
import editorReducer from '../../../store/editorSlice';

// We need to provide the construction slice so `construction.points` is available.
import constructionReducer from '../../../store/constructionSlice';
import markerReducer from '../../../store/markerSlice';

import FileExplorerView from '../FileExplorerView';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * Minimal DXF text that parseDXF can handle: a single LWPOLYLINE on layer 1 (cut).
 * The parser expects ENTITIES section with entity type + layer + data.
 */
const MINIMAL_DXF = `  0
SECTION
  2
HEADER
  0
ENDSEC
  0
SECTION
  2
ENTITIES
  0
LWPOLYLINE
  8
1
  90
4
  70
1
  10
0
  20
0
  10
100
  20
0
  10
100
  20
200
  10
0
  20
200
  0
ENDSEC
  0
EOF
`;

function createTestStore() {
  return configureStore({
    reducer: {
      project: projectReducer,
      editor: editorReducer,
      construction: constructionReducer,
      marker: markerReducer,
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
}

function renderWithStore(store: ReturnType<typeof createTestStore>) {
  return render(
    <Provider store={store}>
      <FileExplorerView />
    </Provider>,
  );
}

describe('FileExplorerView DXF dialog integration', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  it('shows ImportDXFDialog when a DXF file is selected', async () => {
    renderWithStore(store);

    // Find the hidden file input for DXF
    const dxfInput = document.querySelector('input[accept=".dxf"]') as HTMLInputElement;
    expect(dxfInput).toBeTruthy();

    // Simulate file selection
    const file = new File([MINIMAL_DXF], 'test.dxf', { type: 'text/plain' });
    // Mock File.text() since jsdom may not support it
    file.text = vi.fn().mockResolvedValue(MINIMAL_DXF);

    await act(async () => {
      fireEvent.change(dxfInput, { target: { files: [file] } });
      // Wait for async file.text() to resolve
      await new Promise(r => setTimeout(r, 10));
    });

    // Dialog should now be visible
    await waitFor(() => {
      expect(screen.getByText('Import DXF')).toBeTruthy();
    });
  });

  it('imports pieces via "add" mode when Import is clicked', async () => {
    renderWithStore(store);

    // Initially no pieces
    expect(store.getState().project.pieces).toHaveLength(0);

    // Trigger dialog
    const dxfInput = document.querySelector('input[accept=".dxf"]') as HTMLInputElement;
    const file = new File([MINIMAL_DXF], 'test.dxf', { type: 'text/plain' });
    file.text = vi.fn().mockResolvedValue(MINIMAL_DXF);

    await act(async () => {
      fireEvent.change(dxfInput, { target: { files: [file] } });
      await new Promise(r => setTimeout(r, 10));
    });

    // Dialog is shown; find the Import button inside the dialog (has class "primary")
    await waitFor(() => {
      expect(screen.getByText('Import DXF')).toBeTruthy();
    });

    const importBtn = document.querySelector('.import-dxf-dialog button.primary') as HTMLButtonElement;
    expect(importBtn).toBeTruthy();

    await act(async () => {
      fireEvent.click(importBtn);
    });

    // Pieces should now be added to the store
    expect(store.getState().project.pieces.length).toBeGreaterThan(0);

    // Dialog should be closed
    expect(screen.queryByText('Import DXF')).toBeNull();
  });

  it('replaces project via "open" mode when that radio is selected', async () => {
    renderWithStore(store);

    // Trigger dialog
    const dxfInput = document.querySelector('input[accept=".dxf"]') as HTMLInputElement;
    const file = new File([MINIMAL_DXF], 'test.dxf', { type: 'text/plain' });
    file.text = vi.fn().mockResolvedValue(MINIMAL_DXF);

    await act(async () => {
      fireEvent.change(dxfInput, { target: { files: [file] } });
      await new Promise(r => setTimeout(r, 10));
    });

    // Select "Open (replace)" radio
    await waitFor(() => {
      expect(screen.getByText('Import DXF')).toBeTruthy();
    });

    const openRadio = screen.getByLabelText(/Open \(replace\)/i);
    await act(async () => {
      fireEvent.click(openRadio);
    });

    const importBtn = document.querySelector('.import-dxf-dialog button.primary') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(importBtn);
    });

    // Project should have pieces and project name should be 'DXF Import'
    expect(store.getState().project.pieces.length).toBeGreaterThan(0);
    expect(store.getState().project.name).toBe('DXF Import');
  });

  it('closes dialog on Cancel without importing', async () => {
    renderWithStore(store);

    // Trigger dialog
    const dxfInput = document.querySelector('input[accept=".dxf"]') as HTMLInputElement;
    const file = new File([MINIMAL_DXF], 'test.dxf', { type: 'text/plain' });
    file.text = vi.fn().mockResolvedValue(MINIMAL_DXF);

    await act(async () => {
      fireEvent.change(dxfInput, { target: { files: [file] } });
      await new Promise(r => setTimeout(r, 10));
    });

    await waitFor(() => {
      expect(screen.getByText('Import DXF')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Cancel'));
    });

    // Dialog should be closed, no pieces added
    expect(screen.queryByText('Import DXF')).toBeNull();
    expect(store.getState().project.pieces).toHaveLength(0);
  });
});
