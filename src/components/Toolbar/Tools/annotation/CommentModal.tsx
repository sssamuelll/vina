import React, { useState, useEffect, useRef } from 'react';
import { UpArrowSVG } from '../../../../assets/svgs/SVGSLibrary';

interface CommentModalProps {
  position: { x: number; y: number };
  onClose: () => void;
  onSubmit: (comment: string) => void;
}

const CommentModal: React.FC<CommentModalProps> = ({ position, onClose, onSubmit }) => {
  const modalWidth = 200;

  const [modalPosition, setModalPosition] = useState({ left: 0, top: 0 });

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const editorContainer = document.querySelector('.vectorEditorContainer');
    
    if (!editorContainer) return;
  
    const editorRect = editorContainer.getBoundingClientRect();
  
    const relativeX = position.x - editorRect.left;
    const relativeY = position.y - editorRect.top;
  
    let left: number;
    let top: number;
  
    // Horizontal positioning based on editor container midpoint
    if (relativeX > editorRect.width / 2) {
      left = position.x - modalWidth - 10; // Position to the left
    } else {
      left = position.x + 10; // Position to the right
    }
  
    // Vertical positioning based on editor container midpoint
    if (relativeY > editorRect.height / 2) {
      top = position.y - 30; // Position above cursor
    } else {
      top = position.y + 10; // Position below cursor
    }
  
    setModalPosition({ left, top });
  }, [position]);
  
  useEffect(() => {
    // 2. Enfocamos el input luego de montar o actualizar el modal
    inputRef.current?.focus();
  }, []); 

  const [comment, setComment] = useState('');

  const handleSubmit = () => {
    if (comment.trim()) {
      onSubmit(comment);
      setComment('');
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: `${modalPosition.left}px`,
        top: `${modalPosition.top}px`,
        width: `${modalWidth}px`,
        background: '#2C2C2C',
        border: '1px solid #444',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        zIndex: 1000,
      }}
    >
      <div style={{ position: 'relative', width: '100%' }}>
        <input
          ref={inputRef}
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          data-cy="comment-input"
          placeholder="Add a comment"
          style={{
            width: '100%',
            background: '#383838',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 0',
            color: '#fff',
            outline: 'none',
            textIndent: '10px',
          }}
          onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
        />
        <button
          onClick={handleSubmit}
          style={{
            position: 'absolute',
            top: '50%',
            right: '5px',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0',
          }}
        >
          <UpArrowSVG strokeColor="#0D99FF" sizeWidth={18} sizeHeight={18} />
        </button>
      </div>
    </div>
  );
};

export default CommentModal;