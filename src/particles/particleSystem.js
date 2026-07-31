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

function randomColor() {
  return [
    BASE_COLOR[0] + (Math.random() - 0.5) * JITTER,
    BASE_COLOR[1] + (Math.random() - 0.5) * JITTER,
    BASE_COLOR[2] + (Math.random() - 0.5) * JITTER,
    1.0,
  ];
}

export function createParticleSystem(device, {maxParticles, initialCount, width, height, cellSize}) {
  const cols = Math.floor(width / cellSize);
  const rows = Math.floor(height / cellSize);

  const positions = new Float32Array(maxParticles * 2);
  const colors = new Float32Array(maxParticles * 4);
  const velocities = new Float32Array(maxParticles * 2);
  const remainders = new Float32Array(maxParticles * 2);
  const occupancy = new Uint32Array(cols * rows);
  const occupancyShadow = new Uint8Array(cols * rows);

  if (initialCount > 0) {
    const spawnCells = shuffledCellIndices(cols, rows);

    for (let i = 0; i < initialCount; i++) {
      const cellIndex = spawnCells[i];
      const cellX = cellIndex % cols;
      const cellY = Math.floor(cellIndex / cols);
      positions[i * 2] = (cellX + 0.5) * cellSize;
      positions[i * 2 + 1] = (cellY + 0.5) * cellSize;

      occupancy[cellIndex] = i + 1;
      occupancyShadow[cellIndex] = 1;

      const color = randomColor();
      colors[i * 4] = color[0];
      colors[i * 4 + 1] = color[1];
      colors[i * 4 + 2] = color[2];
      colors[i * 4 + 3] = color[3];
    }
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

  let activeCount = initialCount;

  function getActiveCount() {
    return activeCount;
  }

  function spawnParticle(cellX, cellY) {
    if (activeCount >= maxParticles) {
      return false;
    }
    if (cellX < 0 || cellX >= cols || cellY < 0 || cellY >= rows) {
      return false;
    }

    const cellIndex = cellY * cols + cellX;
    if (occupancyShadow[cellIndex]) {
      return false;
    }

    const slot = activeCount;

    device.queue.writeBuffer(positionBuffer, slot * 8, new Float32Array([
      (cellX + 0.5) * cellSize,
      (cellY + 0.5) * cellSize,
    ]));
    device.queue.writeBuffer(velocityBuffer, slot * 8, new Float32Array([0, 0]));
    device.queue.writeBuffer(remainderBuffer, slot * 8, new Float32Array([0, 0]));
    device.queue.writeBuffer(colorBuffer, slot * 16, new Float32Array(randomColor()));
    device.queue.writeBuffer(gridBuffer, cellIndex * 4, new Uint32Array([slot + 1]));

    occupancyShadow[cellIndex] = 1;
    activeCount++;
    return true;
  }

  return { positionBuffer, colorBuffer, velocityBuffer, remainderBuffer, gridBuffer, cols, rows, getActiveCount, spawnParticle };
}
