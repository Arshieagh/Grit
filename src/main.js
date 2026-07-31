import { initWebGPU } from './gpu/device.js';
import { createParticleSystem } from './particles/particleSystem.js';
import { createRenderPipeline } from './render/renderPipeline.js';
import { createComputePipeline } from './compute/computePipeline.js';
import { PARTICLE_COUNT, PARTICLE_SIZE, GRAVITY, MAX_DT } from './sim/config.js';

let lastTime = performance.now();

async function main() {
  const canvas = document.getElementById('canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const { device, context, format } = await initWebGPU(canvas);

  const { positionBuffer, colorBuffer, velocityBuffer, remainderBuffer, gridBuffer, count, cols, rows } = createParticleSystem(device, {
    count: PARTICLE_COUNT,
    width: canvas.width,
    height: canvas.height,
    cellSize: PARTICLE_SIZE,
  });

  const renderPipeline = await createRenderPipeline(device, format, {
    positionBuffer,
    colorBuffer,
    particleCount: count,
    particleSize: PARTICLE_SIZE,
    width: canvas.width,
    height: canvas.height,
  });

  const computePipeline = await createComputePipeline(device, {
    positionBuffer,
    velocityBuffer,
    remainderBuffer,
    gridBuffer,
    particleCount: count,
    cellSize: PARTICLE_SIZE,
    cols,
    rows,
    gravity: GRAVITY,
  });

  lastTime = performance.now();
  requestAnimationFrame((now) => frame(now, context, device, computePipeline, renderPipeline));
}

main().catch(err => {
  console.error(err);
});

function frame(now, ctx, device, computePipeline, renderPipeline) {
  const rawDt = (now - lastTime) / 1000;
  lastTime = now;
  const dt = Math.min(rawDt, MAX_DT);

  const view = ctx.getCurrentTexture().createView();
  const encoder = device.createCommandEncoder();

  computePipeline.dispatch(encoder, dt);

  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: view,
      loadOp: 'clear',
      clearValue: { r: 0.05, g: 0.05, b: 0.08, a: 1.0 },
      storeOp: 'store',
    }],
  });
  renderPipeline.draw(pass);
  pass.end();

  device.queue.submit([encoder.finish()]);
  requestAnimationFrame((n) => frame(n, ctx, device, computePipeline, renderPipeline));
}
