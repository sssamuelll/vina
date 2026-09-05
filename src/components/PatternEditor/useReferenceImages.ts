import { useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { addReferenceImage, removeReferenceImage, updateReferenceImage } from '../../store/projectSlice';
import { showErrorToast } from '../../store/copilotUISlice';
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

  /**
   * Importar, y DECIRLO cuando no se pudo.
   *
   * Aquí había un `catch` vacío en el componente con el comentario «import
   * errors are handled by the parent» — y el padre no tenía try/catch ni
   * despachaba nada. Mientras el panel era inalcanzable eso era código muerto;
   * emplazarlo lo convierte en el PRIMER modo de fallo que María va a ver, y
   * los cuatro caminos que caen aquí son reales: MIME no aceptado (el diálogo
   * del sistema deja elegir «Todos los archivos»), archivo de más de 20 MB (un
   * TIFF escaneado de patronaje pasa de eso sin esfuerzo), archivo corrupto que
   * el navegador no decodifica, e IndexedDB rechazando. En los cuatro se
   * cerraba el selector y no pasaba nada.
   *
   * Es la misma deriva dormida que se atacó en el CSS de este panel, por el
   * otro lado. Variante F de D2 (`showErrorToast`), como el panel gemelo
   * `CollisionBodyMesh.tsx:56`.
   */
  const onImport = useCallback(async (file: File) => {
    const id = newId();
    try {
      const result = await importReferenceImage(file);
      // El blob va a IndexedDB ANTES de tocar el mapa: si la escritura falla,
      // no queda una URL huérfana que nadie pinta, nadie despacha y nadie
      // revoca. El orden inverso dejaba justo eso.
      await storeImageBlob(id, result.imageBlob);
      // Y la URL entra al mapa antes del dispatch: el dispatch es lo que
      // re-renderiza al lienzo, y para entonces la URL ya tiene que estar.
      objectUrlMap.set(id, result.objectUrl);
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
    } catch (e) {
      const url = objectUrlMap.get(id);
      if (url) { URL.revokeObjectURL(url); objectUrlMap.delete(id); }
      // Qué pasó, por qué y qué hacer, en ese orden. El mensaje del importador
      // ya viene en español y dice el límite y los formatos.
      dispatch(showErrorToast(
        e instanceof Error && e.message
          ? `No se pudo traer la imagen: ${e.message}`
          : 'No se pudo traer la imagen. Prueba con un PNG, JPG o WEBP de menos de 20 MB.',
      ));
    }
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
    // No se revoca la URL ni se borra del mapa, y eso es a propósito: deshacer
    // puede devolver la imagen y sin su URL volvería en blanco.
    //
    // Lo que NO es cierto —y el comentario que había aquí lo afirmaba, y viajó
    // verbatim desde `PatternEditor.tsx`— es que la limpieza «va en
    // `garbageCollect()` al abrir otro proyecto»: esa función no tiene un solo
    // llamador en producción, solo su propio test. Así que hoy cada imagen
    // borrada deja una blob URL viva toda la sesión y un blob en IndexedDB para
    // siempre. Es preexistente y no se arregla aquí, pero deja de estar escrito
    // como si estuviera resuelto.
    dispatch(removeReferenceImage(imageId));
  }, [dispatch]);

  return { objectUrlMap, onImport, onCalibrate, onToggleVisible, onToggleLocked, onOpacityChange, onRemove };
}
