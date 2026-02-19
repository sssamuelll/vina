import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import './Viewport3D.css';

/** Placeholder mannequin — will be replaced with parametric avatar */
function Mannequin() {
  return (
    <group>
      {/* Torso */}
      <mesh position={[0, 1.1, 0]}>
        <capsuleGeometry args={[0.22, 0.5, 8, 16]} />
        <meshStandardMaterial color="#c4b5a5" roughness={0.8} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.7, 0]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color="#c4b5a5" roughness={0.8} />
      </mesh>
      {/* Hips */}
      <mesh position={[0, 0.6, 0]}>
        <capsuleGeometry args={[0.24, 0.2, 8, 16]} />
        <meshStandardMaterial color="#c4b5a5" roughness={0.8} />
      </mesh>
      {/* Left leg */}
      <mesh position={[-0.1, 0.05, 0]}>
        <capsuleGeometry args={[0.08, 0.5, 8, 16]} />
        <meshStandardMaterial color="#c4b5a5" roughness={0.8} />
      </mesh>
      {/* Right leg */}
      <mesh position={[0.1, 0.05, 0]}>
        <capsuleGeometry args={[0.08, 0.5, 8, 16]} />
        <meshStandardMaterial color="#c4b5a5" roughness={0.8} />
      </mesh>
    </group>
  );
}

export default function Viewport3D() {
  const { simulationRunning } = useSelector((s: RootState) => s.editor);

  return (
    <div className="viewport3d">
      <Canvas
        camera={{ position: [0, 1.2, 2.5], fov: 45 }}
        shadows
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} castShadow />
        <directionalLight position={[-3, 3, -3]} intensity={0.3} />

        <Mannequin />

        <Grid
          args={[10, 10]}
          cellSize={0.1}
          cellThickness={0.5}
          cellColor="#333"
          sectionSize={1}
          sectionThickness={1}
          sectionColor="#444"
          fadeDistance={10}
          position={[0, -0.25, 0]}
        />

        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          minDistance={1}
          maxDistance={8}
          target={[0, 1, 0]}
        />
      </Canvas>

      {/* Simulation status */}
      <div className={`sim-status ${simulationRunning ? 'running' : ''}`}>
        {simulationRunning ? '● SIMULATING' : '○ PAUSED'}
      </div>
    </div>
  );
}
