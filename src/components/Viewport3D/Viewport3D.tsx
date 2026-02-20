import { Component, Suspense, lazy, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, ContactShadows } from '@react-three/drei';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import PieceMesh from './PieceMesh';
import Mannequin from './Mannequin';
import AvatarModel from './AvatarModel';
import './Viewport3D.css';

/** Lazy-load ClothMesh to keep bundle impact minimal */
const ClothMesh = lazy(() => import('./ClothMesh'));

/** Error boundary so a WebGL crash doesn't take down the 2D editor */
class Viewport3DErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error?: string }> {
  state = { hasError: false, error: '' };
  static getDerivedStateFromError(err: Error) {
    return { hasError: true, error: err.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="viewport3d viewport3d-error">
          <div style={{ padding: '2rem', textAlign: 'center', color: '#888', fontSize: '0.85rem' }}>
            <p style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>⚠️ 3D Preview Unavailable</p>
            <p>WebGL could not initialize. The 2D editor still works normally.</p>
            <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', opacity: 0.6 }}>{this.state.error}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Distribute pieces around the mannequin */
function getPosition(index: number, total: number): [number, number, number] {
  // Arrange pieces in a circle around the mannequin
  const radius = 0.6;
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
  return [
    Math.cos(angle) * radius,
    1.1,
    Math.sin(angle) * radius,
  ];
}

const PIECE_COLORS = ['#e8e4df', '#d4cfc8', '#c8c0b5', '#f0ece6', '#e0d8cc'];

export { Viewport3DErrorBoundary };

export default function Viewport3D() {
  const { pieces, avatarMode, avatarModelUrl, avatar } = useSelector((s: RootState) => s.project);
  const { selectedPieceIds } = useSelector((s: RootState) => s.editor);
  const simulationState = useSelector((s: RootState) => s.simulation.simulationState);
  const useClothSim = simulationState !== 'idle';

  return (
    <div className="viewport3d">
      <Canvas camera={{ position: [0, 0.8, 2.8], fov: 35 }} shadows>
        {/* Studio lighting */}
        <ambientLight intensity={0.35} />
        <directionalLight position={[3, 5, 4]} intensity={0.9} castShadow shadow-mapSize={1024} />
        <directionalLight position={[-2, 3, -1]} intensity={0.25} />
        <hemisphereLight args={['#dde4ee', '#8b7355', 0.25]} />

        {/* Avatar: dress form or loaded 3D model */}
        {avatarMode === 'dressform' && <Mannequin />}
        {avatarMode === 'model' && avatarModelUrl && (
          <Suspense fallback={null}>
            <AvatarModel url={avatarModelUrl} height={avatar.measurements.height / 100} />
          </Suspense>
        )}

        {/* Pattern pieces: cloth sim when running, static otherwise */}
        {useClothSim ? (
          <Suspense fallback={null}>
            {pieces.map((piece, i) => (
              <ClothMesh
                key={piece.id}
                piece={piece}
                isSelected={selectedPieceIds.includes(piece.id)}
                color={PIECE_COLORS[i % PIECE_COLORS.length]}
                position={getPosition(i, pieces.length)}
              />
            ))}
          </Suspense>
        ) : (
          pieces.map((piece, i) => (
            <PieceMesh
              key={piece.id}
              piece={piece}
              isSelected={selectedPieceIds.includes(piece.id)}
              color={PIECE_COLORS[i % PIECE_COLORS.length]}
              position={getPosition(i, pieces.length)}
            />
          ))
        )}

        {/* Floor shadow */}
        <ContactShadows
          position={[0, 0, 0]}
          opacity={0.4}
          scale={3}
          blur={2}
          far={2}
        />

        <Grid
          args={[10, 10]}
          cellSize={0.1}
          cellThickness={0.5}
          cellColor="#333"
          sectionSize={1}
          sectionThickness={1}
          sectionColor="#444"
          fadeDistance={6}
          position={[0, -0.001, 0]}
        />

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.05}
          minDistance={0.6}
          maxDistance={5}
          target={[0, 0.75, 0]}
        />
      </Canvas>

      {/* Status */}
      <div className={`sim-status ${simulationState === 'running' ? 'running' : ''}`}>
        {simulationState === 'running' ? '● SIMULATING' : simulationState === 'paused' ? '⏸ PAUSED' : `○ ${pieces.length} piece${pieces.length !== 1 ? 's' : ''}`}
      </div>
    </div>
  );
}
