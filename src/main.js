import { initWebGPU } from './gpu/device.js';
import { createParticleSystem } from './particles/particleSystem.js';
import { createRenderPipeline } from './render/renderPipeline.js';
import { PARTICLE_COUNT, PARTICLE_SIZE } from './sim/config.js';

async function main() {
  const canvas = document.getElementById('canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const { device, context, format } = await initWebGPU(canvas);

  const { positionBuffer, colorBuffer, count } = createParticleSystem(device, {
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

  requestAnimationFrame(() => frame(context, device, renderPipeline));
}

main().catch(err => {
  console.error(err);
});

function frame(ctx, device, renderPipeline) {
  const view = ctx.getCurrentTexture().createView();
  const encoder = device.createCommandEncoder();

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
  requestAnimationFrame(() => frame(ctx, device, renderPipeline));
}
