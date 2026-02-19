import './Skeleton.css';

const Skeleton = () => {
    return (
      <div className="app-container skeleton">
        <div className="layout">
          {/* Sidebars */}
          <div className="skeleton-sidebar left" />
          <div className="skeleton-sidebar right" />
          
          {/* Main Content */}
          <main className="main-content">
            <div className="skeleton-canvas">
              <div className="skeleton-toolbar" />
            </div>
          </main>
        </div>
      </div>
    );
  };
  
  export default Skeleton;