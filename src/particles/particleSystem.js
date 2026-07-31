import { createBuffer } from '../gpu/buffers.js';

const BASE_COLOR = [0.76, 0.7, 0.5];
const JITTER = 0.15;

function shuffledCellIndices(cols, rows) {
  const cellIndices = new Uint32Array(cols * rows);
  for (let i = 0; i < cellIndices.length; i++) {
    cellIndices[i] = i;
  }
  for (let i = cellIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = cellIndices[i];
    cellIndices[i] = cellIndices[j];
    cellIndices[j] = temp;
  }
  return cellIndices;
}

export function createParticleSystem(device, {count, width, height, cellSize}) {
  const cols = Math.floor(width / cellSize);
  const rows = Math.floor(height / cellSize);

  const positions = new Float32Array(count * 2);
  const colors = new Float32Array(count * 4);
  const occupancy = new Uint32Array(cols * rows);

  const spawnCells = shuffledCellIndices(cols, rows);

  for (let i = 0; i < count; i ++) {
    const cellIndex = spawnCells[i];
    const cellX = cellIndex % cols;
    const cellY = Math.floor(cellIndex / cols);
    positions[i * 2] = (cellX + 0.5) * cellSize;
    positions[i * 2 + 1] = (cellY + 0.5) * cellSize;

    occupancy[cellIndex] = i + 1;

    colors[i * 4] = BASE_COLOR[0] + (Math.random() - 0.5) * JITTER;
    colors[i * 4 + 1] = BASE_COLOR[1] + (Math.random() - 0.5) * JITTER;
    colors[i * 4 + 2] = BASE_COLOR[2] + (Math.random() - 0.5) * JITTER;
    colors[i * 4 + 3] = 1.0;
  }

  const velocities = new Float32Array(count * 2);
  const remainders = new Float32Array(count * 2);

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
  const velocityBuffer = createBuffer(device, {
    data: velocities,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'Particle Velocities',
  });
  const remainderBuffer = createBuffer(device, {
    data: remainders,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'Particle Remainders',
  });
  const gridBuffer = createBuffer(device, {
    data: occupancy,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'Occupancy Grid',
  });

  return { positionBuffer, colorBuffer, velocityBuffer, remainderBuffer, gridBuffer, count, cols, rows };
}
