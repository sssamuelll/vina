import React from "react";
import { Project, User } from "../../../../types/types";
import { nameFirstLetter } from "../../../../utils/utils";
import './FloatingRight.css';
import { DownArrowSVG } from "../../../../assets/svgs/SVGSLibrary";

interface FloatingRightProps {
    project: Project
    user: User
    setShowUserMenu: (showUserMenu: boolean) => void;
    showUserMenu: boolean;
}

const FloatingRight:React.FC<FloatingRightProps> = ({setShowUserMenu, showUserMenu, user}) => {
    
    return (
        <div className="floating-sidebar right-floating">
            <div className="floatingUserContainer">
                <div className="userIconContainer floating-user-icon">
                    <div className="userIcon floatingUserIcon" onClick={() => setShowUserMenu(!showUserMenu)}>
                        {nameFirstLetter(user.name)}
                    </div>
                </div>
                <div className="arrowIcon">
                    <DownArrowSVG />
                </div>
            </div>
            <div className="floatingZoomContainer">
                <div className="floatingZoomButton">
                    100%
                </div>
                <div className="arrowIcon">
                    <DownArrowSVG />
                </div>
            </div>
            <div className="floatingShareButtonContainer">
                <div className="shareButton floatingShareButton">
                    Share
                </div>
            </div>
        </div>
    )   
}

export default FloatingRight;