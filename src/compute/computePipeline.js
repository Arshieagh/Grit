import { createBuffer } from '../gpu/buffers.js';

export async function createComputePipeline(device, { positionBuffer, velocityBuffer, remainderBuffer, gridBuffer, particleCount, cellSize, cols, rows, gravity }) {
  const shaderCode = await fetch('/src/shaders/simulate.wgsl').then((res) => res.text());
  const shaderModule = device.createShaderModule({ code: shaderCode });

  const uniformData = new Float32Array([0, gravity, cellSize, rows, cols, 0, 0, 0]);
  const uniformBuffer = createBuffer(device, {
    data: uniformData,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: 'sim-uniforms',
  });

  const velocityDeltaData = new Int32Array(particleCount);
  const velocityDeltaBuffer = createBuffer(device, {
    data: velocityDeltaData,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'Velocity Delta Y',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
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
    ],
  });

  const pipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    compute: {
      module: shaderModule,
      entryPoint: 'cs_main',
    },
  });

  const workgroupCount = Math.ceil(particleCount / 64);

  let frameCount = 0;

  function dispatch(encoder, dt) {
    uniformData[0] = dt;
    uniformData[5] = frameCount;
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);
    frameCount = (frameCount + 1) % 1000000;

    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(workgroupCount);
    pass.end();
  }

  return { dispatch };
}
