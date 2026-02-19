import { useState, useEffect } from 'react';
import Toolbar from '../Toolbar/Toolbar';
import '../../App.css';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import Left from '../Menus/Left/Sidebar/Left';
import Right from '../Menus/Right/Sidebar/Right';
import FloatingLeft from '../Menus/Left/FloatingMenu/FloatingLeft';
import FloatingRight from '../Menus/Right/FloatingMenu/FloatingRight';
import { Marker, PathCommand, Comment } from '../../types/types';
import { pathCommandsToSVG } from '../../utils/utils'; // Importar la nueva función
import { useTools } from '../Toolbar/Tools/ToolContext';
import CommentModal from '../Toolbar/Tools/annotation/CommentModal';
import { VectorEditor } from '../VectorEditor/VectorEditor';
import ImageLoader from '../ImageLoader/ImageLoader';
import Loader from '../common/Loader/Loader';

interface Project {
  name: string;
  description: string;
  date: string;
  folder: string;
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

function Editor() {
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [scaledDimensions, setScaledDimensions] = useState({ width: 0, height: 0 });

  const [loadedImage, setLoadedImage] = useState<string | null>(null);
  const { activeTool } = useTools();
  const selectedTool = activeTool.id;
  const [sidebarsMinimized, setSidebarsMinimized] = useState<boolean>(false);
  const [showUserMenu, setShowUserMenu] = useState<boolean>(false);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({
    width: 1280,
    height: 832,
  });

  const [markers, setMarkers] = useState<Marker[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [modalPosition, setModalPosition] = useState<{ x: number; y: number } | null>(null);

  const handleImageLoadStart = () => setIsLoadingImage(true);

  const handleImageLoadSuccess = (src: string) => {
    setIsLoadingImage(true); // Activa el loader inmediatamente
    const img = new Image();
  
    const timeout = setTimeout(() => {
      img.src = ''; // abortar carga
      alert('Timeout al cargar imagen.');
      setIsLoadingImage(false);
    }, 10000);
  
    img.onload = () => {
      clearTimeout(timeout);
      const originalWidth = img.width;
      const originalHeight = img.height;
  
      const maxWidth = window.innerWidth - 480;
      const maxHeight = window.innerHeight - 80;
      const scale = Math.min(maxWidth / originalWidth, maxHeight / originalHeight);
      setScaledDimensions({ width: originalWidth * scale, height: originalHeight * scale });
      setLoadedImage(src);
      setIsLoadingImage(false);
    };
  
    img.onerror = () => {
      clearTimeout(timeout);
      alert('Error al cargar imagen.');
      setIsLoadingImage(false);
    };
  
    img.src = src;
  };
  
  const handleImageLoadCancelOrError = () => setIsLoadingImage(false);

  const handleDrawComplete = (pathCommands: PathCommand[]) => {
    const markerType = activeTool.id === 'drawing/rectangle' ? 'rectangulo' : 'poligono';
    const newMarker: Marker = {
      id: Date.now().toString(),
      name: 'New Drawing',
      type: markerType,
      pathCommands,
      status: 'Pendiente',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setMarkers(prev => [...prev, newMarker]);
    const svgPreview = pathCommandsToSVG(pathCommands, canvasSize.width, canvasSize.height);
    console.log('SVG Preview:', svgPreview);
    console.log('New Marker:', newMarker);
  };

  const handleMarkerSelect = (markerId: string, position: { x: number; y: number }) => {
    setSelectedMarkerId(markerId);
    // Aquí puedes actualizar la información mostrada en la barra lateral derecha
    console.log("Marcador seleccionado:", markerId, position);
  };

  const handleMarkerClick = (markerId: string, position: { x: number; y: number }) => {
    setSelectedMarkerId(markerId);
    setModalPosition(position);
    setShowCommentModal(true);
  };

  const handleOpenCommentModal = (position: { x: number; y: number }) => {
    // Actualiza el estado para mostrar el CommentModal en la posición indicada
    setModalPosition(position);
    setShowCommentModal(true);
  };

  const project: Project = {
    name: 'Project 1',
    description: 'Descripción del proyecto',
    date: 'Fecha de creación',
    folder: 'Carpeta de proyecto',
  };

  const user: User = {
    id: '1',
    name: 'Samuel Ballesteros',
    email: 'samueldarioballesteros@gmail.com',
    role: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  useEffect(() => {
    // Sincroniza la variable global con el estado actual
    (window as any).canvasMarkers = { markers };
  }, [markers]);

  useEffect(() => {
    const updateCanvasSize = () => {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const margin = 40;
      const sidebarWidth = 400;
      const availableWidth = windowWidth - sidebarWidth - margin * 2;
      const availableHeight = windowHeight;
      const scaleX = availableWidth / 1280;
      const scaleY = availableHeight / 832;
      const newScale = Math.min(scaleX, scaleY);

      setCanvasSize({
        width: 1280 * newScale,
        height: 832 * newScale,
      });
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [sidebarsMinimized]);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <div className="app-container">
      <div className="layout">
        <main className="main-content">
          {!loadedImage && !isLoadingImage && 
            <ImageLoader 
              onImageLoad={handleImageLoadSuccess}
              onImageSelectStart={handleImageLoadStart}
              onImageSelectCancel={handleImageLoadCancelOrError}
            />}
          {isLoadingImage && !loadedImage && <Loader />}
          {loadedImage && (
            <>
              <TransformWrapper
              disabled={selectedTool !== 'navigation/hand'}
              pinch={{ disabled: selectedTool !== 'navigation/hand' }}
              zoomAnimation={{ disabled: selectedTool !== 'navigation/hand' }}
              panning={{ disabled: selectedTool !== 'navigation/hand' }}
              wheel={{ step: 0.1, smoothStep: 0.005 }}
              minScale={0.1}
              maxScale={10}
            >
              <TransformComponent>
                <div
                  data-cy={"transform-component"}
                  className="canvas-wrapper"
                   style={{
                       '--canvas-width': scaledDimensions.width + 'px',
                       '--canvas-height': scaledDimensions.height + 'px',
                   } as React.CSSProperties}
                >
                  <div
                    className="canvas-container"
                    style={{ cursor: activeTool.cursor, position:'relative' }} 
                  >
                    <img
                      src={loadedImage}
                      className="canvas-image"
                      alt="Loaded Biomedical"
                      style={{ 
                        width: scaledDimensions.width, 
                        height: scaledDimensions.height, 
                        objectFit: 'contain', 
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%,-50%)',
                        zIndex: -1 
                      }}
                    />
                    <VectorEditor
                      width={scaledDimensions.width}
                      height={scaledDimensions.height}
                      markers={markers}
                      setMarkers={setMarkers}
                      onDrawComplete={handleDrawComplete}
                      onMarkerClick={handleMarkerClick}
                      onSelectMarker={handleMarkerSelect}
                      onOpenCommentModal={handleOpenCommentModal}
                    />
                  </div>
                </div>
              </TransformComponent>
              </TransformWrapper>
            </>
          )}
          {showCommentModal && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 999,
              }}
              onClick={() => setShowCommentModal(false)}
            />
          )}
          {showCommentModal && modalPosition && selectedMarkerId && (
            <CommentModal
              position={modalPosition}
              onClose={() => setShowCommentModal(false)}
              onSubmit={(comment) => {
                const newComment: Comment = {
                  name: `Comment on Marker ${selectedMarkerId}`,
                  comment,
                  date: new Date().toLocaleDateString(),
                  time: new Date().toLocaleTimeString(),
                  user: user.name,
                  markerId: selectedMarkerId,
                };
                setComments(prev => [...prev, newComment]);
                setShowCommentModal(false);
              }}
            />
          )}

          <div className="toolbar-overlay">
            <Toolbar />
          </div>
        </main>

        {!sidebarsMinimized && (
          <>
            <Left setSidebarsMinimized={setSidebarsMinimized} />
            <Right comments={comments} user={user} setShowUserMenu={setShowUserMenu} showUserMenu={showUserMenu} />
          </>
        )}
      </div>

      {sidebarsMinimized && (
        <>
          <FloatingLeft setSidebarsMinimized={setSidebarsMinimized} project={project} />
          <FloatingRight project={project} user={user} setShowUserMenu={setShowUserMenu} showUserMenu={showUserMenu} />
        </>
      )}
    </div>
  );
}

export default Editor;
