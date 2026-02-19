import React, { createContext, useContext, useState } from 'react';
import { TOOLS, ToolId } from './tools.config';
import { BaseTool, ToolCategory } from './core/BaseTool';

type ToolContextType = {
  activeTool: BaseTool;
  activeCategory: ToolCategory;
  toolsByCategory: Record<ToolCategory, BaseTool[]>;
  setActiveTool: (toolId: ToolId) => void;
  setActiveCategory: React.Dispatch<React.SetStateAction<ToolCategory>>;
  getCurrentTool: () => BaseTool;
  modalCategory: ToolCategory | null; // Estado para la categoría del modal
  setModalCategory: (category: ToolCategory | null) => void; // Función para controlar el modal
};

// eslint-disable-next-line react-refresh/only-export-components
export const ToolContext = createContext<ToolContextType>({} as ToolContextType);

export const ToolProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  
  const toolsByCategory = Object.entries(TOOLS).reduce<Record<ToolCategory, BaseTool[]>>(
    (acc, [_, ToolClass]) => {
      console.log(_, ToolClass);
      const toolInstance = new ToolClass();
      const category = toolInstance.category;
      if (!acc[category]) acc[category] = [];
      acc[category].push(toolInstance);
      return acc;
    },
    { drawing: [], selection: [], navigation: [], annotation: [] }
  );

  const initialTool = new TOOLS['drawing/pencil']();
  const [activeTool, setActiveToolState] = useState<BaseTool>(initialTool);
  const [activeCategory, setActiveCategory] = useState<ToolCategory>(initialTool.category);
  const [modalCategory, setModalCategory] = useState<ToolCategory | null>(null); // Nuevo estado para el modal

  const setActiveTool = (toolId: ToolId) => {
    const ToolClass = TOOLS[toolId];
    if (ToolClass) {
      activeTool.reset?.(); // Limpiar estado de la herramienta anterior
      const newTool = new ToolClass();
      setActiveToolState(newTool);
      setActiveCategory(newTool.category);
    }
  };

  const getCurrentTool = () => activeTool;

  return (
    <ToolContext.Provider
      value={{
        activeTool,
        activeCategory,
        toolsByCategory,
        setActiveTool,
        setActiveCategory,
        getCurrentTool,
        modalCategory,
        setModalCategory,
      }}
    >
      {children}
    </ToolContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useTools = () => useContext(ToolContext);