import React, { useState } from 'react';
import Modal from '../../../../common/Modal/Modal';
import MenuCategory from './MenuCategory/MenuCategory';
import MenuSecondaryModal from './MenuSecondaryModal';
import { menuData } from './menuData';

interface MenuModalProps {
  position: { x: number; y: number };
  onClose: () => void;
}

const MenuModal: React.FC<MenuModalProps> = ({ position, onClose }) => {
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [secondaryPosition, setSecondaryPosition] = useState({ x: 0, y: 0 });

  const handleCategoryHover = (title: string, event: React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setSecondaryPosition({ x: rect.right + 2, y: rect.top });
    setHoveredCategory(title);
  };

  const handleCloseSubMenu = () => {
    setHoveredCategory(null);
  };

  const activeCategory = menuData.find(cat => cat.title === hoveredCategory);

  return (
    <Modal position={position} onClose={onClose}>
      {menuData.map((category) => (
        <MenuCategory
          key={category.title}
          category={category}
          onHover={handleCategoryHover}
          
        />
      ))}

      {hoveredCategory && activeCategory && (
        <MenuSecondaryModal
          position={secondaryPosition}
          options={activeCategory.options}
          onClose={onClose}
          onCloseSubMenu={handleCloseSubMenu}
        />
      )}
    </Modal>
  );
};

export default MenuModal;
