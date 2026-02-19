import { BaseTool } from '../core/BaseTool';
import { CommentToolSVG } from '../../../../assets/svgs/SVGSLibrary';


export class CommentTool extends BaseTool {
  category = 'annotation' as const;
  id = 'annotation/comment' as const;
  name = 'Comment';
  icon = <CommentToolSVG />;
  cursor = 'pointer';
}
