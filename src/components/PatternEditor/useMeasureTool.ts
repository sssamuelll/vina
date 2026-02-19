import { useState, useCallback, useEffect } from 'react';
import { Point2D } from '../../types/types';

interface Measurement {
  id: string;
  startPoint: Point2D;
  endPoint: Point2D;
  distance: number;
}

function formatDistance(mm: number): string {
  if (mm < 100) return `${mm.toFixed(1)} mm`;
  return `${(mm / 10).toFixed(2)} cm`;
}

export function useMeasureTool(zoom: number, pan: Point2D) {
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [currentStart, setCurrentStart] = useState<Point2D | null>(null);
  const [cursorPos, setCursorPos] = useState<Point2D | null>(null);

  const toPattern = useCallback((screenX: number, screenY: number, svgRect: DOMRect): Point2D => ({
    x: (screenX - svgRect.left - pan.x) / zoom,
    y: (screenY - svgRect.top - pan.y) / zoom,
  }), [zoom, pan]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pt = toPattern(e.clientX, e.clientY, rect);

    if (!currentStart) {
      setCurrentStart(pt);
      setCursorPos(pt);
    } else {
      const dx = pt.x - currentStart.x;
      const dy = pt.y - currentStart.y;
      const distance = Math.hypot(dx, dy);
      setMeasurements(prev => [...prev, {
        id: `measure-${Date.now()}`,
        startPoint: currentStart,
        endPoint: pt,
        distance,
      }]);
      setCurrentStart(null);
      setCursorPos(null);
    }
  }, [toPattern, currentStart]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!currentStart) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setCursorPos(toPattern(e.clientX, e.clientY, rect));
  }, [toPattern, currentStart]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (currentStart) {
        setCurrentStart(null);
        setCursorPos(null);
      } else {
        setMeasurements([]);
      }
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      setMeasurements(prev => prev.slice(0, -1));
    }
  }, [currentStart]);

  const clear = useCallback(() => {
    setMeasurements([]);
    setCurrentStart(null);
    setCursorPos(null);
  }, []);

  return {
    measurements,
    currentStart,
    cursorPos,
    handleMouseDown,
    handleMouseMove,
    handleKeyDown,
    clear,
    formatDistance,
  };
}
