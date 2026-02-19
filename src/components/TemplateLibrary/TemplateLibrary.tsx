import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { addPiece } from '../../store/projectSlice';
import { selectPiece } from '../../store/editorSlice';
import { PATTERN_TEMPLATES, PatternTemplate } from '../../utils/patternTemplates';
import './TemplateLibrary.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function TemplateLibrary({ isOpen, onClose }: Props) {
  const dispatch = useDispatch();
  const avatar = useSelector((s: RootState) => s.project.avatar);

  const handleGenerate = (template: PatternTemplate) => {
    const pieces = template.generate(avatar.measurements);
    pieces.forEach(piece => {
      dispatch(addPiece(piece));
    });
    // Select the first generated piece
    if (pieces.length > 0) {
      dispatch(selectPiece(pieces[0].id));
    }
    onClose();
  };

  return (
    <div className={`template-overlay ${isOpen ? 'open' : 'closed'}`} onClick={onClose}>
      <div className="template-library" onClick={e => e.stopPropagation()}>
        <div className="template-header">
          <h2>Pattern Templates</h2>
          <p className="template-subtitle">
            Generated from avatar measurements ({avatar.measurements.chest}cm chest, {avatar.measurements.waist}cm waist, {avatar.measurements.hips}cm hips)
          </p>
          <button className="template-close" onClick={onClose}>✕</button>
        </div>

        <div className="template-grid">
          {PATTERN_TEMPLATES.map(template => (
            <button
              key={template.id}
              className="template-card"
              onClick={() => handleGenerate(template)}
            >
              <span className="template-icon">{template.icon}</span>
              <span className="template-name">{template.name}</span>
              <span className="template-name-es">{template.nameEs}</span>
              <span className="template-desc">{template.description}</span>
            </button>
          ))}
        </div>

        <div className="template-footer">
          <span className="template-hint">
            💡 Adjust avatar measurements in the Properties panel to change pattern sizing
          </span>
        </div>
      </div>
    </div>
  );
}
