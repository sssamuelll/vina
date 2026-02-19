import React from 'react';
import Header from './Header/Header';
import Comments from './Comments/Comments';

interface Comment {
    name: string;
    comment: string;
    date: string;
    time: string;
    user: string;
}

interface User {
    id: string;
    name: string;
    email?: string;
    avatarUrl?: string;
    role?: 'admin' | 'editor' | 'viewer';
    createdAt?: Date;
    updatedAt?: Date;
}

interface RightProps {
    comments: Comment[];
    user: User;
    setShowUserMenu: (showUserMenu: boolean) => void;
    showUserMenu: boolean;
}

const Right: React.FC<RightProps> = ({comments, user, setShowUserMenu, showUserMenu }) => {
   
    
    return (
        <aside className="sidebar right-sidebar">
            <Header showUserMenu={showUserMenu} setShowUserMenu={setShowUserMenu} user={user} />
            <Comments comments={comments}/>
        </aside>
    )
}

export default Right;