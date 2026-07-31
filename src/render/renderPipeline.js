import { createBuffer } from '../gpu/buffers.js';

export async function createRenderPipeline(device, format, { positionBuffer, colorBuffer, particleSize, width, height }) {
  const shaderCode = await fetch('/src/shaders/render.wgsl').then((res) => res.text());
  const shaderModule = device.createShaderModule({ code: shaderCode });

  const uniformData = new Float32Array([width, height, particleSize, 0]);
  const uniformBuffer = createBuffer(device, {
    data: uniformData,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: 'render-uniforms',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
    ],
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: positionBuffer } },
      { binding: 2, resource: { buffer: colorBuffer } },
    ],
  });

  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex: {
      module: shaderModule,
      entryPoint: 'vs_main',
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [{ format }],
    },
    primitive: {
      topology: 'triangle-strip',
    },
  });

  function draw(pass, activeCount) {
    if (activeCount === 0) {
      return;
    }
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(4, activeCount);
  }

  function updateResolution(newWidth, newHeight) {
    uniformData[0] = newWidth;
    uniformData[1] = newHeight;
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);
  }

  return { draw, updateResolution };
}
