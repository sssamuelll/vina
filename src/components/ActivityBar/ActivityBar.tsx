import './ActivityBar.css';

export type SidebarView =
  | 'explorer'
  | 'measurements'
  | 'grading'
  | 'nesting'
  | 'files'
  | 'plugins'
  | 'settings';

interface ActivityBarProps {
  activeView: SidebarView | null;
  onViewChange: (view: SidebarView | null) => void;
}

interface ActivityItem {
  id: SidebarView;
  label: string;
  icon: JSX.Element;
  position: 'top' | 'bottom';
}

const items: ActivityItem[] = [
  {
    id: 'explorer',
    label: 'Pattern Explorer',
    position: 'top',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 3H16V17H4V3Z" />
        <path d="M7 7H13M7 10H11" />
      </svg>
    ),
  },
  {
    id: 'measurements',
    label: 'Measurements',
    position: 'top',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4V16" />
        <path d="M4 4H7M4 8H6M4 12H7M4 16H6" />
        <path d="M10 6V14" />
        <path d="M7 9L10 6L13 9" />
        <path d="M7 11L10 14L13 11" />
      </svg>
    ),
  },
  {
    id: 'grading',
    label: 'Grading',
    position: 'top',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="5" width="10" height="10" />
        <rect x="3" y="3" width="14" height="14" strokeDasharray="2 2" />
        <rect x="7" y="7" width="6" height="6" strokeDasharray="2 2" />
      </svg>
    ),
  },
  {
    id: 'nesting',
    label: 'Nesting',
    position: 'top',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="6" height="8" />
        <rect x="11" y="3" width="6" height="5" />
        <rect x="11" y="10" width="6" height="7" />
        <rect x="3" y="13" width="6" height="4" />
      </svg>
    ),
  },
  {
    id: 'files',
    label: 'Files',
    position: 'top',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 15V5C3 4.45 3.45 4 4 4H8L10 6H16C16.55 6 17 6.45 17 7V15C17 15.55 16.55 16 16 16H4C3.45 16 3 15.55 3 15Z" />
      </svg>
    ),
  },
  {
    id: 'plugins',
    label: 'Plugins',
    position: 'bottom',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3H12V6H14C14.55 6 15 6.45 15 7V10H12V8H8V10H5V7C5 6.45 5.45 6 6 6H8V3Z" />
        <path d="M5 10H15V15C15 15.55 14.55 16 14 16H6C5.45 16 5 15.55 5 15V10Z" />
        <path d="M8 16V18M12 16V18" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    position: 'bottom',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10" cy="10" r="3" />
        <path d="M10 3V5M10 15V17M17 10H15M5 10H3M15 5L13.5 6.5M6.5 13.5L5 15M15 15L13.5 13.5M6.5 6.5L5 5" />
      </svg>
    ),
  },
];

export default function ActivityBar({ activeView, onViewChange }: ActivityBarProps) {
  const topItems = items.filter(i => i.position === 'top');
  const bottomItems = items.filter(i => i.position === 'bottom');

  const handleClick = (id: SidebarView) => {
    if (activeView === id) {
      onViewChange(null); // collapse sidebar
    } else {
      onViewChange(id);
    }
  };

  return (
    <div className="activity-bar">
      <div className="activity-bar-top">
        {topItems.map(item => (
          <button
            key={item.id}
            className={`activity-bar-item ${activeView === item.id ? 'active' : ''}`}
            onClick={() => handleClick(item.id)}
            title={item.label}
          >
            <span className="activity-bar-icon">{item.icon}</span>
          </button>
        ))}
      </div>
      <div className="activity-bar-bottom">
        {bottomItems.map(item => (
          <button
            key={item.id}
            className={`activity-bar-item ${activeView === item.id ? 'active' : ''}`}
            onClick={() => handleClick(item.id)}
            title={item.label}
          >
            <span className="activity-bar-icon">{item.icon}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
