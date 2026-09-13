/**
 * Tests for ArrayBuffer Codec
 */
import { describe, it, expect } from 'vitest';
import {
  detectCapabilities,
  selectStrategy,
  encodePoints,
  decodePoints,
  serializePoint,
  serializePathCommand,
  deserializeOutline,
  serializePiece,
  deserializePiece,
  encodeOutline,
  decodeOutline,
  prepareJobData,
} from '../arrayBufferCodec';
import type { CPoint, CPiece } from '../../types/construction';
import type { PathCommand } from '../../types/types';

describe('ArrayBuffer Codec', () => {
  describe('detectCapabilities', () => {
    it('returns valid capabilities object', () => {
      const caps = detectCapabilities();

      expect(caps).toHaveProperty('sharedArrayBuffer');
      expect(caps).toHaveProperty('transferable');
      expect(caps).toHaveProperty('workerSupport');
      expect(caps).toHaveProperty('hardwareConcurrency');
      expect(typeof caps.hardwareConcurrency).toBe('number');
      expect(caps.hardwareConcurrency).toBeGreaterThan(0);
    });
  });

  describe('selectStrategy', () => {
    const baseCapabilities = {
      sharedArrayBuffer: true,
      transferable: true,
      workerSupport: true,
      hardwareConcurrency: 4,
    };

    it('returns mainThread when no worker support', () => {
      const caps = { ...baseCapabilities, workerSupport: false };
      expect(selectStrategy(caps, 1000)).toBe('mainThread');
    });

    it('returns sharedArrayBuffer for large datasets when available', () => {
      expect(selectStrategy(baseCapabilities, 500)).toBe('sharedArrayBuffer');
      expect(selectStrategy(baseCapabilities, 1000)).toBe('sharedArrayBuffer');
    });

    it('returns transferable for medium datasets', () => {
      const caps = { ...baseCapabilities, sharedArrayBuffer: false };
      expect(selectStrategy(caps, 200)).toBe('transferable');
      expect(selectStrategy(caps, 400)).toBe('transferable');
    });

    it('returns structuredClone for small datasets', () => {
      expect(selectStrategy(baseCapabilities, 50)).toBe('structuredClone');
      expect(selectStrategy(baseCapabilities, 199)).toBe('structuredClone');
    });
  });

  describe('encodePoints / decodePoints', () => {
    it('round-trip encoding preserves data', () => {
      const points: CPoint[] = [
        { id: 'p1', label: 'A', x: 100, y: 200, definition: { type: 'manual', x: 100, y: 200 }, visible: true },
        { id: 'p2', label: 'B', x: 300, y: 400, definition: { type: 'manual', x: 300, y: 400 }, visible: true },
        { id: 'p3', label: 'C', x: 500, y: 600, definition: { type: 'manual', x: 500, y: 600 }, visible: true },
      ];

      const { coords, ids } = encodePoints(points);

      expect(coords).toBeInstanceOf(Float64Array);
      expect(coords.length).toBe(6); // 3 points * 2 coords
      expect(ids).toHaveLength(3);

      const decoded = decodePoints(coords, ids);

      expect(decoded).toHaveLength(3);
      expect(decoded[0].id).toBe('p1');
      expect(decoded[0].x).toBe(100);
      expect(decoded[0].y).toBe(200);
      expect(decoded[1].x).toBe(300);
      expect(decoded[2].y).toBe(600);
    });

    it('handles empty array', () => {
      const { coords, ids } = encodePoints([]);
      expect(coords.length).toBe(0);
      expect(ids.length).toBe(0);

      const decoded = decodePoints(coords, ids);
      expect(decoded).toHaveLength(0);
    });
  });

  describe('serializePoint', () => {
    it('extracts essential properties', () => {
      const point: CPoint = {
        id: 'test-id',
        label: 'TestPoint',
        x: 123.456,
        y: 789.012,
        definition: { type: 'manual', x: 123.456, y: 789.012 },
        visible: true,
        blockId: 'block1',
      };

      const serialized = serializePoint(point);

      expect(serialized).toEqual({
        id: 'test-id',
        label: 'TestPoint',
        x: 123.456,
        y: 789.012,
      });
    });
  });

  describe('serializePiece / deserializePiece', () => {
    it('round-trip preserves structure', () => {
      const piece: CPiece = {
        id: 'piece1',
        name: 'Test Piece',
        nodes: [
          { pointId: 'p1', connection: 'line' },
          { pointId: 'p2', connection: 'curve', curveId: 'c1', reverse: true },
          { pointId: 'p3', connection: 'line' },
        ],
        seamAllowance: 10,
        closed: true,
      };

      const serialized = serializePiece(piece);

      expect(serialized.id).toBe('piece1');
      expect(serialized.name).toBe('Test Piece');
      expect(serialized.nodePointIds).toEqual(['p1', 'p2', 'p3']);
      expect(serialized.nodeCurveIds).toEqual([null, 'c1', null]);
      expect(serialized.nodeConnections).toEqual(['line', 'curve', 'line']);
      expect(serialized.nodeReverse).toEqual([false, true, false]);

      const deserialized = deserializePiece(serialized);

      expect(deserialized.id).toBe('piece1');
      expect(deserialized.nodes).toHaveLength(3);
      expect(deserialized.nodes[1].curveId).toBe('c1');
      expect(deserialized.nodes[1].reverse).toBe(true);
    });
  });

  describe('encodeOutline / decodeOutline', () => {
    it('round-trip preserves PathCommands', () => {
      const outline: PathCommand[] = [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'C', values: [100, 50, 100, 100, 50, 100] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ];

      const encoded = encodeOutline(outline);
      expect(encoded).toBeInstanceOf(Float64Array);

      const decoded = decodeOutline(encoded);

      expect(decoded).toHaveLength(5);
      expect(decoded[0].type).toBe('M');
      expect(decoded[0].values).toEqual([0, 0]);
      expect(decoded[2].type).toBe('C');
      expect(decoded[2].values).toEqual([100, 50, 100, 100, 50, 100]);
      expect(decoded[4].type).toBe('Z');
      expect(decoded[4].values).toEqual([]);
    });
  });

  describe('PathCommand serialization', () => {
    it('preserves authored and manual Bezier intent in both directions', () => {
      const commands: PathCommand[] = [
        { type: 'L', values: [50, 0], authoredAnchor: true },
        { type: 'C', values: [60, 0, 90, 0, 100, 0], manualBezier: true },
      ];

      const serialized = commands.map(serializePathCommand);
      const restored = deserializeOutline(serialized);

      expect(restored).toEqual(commands);
      expect(restored[0]).not.toBe(commands[0]);
      expect(restored[0].values).not.toBe(commands[0].values);
    });
  });

  describe('prepareJobData', () => {
    const testPoints: CPoint[] = [
      { id: 'p1', label: 'A', x: 10, y: 20, definition: { type: 'manual', x: 10, y: 20 }, visible: true },
      { id: 'p2', label: 'B', x: 30, y: 40, definition: { type: 'manual', x: 30, y: 40 }, visible: true },
    ];

    it('uses structuredClone for small data', () => {
      const result = prepareJobData(testPoints, 'structuredClone');

      expect(result.points).toHaveLength(2);
      expect(result.pointsBuffer).toBeUndefined();
      expect(result.pointsShared).toBeUndefined();
    });

    it('uses transferable for medium data', () => {
      const result = prepareJobData(testPoints, 'transferable');

      expect(result.points).toHaveLength(0);
      expect(result.pointsBuffer).toBeInstanceOf(ArrayBuffer);
      expect(result.pointIds).toHaveLength(2);
    });
  });
});
