import React from 'react';
import Modal from '../../../../common/Modal/Modal';
import MenuOption from './MenuOption/MenuOption';

type Option = {
  label: string;
  action: () => void
}

interface MenuSecondaryModalProps {
  position: { x: number; y: number };
  options: Option[];
  onCloseSubMenu: () => void;
  onClose: () => void;
}

const MenuSecondaryModal: React.FC<MenuSecondaryModalProps> = ({ position, options, onCloseSubMenu, onClose }) => {
  const handleMouseLeave = (e: React.MouseEvent) => {
    onCloseSubMenu();
  };
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };
  return (
    <Modal position={position} onClose={onClose}>
      <div 
        className="menu-secondary-modal"
        onMouseLeave={handleMouseLeave}
        onMouseEnter={(e) => e.stopPropagation()}
        onClick={handleClick}
      >
        {options.map((option) => (
          <MenuOption key={option.label} option={option} onClose={onClose} />
        ))}
      </div>
    </Modal>
  );
};

export default MenuSecondaryModal;
