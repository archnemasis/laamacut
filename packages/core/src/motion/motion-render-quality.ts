// Render settings for 3D motion layers. Kept apart from motion-three-renderer
// so importing them does not load Three.js.

export type MotionToneMapping =
  | "agx"
  | "aces"
  | "filmic"
  | "neutral"
  | "linear"
  | "none";

export interface MotionRenderQuality {
  readonly shadows: boolean;
  readonly shadowMapSize: number;
  readonly environment: boolean;
  /** Cinematic post-processing (bloom + optional AO/DOF). Off for fast preview. */
  readonly postProcessing?: boolean;
  /** UnrealBloom strength when postProcessing is on. */
  readonly bloomStrength?: number;
  /** Screen-space ambient occlusion (GTAO) — grounds objects with contact shadows. */
  readonly ambientOcclusion?: boolean;
  /** Cinematic depth-of-field (Bokeh): focal plane on the camera target. */
  readonly depthOfField?: boolean;
  /** DOF aperture (blur strength) when depthOfField is on. */
  readonly dofAperture?: number;
  /** MSAA samples for the post-processing pipeline (0 disables; 4 is a good default). */
  readonly antialiasSamples?: number;
  /** View transform / tonemap applied on present. Defaults to AgX (the Blender look). */
  readonly toneMapping?: MotionToneMapping;
  /** Tonemap exposure multiplier. */
  readonly exposure?: number;
  /** Soft area (softbox) key light for product-grade speculars. */
  readonly softLighting?: boolean;
  /** Image-based-lighting intensity (reflections + ambient fill). */
  readonly environmentIntensity?: number;
}

export const DEFAULT_ENVIRONMENT_INTENSITY = 0.85;

export const DEFAULT_MOTION_RENDER_QUALITY: MotionRenderQuality = {
  shadows: true,
  shadowMapSize: 2048,
  environment: true,
  postProcessing: true,
  bloomStrength: 0.34,
  ambientOcclusion: true,
  depthOfField: true,
  dofAperture: 0.0016,
  antialiasSamples: 4,
  toneMapping: "agx",
  exposure: 1,
  softLighting: true,
  environmentIntensity: DEFAULT_ENVIRONMENT_INTENSITY,
};

export function mergeMotionRenderQuality(
  partial?: Partial<MotionRenderQuality>,
): MotionRenderQuality {
  return { ...DEFAULT_MOTION_RENDER_QUALITY, ...(partial ?? {}) };
}
