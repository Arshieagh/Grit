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
  const materialButtons = [];

  sliderEl.addEventListener('input', () => {
    brushRadius = Number(sliderEl.value);
    sliderValueEl.textContent = brushRadius;
  });

  function selectMaterial(material) {
    selectedMaterial = material;
    materialsEl.querySelectorAll('.material-btn').forEach((b) => b.classList.remove('active'));
    materialButtons[materials.indexOf(material)].classList.add('active');
    log(`Material: ${material.name}`);
  }

  materials.forEach((material) => {
    const btn = document.createElement('button');
    btn.className = 'material-btn';
    btn.textContent = material.name;
    btn.style.background = `rgba(${material.color[0] * 255}, ${material.color[1] * 255}, ${material.color[2] * 255}, 1)`;
    if (material === selectedMaterial) {
      btn.classList.add('active');
    }

    btn.addEventListener('click', () => selectMaterial(material));

    materialsEl.appendChild(btn);
    materialButtons.push(btn);
  });

  function doReset() {
    onReset();
    log('Reset canvas');
  }

  resetBtn.addEventListener('click', doReset);

  // Keyboard shortcuts: number keys pick a material by position, R resets.
  // Ignored while focus is in a form control so arrow-key slider nudging
  // and any future text inputs aren't hijacked.
  window.addEventListener('keydown', (event) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      return;
    }

    if (event.key >= '1' && event.key <= '9') {
      const index = Number(event.key) - 1;
      if (index < materials.length) {
        selectMaterial(materials[index]);
      }
      return;
    }

    if (event.key === 'r' || event.key === 'R') {
      doReset();
    }
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
