// Material property schema for Grit.
//
// This documents every field a material in materialsData.js must have.
// It's deliberately a plain JS object shape (not a class/validator) to
// match this project's zero-build, no-framework convention - this file
// is documentation + a factory default, not enforced at runtime.
//
// Field groupings mirror the design discussion this schema comes from:
// identity/rendering, matter state, mechanical, thermal, chemical, and
// "other" (electrical/radioactive/absorption). Two categories were
// deliberately EXCLUDED after discussion and are not part of this
// per-material schema:
//   - Engine mechanics (Forces, Pressure) - not material properties,
//     they're simulation-wide systems computed from particle
//     interactions, not stored per material.
//   - Dynamic per-particle STATE (current temperature, current matter
//     state, current wetness level, structural stress/damage, burn
//     progress, decay progress) - these change every frame and are
//     computed by the engine at runtime, not fixed per-material data.
//     A material's PROPERTIES (below) govern how its state evolves;
//     the state itself lives in per-particle GPU buffers, not here.
//
// Units are real-world where a real-world unit makes unambiguous sense
// (density, thermal conductivity, temperatures) so material entries can
// be filled in with genuine physical reference values. Where no
// convenient real-world unit exists (friction, reactivity, etc.) the
// field is a normalized 0-1 scalar instead - documented per field.

/**
 * @typedef {Object} MaterialDefinition
 *
 * -- Identity / rendering --
 * @property {string} id - unique slug, e.g. "water", "basalt", "lava"
 * @property {string} name - display name, e.g. "Water", "Basalt", "Lava"
 * @property {[number, number, number, number]} color - RGBA, each 0-1
 *
 * -- Matter state --
 * @property {'solid'|'liquid'|'gas'} matterState - default state at
 *   room temperature (~20C). Drives base movement behavior: solid
 *   particles use grid-snapped granular movement (fall + diagonal
 *   slip, gated by friction); liquid and gas particles get that same
 *   movement plus a sideways-spread fallback when blocked, and gas
 *   additionally rises (buoyancy) instead of falling.
 * @property {boolean} immovable - true for materials that never move
 *   regardless of matterState (e.g. Stone). Checked first in the
 *   compute shader, before matterState-driven movement rules.
 *
 * -- Mechanical --
 * @property {number} density - kg/m^3, real-world reference value
 *   (e.g. water=1000, granite=2700, lava=3100, air=1.2, gold=19300)
 * @property {number} viscosity - Pa*s, real-world reference value for
 *   liquids/gases (water=0.001, honey=~10, lava=~1e4-1e6 depending on
 *   composition/temperature). 0 for rigid solids - viscosity doesn't
 *   meaningfully apply to something that doesn't flow.
 * @property {number} friction - 0-1 normalized. 0 = no resistance to
 *   diagonal slipping (behaves like the original always-slip
 *   heuristic), 1 = maximum resistance (needs a very steep local pile
 *   before ever slipping). This is the property already wired into
 *   simulate.wgsl's angle-of-repose gating.
 * @property {number} structuralStrength - 0-1 normalized, relative
 *   maximum load before structural collapse. Not yet wired into any
 *   collapse/breakage mechanic - reserved for a future milestone.
 *
 * -- Thermal --
 * @property {number} thermalConductivity - W/(m*K), real-world
 *   reference value (e.g. copper=401, water=0.6, air=0.026,
 *   basalt=~2). Governs heat transfer through direct contact - not
 *   yet wired into any simulation logic (no heat/temperature system
 *   exists yet), but the value should be a genuine physical reference.
 * @property {number} specificHeatCapacity - J/(kg*K), real-world
 *   reference value (e.g. water=4186, iron=450, basalt=~840). How
 *   much energy is needed to change 1kg of this material by 1 degree.
 * @property {number} emissivity - 0-1, real-world reference value
 *   (e.g. polished metal ~0.02-0.1, most rock/organic matter ~0.9-0.96,
 *   water ~0.96). How strongly the material radiates heat.
 * @property {number|null} meltingPointC - degrees Celsius, real-world
 *   reference value, or null if not physically meaningful at
 *   reachable temperatures (e.g. most silicate rock's melting point
 *   IS meaningful and should be filled in - lava's melting point is
 *   effectively its solidification point, ~1100-1250C depending on
 *   composition).
 * @property {number|null} boilingPointC - degrees Celsius, real-world
 *   reference value, or null if not applicable (most solids at
 *   reachable temperatures don't have a meaningful boiling point
 *   entry here - use null rather than an extreme placeholder number).
 *
 * -- Chemical --
 * @property {number} acidity - pH scale, 0-14, real-world reference
 *   value where one exists (pure water=7, battery acid~1,
 *   ammonia~11); for materials with no meaningful pH (most dry solids
 *   like stone/metal), use 7 (neutral) as the baseline.
 * @property {number} chemicalReactivity - 0-1 normalized generic
 *   reactivity coefficient (how readily this material reacts with
 *   others in general - inert materials like gold/glass near 0,
 *   volatile ones like sodium/phosphorus near 1). Not yet wired into
 *   any reaction mechanic.
 * @property {number} solubility - 0-1 normalized, how readily this
 *   material dissolves into a liquid (salt/sugar high, sand/stone
 *   near 0). Not yet wired into any dissolution mechanic.
 * @property {number} ignitionTemperatureC - degrees Celsius, real-
 *   world reference value where the material can catch fire, or a
 *   very high placeholder (e.g. 99999) for materials that don't burn
 *   under normal conditions (stone, water, metal).
 * @property {number} burnRate - 0-1 normalized, how fast it burns
 *   once ignited (0 = doesn't burn, matches a 99999 ignition temp;
 *   higher = faster/more intense burn, e.g. dry wood/oil high, damp
 *   wood lower).
 * @property {number} explosiveness - 0-1 normalized, instant-release
 *   potential distinct from burnRate's sustained burn (most materials
 *   0; volatile/reactive ones like TNT-equivalents near 1).
 *
 * -- Other --
 * @property {number} absorptionCapacity - 0-1 normalized, how much
 *   liquid this material can soak up before becoming saturated
 *   (porous materials like wood/sand higher, glass/metal near 0).
 * @property {number} electricalConductivity - S/m, real-world
 *   reference value on a log scale is fine to approximate (copper=
 *   ~6e7, water(impure)=~0.05-5, dry wood=~1e-14, air=~1e-15). Use
 *   real reference magnitudes, not a 0-1 normalization, since the
 *   real-world range spans ~20 orders of magnitude and normalizing
 *   would lose that.
 * @property {number} halfLifeSeconds - seconds, real-world reference
 *   value for radioactive materials, or 0 for non-radioactive
 *   materials (the vast majority of entries).
 */

// Default values a MaterialDefinition should start from before
// overriding the fields that make a specific material distinct - kept
// here so every generated material entry has an intentional value for
// every field rather than an accidental `undefined`.
export const MATERIAL_DEFAULTS = {
  id: '',
  name: '',
  color: [0.5, 0.5, 0.5, 1.0],

  matterState: 'solid',
  immovable: false,

  density: 2000,
  viscosity: 0,
  friction: 0.5,
  structuralStrength: 0.5,

  thermalConductivity: 1,
  specificHeatCapacity: 800,
  emissivity: 0.9,
  meltingPointC: null,
  boilingPointC: null,

  acidity: 7,
  chemicalReactivity: 0.1,
  solubility: 0,
  ignitionTemperatureC: 99999,
  burnRate: 0,
  explosiveness: 0,

  absorptionCapacity: 0,
  electricalConductivity: 1e-10,
  halfLifeSeconds: 0,
};

export const MATERIAL_FIELDS = Object.keys(MATERIAL_DEFAULTS);
