import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import {
  setPreset, resetPose, selectJoint, setJointRotation, mirrorJoint,
  loadSavedPosesFromStorage, loadSavedPosesAsync, savePose, deleteSavedPose, overwriteSavedPose,
  togglePoseEditor, toggleIK,
  JOINT_CONSTRAINTS,
  loadProfilesFromStorage, loadProfilesAsync, setActiveProfile, addProfile, updateProfile, deleteProfile,
  setMorphTarget,
} from '../../store/avatarSlice';
import {
  setAvatarModelUrl, setAvatarMode, updateMeasurements,
} from '../../store/projectSlice';
import { MIN_MEASUREMENT_CM, MAX_MEASUREMENT_CM, type AvatarProfile } from '../../utils/avatar/avatarLibrary';
import { AVATAR_POR_DEFECTO, avatarPorUrl, registrarModeloPropio } from '../../avatares/catalogo';
import { PRESETS_DE_POSE } from '../../utils/avatar/posePorDireccion';
import type { BodyMeasurements } from '../../types/types';
import type { AvatarMode } from '../../store/projectSlice';
import { requestConfirmation } from '../../hooks/useGuardedAction';
import CampoDeMedida from './CampoDeMedida';
import './AvatarPanel.css';

interface MedidaDef {
  key: keyof BodyMeasurements;
  label: string;
}

// Los rangos del deslizador viejo (140-210 de estatura, 35-55 de hombros…)
// eran de adulto, y el catálogo trae cuerpos de niño: los campos aceptan lo
// que aceptan los perfiles guardados (MIN/MAX_MEASUREMENT_CM).
const MEDIDAS: MedidaDef[] = [
  { key: 'height', label: 'Estatura' },
  { key: 'chest', label: 'Pecho' },
  { key: 'waist', label: 'Cintura' },
  { key: 'hips', label: 'Cadera' },
  { key: 'shoulder', label: 'Ancho de hombros' },
  { key: 'armLength', label: 'Largo de brazo' },
  { key: 'inseam', label: 'Entrepierna' },
];

// Las keys de PRESETS_DE_POSE son estado Redux (activePreset) — no se traducen; solo el label visible.
const PRESET_LABELS: Record<string, string> = {
  'Relaxed': 'Relajada',
  'Arms Forward': 'Brazos al frente',
  'Sitting': 'Sentado',
};

const AXIS_LABELS = ['X', 'Y', 'Z'] as const;
const AXIS_KEYS = ['x', 'y', 'z'] as const;

export default function AvatarPanel() {
  const dispatch = useDispatch<AppDispatch>();

  // Avatar state
  const measurements = useSelector((s: RootState) => s.project.avatar.measurements);
  const profiles = useSelector((s: RootState) => s.avatar.avatarProfiles);
  const activeProfileId = useSelector((s: RootState) => s.avatar.activeProfileId);
  const avatarMode = useSelector((s: RootState) => s.project.avatarMode);
  const avatarModelUrl = useSelector((s: RootState) => s.project.avatarModelUrl);
  const modeloDelProyecto = useSelector((s: RootState) => s.project.avatar.modelUrl);
  // El cuerpo que se ve, si es de la biblioteca: no se estira (spec § 5).
  const deLaBiblioteca = avatarPorUrl(avatarModelUrl);
  const poseEditorOpen = useSelector((s: RootState) => s.avatar.poseEditorOpen);

  // Pose state
  const activePreset = useSelector((s: RootState) => s.avatar.pose.activePreset);
  const ikEnabled = useSelector((s: RootState) => s.avatar.pose.ikEnabled);
  const savedPoses = useSelector((s: RootState) => s.avatar.savedPoses);
  const selectedJoint = useSelector((s: RootState) => s.avatar.selectedJoint);
  const jointRotationRaw = useSelector(
    (s: RootState) => selectedJoint ? s.avatar.pose.joints[selectedJoint] : null
  );
  const jointRotation = useMemo(() => jointRotationRaw ?? { x: 0, y: 0, z: 0 }, [jointRotationRaw]);

  const availableMorphTargets = useSelector((s: RootState) => s.avatar.availableMorphTargets);
  const morphTargets = useSelector((s: RootState) => s.avatar.morphTargets);

  // Section collapse
  const [avatarOpen, setAvatarOpen] = useState(true);
  const [poseOpen, setPoseOpen] = useState(true);
  const [jointDetailsOpen, setJointDetailsOpen] = useState(true);
  const [bodyShapeOpen, setBodyShapeOpen] = useState(true);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragover, setDragover] = useState(false);
  const [modelName, setModelName] = useState<string | null>(null);
  /** Qué se está nombrando en línea ('perfil' | 'pose'), en vez de un prompt(). */
  const [nombrando, setNombrando] = useState<'perfil' | 'pose' | null>(null);
  const [borradorNombre, setBorradorNombre] = useState('');

  useEffect(() => {
    // Sync stub for legacy LS users; async hydrate replaces with IDB-backed value.
    dispatch(loadProfilesFromStorage(undefined));
    dispatch(loadSavedPosesFromStorage(undefined));
    void loadProfilesAsync().then(profiles => dispatch(loadProfilesFromStorage(profiles)));
    void loadSavedPosesAsync().then(poses => dispatch(loadSavedPosesFromStorage(poses)));
  }, [dispatch]);

  // Con la sección «Pose» abierta, los mandos de las articulaciones se ven.
  useEffect(() => {
    if (poseOpen && !poseEditorOpen) dispatch(togglePoseEditor());
  }, [poseOpen, poseEditorOpen, dispatch]);

  // Al cerrarse el panel, o al reemplazarlo otro en su ranura, el modo pose se
  // apaga: sin el panel no quedaba puerta para apagarlo, y los mandos y
  // «● MODO POSE» se quedaban en el 3D.
  const poseAlDesmontar = useRef(poseEditorOpen);
  poseAlDesmontar.current = poseEditorOpen;
  useEffect(() => () => {
    if (poseAlDesmontar.current) dispatch(togglePoseEditor());
  }, [dispatch]);

  // Derive model name
  useEffect(() => {
    if (!avatarModelUrl || avatarPorUrl(avatarModelUrl)) {
      setModelName(null);
    }
  }, [avatarModelUrl]);

  // 3D model upload (OBJ, FBX, GLB, GLTF, VRM)
  const handleFileUpload = useCallback((file: File) => {
    const ext = file.name.toLowerCase().split('.').pop() || '';
    const supported = ['obj', 'fbx', 'glb', 'gltf', 'vrm'];
    if (!supported.includes(ext)) return;
    // El blob no trae extensión: sin el nombre en el fragmento, AvatarModel no sabe qué cargador
    // usar y la subida fallaba en silencio. fetch ignora el fragmento de una URL blob.
    const url = `${URL.createObjectURL(file)}#${encodeURIComponent(file.name)}`;
    registrarModeloPropio(url, measurements);
    dispatch(setAvatarModelUrl(url));
    setModelName(file.name);
  }, [dispatch, measurements]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragover(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  // Profile handlers
  const handleProfileChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value || null;
    dispatch(setActiveProfile(id));
    if (id) {
      const profile = profiles.find(p => p.id === id);
      if (profile) dispatch(updateMeasurements(profile.measurements));
    }
  }, [dispatch, profiles]);

  /** Nombrar en línea, no con `prompt()`: el nativo bloquea el hilo, no se
   *  puede estilar, el navegador puede desactivarlo y se lleva el foco fuera
   *  del panel. Contrato de interfaz § 4. */
  const handleSave = useCallback((name: string) => {
    if (!name.trim()) return;
    const now = Date.now();
    const profile: AvatarProfile = {
      id: activeProfileId ?? `profile-${now}`,
      name: name.trim(),
      measurements: { ...measurements },
      createdAt: now,
      updatedAt: now,
    };
    if (activeProfileId && profiles.find(p => p.id === activeProfileId)) {
      dispatch(updateProfile(profile));
    } else {
      dispatch(addProfile(profile));
      dispatch(setActiveProfile(profile.id));
    }
  }, [dispatch, measurements, activeProfileId, profiles]);

  const handleDelete = useCallback(async () => {
    if (!activeProfileId) return;
    const perfil = profiles.find((p) => p.id === activeProfileId);
    const ok = await requestConfirmation(dispatch, {
      title: '¿Eliminar el perfil?',
      description: `Se borra «${perfil?.name ?? 'sin nombre'}» y las medidas que tiene guardadas.`,
      consequences: ['Las medidas que el avatar tiene puestas ahora no cambian'],
      confirmLabel: 'Eliminar el perfil',
    });
    if (ok) dispatch(deleteProfile(activeProfileId));
  }, [dispatch, activeProfileId, profiles]);

  const handleMeasurement = useCallback((key: keyof BodyMeasurements, value: number) => {
    dispatch(updateMeasurements({ [key]: value }));
  }, [dispatch]);

  const handleMorphTarget = useCallback((name: string, value: number) => {
    dispatch(setMorphTarget({ name, value }));
  }, [dispatch]);

  // Joint rotation handler
  const handleJointChange = useCallback((axis: 'x' | 'y' | 'z', value: number) => {
    if (!selectedJoint) return;
    dispatch(setJointRotation({ joint: selectedJoint, rotation: { ...jointRotation, [axis]: value } }));
  }, [dispatch, selectedJoint, jointRotation]);

  const constraints = selectedJoint ? JOINT_CONSTRAINTS[selectedJoint] : null;
  const canMirror = selectedJoint ? (selectedJoint.startsWith('Left') || selectedJoint.startsWith('Right')) : false;

  return (
    <div className="avatar-panel-wrapper">
      <div className="avatar-panel">
        {/* Fase1-S6: sin header propio — el host (ContextPanel "Avatar") ya
            pone título y botón de cerrar; aquí había un segundo par. */}
        <div className="avatar-panel-scroll">
          {/* ── Avatar Section ── */}
          <div className="ap-section">
            <button className="ap-section-header" onClick={() => setAvatarOpen(!avatarOpen)}>
              <span className={`ap-chevron ${avatarOpen ? 'open' : ''}`}>▸</span>
              Avatar
            </button>
            {avatarOpen && (
              <div className="ap-section-body">
                {/* GLB loader */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".obj,.fbx,.glb,.gltf,.vrm"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f);
                  }}
                />
                <div
                  className={`ap-dropzone ${dragover ? 'dragover' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragover(true); }}
                  onDragLeave={() => setDragover(false)}
                  onDrop={handleDrop}
                >
                  📁 Suelta un archivo .obj, .fbx, .glb, .gltf o .vrm
                </div>
                <div className="ap-model-info">
                  <span>{modelName ?? deLaBiblioteca?.name ?? 'Modelo propio'}</span>
                  {!deLaBiblioteca && (
                    <button
                      className="ap-btn"
                      style={{ flex: 'none', padding: '2px 8px' }}
                      onClick={() => {
                        dispatch(setAvatarModelUrl(avatarPorUrl(modeloDelProyecto)?.modelUrl ?? AVATAR_POR_DEFECTO.modelUrl));
                        setModelName(null);
                      }}
                    >
                      Restablecer
                    </button>
                  )}
                </div>

                {/* Avatar Mode */}
                <div className="ap-mode-toggle">
                  <button
                    className={avatarMode === 'model' ? 'active' : ''}
                    onClick={() => dispatch(setAvatarMode('model' as AvatarMode))}
                  >
                    Modelo
                  </button>
                  <button
                    className={avatarMode === 'dressform' ? 'active' : ''}
                    onClick={() => dispatch(setAvatarMode('dressform' as AvatarMode))}
                  >
                    Maniquí
                  </button>
                </div>

                {/* Profiles */}
                <select className="ap-select" value={activeProfileId ?? ''} onChange={handleProfileChange}>
                  <option value="">— Elegir perfil —</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <div className="ap-btn-row">
                  {nombrando === 'perfil' ? (
                    <>
                      <input
                        className="ap-name-input"
                        autoFocus
                        value={borradorNombre}
                        onChange={(e) => setBorradorNombre(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { handleSave(borradorNombre); setNombrando(null); }
                          if (e.key === 'Escape') { e.stopPropagation(); setNombrando(null); }
                        }}
                        placeholder="Nombre del perfil"
                        aria-label="Nombre del perfil"
                      />
                      <button
                        className="ap-btn"
                        onClick={() => { handleSave(borradorNombre); setNombrando(null); }}
                        disabled={!borradorNombre.trim()}
                      >Guardar</button>
                      <button className="ap-btn" onClick={() => setNombrando(null)}>Cancelar</button>
                    </>
                  ) : (
                    <>
                      <button
                        className="ap-btn"
                        onClick={() => {
                          setBorradorNombre(profiles.find((p) => p.id === activeProfileId)?.name ?? '');
                          setNombrando('perfil');
                        }}
                      >Guardar perfil</button>
                      <button className="ap-btn" onClick={handleDelete} disabled={!activeProfileId}>Eliminar</button>
                    </>
                  )}
                </div>

                {avatarMode === 'model' && deLaBiblioteca && (
                  <div className="ap-hint">El cuerpo es la talla {deLaBiblioteca.name}; tus cambios se usan en el patrón.</div>
                )}
                {/* Las siete medidas, un campo cada una (spec 2026-10-02 § 6.1). */}
                <div className="ap-medidas">
                  {MEDIDAS.map(({ key, label }) => (
                    <CampoDeMedida
                      key={key}
                      id={`ap-medida-${key}`}
                      label={label}
                      min={MIN_MEASUREMENT_CM}
                      max={MAX_MEASUREMENT_CM}
                      valor={measurements[key] as number | undefined}
                      alFijar={(v) => handleMeasurement(key, v)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Body Shape Section (native morph targets) ── */}
          {availableMorphTargets.length > 0 && (
            <div className="ap-section">
              <button className="ap-section-header" onClick={() => setBodyShapeOpen(!bodyShapeOpen)}>
                <span className={`ap-chevron ${bodyShapeOpen ? 'open' : ''}`}>▸</span>
                Forma del cuerpo
              </button>
              {bodyShapeOpen && (
                <div className="ap-section-body">
                  <div className="ap-slider-group">
                    {availableMorphTargets.map(name => {
                      const val = morphTargets[name] ?? 0;
                      return (
                        <div key={name}>
                          <div className="ap-slider-label">
                            <span>{name}</span>
                            <span>{Math.round(val * 100)}%</span>
                          </div>
                          <div className="ap-slider-control">
                            <input
                              type="range" min={0} max={1} step={0.01} value={val}
                              onChange={e => handleMorphTarget(name, Number(e.target.value))}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Pose Section ── */}
          <div className="ap-section">
            <button className="ap-section-header" onClick={() => {
              const next = !poseOpen;
              setPoseOpen(next);
              // Sync gizmos: open Pose section → show gizmos, close → hide
              if (next && !poseEditorOpen) dispatch(togglePoseEditor());
              if (!next && poseEditorOpen) dispatch(togglePoseEditor());
            }}>
              <span className={`ap-chevron ${poseOpen ? 'open' : ''}`}>▸</span>
              Pose
            </button>
            {poseOpen && (
              <div className="ap-section-body">
                {/* Presets */}
                <div className="ap-preset-row">
                  {Object.keys(PRESETS_DE_POSE).map(name => (
                    <button
                      key={name}
                      className={`ap-preset-btn ${activePreset === name ? 'active' : ''}`}
                      onClick={() => dispatch(setPreset(name))}
                    >
                      {PRESET_LABELS[name] ?? name}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="ap-btn" style={{ flex: 1 }} onClick={() => dispatch(resetPose())}>Restablecer todo</button>
                  {nombrando === 'pose' ? (
                    <>
                      <input
                        className="ap-name-input"
                        style={{ flex: 1 }}
                        autoFocus
                        value={borradorNombre}
                        onChange={(e) => setBorradorNombre(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && borradorNombre.trim()) {
                            dispatch(savePose(borradorNombre.trim())); setNombrando(null);
                          }
                          if (e.key === 'Escape') { e.stopPropagation(); setNombrando(null); }
                        }}
                        placeholder="Nombre de la pose"
                        aria-label="Nombre de la pose"
                      />
                      <button
                        className="ap-btn"
                        onClick={() => { dispatch(savePose(borradorNombre.trim())); setNombrando(null); }}
                        disabled={!borradorNombre.trim()}
                      >Guardar</button>
                    </>
                  ) : (
                    <button
                      className="ap-btn"
                      style={{ flex: 1 }}
                      onClick={() => { setBorradorNombre(''); setNombrando('pose'); }}
                    >Guardar pose</button>
                  )}
                  <button
                    className={`ik-toggle-btn ${ikEnabled ? 'active' : ''}`}
                    onClick={() => dispatch(toggleIK())}
                    title={ikEnabled ? 'Cambiar a FK (rotación directa de articulaciones)' : 'Cambiar a IK (arrastrar efectores finales)'}
                  >
                    {ikEnabled ? 'Modo IK' : 'Modo FK'}
                  </button>
                </div>

                {/* Saved custom poses */}
                {savedPoses.length > 0 && (
                  <div className="ap-saved-poses">
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Poses guardadas</div>
                    {savedPoses.map(p => (
                      <div key={p.id} className="ap-saved-pose-row">
                        <button
                          className={`ap-preset-btn ${activePreset === p.id ? 'active' : ''}`}
                          style={{ flex: 1, textAlign: 'left' }}
                          onClick={() => dispatch(setPreset(p.id))}
                        >
                          {p.name}
                        </button>
                        <button
                          className="ap-btn"
                          style={{ padding: '1px 5px', fontSize: 9, flexShrink: 0 }}
                          onClick={() => dispatch(overwriteSavedPose(p.id))}
                          title="Sobrescribir con la pose actual"
                        >↻</button>
                        <button
                          className="ap-btn"
                          style={{ padding: '1px 5px', fontSize: 9, flexShrink: 0 }}
                          onClick={async () => {
                            const ok = await requestConfirmation(dispatch, {
                              title: '¿Eliminar la pose?',
                              description: `Se borra «${p.name}» de las poses guardadas.`,
                              consequences: ['La pose que el avatar tiene puesta ahora no cambia'],
                              confirmLabel: 'Eliminar la pose',
                            });
                            if (ok) dispatch(deleteSavedPose(p.id));
                          }}
                          title="Eliminar pose"
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="ap-hint">Clic en las articulaciones del 3D para posar</div>

                {/* Selected joint */}
                {selectedJoint ? (
                  <>
                    <div className="ap-joint-info">
                      Seleccionada: {selectedJoint}
                      <button
                        className="ap-btn"
                        style={{ flex: 'none', marginLeft: 8, padding: '1px 6px', fontSize: 10 }}
                        onClick={() => dispatch(selectJoint(null))}
                      >
                        ×
                      </button>
                      {canMirror && (
                        <button
                          className="ap-btn"
                          style={{ flex: 'none', marginLeft: 4, padding: '1px 6px', fontSize: 10 }}
                          onClick={() => dispatch(mirrorJoint(selectedJoint))}
                          title="Reflejar al lado opuesto"
                        >
                          ↔
                        </button>
                      )}
                    </div>

                    {/* Joint Details */}
                    <div className="ap-section" style={{ border: 'none', padding: 0 }}>
                      <button
                        className="ap-section-header"
                        style={{ padding: '4px 0' }}
                        onClick={() => setJointDetailsOpen(!jointDetailsOpen)}
                      >
                        <span className={`ap-chevron ${jointDetailsOpen ? 'open' : ''}`}>▸</span>
                        Detalles de articulación
                      </button>
                      {jointDetailsOpen && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {AXIS_KEYS.map((axis, i) => {
                            const min = constraints ? constraints[`min${AXIS_LABELS[i]}` as keyof typeof constraints] : -180;
                            const max = constraints ? constraints[`max${AXIS_LABELS[i]}` as keyof typeof constraints] : 180;
                            return (
                              <div className="ap-joint-axis" key={axis}>
                                <label>{AXIS_LABELS[i]}</label>
                                <input
                                  type="range"
                                  min={min} max={max}
                                  value={jointRotation[axis]}
                                  onChange={e => handleJointChange(axis, Number(e.target.value))}
                                  style={{ flex: 1, height: 4, appearance: 'none', background: 'var(--border)', borderRadius: 2 }}
                                />
                                <span>{jointRotation[axis]}°</span>
                              </div>
                            );
                          })}
                          <button
                            className="ap-btn"
                            style={{ alignSelf: 'flex-start', padding: '2px 8px', fontSize: 10 }}
                            onClick={() => dispatch(setJointRotation({ joint: selectedJoint, rotation: { x: 0, y: 0, z: 0 } }))}
                          >
                            Restablecer articulación
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="ap-hint">Ninguna articulación seleccionada</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
