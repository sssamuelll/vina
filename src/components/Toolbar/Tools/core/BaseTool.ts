import { PathCommand } from "../../../../types/types";

export abstract class BaseTool {
  abstract category: ToolCategory;
  abstract id: ToolId;
  abstract name: string;
  abstract icon: React.ReactNode;
  abstract cursor: string;
  protected pathCommands: PathCommand[] = [];
  requiresOptimization = false;

  optimizePath?(): PathCommand[]{
    return this.pathCommands;
  }

  getPathCommands(): PathCommand[] {
    return this.pathCommands;
  }

  resetPath() {
    this.pathCommands = [];
  }

  getCanvasCoordinates(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  // Métodos opcionales
  onActivate?(): void;
  onDeactivate?(): void;
  reset?(): void; // Para limpiar estados internos

  // Handlers de eventos
  onMouseDown?(e: ToolEvent): void;
  onMouseMove?(e: ToolEvent): void;
  onMouseUp?(e: ToolEvent): void;
  onDoubleClick?(e: ToolEvent): void;
  onKeyDown?(e: KeyboardEvent): void;
  onKeyUp?(e: KeyboardEvent): void;
}

export type ToolEvent = {
  nativeEvent: MouseEvent;
  context: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  coordinates: { x: number; y: number };
  scale: number
};

export type ToolCategory = 'drawing' | 'selection' | 'navigation' | 'annotation';
export type ToolId = `${ToolCategory}/${string}`;