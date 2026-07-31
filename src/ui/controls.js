export function createControls({ materials, defaultBrushRadius, minBrushRadius, maxBrushRadius, onReset, log }) {
  const sliderEl = document.getElementById('brush-size');
  const sliderValueEl = document.getElementById('brush-size-value');
  const materialsEl = document.getElementById('materials');
  const resetBtn = document.getElementById('reset-btn');

  sliderEl.min = minBrushRadius;
  sliderEl.max = maxBrushRadius;
  sliderEl.value = defaultBrushRadius;
  sliderValueEl.textContent = defaultBrushRadius;

  let brushRadius = defaultBrushRadius;
  let selectedMaterial = materials[0];

  sliderEl.addEventListener('input', () => {
    brushRadius = Number(sliderEl.value);
    sliderValueEl.textContent = brushRadius;
  });

  materials.forEach((material) => {
    const btn = document.createElement('button');
    btn.className = 'material-btn';
    btn.textContent = material.name;
    btn.style.background = `rgba(${material.color[0] * 255}, ${material.color[1] * 255}, ${material.color[2] * 255}, 1)`;
    if (material === selectedMaterial) {
      btn.classList.add('active');
    }

    btn.addEventListener('click', () => {
      selectedMaterial = material;
      materialsEl.querySelectorAll('.material-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      log(`Material: ${material.name}`);
    });

    materialsEl.appendChild(btn);
  });

  resetBtn.addEventListener('click', () => {
    onReset();
    log('Reset canvas');
  });

  function getBrushRadius() {
    return brushRadius;
  }

  function getBrushColor() {
    return selectedMaterial.color;
  }

  function getSelectedMaterialName() {
    return selectedMaterial.name;
  }

  function getBrushMaterialId() {
    return materials.indexOf(selectedMaterial);
  }

  return { getBrushRadius, getBrushColor, getSelectedMaterialName, getBrushMaterialId };
}
