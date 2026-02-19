import React from 'react';
import styles from './MenuCategory.module.css'

interface Category {
  title: string;
}

interface MenuCategoryProps {
  category: Category;
  onHover: (title: string, event: React.MouseEvent) => void;
}

const MenuCategory: React.FC<MenuCategoryProps> = ({ category, onHover }) => {
  
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return(
    <div
      className={styles.menuCategory}
      onMouseDown={handleMouseDown}
      onMouseEnter={(e) => onHover(category.title, e)}
      onClick={handleClick} 
    >
      <div className="menu-category-title">{category.title}</div>
    </div>
  );
};

export default MenuCategory;
