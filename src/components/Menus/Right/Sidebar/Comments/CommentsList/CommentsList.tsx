import React from 'react';
import { CommentsSVG } from '../../../../../../assets/svgs/SVGSLibrary';
import './CommentsList.css';
interface Comment {
  name: string;
  comment: string;
  date: string;
  time: string;
  user: string;
}

interface CommentsListProps {
  comments: Comment[];
}

const CommentsList: React.FC<CommentsListProps> = ({ comments }) => {
  // Verifica si no hay comentarios
  if (comments.length === 0) {
    return (
        <>
            <div className="EmptyCommentsContainer">
                <div className="EmptyIcon">
                    <CommentsSVG />
                </div>
                <div className="EmptyMessage">
                    Da tu opinión, haz una pregunta o simplemente deja una nota de agradecimiento. Haz clic en cualquier parte del archivo para dejar un comentario.
                </div>
            </div>
        </>
        );
  }

  // Si hay comentarios, muéstralos en la lista
  return (
    <div className="commentsList">
      {comments.map((comment, index) => (
        <div key={index} className="comment">
          <div className="commentUser">{comment.user}</div>
          <div className="commentDate">
            {comment.date} {comment.time}
          </div>
          <div className="commentText">{comment.comment}</div>
        </div>
      ))}
    </div>
  );
};

export default CommentsList;
