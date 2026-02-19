import { useEffect } from 'react';
import { useTools } from './Tools/hooks';
import { ToolCategory, TOOLS } from './Tools/tools.config';
import { DownArrowSVG } from '../../assets/svgs/SVGSLibrary';
import './Toolbar.css';

export type ToolId = keyof typeof TOOLS;

const Toolbar = () => {
  const { activeTool, toolsByCategory, setActiveTool, modalCategory, setModalCategory } = useTools();

  // Efecto para cerrar el modal al hacer clic fuera
  useEffect(() => {
    if (modalCategory) {
      const handleClickOutside = (event: MouseEvent) => {
        const modal = document.querySelector(`.tool-modal[data-category="${modalCategory}"]`);
        const arrowButton = document.querySelector(`.toolbarButton.arrow[data-category="${modalCategory}"]`);

        if (modal && arrowButton) {
          const target = event.target as Node;
          if (!modal.contains(target) && !arrowButton.contains(target)) {
            setModalCategory(null);
          }
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [modalCategory, setModalCategory]);

  const getActiveToolForCategory = (category: ToolCategory) => {
    return (
      toolsByCategory[category].find((tool) => tool.id === activeTool.id) ||
      toolsByCategory[category][0]
    );
  };

  return (
    <div className="toolbar">
      {Object.keys(toolsByCategory).map((category) => {
        const cat = category as ToolCategory;
        const activeToolInCategory = getActiveToolForCategory(cat);

        if (toolsByCategory[cat].length === 0) return null;

        return (
          <div key={cat} className="toolbar-group">
            <div
              className={`toolbarButton ${activeTool.id === activeToolInCategory.id ? 'active' : ''}`}
              onClick={() => setActiveTool(activeToolInCategory.id as ToolId)}
              title={activeToolInCategory.name}
              data-cy={`toolbar-button-${activeToolInCategory.id}`}  // <-- Atributo agregado
            >
              {activeToolInCategory.icon}
            </div>
            <div
              className="toolbarButton arrow"
              onClick={() => setModalCategory(modalCategory === cat ? null : cat)}
              data-category={cat}
              data-cy={`toolbar-arrow-${cat}`}  // <-- Atributo agregado
            >
              <DownArrowSVG />
            </div>
            {modalCategory === cat && (
              <div className="tool-modal" data-category={cat}>
                {toolsByCategory[cat].map((tool) => (
                  <div
                    key={tool.id}
                    className={`modal-tool ${activeTool.id === tool.id ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTool(tool.id as ToolId);
                      setModalCategory(null);
                    }}
                    data-cy={`modal-tool-${tool.id}`}  // <-- Atributo agregado
                  >
                    {tool.icon}
                    <span>{tool.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default Toolbar;