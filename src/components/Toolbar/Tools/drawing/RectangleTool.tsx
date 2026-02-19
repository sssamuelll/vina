import { BaseTool, ToolEvent } from '../core/BaseTool';
import { SelectSquareSVG } from '../../../../assets/svgs/SVGSLibrary';
import { PathCommand } from '../../../../types/types';

export class RectangleTool extends BaseTool {
  category = 'drawing' as const;
  id = 'drawing/rectangle' as const;
  name = 'Rectangle';
  icon = <SelectSquareSVG />;
  cursor = 'crosshair';
  private startPos: { x: number; y: number } | null = null;
  protected pathCommands: PathCommand[] = [];

  onMouseDown = ({ coordinates }: ToolEvent) => {
    this.startPos = coordinates;
    this.pathCommands = [{ type: 'R', values: [coordinates.x, coordinates.y, 0, 0] }];
  };

  onMouseMove = ({ coordinates }: ToolEvent) => {
    if (!this.startPos) return;
  
    const { x, y } = this.startPos;
    const width = coordinates.x - this.startPos.x;
    const height = coordinates.y - this.startPos.y;
  
    this.pathCommands = [{
      type: 'R',
      values: [x, y, width, height]
    }];
  };

  onMouseUp = () => {
    this.startPos = null;
  };

  reset = () => {
    this.startPos = null;
    this.pathCommands = [];
  };

  getPathCommands(): PathCommand[] {
    return this.pathCommands;
  }
}