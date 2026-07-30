@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> positions: array<vec2f>;
@group(0) @binding(2) var<storage, read> colors: array<vec4f>;

struct Uniforms {
  data: vec4f,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VertexOutput {
  let x = f32(vi & 1u);
  let y = f32((vi >> 1u) & 1u);
  let corner = vec2f(x, y) - vec2f(0.5, 0.5);

  let particlePos = positions[ii];

  let resolution = uniforms.data.xy;
  let particleSize = uniforms.data.z;

  let worldPos = particlePos + corner * particleSize;

  let ndc = vec2f(
    (worldPos.x / resolution.x) * 2.0 - 1.0,
    1.0 - (worldPos.y / resolution.y) * 2.0
  );

  var out: VertexOutput;
  out.position = vec4f(ndc, 0.0, 1.0);
  out.color = colors[ii];
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  return in.color;
}
