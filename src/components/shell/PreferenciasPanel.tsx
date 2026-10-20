import InputSchemeSection from './InputSchemeSection';
import AgentSettings from '../../copilot/AgentSettings';

/**
 * Preferencias (spec 2026-10-02 «la interfaz en papel» § 6.1): el esquema del
 * ratón y los ajustes de la IA, que eran el «modo ajustes» de la barra. Un
 * panel del marco, con puerta en Vina › Preferencias › «IA y ratón...» y en la
 * paleta.
 */
export default function PreferenciasPanel({ alCerrar }: { alCerrar: () => void }) {
  return (
    <>
      <InputSchemeSection />
      <AgentSettings
        enPanel
        onClose={alCerrar}
        onSave={() => {
          // `ConnectionsList` avisa de cada cambio de conexión por su cuenta;
          // esto es para las preferencias (enseñanza, idioma) al guardar.
          window.dispatchEvent(new CustomEvent('vina:provider-config-changed'));
        }}
      />
    </>
  );
}
