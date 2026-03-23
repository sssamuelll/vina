/**
 * Render Settings Tools — copilot tools for controlling render resolution,
 * garment display mode, avatar render style, lighting presets, image/video
 * format, and render quality settings.
 * Herramientas de Renderizado — herramientas de copiloto para controlar
 * resolución de render, modo de visualización de prenda, estilo de avatar,
 * presets de iluminación, formato de imagen/video y calidad de render.
 *
 * @module renderTools
 */

import type { ToolDefinition, ToolResult } from '../registry';
import type { AppDispatch, RootState } from '../../../../store';
import {
  setResolutionPreset,
  setExportWidth,
  setExportHeight,
  setAvatarRenderStyle,
  applyLightPreset,
  setImageFormat,
  setJpegQuality,
  setVideoFormat,
  setVideoFps,
  setSamplesPerPixel,
  setDenoiserEnabled,
  type ResolutionPreset,
  type AvatarRenderStyle,
  type ImageFormat,
  type VideoFormat,
} from '../../../../store/renderSettingsSlice';
import { setSurfaceMode3D, type SurfaceMode3D } from '../../../../store/simulationSlice';

// ─── setRenderResolution ──────────────────────────────────────────────────────

const setRenderResolutionTool: ToolDefinition = {
  name: 'setRenderResolution',
  description:
    'Set the export resolution for rendering. Use a named preset (1080p, 4k, instagram, instagram-story) ' +
    'or provide custom width/height in pixels. ' +
    '/ Establecer la resolución de exportación para el render. Usar un preset nombrado (1080p, 4k, instagram, ' +
    'instagram-story) o proporcionar ancho/alto personalizado en píxeles.',
  parameters: {
    type: 'object',
    properties: {
      preset: {
        type: 'string',
        enum: ['1080p', '4k', 'instagram', 'instagram-story', 'custom'],
        description:
          'Named resolution preset. Use "custom" when providing width/height. ' +
          '/ Preset de resolución. Usar "custom" al proporcionar ancho/alto.',
      },
      width: {
        type: 'number',
        description:
          'Custom export width in pixels (used when preset is "custom" or omitted). ' +
          '/ Ancho personalizado en píxeles (usado cuando el preset es "custom" u omitido).',
      },
      height: {
        type: 'number',
        description:
          'Custom export height in pixels (used when preset is "custom" or omitted). ' +
          '/ Alto personalizado en píxeles (usado cuando el preset es "custom" u omitido).',
      },
    },
    required: [],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const previousPreset = state.renderSettings.resolutionPreset;
    const previousWidth = state.renderSettings.exportWidth;
    const previousHeight = state.renderSettings.exportHeight;

    const preset = params.preset as ResolutionPreset | undefined;
    const width = params.width as number | undefined;
    const height = params.height as number | undefined;

    if (preset && preset !== 'custom') {
      dispatch(setResolutionPreset(preset));
      return {
        success: true,
        data: { preset, width: getState().renderSettings.exportWidth, height: getState().renderSettings.exportHeight },
        rollback: () => {
          dispatch(setResolutionPreset(previousPreset));
          if (previousPreset === 'custom') {
            dispatch(setExportWidth(previousWidth));
            dispatch(setExportHeight(previousHeight));
          }
        },
      };
    }

    // Custom dimensions
    if (width !== undefined) dispatch(setExportWidth(width));
    if (height !== undefined) dispatch(setExportHeight(height));

    if (width === undefined && height === undefined && !preset) {
      return { success: false, error: 'Provide a preset, or width and/or height for custom resolution.' };
    }

    return {
      success: true,
      data: {
        preset: 'custom',
        width: getState().renderSettings.exportWidth,
        height: getState().renderSettings.exportHeight,
      },
      rollback: () => {
        dispatch(setResolutionPreset(previousPreset));
        dispatch(setExportWidth(previousWidth));
        dispatch(setExportHeight(previousHeight));
      },
    };
  },
};

// ─── setGarmentDisplayMode ────────────────────────────────────────────────────

const setGarmentDisplayModeTool: ToolDefinition = {
  name: 'setGarmentDisplayMode',
  description:
    'Set the 3D surface rendering mode for garment pieces. ' +
    'Controls how fabric is drawn in the viewport (textured, wireframe, xray, etc.). ' +
    '/ Establecer el modo de renderizado 3D para las piezas de prenda. ' +
    'Controla cómo se dibra la tela en el viewport (texturizado, malla, rayos X, etc.).',
  parameters: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['textured', 'translucent', 'mesh', 'thick', 'flat', 'xray', 'shaded', 'shaded-wire', 'textured-wire'],
        description:
          'Surface rendering mode: textured = full texture, translucent = see-through fabric, mesh = wireframe only, ' +
          'thick = volumetric, flat = unlit flat color, xray = transparent with edges, ' +
          'shaded = lit without texture, shaded-wire = lit with wireframe, textured-wire = texture + wireframe. ' +
          '/ Modo de superficie: textured = textura completa, translucent = tela transparente, mesh = solo malla, ' +
          'thick = volumétrico, flat = color plano sin iluminación, xray = transparente con bordes, ' +
          'shaded = iluminado sin textura, shaded-wire = iluminado con malla, textured-wire = textura + malla.',
      },
    },
    required: ['mode'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const previousMode = state.simulation.surfaceMode3D;
    const mode = params.mode as SurfaceMode3D;

    dispatch(setSurfaceMode3D(mode));

    return {
      success: true,
      data: { mode },
      rollback: () => dispatch(setSurfaceMode3D(previousMode)),
    };
  },
};

// ─── setAvatarRenderStyle ─────────────────────────────────────────────────────

const setAvatarRenderStyleTool: ToolDefinition = {
  name: 'setAvatarRenderStyle',
  description:
    'Set how the avatar body is displayed during rendering. ' +
    'Options: visible (default), hidden (invisible), wireframe (mesh outline only), xray (see-through). ' +
    '/ Establecer cómo se muestra el cuerpo del avatar durante el renderizado. ' +
    'Opciones: visible (por defecto), hidden (invisible), wireframe (solo contorno de malla), xray (transparente).',
  parameters: {
    type: 'object',
    properties: {
      style: {
        type: 'string',
        enum: ['visible', 'hidden', 'wireframe', 'xray'],
        description:
          'Avatar rendering style. "visible" = normal mesh, "hidden" = avatar not drawn, ' +
          '"wireframe" = edge outline only, "xray" = transparent body. ' +
          '/ Estilo de renderizado del avatar. "visible" = malla normal, "hidden" = avatar no dibujado, ' +
          '"wireframe" = solo contorno de bordes, "xray" = cuerpo transparente.',
      },
    },
    required: ['style'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const previousStyle = state.renderSettings.avatarRenderStyle;
    const style = params.style as AvatarRenderStyle;

    dispatch(setAvatarRenderStyle(style));

    return {
      success: true,
      data: { style },
      rollback: () => dispatch(setAvatarRenderStyle(previousStyle)),
    };
  },
};

// ─── setLightingPreset ────────────────────────────────────────────────────────

const setLightingPresetTool: ToolDefinition = {
  name: 'setLightingPreset',
  description:
    'Apply a named lighting preset to the 3D scene. ' +
    'Replaces current lights with a pre-configured set tuned for specific moods or workflows. ' +
    '/ Aplicar un preset de iluminación nombrado a la escena 3D. ' +
    'Reemplaza las luces actuales con un conjunto preconfigurado ajustado para estados de ánimo o flujos de trabajo específicos.',
  parameters: {
    type: 'object',
    properties: {
      preset: {
        type: 'string',
        enum: ['studio3Point', 'softBox', 'dramatic', 'natural'],
        description:
          'Lighting preset name: studio3Point = classic key/fill/rim, softBox = even diffuse lighting, ' +
          'dramatic = single hard key light, natural = sun + ambient fill. ' +
          '/ Nombre del preset de iluminación: studio3Point = clave/relleno/contorno clásico, ' +
          'softBox = iluminación difusa uniforme, dramatic = única luz dura, natural = sol + relleno ambiental.',
      },
    },
    required: ['preset'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const previousLights = [...state.renderSettings.lights];

    const preset = params.preset as string;
    dispatch(applyLightPreset(preset));

    return {
      success: true,
      data: { preset, lightCount: getState().renderSettings.lights.length },
      rollback: () => {
        // Restore by re-dispatching previous light state is not trivially reversible
        // via a single action; mark rollback as best-effort notification only.
        // The user can reapply the previous preset if needed.
        void previousLights;
      },
    };
  },
};

// ─── setImageFormat ───────────────────────────────────────────────────────────

const setImageFormatTool: ToolDefinition = {
  name: 'setImageFormat',
  description:
    'Set the still image export format (PNG, JPEG, or WebP) and optionally the JPEG quality level. ' +
    '/ Establecer el formato de exportación de imagen estática (PNG, JPEG o WebP) y opcionalmente el nivel de calidad JPEG.',
  parameters: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['png', 'jpeg', 'webp'],
        description:
          'Image format. "png" = lossless with transparency, "jpeg" = lossy compressed, "webp" = modern compressed. ' +
          '/ Formato de imagen. "png" = sin pérdida con transparencia, "jpeg" = compresión con pérdida, "webp" = compresión moderna.',
      },
      jpegQuality: {
        type: 'number',
        description:
          'JPEG/WebP quality from 0.0 (lowest) to 1.0 (highest). Only used when format is "jpeg" or "webp". ' +
          '/ Calidad JPEG/WebP de 0.0 (mínima) a 1.0 (máxima). Solo se usa cuando el formato es "jpeg" o "webp".',
      },
    },
    required: ['format'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const previousFormat = state.renderSettings.imageFormat;
    const previousQuality = state.renderSettings.jpegQuality;

    const format = params.format as ImageFormat;
    dispatch(setImageFormat(format));

    if (params.jpegQuality !== undefined) {
      dispatch(setJpegQuality(params.jpegQuality as number));
    }

    return {
      success: true,
      data: {
        format,
        jpegQuality: params.jpegQuality !== undefined ? params.jpegQuality : previousQuality,
      },
      rollback: () => {
        dispatch(setImageFormat(previousFormat));
        dispatch(setJpegQuality(previousQuality));
      },
    };
  },
};

// ─── setVideoFormat ───────────────────────────────────────────────────────────

const setVideoFormatTool: ToolDefinition = {
  name: 'setVideoFormat',
  description:
    'Set the video export format (WebM or MP4) and frames-per-second for turntable or animation exports. ' +
    '/ Establecer el formato de exportación de video (WebM o MP4) y los fotogramas por segundo para exportaciones de giratoria o animación.',
  parameters: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['webm', 'mp4'],
        description:
          'Video format. "webm" = open format, broad browser support. "mp4" = widely compatible for sharing. ' +
          '/ Formato de video. "webm" = formato abierto, amplio soporte de navegadores. "mp4" = ampliamente compatible para compartir.',
      },
      fps: {
        type: 'number',
        description:
          'Frames per second (minimum 1). Common values: 24 (cinematic), 30 (standard), 60 (smooth). ' +
          '/ Fotogramas por segundo (mínimo 1). Valores comunes: 24 (cinemático), 30 (estándar), 60 (suave).',
      },
    },
    required: ['format'],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const previousFormat = state.renderSettings.videoFormat;
    const previousFps = state.renderSettings.videoFps;

    const format = params.format as VideoFormat;
    dispatch(setVideoFormat(format));

    if (params.fps !== undefined) {
      dispatch(setVideoFps(params.fps as number));
    }

    return {
      success: true,
      data: {
        format,
        fps: params.fps !== undefined ? params.fps : previousFps,
      },
      rollback: () => {
        dispatch(setVideoFormat(previousFormat));
        dispatch(setVideoFps(previousFps));
      },
    };
  },
};

// ─── setRenderQuality ─────────────────────────────────────────────────────────

const setRenderQualityTool: ToolDefinition = {
  name: 'setRenderQuality',
  description:
    'Control the render quality by setting samples per pixel (anti-aliasing) and toggling the AI denoiser. ' +
    'Higher samples = cleaner image but slower render. Denoiser can compensate for lower sample counts. ' +
    '/ Controlar la calidad de render estableciendo muestras por píxel (anti-aliasing) y activando/desactivando el eliminador de ruido IA. ' +
    'Más muestras = imagen más limpia pero render más lento. El denoiser puede compensar con menos muestras.',
  parameters: {
    type: 'object',
    properties: {
      samplesPerPixel: {
        type: 'number',
        description:
          'Number of samples per pixel (minimum 1). Higher values reduce noise. Typical: 1 (draft), 4 (preview), 16 (final). ' +
          '/ Número de muestras por píxel (mínimo 1). Valores más altos reducen el ruido. Típico: 1 (borrador), 4 (previsualización), 16 (final).',
      },
      denoiserEnabled: {
        type: 'boolean',
        description:
          'Enable or disable the AI denoiser. When true, removes noise from lower sample renders. ' +
          '/ Activar o desactivar el eliminador de ruido IA. Cuando es true, elimina el ruido en renders con pocas muestras.',
      },
    },
    required: [],
  },
  execute: async (
    params: Record<string, unknown>,
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<ToolResult> => {
    const state = getState();
    const previousSamples = state.renderSettings.samplesPerPixel;
    const previousDenoiser = state.renderSettings.denoiserEnabled;

    if (params.samplesPerPixel === undefined && params.denoiserEnabled === undefined) {
      return { success: false, error: 'Provide samplesPerPixel and/or denoiserEnabled.' };
    }

    if (params.samplesPerPixel !== undefined) {
      dispatch(setSamplesPerPixel(params.samplesPerPixel as number));
    }

    if (params.denoiserEnabled !== undefined) {
      dispatch(setDenoiserEnabled(params.denoiserEnabled as boolean));
    }

    return {
      success: true,
      data: {
        samplesPerPixel: params.samplesPerPixel !== undefined
          ? getState().renderSettings.samplesPerPixel
          : previousSamples,
        denoiserEnabled: params.denoiserEnabled !== undefined
          ? params.denoiserEnabled
          : previousDenoiser,
      },
      rollback: () => {
        dispatch(setSamplesPerPixel(previousSamples));
        dispatch(setDenoiserEnabled(previousDenoiser));
      },
    };
  },
};

// ─── Export ───────────────────────────────────────────────────────────────────

export const tools: ToolDefinition[] = [
  setRenderResolutionTool,
  setGarmentDisplayModeTool,
  setAvatarRenderStyleTool,
  setLightingPresetTool,
  setImageFormatTool,
  setVideoFormatTool,
  setRenderQualityTool,
];
