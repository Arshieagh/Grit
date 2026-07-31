export async function initWebGPU(canvas) {
  if (!navigator.gpu) {
    throw new Error("WebGPU is not supported in this browser.");
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error("Failed to get GPU adapter.");
  }
  
  // requestDevice() with no arguments only grants WebGPU's guaranteed
  // *default* limits, not whatever the hardware actually supports - and
  // the default maxStorageBuffersPerShaderStage is 8. The compute shader
  // binds 11 storage buffers (particle data + per-material property
  // tables), so we have to explicitly opt into the adapter's real limit
  // or pipeline creation fails validation.
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBuffersPerShaderStage: adapter.limits.maxStorageBuffersPerShaderStage,
    },
  });
  device.lost.then((info) => {
    console.error("WebGPU device lost:", info);
  });
  device.addEventListener('uncapturederror', (event) => {
    console.error("WebGPU uncaptured error:", event.error);
  });
  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device: device,
    format: format,
  });

  return { device, context, format, adapter };
}