import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { getCatalog, getCatalogByCategory, type CatalogEntry, type GarmentCategory } from '../../utils/seamly2d/catalog';
import { useState } from 'react';
import './TemplateLibrary.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<GarmentCategory, string> = {
  tops: '👚 Tops',
  bottoms: '👖 Bottoms',
  dresses: '👗 Dresses',
  outerwear: '🧥 Outerwear',
  underwear: '🩱 Underwear',
  blocks: '📐 Blocks',
  sleeves: '🦾 Sleeves',
  other: '📦 Other',
};

export default function TemplateLibrary({ isOpen, onClose }: Props) {
  const avatar = useSelector((s: RootState) => s.project.avatar);
  const [filter, setFilter] = useState<GarmentCategory | 'all'>('all');
  const [loading, setLoading] = useState<string | null>(null);

  const catalog = filter === 'all' ? getCatalog() : getCatalogByCategory(filter);
  const categories = [...new Set(getCatalog().map(e => e.category))];

  const handleGenerate = async (entry: CatalogEntry) => {
    setLoading(entry.id);
    try {
      // Dispatch a custom event that the CopilotPanel can pick up,
      // or directly use the template engine
      const event = new CustomEvent('openclo:generate-template', {
        detail: { templateId: entry.id },
      });
      window.dispatchEvent(event);
      onClose();
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className={`template-overlay ${isOpen ? 'open' : 'closed'}`} onClick={onClose}>
      <div className="template-library" onClick={e => e.stopPropagation()}>
        <div className="template-header">
          <h2>Seamly2D Pattern Library</h2>
          <p className="template-subtitle">
            {catalog.length} validated patterns • Measurements: {avatar.measurements.chest}cm chest, {avatar.measurements.waist}cm waist
          </p>
          <button className="template-close" onClick={onClose}>✕</button>
        </div>

        <div className="template-filters">
          <button
            className={`template-filter ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >All</button>
          {categories.map(cat => (
            <button
              key={cat}
              className={`template-filter ${filter === cat ? 'active' : ''}`}
              onClick={() => setFilter(cat)}
            >{CATEGORY_LABELS[cat]}</button>
          ))}
        </div>

        <div className="template-grid">
          {catalog.map(entry => (
            <button
              key={entry.id}
              className="template-card"
              onClick={() => handleGenerate(entry)}
              disabled={loading === entry.id}
            >
              <span className="template-complexity" data-level={entry.complexity}>
                {entry.complexity}
              </span>
              <span className="template-name">{entry.name}</span>
              <span className="template-name-es">{entry.nameEs}</span>
              <span className="template-desc">{entry.description}</span>
              <span className="template-meta">
                {entry.gender} • {entry.requiredMeasurements.length} measurements
              </span>
            </button>
          ))}
        </div>

        <div className="template-footer">
          <span className="template-hint">
            💡 These are real patterns from Seamly2D — validated construction, not AI-generated shapes
          </span>
        </div>
      </div>
    </div>
  );
}
