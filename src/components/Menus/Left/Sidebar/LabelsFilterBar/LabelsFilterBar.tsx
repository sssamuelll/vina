import styles from './LabelsFilterBar.module.css';
import { SearchSVG } from '../../../../../assets/svgs/SVGSLibrary';

const LabelsFilterBar = () => {
    return (
        <div className={styles.labelsFilterBar}>
            <div className={styles.Labels}>
                <div className={styles.Label+" "+styles.active}>Células</div>
                <div className={styles.Label}>Tumores</div>
            </div>
            <div className={styles.LabelFilter}>
                <div className={styles.searchIcon}>
                    <SearchSVG />
                </div>
            </div>
        </div>
    )
}

export default LabelsFilterBar;