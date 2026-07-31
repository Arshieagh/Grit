import { CONSOLE_MAX_LINES } from '../sim/config.js';

export function createDebugPanel() {
  const fpsEl = document.getElementById('stat-fps');
  const countEl = document.getElementById('stat-count');
  const maxEl = document.getElementById('stat-max');
  const gridEl = document.getElementById('stat-grid');
  const brushEl = document.getElementById('stat-brush');
  const materialEl = document.getElementById('stat-material');
  const adapterEl = document.getElementById('stat-adapter');
  const lastSpawnEl = document.getElementById('stat-last-spawn');
  const breakdownEl = document.getElementById('stat-material-breakdown');
  const consoleEl = document.getElementById('console-log');

  function updateStats({ fps, activeCount, maxParticles, cols, rows, brushRadius, materialName, adapterInfo, lastSpawnResult, materialBreakdown }) {
    fpsEl.textContent = fps.toFixed(0);
    countEl.textContent = activeCount;
    maxEl.textContent = maxParticles;
    gridEl.textContent = `${cols} x ${rows}`;
    brushEl.textContent = brushRadius;
    materialEl.textContent = materialName;
    adapterEl.textContent = adapterInfo;
    lastSpawnEl.textContent = lastSpawnResult;
    breakdownEl.textContent = materialBreakdown;
  }

  function logToConsole(message) {
    const time = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.textContent = `[${time}] ${message}`;
    consoleEl.appendChild(line);

    while (consoleEl.children.length > CONSOLE_MAX_LINES) {
      consoleEl.removeChild(consoleEl.firstChild);
    }
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  return { updateStats, logToConsole };
}
