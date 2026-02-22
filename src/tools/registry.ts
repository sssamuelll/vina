import { ToolDefinition, ToolContext } from './types';

class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  registerTool(definition: ToolDefinition): void {
    this.tools.set(definition.id, definition);
  }

  getTool(id: string): ToolDefinition | undefined {
    return this.tools.get(id);
  }

  getToolsByContext(context: ToolContext): ToolDefinition[] {
    const result: ToolDefinition[] = [];
    for (const tool of this.tools.values()) {
      if (tool.context === context || tool.context === 'both') {
        result.push(tool);
      }
    }
    return result;
  }

  getToolsByGroup(group: string): ToolDefinition[] {
    const result: ToolDefinition[] = [];
    for (const tool of this.tools.values()) {
      if (tool.group === group) {
        result.push(tool);
      }
    }
    return result;
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getShortcuts(): Record<string, string> {
    const shortcuts: Record<string, string> = {};
    for (const tool of this.tools.values()) {
      if (tool.shortcut) {
        shortcuts[tool.shortcut.toLowerCase()] = tool.id;
      }
    }
    return shortcuts;
  }
}

// Export singleton instance
export const toolRegistry = new ToolRegistry();