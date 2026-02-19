/* deprecated
import React, { useRef, useEffect, useCallback } from 'react';
import './Canvas.css';
import { useTools } from '../Toolbar/Tools/ToolContext';
import { useWorker } from '../../workers/WorkerContext';
import { Marker, PathCommand, Comment } from '../../types/types';
import { ToolEvent } from '../Toolbar/Tools/core/BaseTool';
import { drawCommentBubble } from '../../utils/utils';

interface CanvasProps {
  width: number;
  height: number;
  markers: Marker[];
  comments: Comment[];
  onDrawComplete?: (pathCommands: PathCommand[]) => void;
  onMarkerClick?: (markerId: string, screenPosition: { x: number; y: number }) => void;
  onSelectMarker?: (markerId: string, position: { x: number; y: number }) => void;
  onOpenCommentModal?: (position: { x: number; y: number }) => void;
}

const Canvas: React.FC<CanvasProps> = ({ width, height, markers, onDrawComplete, comments, onSelectMarker, onOpenCommentModal, onMarkerClick }) => {
  const { worker } = useWorker();
  const { sendToWorker } = useWorker();
  const { getCurrentTool } = useTools();
  const permanentCanvasRef = useRef<HTMLCanvasElement>(null);
  const transientCanvasRef = useRef<HTMLCanvasElement>(null);

  

  const drawCommands = useCallback((ctx: CanvasRenderingContext2D, commands: PathCommand[]) => {
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.beginPath();
    commands.forEach(cmd => {
      if (cmd.type === 'M') ctx.moveTo(cmd.values[0], cmd.values[1]);
          else if (cmd.type === 'L') ctx.lineTo(cmd.values[0], cmd.values[1]);
          else if (cmd.type === 'Q') ctx.quadraticCurveTo(cmd.values[0], cmd.values[1], cmd.values[2], cmd.values[3]);
          else if (cmd.type === 'C') ctx.bezierCurveTo(cmd.values[0], cmd.values[1], cmd.values[2], cmd.values[3], cmd.values[4], cmd.values[5]);
          else if (cmd.type === 'R') ctx.rect(cmd.values[0], cmd.values[1], cmd.values[2], cmd.values[3]);
          else if (cmd.type === 'A') ctx.arc(cmd.values[0], cmd.values[1], cmd.values[2], cmd.values[3], cmd.values[4]);
          else if (cmd.type === 'H') ctx.lineTo(cmd.values[0], ctx.canvas.height);
          else if (cmd.type === 'V') ctx.lineTo(ctx.canvas.width, cmd.values[0]);
          else if (cmd.type === 'S') ctx.bezierCurveTo(cmd.values[0], cmd.values[1], cmd.values[2], cmd.values[3], cmd.values[4], cmd.values[5]);
          else if (cmd.type === 'T') ctx.quadraticCurveTo(cmd.values[0], cmd.values[1], cmd.values[2], cmd.values[3]);
          else if (cmd.type === 'Z') ctx.closePath();
    });
    ctx.stroke();
  }, []);

  useEffect(() => {
    if (!worker) return;
  
    const handleMessage = (event: MessageEvent) => {
      const permanentCtx = permanentCanvasRef.current?.getContext('2d');
      const transientCtx = transientCanvasRef.current?.getContext('2d');
      
      if (permanentCtx && transientCtx) {
        transientCtx.clearRect(0, 0, transientCtx.canvas.width, transientCtx.canvas.height);
        drawCommands(permanentCtx, event.data);
        onDrawComplete?.(event.data);
        getCurrentTool().resetPath();
      }
    };
  
    worker.addEventListener('message', handleMessage);
    
    return () => {
      worker.removeEventListener('message', handleMessage);
    };
  }, [worker, drawCommands, getCurrentTool, onDrawComplete]);

  useEffect(() => {
    const permanentCtx = permanentCanvasRef.current?.getContext('2d');
    if (permanentCtx) {
      permanentCtx.clearRect(0, 0, width, height);
      markers.forEach(marker => {
        drawCommands(permanentCtx, marker.pathCommands);
        drawCommentBubble(permanentCtx, marker, comments);
      });
    }
  }, [markers, comments, drawCommands, width, height]);

  useEffect(() => {
    const initCanvas = (canvas: HTMLCanvasElement | null, ctx: CanvasRenderingContext2D | null) => {
      if (!canvas || !ctx) return;
      canvas.width = width;
      canvas.height = height;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    };

    initCanvas(permanentCanvasRef.current, permanentCanvasRef.current ? permanentCanvasRef.current.getContext('2d') : null);
    initCanvas(transientCanvasRef.current, transientCanvasRef.current ? transientCanvasRef.current.getContext('2d') : null);
  }, [width, height]);

  const handleMouseEvent = (
    handler: ((e: ToolEvent) => void) | undefined,
    e: React.MouseEvent<HTMLCanvasElement>
  ) => {
    const activeTool = getCurrentTool();
    
    if (!handler || activeTool.id === 'navigation/hand') return;
    
    const transientCanvas = transientCanvasRef.current;
    const transientCtx = transientCanvas?.getContext('2d');
    const permanentCtx = permanentCanvasRef.current?.getContext('2d');
  
    if (!transientCanvas || !transientCtx || !permanentCtx) return;
  
    const coordinates = activeTool.getCanvasCoordinates(transientCanvas, e.clientX, e.clientY);
  
    // Aquí construimos el objeto toolEvent extendido con ambos callbacks:
    const toolEvent = {
      nativeEvent: e.nativeEvent,
      context: transientCtx,
      canvas: transientCanvas,
      coordinates,
      onSelectMarker,       
      onOpenCommentModal,  
      onMarkerClick,       
    };
  
    handler.call(activeTool, toolEvent);
  
    if (e.type === 'mouseup') {
      const pathCommands = activeTool.getPathCommands();
      if (pathCommands.length > 0) {
        sendToWorker({
          pathCommands,
          requiresOptimization: activeTool.requiresOptimization,
        });
      }
      transientCtx.clearRect(0, 0, transientCanvas.width, transientCanvas.height);
    }
  };

  return (
    <div className="canvasContainer">
      <div className="canvasTitle">Project 1</div>
      <canvas ref={permanentCanvasRef} className="canvas permanent-layer" />
      <canvas
        ref={transientCanvasRef}
        className="canvas transient-layer"
        onMouseDown={(e) => handleMouseEvent(getCurrentTool().onMouseDown, e)}
        onMouseMove={(e) => handleMouseEvent(getCurrentTool().onMouseMove, e)}
        onMouseUp={(e) => handleMouseEvent(getCurrentTool().onMouseUp, e)}
        onMouseLeave={(e) => handleMouseEvent(getCurrentTool().onMouseUp, e)}
      />
    </div>
  );
};

export default Canvas;
*/