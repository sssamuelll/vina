import React from 'react';
import './Header.css';
import { DownArrowSVG } from '../../../../../assets/svgs/SVGSLibrary';
import { User } from '../../../../../types/types';
import { nameFirstLetter } from '../../../../../utils/utils';

interface HeaderProps {
    showUserMenu: boolean;
    setShowUserMenu: (showUserMenu: boolean) => void;
    user: User;
}
  
const Header: React.FC<HeaderProps> = ({showUserMenu, setShowUserMenu, user}) => {

    return (
        <header className="header">
            <div className="headerRow">
                <div className="userContainer">
                    <div className="userIconContainer">
                        <div className="userIcon" onClick={() => setShowUserMenu(!showUserMenu)}>
                            {nameFirstLetter(user.name)}
                        </div>
                    </div>
                    <div className="arrowIcon">
                        <DownArrowSVG />
                    </div>
                </div>
                <div className="shareButtonContainer">
                    <div className="shareButton">
                        Share
                    </div>
                </div>
            </div>
            <div className="rightRow">
                <div className="rightTitle">
                    Comments
                </div>
                <div className="ZoomContainer">
                    <div className="zoomButton">
                        100%
                    </div>
                    <div className="arrowIcon">
                        <DownArrowSVG />
                    </div>
                </div>
            </div>
        </header>
    );
}

export default Header;