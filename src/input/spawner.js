export function createSpawnInput(canvas, particleSystem, { cellSize }) {
  let isDragging = false;
  let lastSpawnCell = null;

  function screenToCell(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (clientX - rect.left) * scaleX;
    const canvasY = (clientY - rect.top) * scaleY;

    return {
      x: Math.floor(canvasX / cellSize),
      y: Math.floor(canvasY / cellSize),
    };
  }

  function trySpawn(cell) {
    if (lastSpawnCell && lastSpawnCell.x === cell.x && lastSpawnCell.y === cell.y) {
      return;
    }
    particleSystem.spawnParticle(cell.x, cell.y);
    lastSpawnCell = cell;
  }

  function stopDragging() {
    isDragging = false;
    lastSpawnCell = null;
  }

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    isDragging = true;
    trySpawn(screenToCell(event.clientX, event.clientY));
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!isDragging) {
      return;
    }
    trySpawn(screenToCell(event.clientX, event.clientY));
  });

  canvas.addEventListener('pointerup', stopDragging);
  canvas.addEventListener('pointercancel', stopDragging);
}
