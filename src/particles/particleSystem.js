import { createBuffer } from '../gpu/buffers.js';

const BASE_COLOR = [0.76, 0.7, 0.5];
const JITTER = 0.15;

export function createParticleSystem(device, {count, width, height, cellSize}) {
  const cols = Math.floor(width / cellSize);
  const rows = Math.floor(height / cellSize);

  const positions = new Float32Array(count * 2);
  const colors = new Float32Array(count * 4);

  for (let i = 0; i < count; i ++) {
    const cellX = Math.floor(Math.random() * cols);
    const cellY = Math.floor(Math.random() * rows);
    positions[i * 2] = (cellX + 0.5) * cellSize;
    positions[i * 2 + 1] = (cellY + 0.5) * cellSize;

    colors[i * 4] = BASE_COLOR[0] + (Math.random() - 0.5) * JITTER;
    colors[i * 4 + 1] = BASE_COLOR[1] + (Math.random() - 0.5) * JITTER;
    colors[i * 4 + 2] = BASE_COLOR[2] + (Math.random() - 0.5) * JITTER;
    colors[i * 4 + 3] = 1.0;
  }

  const positionBuffer = createBuffer(device, {
    data: positions,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'Particle Positions',
  });
  const colorBuffer = createBuffer(device, {
    data: colors,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'Particle Colors',
  });
  return { positionBuffer, colorBuffer, count };
}