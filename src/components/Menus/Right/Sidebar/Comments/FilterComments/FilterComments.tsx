import React from 'react';
import styles from './FilterComments.module.css';
import { FilterSVG, MoreSVG, SearchSVG } from '../../../../../../assets/svgs/SVGSLibrary';

interface FilterCommentsProps {
  searchTerm: string;
  setSearchTerm: (searchTerm: string) => void;
}

const FilterComments: React.FC<FilterCommentsProps> = ({ searchTerm, setSearchTerm }) => {
  return (
    <div className={styles.filterCommentsContainer}>
      <div className={styles.searchCommentsContainer}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <div className={styles.searchIcon}>
          <SearchSVG />
        </div>
      </div>
      <div className={styles.filterOptionsContainer}>
        <div className={styles.filterIcon}>
            <FilterSVG />
        </div>
        <div className={styles.filterMoreOptions}>
             <MoreSVG />
        </div>
      </div>
    </div>
  );
};

export default FilterComments;
