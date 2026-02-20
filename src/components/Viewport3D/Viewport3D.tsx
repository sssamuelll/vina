import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, ContactShadows } from '@react-three/drei';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import PieceMesh from './PieceMesh';
import Mannequin from './Mannequin';
import AvatarModel from './AvatarModel';
import './Viewport3D.css';

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

export default function Viewport3D() {
  const { pieces, avatarMode, avatarModelUrl, avatar } = useSelector((s: RootState) => s.project);
  const { simulationRunning, selectedPieceIds } = useSelector((s: RootState) => s.editor);

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

        {/* Pattern pieces as 3D meshes */}
        {pieces.map((piece, i) => (
          <PieceMesh
            key={piece.id}
            piece={piece}
            isSelected={selectedPieceIds.includes(piece.id)}
            color={PIECE_COLORS[i % PIECE_COLORS.length]}
            position={getPosition(i, pieces.length)}
          />
        ))}

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
      <div className={`sim-status ${simulationRunning ? 'running' : ''}`}>
        {simulationRunning ? '● SIMULATING' : `○ ${pieces.length} piece${pieces.length !== 1 ? 's' : ''}`}
      </div>
    </div>
  );
}
