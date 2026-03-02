import React from 'react';

export interface ProgressQuestionProps {
  question: string;
  options: string[];
  onAnswer: (answer: string) => void;
}

/**
 * ProgressQuestion - Renders question UI with clickable options.
 */
export const ProgressQuestion: React.FC<ProgressQuestionProps> = ({
  question,
  options,
  onAnswer,
}) => {
  return (
    <div className="progress-question">
      <p className="progress-question-text">{question}</p>
      <div className="progress-question-options">
        {options.map((option) => (
          <button
            key={option}
            className="progress-option-btn"
            onClick={() => onAnswer(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
};
