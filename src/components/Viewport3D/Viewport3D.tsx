import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import PieceMesh from './PieceMesh';
import './Viewport3D.css';

/** Placeholder mannequin */
function Mannequin() {
  const mat = <meshStandardMaterial color="#b8a99a" roughness={0.85} />;
  return (
    <group>
      {/* Head */}
      <mesh position={[0, 1.68, 0]}>
        <sphereGeometry args={[0.11, 16, 16]} />
        {mat}
      </mesh>
      {/* Neck */}
      <mesh position={[0, 1.54, 0]}>
        <cylinderGeometry args={[0.05, 0.06, 0.08, 12]} />
        {mat}
      </mesh>
      {/* Torso upper */}
      <mesh position={[0, 1.32, 0]}>
        <capsuleGeometry args={[0.18, 0.28, 8, 16]} />
        {mat}
      </mesh>
      {/* Torso lower */}
      <mesh position={[0, 0.95, 0]}>
        <capsuleGeometry args={[0.15, 0.2, 8, 16]} />
        {mat}
      </mesh>
      {/* Hips */}
      <mesh position={[0, 0.75, 0]}>
        <capsuleGeometry args={[0.19, 0.1, 8, 16]} />
        {mat}
      </mesh>
      {/* Left arm */}
      <mesh position={[-0.28, 1.25, 0]} rotation={[0, 0, 0.15]}>
        <capsuleGeometry args={[0.04, 0.5, 8, 12]} />
        {mat}
      </mesh>
      {/* Right arm */}
      <mesh position={[0.28, 1.25, 0]} rotation={[0, 0, -0.15]}>
        <capsuleGeometry args={[0.04, 0.5, 8, 12]} />
        {mat}
      </mesh>
      {/* Left leg */}
      <mesh position={[-0.09, 0.38, 0]}>
        <capsuleGeometry args={[0.065, 0.5, 8, 12]} />
        {mat}
      </mesh>
      {/* Right leg */}
      <mesh position={[0.09, 0.38, 0]}>
        <capsuleGeometry args={[0.065, 0.5, 8, 12]} />
        {mat}
      </mesh>
    </group>
  );
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

export default function Viewport3D() {
  const { pieces } = useSelector((s: RootState) => s.project);
  const { simulationRunning, selectedPieceIds } = useSelector((s: RootState) => s.editor);

  return (
    <div className="viewport3d">
      <Canvas camera={{ position: [0, 1.2, 2.5], fov: 45 }} shadows>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={0.7} castShadow />
        <directionalLight position={[-3, 4, -2]} intensity={0.3} />
        <hemisphereLight args={['#b1e1ff', '#b97a20', 0.2]} />

        <Mannequin />

        {/* Render pattern pieces as 3D meshes */}
        {pieces.map((piece, i) => (
          <PieceMesh
            key={piece.id}
            piece={piece}
            isSelected={selectedPieceIds.includes(piece.id)}
            color={PIECE_COLORS[i % PIECE_COLORS.length]}
            position={getPosition(i, pieces.length)}
          />
        ))}

        <Grid
          args={[10, 10]}
          cellSize={0.1}
          cellThickness={0.5}
          cellColor="#333"
          sectionSize={1}
          sectionThickness={1}
          sectionColor="#444"
          fadeDistance={8}
          position={[0, 0, 0]}
        />

        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          minDistance={0.8}
          maxDistance={6}
          target={[0, 1, 0]}
        />
      </Canvas>

      {/* Status */}
      <div className={`sim-status ${simulationRunning ? 'running' : ''}`}>
        {simulationRunning ? '● SIMULATING' : `○ ${pieces.length} piece${pieces.length !== 1 ? 's' : ''}`}
      </div>
    </div>
  );
}
