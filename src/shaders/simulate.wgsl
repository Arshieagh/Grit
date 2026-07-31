struct SimUniforms {
  data: vec4f,  // x: dt, y: gravity, z: cellSize, w: rows
  data2: vec4f, // x: cols, y: frameCount, z: activeCount, w: unused
}

@group(0) @binding(0) var<uniform> uniforms: SimUniforms;
@group(0) @binding(1) var<storage, read_write> positions: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> velocities: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> remainders: array<vec2f>;
@group(0) @binding(4) var<storage, read_write> grid: array<atomic<u32>>;
@group(0) @binding(5) var<storage, read_write> velocityDeltaY: array<atomic<i32>>;
@group(0) @binding(6) var<storage, read> materials: array<u32>;
@group(0) @binding(7) var<storage, read> materialFriction: array<f32>;
@group(0) @binding(8) var<storage, read> materialImmovable: array<u32>;
@group(0) @binding(9) var<storage, read> materialMatterState: array<u32>;

const EMPTY: u32 = 0u;
const MAX_STEPS: u32 = 8u;
// fixed-point scale for encoding f32 velocity deltas into atomic<i32>
// (WGSL has no atomic<f32>) - see queueVelocityDelta / pending-delta pickup
const FIXED_SCALE: f32 = 65536.0;

// Matter state IDs - must match MATTER_STATE_IDS in computePipeline.js.
// Behavior branches on these instead of specific material IDs, so any
// material marked immovable/liquid in config gets the matching
// behavior automatically - not just the original hardcoded Stone/Water.
const MATTER_SOLID: u32 = 0u;
const MATTER_LIQUID: u32 = 1u;
const MATTER_GAS: u32 = 2u;

// Angle-of-repose heuristic tuning. When straight-down is blocked, a
// diagonal slip is only taken if the local "height difference" between
// the particle's own column and the candidate neighbor column is at
// least this many cells deep - a friction-derived threshold (see
// requiredHeightDrop). Kept small and fixed so the extra grid probing
// this requires stays cheap and independent of actual pile height.
const SLOPE_PROBE_DEPTH: u32 = 4u;

struct ClaimResult {
  claimed: bool,
  blocker: u32, // valid only when claimed == false: the occupant's particle index
}

// Atomically claims cell `idx` for particle `owner` (index + 1) if it's
// currently empty. atomicCompareExchangeWeak can spuriously fail even when
// the cell IS empty, so we only give up once we see a genuinely
// non-empty old_value - and we surface who that occupant is, so the
// caller can identify the blocker for momentum purposes.
fn tryClaim(idx: u32, owner: u32) -> ClaimResult {
  loop {
    let result = atomicCompareExchangeWeak(&grid[idx], EMPTY, owner);
    if (result.exchanged) {
      return ClaimResult(true, 0u);
    }
    if (result.old_value != EMPTY) {
      return ClaimResult(false, result.old_value - 1u);
    }
  }
}

// cheap integer bit-mixer (murmur3 fmix32) used to pick a pseudo-random
// per-particle-per-frame diagonal slip order - avoids favoring one side
// over long runs the way parity-of-index or hash-of-position would.
fn hash_u32(x: u32) -> u32 {
  var h = x;
  h = h ^ (h >> 16u);
  h = h * 0x7feb352du;
  h = h ^ (h >> 15u);
  h = h * 0x846ca68bu;
  h = h ^ (h >> 16u);
  return h;
}

// Queues a velocity change for another particle's NEXT invocation.
// Can't write velocities[idx] directly here - that particle very likely
// has its own invocation running concurrently in this same dispatch,
// independently reading/writing that same slot, which would be a
// genuine write-write race. atomicAdd on a fixed-point int is the one
// cross-invocation-safe way to accumulate a float-ish value.
fn queueVelocityDelta(idx: u32, delta: f32) {
  atomicAdd(&velocityDeltaY[idx], i32(round(delta * FIXED_SCALE)));
}

// Treats the grid as "solid" at (colX, row): either genuinely occupied,
// or off the top/bottom edge of the world (both edges act like an
// immovable floor/ceiling for the purposes of measuring local pile
// support - there's nothing beyond them to fall into).
fn isSolid(colX: u32, row: i32, cols: u32, rows: f32) -> bool {
  if (row < 0 || f32(row) >= rows) {
    return true;
  }
  let idx = u32(row) * cols + colX;
  return atomicLoad(&grid[idx]) != EMPTY;
}

// Counts consecutive solid cells starting at (colX, startRow) and
// walking in the +/-row direction given by dirY, stopping at the first
// empty cell or after SLOPE_PROBE_DEPTH cells, whichever comes first.
// This is the cheap, fixed-cost local "pile depth" proxy used by the
// angle-of-repose gate below: it never reads more than SLOPE_PROBE_DEPTH
// cells, regardless of how tall the real pile in that column is.
fn supportDepth(colX: u32, startRow: i32, dirY: i32, cols: u32, rows: f32) -> u32 {
  var count = 0u;
  var row = startRow;
  loop {
    if (count >= SLOPE_PROBE_DEPTH) {
      break;
    }
    if (!isSolid(colX, row, cols, rows)) {
      break;
    }
    count = count + 1u;
    row = row + dirY;
  }
  return count;
}

// Maps a material's friction [0,1] onto a required height-difference
// threshold, in cells, out of the SLOPE_PROBE_DEPTH cells we're able to
// measure: friction near 0 needs only a 1-cell drop (moot in practice -
// see the friction <= 0 bypass at the call site, which skips this
// entirely), friction 1 needs the full probe depth (an extreme, steep
// drop) before a grain will ever slip sideways. Clamped defensively in
// case a future material's friction value strays outside [0,1].
fn requiredHeightDrop(friction: f32) -> i32 {
  let raw = i32(round(1.0 + friction * f32(SLOPE_PROBE_DEPTH - 1u)));
  return clamp(raw, 1, i32(SLOPE_PROBE_DEPTH));
}

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  let activeCount = u32(uniforms.data2.z);
  if (i >= activeCount || i >= arrayLength(&positions)) {
    return;
  }

  let material = materials[i];
  if (materialImmovable[material] != 0u) {
    // Immovable: stays in whatever cell it spawned in forever, still
    // blocking other particles via the occupancy grid it already
    // claimed at spawn time. Nothing else in this function needs to run.
    return;
  }

  let dt = uniforms.data.x;
  let gravity = uniforms.data.y;
  let cellSize = uniforms.data.z;
  let rows = uniforms.data.w;
  let cols = uniforms.data2.x;
  let frameCount = u32(uniforms.data2.y);
  let friction = materialFriction[material];

  var pos = positions[i];
  var vel = velocities[i];
  var rem = remainders[i];

  // Pick up any momentum queued for us last frame by a particle that
  // landed on top of us and couldn't write into our slot directly.
  // atomicExchange reads-and-resets in one atomic step, so a concurrent
  // atomicAdd from THIS frame's collisions (queued for next frame) can
  // never be silently lost between a separate load and store.
  let pendingFixed = atomicExchange(&velocityDeltaY[i], 0);
  if (pendingFixed != 0) {
    vel.y += f32(pendingFixed) / FIXED_SCALE;
  }

  // gravity drives velocity, velocity accumulates into the sub-cell remainder
  vel.y += gravity * dt;
  rem += vel * dt;

  var cellX = u32(floor(pos.x / cellSize));
  var cellY = u32(floor(pos.y / cellSize));
  var currentIdx = cellY * u32(cols) + cellX;

  // Y axis: walk one cell at a time, atomically claiming each next cell
  // before releasing the one we're leaving. On a straight-down block by
  // another particle, try to slip diagonally past it before giving up -
  // gated by the material's angle-of-repose friction (see below).
  let stepsY = floor(abs(rem.y) / cellSize);
  let stepsWanted = min(stepsY, f32(MAX_STEPS));
  let dirY = sign(rem.y);
  let dirYi = i32(dirY);

  var stepsDone = 0.0;
  var blocked = false;
  var hitFloor = false;

  for (var s = 0u; s < u32(stepsWanted); s = s + 1u) {
    let nextRow = i32(cellY) + dirYi;
    if (nextRow < 0 || f32(nextRow) >= rows) {
      blocked = true;
      hitFloor = true; // world edge - always a hard stop, never slips
      break;
    }

    let straightIdx = u32(nextRow) * u32(cols) + cellX;
    let straightClaim = tryClaim(straightIdx, i + 1u);

    if (straightClaim.claimed) {
      atomicStore(&grid[currentIdx], EMPTY);
      currentIdx = straightIdx;
      cellY = u32(nextRow);
      stepsDone += 1.0;
      continue;
    }

    // Straight-down is occupied by another particle - try to slip
    // diagonally past it, but only if doing so wouldn't violate this
    // material's angle of repose. homeSupport/requiredDrop are shared
    // by both candidate sides below; friction <= 0 (water) skips the
    // gate entirely and reproduces the old unconditional-slip behavior.
    let cellXi = i32(cellX);
    let colsI = i32(cols);
    let leftX = cellXi - 1;
    let rightX = cellXi + 1;
    let leftValid = leftX >= 0;
    let rightValid = rightX < colsI;

    let h = hash_u32(i ^ (frameCount * 0x9E3779B1u));
    let tryLeftFirst = (h & 1u) == 0u;

    var firstX = leftX;
    var firstValid = leftValid;
    var secondX = rightX;
    var secondValid = rightValid;
    if (!tryLeftFirst) {
      firstX = rightX;
      firstValid = rightValid;
      secondX = leftX;
      secondValid = leftValid;
    }

    let useSlopeGate = friction > 0.0;
    var homeSupport: u32 = 0u;
    var requiredDrop: i32 = 0;
    if (useSlopeGate) {
      // How deep the pile is directly under our current resting spot
      // (nextRow is already known occupied, so this is always >= 1).
      homeSupport = supportDepth(cellX, nextRow, dirYi, u32(cols), rows);
      requiredDrop = requiredHeightDrop(friction);
    }

    var slipped = false;
    if (firstValid) {
      let diagIdx = u32(nextRow) * u32(cols) + u32(firstX);
      if (atomicLoad(&grid[diagIdx]) == EMPTY) {
        var allowed = true;
        if (useSlopeGate) {
          let neighborSupport = supportDepth(u32(firstX), nextRow + dirYi, dirYi, u32(cols), rows);
          let heightDiff = i32(homeSupport) - i32(neighborSupport);
          allowed = heightDiff >= requiredDrop;
        }
        if (allowed) {
          let diagClaim = tryClaim(diagIdx, i + 1u);
          if (diagClaim.claimed) {
            atomicStore(&grid[currentIdx], EMPTY);
            currentIdx = diagIdx;
            cellX = u32(firstX);
            cellY = u32(nextRow);
            pos.x = (f32(cellX) + 0.5) * cellSize;
            stepsDone += 1.0;
            slipped = true;
          }
        }
      }
    }
    if (!slipped && secondValid) {
      let diagIdx = u32(nextRow) * u32(cols) + u32(secondX);
      if (atomicLoad(&grid[diagIdx]) == EMPTY) {
        var allowed = true;
        if (useSlopeGate) {
          let neighborSupport = supportDepth(u32(secondX), nextRow + dirYi, dirYi, u32(cols), rows);
          let heightDiff = i32(homeSupport) - i32(neighborSupport);
          allowed = heightDiff >= requiredDrop;
        }
        if (allowed) {
          let diagClaim = tryClaim(diagIdx, i + 1u);
          if (diagClaim.claimed) {
            atomicStore(&grid[currentIdx], EMPTY);
            currentIdx = diagIdx;
            cellX = u32(secondX);
            cellY = u32(nextRow);
            pos.x = (f32(cellX) + 0.5) * cellSize;
            stepsDone += 1.0;
            slipped = true;
          }
        }
      }
    }

    // Liquids: if a material can't fall straight down OR diagonally
    // (whether because the diagonal cell was occupied, or because it
    // was open but rejected by the slope gate above - moot for any
    // liquid with friction 0, since useSlopeGate is always false then),
    // spread sideways along its current row before settling - a looser
    // "liquid disperses" fallback solids don't get. Driven by
    // matterState rather than a specific material ID, so every liquid
    // (water, oil, lava, etc.) gets this, not just literally "water".
    // Reuses the same hash-ordered left/right candidates computed above
    // (column bounds don't depend on which row we're checking).
    if (!slipped && materialMatterState[material] == MATTER_LIQUID) {
      if (firstValid) {
        let sideIdx = cellY * u32(cols) + u32(firstX);
        let sideClaim = tryClaim(sideIdx, i + 1u);
        if (sideClaim.claimed) {
          atomicStore(&grid[currentIdx], EMPTY);
          currentIdx = sideIdx;
          cellX = u32(firstX);
          pos.x = (f32(cellX) + 0.5) * cellSize;
          slipped = true;
        }
      }
      if (!slipped && secondValid) {
        let sideIdx = cellY * u32(cols) + u32(secondX);
        let sideClaim = tryClaim(sideIdx, i + 1u);
        if (sideClaim.claimed) {
          atomicStore(&grid[currentIdx], EMPTY);
          currentIdx = sideIdx;
          cellX = u32(secondX);
          pos.x = (f32(cellX) + 0.5) * cellSize;
          slipped = true;
        }
      }
    }

    if (slipped) {
      break; // one-shot per frame - don't chain further steps after a slip
    }

    // Nothing worked - genuine dead stop against the particle directly
    // below. Resolve as a soft (perfectly inelastic, equal-mass) two-way
    // momentum exchange instead of a hard freeze.
    blocked = true;
    let blockerIdx = straightClaim.blocker;
    let vBottom = velocities[blockerIdx].y; // benign read race - see plan notes
    let vFinal = (vel.y + vBottom) * 0.5;
    vel.y = vFinal; // our own half applies immediately (own slot, no race)
    queueVelocityDelta(blockerIdx, vFinal - vBottom); // their half, deferred
    break;
  }

  pos.y = (f32(cellY) + 0.5) * cellSize;

  if (blocked) {
    rem.y = 0.0;
    if (hitFloor) {
      vel.y = 0.0;
    }
    // else: vel.y already holds the momentum-merged value set above
  } else {
    // only consume the cells we actually moved; leftover remainder
    // (e.g. capped by MAX_STEPS, or a water horizontal spread that made
    // no vertical progress) carries over to next frame
    rem.y -= dirY * stepsDone * cellSize;
  }

  // X axis: same logic, symmetric but currently inert (diagonal/water
  // slip writes pos.x directly and never touches rem.x/vel.x)
  let stepsX = floor(abs(rem.x) / cellSize);
  if (stepsX > 0.0) {
    let dirX = sign(rem.x);
    pos.x += dirX * stepsX * cellSize;
    rem.x -= dirX * stepsX * cellSize;
  }

  positions[i] = pos;
  velocities[i] = vel;
  remainders[i] = rem;
}
