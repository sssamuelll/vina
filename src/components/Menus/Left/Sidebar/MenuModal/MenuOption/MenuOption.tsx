import React from 'react';
import styles from './MenuOption.module.css';

interface Option {
  label: string;
  action: () => void;
}

interface MenuOptionProps {
  option: Option;
  onClose: () => void;
}

const MenuOption: React.FC<MenuOptionProps> = ({ option, onClose }) => {
  
  const handleClick = () => {
    option.action();
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleClick();
    }
  };

  return (
    <div
      role="menuitem"
      tabIndex={0}
      className={styles.menuOption}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {option.label}
    </div>
  );
};

export default MenuOption;
