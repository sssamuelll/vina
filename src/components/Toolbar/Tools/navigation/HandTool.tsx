// Tools/navigation/HandTool.ts
import { BaseTool, ToolEvent } from '../core/BaseTool';
import { HandToolSVG } from '../../../../assets/svgs/SVGSLibrary';

export class HandTool extends BaseTool {
  category = 'navigation' as const;
  id = 'navigation/hand' as const;
  name = 'Hand';
  icon = <HandToolSVG />;
  cursor = 'grab';
  
  private isPanning = false;
  private lastPos = { x: 0, y: 0 };

  onMouseDown = ({ coordinates }: ToolEvent) => {
    this.isPanning = true;
    this.lastPos = coordinates;
  };

  onMouseMove = ({ coordinates, canvas }: ToolEvent) => {
    if (!this.isPanning) return;
    
    const dx = coordinates.x - this.lastPos.x;
    const dy = coordinates.y - this.lastPos.y;
    
    // Actualizar posición del canvas
    canvas.style.transform = `translate(${dx}px, ${dy}px)`;
    
    this.lastPos = coordinates;
  };

  onMouseUp = () => {
    this.isPanning = false;
  };

  reset = () => {
    this.isPanning = false;
    this.lastPos = { x: 0, y: 0 };
  };
}