import React from "react";
import { BurguerSVG, DownArrowSVG, SideBarShowSVG } from '../../../../assets/svgs/SVGSLibrary';
import './FloatingLeft.css';

interface Project {
    name: string;
    description: string;
    date: string;
    folder: string;
}

interface FloatingLeftProps {
    setSidebarsMinimized: (sidebarsMinimized: boolean) => void;
    project: Project;
}

const FloatingLeft: React.FC<FloatingLeftProps> = ({ setSidebarsMinimized, project }) => {
    return (
        <div className="floating-sidebar left-floating">
            {/* Se recomienda reemplazar "Nombre del Proyecto" por una variable o prop si es necesario */}
            <div className="floatingButton" onClick={() => {}}>
                <BurguerSVG />
                <DownArrowSVG />
            </div>
            <div className="floatingTitle">
                <div className="floatin-projectTitle">{project.name}</div>
                <div className="floatingButton floatingButtonLeft" onClick={() => setSidebarsMinimized(false)}>
                    <SideBarShowSVG />
                </div>
            </div>
        </div>
    );
}

export default FloatingLeft;