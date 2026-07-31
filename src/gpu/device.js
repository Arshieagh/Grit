export async function initWebGPU(canvas) {
  if (!navigator.gpu) {
    throw new Error("WebGPU is not supported in this browser.");
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error("Failed to get GPU adapter.");
  }
  
  const device = await adapter.requestDevice();
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