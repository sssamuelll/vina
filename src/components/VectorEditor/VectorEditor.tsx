import React, { useState, useRef } from 'react';
import { Marker, PathCommand } from '../../types/types';
import SvgOverlay from '../SVGOverlay/SVGOverlay';
import { useTools } from '../Toolbar/Tools/ToolContext';
import { useTransformContext } from 'react-zoom-pan-pinch';
import './VectorEditor.css';

interface VectorEditorProps {
  width: number;
  height: number;
  markers: Marker[];
  setMarkers: React.Dispatch<React.SetStateAction<Marker[]>>;
  onDrawComplete?: (pathCommands: PathCommand[]) => void;
  onMarkerClick?: (markerId: string, screenPosition: { x: number; y: number }) => void;
  onSelectMarker?: (markerId: string, position: { x: number; y: number }) => void;
  onOpenCommentModal?: (position: { x: number; y: number }) => void;
}

export const VectorEditor: React.FC<VectorEditorProps> = ({
  width,
  height,
  markers,
  setMarkers,
  onMarkerClick,
  onDrawComplete,
  onSelectMarker,
  onOpenCommentModal,
}) => {
  const { activeTool } = useTools();
  const activeToolCategory = activeTool.category;

  // Estado para el dibujo (usado en la lógica por defecto)
  const [currentPathCommands, setCurrentPathCommands] = useState<PathCommand[]>([]);
  // Ref del SVG transitorio
  const transientSvgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const transformState = useTransformContext();

  // Función de interacción para marcadores (selección o comentario)
  const handleMarkerInteraction = (markerId: string, event: React.MouseEvent) => {
    const position = {
      x: event.clientX,
      y: event.clientY,
    };
    if (activeTool.id === 'annotation/comment') {
      onMarkerClick?.(markerId, position);
    } else if (activeTool.id === 'selection/pointer') {
      onSelectMarker?.(markerId, position);
    }
  };
  
  // Calcula las coordenadas dentro del SVG
  
  const getSvgCoordinates = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    const svg = containerRef.current;
    if (!svg) return { x: 0, y: 0 };
  
    const rect = svg.getBoundingClientRect();
    const { scale, positionX, positionY } = transformState.transformState;
    
    console.log('Scale:', scale, 'Position:', positionX, positionY);
    
    return {
      x: (e.clientX - rect.x) / scale,
      y: (e.clientY - rect.y) / scale,
    };
  };

  // Ref para el canvas oculto para proporcionar un contexto 2D
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Manejador único de eventos para el SVG
  const handleSvgMouseEvent = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    
    if (activeTool.id === 'annotation/comment' || activeTool.id === 'selection/pointer') {
        return;
      }
    
    const eventType = e.type;
    const coordinates = getSvgCoordinates(e);
    
    // Asegurar que tenemos un canvas y un contexto para el toolEvent
    if (!hiddenCanvasRef.current) {
      hiddenCanvasRef.current = document.createElement('canvas');
      hiddenCanvasRef.current.width = width;
      hiddenCanvasRef.current.height = height;
    }
    const context = hiddenCanvasRef.current.getContext('2d');

    const { scale } = transformState.transformState;
  
    const toolEvent = {
      nativeEvent: e.nativeEvent,
      coordinates,
      onSelectMarker,
      onOpenCommentModal,
      onMarkerClick,
      canvas: transientSvgRef.current,
      context: context,
      scale
    };
  
    let handler;
    if (eventType === 'mousedown') {
      handler = activeTool.onMouseDown;
    } else if (eventType === 'mousemove') {
      handler = activeTool.onMouseMove;
    } else if (eventType === 'mouseup' || eventType === 'mouseleave') {
      handler = activeTool.onMouseUp;
    }
  
    if (handler) {
      handler.call(activeTool, toolEvent as any); // Llama al método del tool Fix the any type
  
      setCurrentPathCommands([...activeTool.getPathCommands()]);
  
      if (eventType === 'mouseup' || eventType === 'mouseleave') {
        const pathCommands = activeTool.getPathCommands();
        if (pathCommands.length > 0) {
          const markerType =
            activeTool.id === 'drawing/rectangle' ? 'rectangulo' : 'poligono';
  
          const newMarker: Marker = {
            id: Date.now().toString(),
            name: 'Nuevo marcador',
            type: markerType,
            pathCommands,
            status: 'Pendiente',
            createdAt: new Date(),
            updatedAt: new Date(),
          };
  
          setMarkers((prev) => [...prev, newMarker]);
          if (onDrawComplete) {
            onDrawComplete(pathCommands);
          }
          activeTool.reset?.();
          setCurrentPathCommands([]); // Limpia tras finalizar
        }
      }
    }
  };
  
  

  return (
    <div ref={containerRef} className="vectorEditorContainer" style={{ width, height, position: 'relative' }}>
      {/* SvgOverlay para renderizar marcadores y trazos transitorios */}
      <SvgOverlay
        width={width}
        height={height}
        markers={markers}
        transientPathCommands={currentPathCommands}
        onMarkerClick={handleMarkerInteraction}
        enableMarkerInteraction={activeToolCategory === 'selection' || activeToolCategory === 'annotation'}
      />

      {/* SVG que captura los eventos de interacción */}
      <svg
        ref={transientSvgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: 'absolute', top: 0, left: 0, zIndex: 5 }}
        onMouseDown={handleSvgMouseEvent}
        onMouseMove={handleSvgMouseEvent}
        onMouseUp={handleSvgMouseEvent}
        onMouseLeave={handleSvgMouseEvent}
      />
    </div>
  );
};
