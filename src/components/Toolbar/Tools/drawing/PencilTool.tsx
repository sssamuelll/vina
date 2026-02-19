import { BaseTool, ToolEvent } from '../core/BaseTool';
import { PencilCursorSVG, PencilSVG } from '../../../../assets/svgs/SVGSLibrary';
import { svgToDataUrl } from '../../../../utils/utils';
import { PathCommand } from '../../../../types/types';

export class PencilTool extends BaseTool {
  category = 'drawing' as const;
  id = 'drawing/pencil' as const;
  name = 'Pencil';
  icon = <PencilSVG />;
  cursor = svgToDataUrl(<PencilCursorSVG />, 24, 24, 2, 18);
  
  private drawing = false;
  protected pathCommands: PathCommand[] = [];
  requiresOptimization = true;

  onMouseDown = ({ coordinates, context }: ToolEvent) => {
    this.drawing = true;
    this.pathCommands = [{ type: 'M', values: [coordinates.x, coordinates.y] }];
    context.beginPath();
    context.moveTo(coordinates.x, coordinates.y);
  };

  onMouseMove = ({ coordinates, context }: ToolEvent) => {
    if (!this.drawing) return;
    
    this.pathCommands.push({ type: 'L', values: [coordinates.x, coordinates.y] });
    
    // Dibujo temporal
    context.lineTo(coordinates.x, coordinates.y);
    context.strokeStyle = 'black';
    context.lineWidth = 2;
    context.stroke();
  };

  onMouseUp = ({ context }: ToolEvent) => {
    this.drawing = false;
    context.closePath();
  };

  getPathCommands(): PathCommand[] {
    return this.pathCommands;
  }

  reset = () => {
    this.pathCommands = [];
    this.drawing = false;
  };

  optimizePath(): PathCommand[] {
    if (this.pathCommands.length < 3) return this.pathCommands;
    
    const optimized: PathCommand[] = [this.pathCommands[0]];
    let lastDirection = this.calculateDirection(this.pathCommands[0], this.pathCommands[1]);
    
    for (let i = 1; i < this.pathCommands.length - 1; i++) {
      const currentDirection = this.calculateDirection(
        this.pathCommands[i],
        this.pathCommands[i + 1]
      );
      
      if (currentDirection !== lastDirection) {
        optimized.push(this.pathCommands[i]);
        lastDirection = currentDirection;
      }
    }
    
    optimized.push(this.pathCommands[this.pathCommands.length - 1]);
    return optimized;
  }

  private calculateDirection(start: PathCommand, end: PathCommand): string {
    const dx = end.values[0] - start.values[0];
    const dy = end.values[1] - start.values[1];
    const angle = Math.atan2(dy, dx);
    return angle.toFixed(2); // Precisión de 2 decimales para agrupar
  }
}