import { createBuffer } from '../gpu/buffers.js';

export async function createComputePipeline(device, { positionBuffer, velocityBuffer, remainderBuffer, particleCount, cellSize, rows, gravity }) {
  const shaderCode = await fetch('/src/shaders/simulate.wgsl').then((res) => res.text());
  const shaderModule = device.createShaderModule({ code: shaderCode });

  const uniformData = new Float32Array([0, gravity, cellSize, rows]);
  const uniformBuffer = createBuffer(device, {
    data: uniformData,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: 'sim-uniforms',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: positionBuffer } },
      { binding: 2, resource: { buffer: velocityBuffer } },
      { binding: 3, resource: { buffer: remainderBuffer } },
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

  function dispatch(encoder, dt) {
    uniformData[0] = dt;
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(workgroupCount);
    pass.end();
  }

  return { dispatch };
}
