import React, { useRef } from 'react';
import { useState } from 'react';
import './Header.css';
import { BurguerSVG, DownArrowSVG, SideBarShowSVG } from '../../../../../assets/svgs/SVGSLibrary';
import ProjectMenu from '../ProjectMenu/ProjectMenu';
import MenuModal from '../MenuModal/MenuModal';

interface HeaderProps {
    setSidebarsMinimized: (sidebarsMinimized: boolean) => void;
}

const Header: React.FC<HeaderProps> = ({ setSidebarsMinimized }) => {
    const [showMenu, setshowMenu] = useState<boolean>(false);
    const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
    const burgerIconRef = useRef<HTMLDivElement>(null);
    const [projectMenu, setprojectMenu] = useState<boolean>(false);

    const handleIconClick = () => {
        if (burgerIconRef.current) {
          const rect = burgerIconRef.current.getBoundingClientRect();
          setModalPosition({ x: rect.left, y: rect.bottom + 5 });
        }
        setshowMenu(true);
      };
    
    return (
        <header className="sidebarHeader">
            <div className="headerRow">
                <div className="iconButtonContainer" ref={burgerIconRef} onClick={handleIconClick}>
                    <div className="iconButton">
                        <BurguerSVG />
                    </div>
                    <div className="arrowIcon">
                        <DownArrowSVG />
                    </div>
                </div>
                <div className="iconButton sideBarIcon" onClick={() => setSidebarsMinimized(true)}>
                    <SideBarShowSVG />
                </div>
            </div>
            <div className="headerTitle">
                <ProjectMenu projectMenu={projectMenu} setprojectMenu={setprojectMenu} />
            </div>
            {showMenu && (
                <MenuModal
                  position={modalPosition}
                  onClose={() => setshowMenu(false)}
                />
            )}
        </header>
    );
}

export default Header;