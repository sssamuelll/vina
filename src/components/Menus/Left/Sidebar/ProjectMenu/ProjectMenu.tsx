import React from 'react';
import { DownArrowSVG } from '../../../../../assets/svgs/SVGSLibrary';
import styles from './ProjectMenu.module.css';

interface ProjectMenuProps {
    projectMenu: boolean;
    setprojectMenu: (projectMenu: boolean) => void;
}

const ProjectMenu: React.FC<ProjectMenuProps> = ({projectMenu, setprojectMenu}) => {
    
    return (
        <>
            <div className={styles.projectTitle} onClick={() => setprojectMenu(!projectMenu)}>
                <div className={styles.title}>
                    Project 1
                </div>    
                <div className={styles.iconButtonContainer} >
                    <div className="arrowIcon">
                        <DownArrowSVG />
                    </div>
                </div>
            </div>
            <div className={styles.projectFolder}>
                <div className="folderTitle">
                    Folder 1
                </div>
                <div className="folderTitle">
                    /
                </div>
                <div className="folderTitle">
                    Folder 2
                </div>
            </div>
        </>
    )
}

export default ProjectMenu;