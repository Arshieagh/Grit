export function createControls({ materials, defaultBrushRadius, minBrushRadius, maxBrushRadius, onReset, log }) {
  const sliderEl = document.getElementById('brush-size');
  const sliderValueEl = document.getElementById('brush-size-value');
  const filterEl = document.getElementById('material-filter');
  const swatchEl = document.getElementById('material-swatch');
  const selectEl = document.getElementById('materials');
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

  // Rebuilds the <select>'s options from `materials`, filtered by name
  // (case-insensitive substring match). Rebuilding rather than
  // hiding/showing individual <option> elements keeps this simple and
  // avoids relying on inconsistent cross-browser support for
  // display:none on <option>. Scales fine to hundreds of materials -
  // this only runs when the filter text or selection changes, not
  // per-frame.
  function renderOptions(filterText) {
    const query = filterText.trim().toLowerCase();
    selectEl.innerHTML = '';

    materials.forEach((material, index) => {
      if (query && !material.name.toLowerCase().includes(query)) {
        return;
      }
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = material.name;
      selectEl.appendChild(option);
    });

    const selectedIndex = materials.indexOf(selectedMaterial);
    const stillVisible = Array.from(selectEl.options).some((o) => Number(o.value) === selectedIndex);
    if (stillVisible) {
      selectEl.value = String(selectedIndex);
    } else if (selectEl.options.length > 0) {
      selectEl.value = selectEl.options[0].value;
      selectMaterial(materials[Number(selectEl.value)]);
    }
  }

  function selectMaterial(material) {
    selectedMaterial = material;
    swatchEl.style.background = `rgba(${material.color[0] * 255}, ${material.color[1] * 255}, ${material.color[2] * 255}, 1)`;
    log(`Material: ${material.name}`);

    const index = materials.indexOf(material);
    const optionExists = Array.from(selectEl.options).some((o) => Number(o.value) === index);
    if (!optionExists) {
      // Selected from outside the current filter (e.g. a keyboard
      // shortcut) - clear the filter so the dropdown stays truthful
      // about what's actually selected.
      filterEl.value = '';
      renderOptions('');
    }
    selectEl.value = String(index);
  }

  filterEl.addEventListener('input', () => renderOptions(filterEl.value));
  selectEl.addEventListener('change', () => selectMaterial(materials[Number(selectEl.value)]));

  renderOptions('');
  selectMaterial(selectedMaterial);

  function doReset() {
    onReset();
    log('Reset canvas');
  }

  resetBtn.addEventListener('click', doReset);

  // Keyboard shortcuts: number keys pick a material by position, R resets.
  // Ignored while focus is in a form control so arrow-key slider nudging,
  // typing in the filter box, and select-list navigation aren't hijacked.
  window.addEventListener('keydown', (event) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
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
