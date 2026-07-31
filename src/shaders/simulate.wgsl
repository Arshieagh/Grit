struct SimUniforms {
  data: vec4f, // x: dt, y: gravity, z: cellSize, w: rows
}

@group(0) @binding(0) var<uniform> uniforms: SimUniforms;
@group(0) @binding(1) var<storage, read_write> positions: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> velocities: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> remainders: array<vec2f>;

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= arrayLength(&positions)) {
    return;
  }

  let dt = uniforms.data.x;
  let gravity = uniforms.data.y;
  let cellSize = uniforms.data.z;
  let rows = uniforms.data.w;

  var pos = positions[i];
  var vel = velocities[i];
  var rem = remainders[i];

  // gravity drives velocity, velocity accumulates into the sub-cell remainder
  vel.y += gravity * dt;
  rem += vel * dt;

  // Y axis: convert however much remainder has built up into whole grid-cell steps
  let stepsY = floor(abs(rem.y) / cellSize);
  if (stepsY > 0.0) {
    let dirY = sign(rem.y);
    pos.y += dirY * stepsY * cellSize;
    rem.y -= dirY * stepsY * cellSize;

    // floor boundary: land on the last row and stop falling
    let maxRowCenter = (rows - 0.5) * cellSize;
    if (pos.y >= maxRowCenter) {
      pos.y = maxRowCenter;
      vel.y = 0.0;
      rem.y = 0.0;
    }
  }

  // X axis: same logic, symmetric but currently inert (nothing sets vel.x yet)
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
