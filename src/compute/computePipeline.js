import { createBuffer } from '../gpu/buffers.js';

// Must match MATTER_SOLID/LIQUID/GAS in simulate.wgsl.
const MATTER_STATE_IDS = { solid: 0, liquid: 1, gas: 2 };

// Real-world viscosity spans ~1e-4 to 1e5 Pa*s across the material
// dataset - a linear 0-1 normalization would put almost everything at
// either extreme. Log-scale against water (the most common reference
// liquid) instead: water itself always maps to exactly 1.0 (spreads
// every attempt, unchanged from the original always-spread behavior),
// down to 0.0 at MAX_VISCOSITY_RATIO orders of magnitude more viscous
// (tar, at ~1e8x water's viscosity, lands almost exactly at the floor).
const WATER_VISCOSITY = 0.001;
const MAX_VISCOSITY_RATIO_LOG10 = 8;

function viscosityToSpreadChance(viscosity) {
  const ratio = Math.max(viscosity, 1e-9) / WATER_VISCOSITY;
  const normalized = Math.log10(ratio) / MAX_VISCOSITY_RATIO_LOG10;
  return 1 - Math.max(0, Math.min(1, normalized));
}

export async function createComputePipeline(device, { positionBuffer, velocityBuffer, remainderBuffer, materialBuffer, gridBuffer, maxParticles, cellSize, cols, rows, gravity, materials }) {
  const shaderCode = await fetch('/src/shaders/simulate.wgsl').then((res) => res.text());
  const shaderModule = device.createShaderModule({ code: shaderCode });

  const uniformData = new Float32Array([0, gravity, cellSize, rows, cols, 0, 0, 0]);
  const uniformBuffer = createBuffer(device, {
    data: uniformData,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: 'sim-uniforms',
  });

  const velocityDeltaData = new Int32Array(maxParticles);
  const velocityDeltaBuffer = createBuffer(device, {
    data: velocityDeltaData,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'Velocity Delta Y',
  });

  // Per-material-TYPE properties tables (NOT per-particle - that's
  // materialBuffer/binding 6). One entry per MATERIALS[] entry, indexed
  // by the same materialId used everywhere else. Built once from config
  // and never written again - materials aren't edited live, only which
  // material a new particle gets is chosen at spawn time. Behavior that
  // used to be hardcoded to specific material IDs (Stone is immovable,
  // Water spreads sideways) is now driven by these tables instead, so
  // ANY material marked immovable/liquid in config gets the matching
  // behavior - essential once many materials exist, not just the
  // original three.
  const materialFrictionBuffer = createBuffer(device, {
    data: Float32Array.from(materials, (m) => m.friction),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'Material Friction Table',
  });
  const materialImmovableBuffer = createBuffer(device, {
    data: Uint32Array.from(materials, (m) => (m.immovable ? 1 : 0)),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'Material Immovable Table',
  });
  const materialMatterStateBuffer = createBuffer(device, {
    data: Uint32Array.from(materials, (m) => MATTER_STATE_IDS[m.matterState] ?? MATTER_STATE_IDS.solid),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'Material Matter State Table',
  });
  const materialSpreadChanceBuffer = createBuffer(device, {
    data: Float32Array.from(materials, (m) => viscosityToSpreadChance(m.viscosity)),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'Material Spread Chance Table',
  });
  const materialDensityBuffer = createBuffer(device, {
    data: Float32Array.from(materials, (m) => m.density),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'Material Density Table',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 9, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 10, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 11, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    ],
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: positionBuffer } },
      { binding: 2, resource: { buffer: velocityBuffer } },
      { binding: 3, resource: { buffer: remainderBuffer } },
      { binding: 4, resource: { buffer: gridBuffer } },
      { binding: 5, resource: { buffer: velocityDeltaBuffer } },
      { binding: 6, resource: { buffer: materialBuffer } },
      { binding: 7, resource: { buffer: materialFrictionBuffer } },
      { binding: 8, resource: { buffer: materialImmovableBuffer } },
      { binding: 9, resource: { buffer: materialMatterStateBuffer } },
      { binding: 10, resource: { buffer: materialSpreadChanceBuffer } },
      { binding: 11, resource: { buffer: materialDensityBuffer } },
    ],
  });

  const pipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    compute: {
      module: shaderModule,
      entryPoint: 'cs_main',
    },
  });

  let frameCount = 0;

  function dispatch(encoder, dt, activeCount) {
    uniformData[0] = dt;
    uniformData[5] = frameCount;
    uniformData[6] = activeCount;
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);
    frameCount = (frameCount + 1) % 1000000;

    const workgroupCount = Math.ceil(activeCount / 64);
    if (workgroupCount === 0) {
      return;
    }

    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(workgroupCount);
    pass.end();
  }

  function reset() {
    device.queue.writeBuffer(velocityDeltaBuffer, 0, velocityDeltaData);
  }

  return { dispatch, reset };
}
