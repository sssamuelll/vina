/* deprecated 
import React, { useRef, useState, useEffect } from 'react';

interface ZoomPanWrapperProps {
  selectedTool: string;
  width: number;
  height: number;
  children: React.ReactNode;
}

const ZoomPanWrapper: React.FC<ZoomPanWrapperProps> = ({
  selectedTool, width, height, children
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [offsetStart, setOffsetStart] = useState({ x: 0, y: 0 });

  // Clamp helper
  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  // === 1) Center child once we know container size ===
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const startX = rect.width / 2 - width / 2;
    const startY = rect.height / 2 - height / 2;
    setOffset({ x: startX, y: startY });
  }, [width, height]);

  // === 2) Wheel zoom logic ===
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const { clientX, clientY, deltaY } = e;
      const zoomFactor = Math.exp(-deltaY * 0.005);

      setScale(prevScale => {
        const newScale = clamp(prevScale * zoomFactor, 0.1, 10);

        setOffset(prevOffset => {
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return prevOffset;

          const screenX = clientX - rect.left;
          const screenY = clientY - rect.top;

          return {
            x: screenX - (screenX - prevOffset.x) * (newScale / prevScale),
            y: screenY - (screenY - prevOffset.y) * (newScale / prevScale),
          };
        });

        return newScale;
      });
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  // === 3) Pan / "hand tool" logic ===
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (selectedTool === 'hand') {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      setOffsetStart(offset);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (selectedTool === 'hand' && isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setOffset({
        x: offsetStart.x + dx,
        y: offsetStart.y + dy,
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (selectedTool === 'hand') {
      setIsPanning(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: '0 0',
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default ZoomPanWrapper;
*/