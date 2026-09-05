import { useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { addReferenceImage, removeReferenceImage, updateReferenceImage } from '../../store/projectSlice';
import { startCalibration } from '../../store/editorSlice';
import { newId } from '../../utils/ids';
import { importReferenceImage } from '../../utils/import/imageImporter';
import { storeImageBlob, loadImageBlob } from '../../utils/import/referenceImageStore';

/**
 * imageId → blob URL. Vive a nivel de MÓDULO, no en un `useRef`, y esa es la
 * pieza que hay que entender antes de tocar este archivo.
 *
 * Un blob URL no es serializable, así que no puede ir a Redux. Y desde el
 * 2026-09-05 tiene DOS lectores en ramas distintas del árbol: el lienzo
 * (`ReferenceImageLayer`, dentro de `PatternEditor`) y el panel (dentro de
 * `AppShell`). Con un ref por instancia cada uno tendría su propio mapa: la
 * usuaria importaría desde el panel y el lienzo pintaría la imagen EN BLANCO
 * —sin excepción, sin error en consola, y sin que jsdom lo note, porque no hay
 * layout ni `URL.createObjectURL` de verdad—. El único sitio donde eso se ve es
 * un navegador: `tests/e2e/emplazamiento-imagenes-de-referencia.spec.ts` importa
 * un PNG real y mira el `href` del `<image>`.
 */
const objectUrlMap = new Map<string, string>();

export interface ReferenceImagesApi {
  /** Compartido por todas las instancias del hook — ver la nota de arriba. */
  objectUrlMap: Map<string, string>;
  onImport: (file: File) => Promise<void>;
  onCalibrate: (imageId: string) => void;
  onToggleVisible: (imageId: string) => void;
  onToggleLocked: (imageId: string) => void;
  onOpacityChange: (imageId: string, opacity: number) => void;
  onRemove: (imageId: string) => void;
}

/**
 * Las imágenes de referencia: el mapa de URLs, su hidratación desde IndexedDB y
 * los seis gestos del panel.
 *
 * De dónde vino: todo esto estaba dentro de `PatternEditor.tsx` (el `Map` de
 * módulo, el efecto de hidratación y los seis handlers), porque el panel se
 * montaba como último hijo de `.pattern-editor`. Ahí nunca se vio: se pintaba
 * fuera de la ventana y `overflow: hidden` se lo comía, así que la única puerta
 * del repo para meter una imagen de fondo llevaba 165 días inalcanzable. Al
 * mudar el panel a `ContextPanel` el estado tuvo que salir del componente que
 * lo alojaba, o el lienzo se quedaba sin las URLs.
 */
export function useReferenceImages(): ReferenceImagesApi {
  const dispatch = useDispatch();
  const referenceImages = useSelector((s: RootState) => s.project.referenceImages);

  // Rellena el mapa con las imágenes que vienen del autoguardado o de un
  // proyecto abierto: el blob está en IndexedDB, la URL hay que rehacerla.
  useEffect(() => {
    for (const img of referenceImages) {
      if (!objectUrlMap.has(img.id)) {
        loadImageBlob(img.id).then(blob => {
          if (blob && !objectUrlMap.has(img.id)) {
            objectUrlMap.set(img.id, URL.createObjectURL(blob));
          }
        }).catch(() => {});
      }
    }
  }, [referenceImages]);

  const onImport = useCallback(async (file: File) => {
    const result = await importReferenceImage(file);
    const id = newId();
    // La URL entra al mapa ANTES del dispatch: el dispatch es lo que re-renderiza
    // al lienzo, y para entonces la URL ya tiene que estar puesta.
    objectUrlMap.set(id, result.objectUrl);
    await storeImageBlob(id, result.imageBlob);
    dispatch(addReferenceImage({
      id,
      filename: result.filename,
      width: result.width,
      height: result.height,
      position: { x: 0, y: 0 },
      scale: 1,
      rotation: 0,
      opacity: 0.5,
      locked: false,
      visible: true,
      pixelsPerMm: null,
    }));
  }, [dispatch]);

  const onCalibrate = useCallback((imageId: string) => {
    dispatch(startCalibration({ imageId }));
  }, [dispatch]);

  const onToggleVisible = useCallback((imageId: string) => {
    const img = referenceImages.find(i => i.id === imageId);
    if (img) dispatch(updateReferenceImage({ id: imageId, visible: !img.visible }));
  }, [referenceImages, dispatch]);

  const onToggleLocked = useCallback((imageId: string) => {
    const img = referenceImages.find(i => i.id === imageId);
    if (img) dispatch(updateReferenceImage({ id: imageId, locked: !img.locked }));
  }, [referenceImages, dispatch]);

  const onOpacityChange = useCallback((imageId: string, opacity: number) => {
    dispatch(updateReferenceImage({ id: imageId, opacity }));
  }, [dispatch]);

  const onRemove = useCallback((imageId: string) => {
    // No se revoca la URL ni se borra del mapa: deshacer puede devolver la
    // imagen. La limpieza va en `garbageCollect()` al abrir otro proyecto.
    dispatch(removeReferenceImage(imageId));
  }, [dispatch]);

  return { objectUrlMap, onImport, onCalibrate, onToggleVisible, onToggleLocked, onOpacityChange, onRemove };
}
