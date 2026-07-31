export const MAX_PARTICLES = 20000;
export const INITIAL_PARTICLE_COUNT = 0;
export const PARTICLE_SIZE = 4;

export const GRAVITY = 980;
export const MAX_DT = 1 / 30;

export const MATERIALS = [
  { id: 'sand', name: 'Sand', color: [0.76, 0.70, 0.50, 1.0] },
  { id: 'stone', name: 'Stone', color: [0.50, 0.50, 0.52, 1.0] },
  { id: 'water', name: 'Water', color: [0.25, 0.45, 0.85, 1.0] },
];

export const MIN_BRUSH_RADIUS = 0;
export const MAX_BRUSH_RADIUS = 15;
export const DEFAULT_BRUSH_RADIUS = 2;

export const DEBUG_UPDATE_INTERVAL_MS = 250;
export const CONSOLE_MAX_LINES = 50;
