import { BaseTool } from '../core/BaseTool';
import { Marker } from '../../../../types/types';
import { PointerSVG } from '../../../../assets/svgs/SVGSLibrary';

export class SelectionTool extends BaseTool {
  category = 'selection' as const;
  id = 'selection/pointer' as const;
  name = 'Puntero';
  icon = <PointerSVG />;
  cursor = 'pointer';
  
  hoveredMarker: Marker | null = null;

  getCanvasMarkers(): Marker[] {
    const customWindow = window as any;
    return (customWindow.canvasMarkers && customWindow.canvasMarkers.markers) || [];
  }

  
}
