import React, { useState } from 'react';
import FilterComments from './FilterComments/FilterComments';
import CommentsList from './CommentsList/CommentsList';

interface CommentsProps {
    comments: Comment[];
}

interface Comment {
    name: string;
    comment: string;
    date: string;
    time: string;
    user: string;
}

const Comments: React.FC<CommentsProps> = ({comments}) => {
    const [searchTerm, setSearchTerm] = useState('');

    
    const filteredComments = comments.filter((commentObj) =>
        commentObj.comment.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <>
            <FilterComments searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
            <CommentsList comments={filteredComments} />
        </>
        
    )
}

export default Comments;