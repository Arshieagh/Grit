import { initWebGPU } from './gpu/device.js';
import { createParticleSystem } from './particles/particleSystem.js';
import { createRenderPipeline } from './render/renderPipeline.js';
import { createComputePipeline } from './compute/computePipeline.js';
import { createSpawnInput } from './input/spawner.js';
import { createDebugPanel } from './ui/debugPanel.js';
import { createControls } from './ui/controls.js';
import {
  MAX_PARTICLES, INITIAL_PARTICLE_COUNT, PARTICLE_SIZE, GRAVITY, MAX_DT,
  MATERIALS, MIN_BRUSH_RADIUS, MAX_BRUSH_RADIUS, DEFAULT_BRUSH_RADIUS, DEBUG_UPDATE_INTERVAL_MS,
  OCCUPANCY_SYNC_INTERVAL_MS,
} from './sim/config.js';

let lastTime = performance.now();
let smoothedFps = 0;
let lastDebugUpdate = 0;
let previousSpawnResult = 'none';
let lastOccupancySync = 0;

async function main() {
  const canvas = document.getElementById('canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const { device, context, format, adapter } = await initWebGPU(canvas);

  const debugPanel = createDebugPanel();

  device.addEventListener('uncapturederror', (event) => {
    debugPanel.logToConsole(`GPU error: ${event.error.message}`);
  });
  device.lost.then((info) => {
    debugPanel.logToConsole(`Device lost: ${info.message}`);
  });

  const particleSystem = createParticleSystem(device, {
    maxParticles: MAX_PARTICLES,
    initialCount: INITIAL_PARTICLE_COUNT,
    width: canvas.width,
    height: canvas.height,
    cellSize: PARTICLE_SIZE,
  });
  const { positionBuffer, colorBuffer, velocityBuffer, remainderBuffer, materialBuffer, gridBuffer, cols, rows, spawnBrush } = particleSystem;

  const renderPipeline = await createRenderPipeline(device, format, {
    positionBuffer,
    colorBuffer,
    particleSize: PARTICLE_SIZE,
    width: canvas.width,
    height: canvas.height,
  });

  const computePipeline = await createComputePipeline(device, {
    positionBuffer,
    velocityBuffer,
    remainderBuffer,
    materialBuffer,
    gridBuffer,
    maxParticles: MAX_PARTICLES,
    cellSize: PARTICLE_SIZE,
    cols,
    rows,
    gravity: GRAVITY,
  });

  const controls = createControls({
    materials: MATERIALS,
    defaultBrushRadius: DEFAULT_BRUSH_RADIUS,
    minBrushRadius: MIN_BRUSH_RADIUS,
    maxBrushRadius: MAX_BRUSH_RADIUS,
    onReset: () => {
      particleSystem.reset();
      computePipeline.reset();
    },
    log: debugPanel.logToConsole,
  });

  const spawnInput = createSpawnInput(canvas, { spawnBrush }, {
    cellSize: PARTICLE_SIZE,
    getBrushRadius: controls.getBrushRadius,
    getBrushColor: controls.getBrushColor,
    getBrushMaterialId: controls.getBrushMaterialId,
  });

  // Keeps the canvas's internal pixel buffer matching its CSS size on
  // resize, so cells stay square instead of the browser stretching a
  // fixed-resolution buffer non-uniformly. Deliberately does NOT resize
  // the simulation grid itself (cols/rows/occupancy buffer stay fixed at
  // their original dimensions) - growing/shrinking the grid would mean
  // recreating buffers and remapping existing particles' cell indices,
  // a bigger design decision left for later. Net effect: the sim's
  // playable area stays anchored at its original size and position;
  // resizing the window larger just reveals blank canvas beyond it.
  let resizeTimeout = null;
  window.addEventListener('resize', () => {
    // Debounced - a dragged window edge can fire many resize events per
    // second, and there's no need to touch the GPU resolution uniform
    // on every single one.
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      renderPipeline.updateResolution(canvas.width, canvas.height);
    }, 150);
  });

  const adapterInfo = adapter?.info
    ? `${adapter.info.vendor || 'unknown'} ${adapter.info.description || ''}`.trim()
    : 'unavailable';

  lastTime = performance.now();
  requestAnimationFrame((now) => frame(now, context, device, computePipeline, renderPipeline, particleSystem, debugPanel, controls, spawnInput, cols, rows, adapterInfo));
}

main().catch(err => {
  console.error(err);
  const errorEl = document.getElementById('fatal-error');
  errorEl.textContent = `Something went wrong starting Grit: ${err.message}`;
  errorEl.classList.add('visible');
});

function frame(now, ctx, device, computePipeline, renderPipeline, particleSystem, debugPanel, controls, spawnInput, cols, rows, adapterInfo) {
  const rawDt = (now - lastTime) / 1000;
  lastTime = now;
  const dt = Math.min(rawDt, MAX_DT);

  const instantFps = rawDt > 0 ? 1 / rawDt : 0;
  smoothedFps = smoothedFps === 0 ? instantFps : smoothedFps * 0.9 + instantFps * 0.1;

  const activeCount = particleSystem.getActiveCount();

  const view = ctx.getCurrentTexture().createView();
  const encoder = device.createCommandEncoder();

  computePipeline.dispatch(encoder, dt, activeCount);

  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: view,
      loadOp: 'clear',
      clearValue: { r: 0.05, g: 0.05, b: 0.08, a: 1.0 },
      storeOp: 'store',
    }],
  });
  renderPipeline.draw(pass, activeCount);
  pass.end();

  device.queue.submit([encoder.finish()]);

  if (now - lastOccupancySync > OCCUPANCY_SYNC_INTERVAL_MS) {
    lastOccupancySync = now;
    particleSystem.syncOccupancyShadow().catch((err) => {
      debugPanel.logToConsole(`Occupancy sync failed: ${err.message}`);
    });
  }

  const lastSpawnResult = spawnInput.getLastResult();
  if (lastSpawnResult === 'capacity' && previousSpawnResult !== 'capacity') {
    debugPanel.logToConsole('Spawn capacity reached');
  }
  previousSpawnResult = lastSpawnResult;

  if (now - lastDebugUpdate > DEBUG_UPDATE_INTERVAL_MS) {
    lastDebugUpdate = now;
    const materialCounts = particleSystem.getMaterialCounts();
    const materialBreakdown = MATERIALS
      .map((material, id) => `${material.name} ${materialCounts[id] || 0}`)
      .join(', ');
    debugPanel.updateStats({
      fps: smoothedFps,
      activeCount,
      maxParticles: MAX_PARTICLES,
      cols,
      rows,
      brushRadius: controls.getBrushRadius(),
      materialName: controls.getSelectedMaterialName(),
      adapterInfo,
      lastSpawnResult,
      materialBreakdown,
    });
  }

  requestAnimationFrame((n) => frame(n, ctx, device, computePipeline, renderPipeline, particleSystem, debugPanel, controls, spawnInput, cols, rows, adapterInfo));
}
