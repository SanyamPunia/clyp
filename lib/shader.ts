/**
 * Moving backgrounds, drawn by a fragment shader.
 *
 * The flow and warp presets are pictures that change over time, which no
 * `background-image` can be. Each frame is drawn by one WebGL2 program from the
 * preset's data and a phase. The preview, the picker's swatches, a still
 * export and the encode in the worker all draw through `createShaderRenderer`,
 * so the four cannot disagree about what a preset looks like.
 *
 * The two kinds follow Paper's shaders (shaders.paper.design). A flow is their
 * mesh gradient: colour points drifting over the frame, blended by inverse
 * distance, with a distortion and a swirl over the coordinates. A warp is
 * their warp: a pattern of checks, stripes or an edge pushed through noise and
 * a stack of sine swirls, then cut into colour bands.
 *
 * **Every motion is periodic over `LOOP_SECONDS`.** Paper's shaders run on a
 * free clock with frequencies that never line up, which is right for a page
 * and wrong for a file: an exported clip would jump when it loops. Here the
 * time is a phase from 0 to 1, every oscillator runs a whole number of turns
 * per loop, and drifting through noise is a circle rather than a line. A
 * clip exported at one loop's length plays round without a seam.
 */

/** One loop at the normal speed, in seconds. */
export const LOOP_SECONDS = 12;

/**
 * How fast the background moves. 0 holds it at one moment, which is also how a
 * reader picks the frame a PNG captures. The loop runs `LOOP_SECONDS / speed`.
 */
export const BACKGROUND_SPEEDS = [
  { value: 0, label: "Still" },
  { value: 0.5, label: "Slow" },
  { value: 1, label: "Normal" },
  { value: 2, label: "Fast" },
] as const;

export type BackgroundSpeed = (typeof BACKGROUND_SPEEDS)[number]["value"];

/** The longest a palette may be, which is the size of the uniform array. */
export const MAX_SHADER_COLORS = 8;

/**
 * A mesh gradient. `colors` are its points, two to eight. `distortion` and
 * `swirl` run 0 to 1 and bend the coordinates the points are measured in.
 * `pace` is how many turns each point makes per loop, so it stays a whole
 * number and the loop stays seamless.
 */
export interface FlowField {
  colors: string[];
  distortion: number;
  swirl: number;
  pace: 1 | 2;
  /** Shifts where each point starts on its orbit. */
  seed: number;
}

export type WarpShape = "checks" | "stripes" | "edge";

/**
 * A warped pattern cut into colour bands. `scale` zooms the pattern in,
 * `shapeScale` sets how fine it is, `proportion` moves the balance between the
 * first colour and the last, and `softness` runs from hard bands at 0 to a
 * smooth blend at 1 and past it. `iterations` is how many sine swirls are
 * stacked, which is how tangled it gets.
 */
export interface WarpField {
  colors: string[];
  shape: WarpShape;
  scale: number;
  rotation: number;
  shapeScale: number;
  proportion: number;
  softness: number;
  distortion: number;
  swirl: number;
  iterations: number;
  pace: 1 | 2 | 3;
}

export type ShaderField =
  | ({ kind: "flow" } & FlowField)
  | ({ kind: "warp" } & WarpField);

/**
 * The phase a moving background is at, from 0 to 1.
 *
 * Held still, it is the moment chosen. Moving, it runs from that moment at the
 * chosen speed, so pausing and resuming picks up where the picture was.
 */
export function phaseAt(seconds: number, speed: number, moment: number): number {
  const phase = moment + (seconds * speed) / LOOP_SECONDS;
  return phase - Math.floor(phase);
}

/** How long one seamless loop runs at a speed, in seconds. */
export function loopSeconds(speed: number): number {
  return speed > 0 ? LOOP_SECONDS / speed : 0;
}

/**
 * Where a flow's point sits at a phase, in fractions of the frame's square.
 * The shader runs the same arithmetic, and the CSS stand-in reads it at the
 * phase a swatch is drawn at.
 */
export function flowPoint(
  index: number,
  phase: number,
  pace: number,
  seed: number,
): { x: number; y: number } {
  const theta = phase * Math.PI * 2;
  const a = index * 0.37 + seed;
  const { kx, ky } = flowTurns(index, pace);
  return {
    x: 0.5 + 0.5 * Math.sin(kx * theta + a),
    y: 0.5 + 0.5 * Math.cos(ky * theta + a * 1.5),
  };
}

/**
 * How many turns a flow's point makes per loop, across and down. Whole numbers
 * whatever the index, which is what makes the loop seamless, and not all the
 * same, so the points do not move in step.
 */
export function flowTurns(index: number, pace: number): { kx: number; ky: number } {
  return {
    kx: ((index % 2) + 1) * pace,
    ky: ((index + 1) % 3 === 0 ? 2 : 1) * pace,
  };
}

const VERTEX = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/*
 * One program for both kinds, branching on a uniform. A uniform branch costs
 * nothing worth measuring, and one program is one compile and one set of
 * locations per context.
 *
 * `uv` is the frame mapped so the longer side spans 0 to 1 and the shorter is
 * centred inside that, which is a cover fit: a point's orbit is round on any
 * shape, and a tall frame shows the middle of the field rather than squashing
 * it. y runs downwards, the way the DOM counts.
 */
const FRAGMENT = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_phase;
uniform int u_kind;
uniform vec3 u_colors[${MAX_SHADER_COLORS}];
uniform int u_count;
uniform float u_distortion;
uniform float u_swirl;
uniform float u_pace;
uniform float u_seed;
uniform int u_shape;
uniform float u_scale;
uniform float u_rotation;
uniform float u_shapeScale;
uniform float u_proportion;
uniform float u_softness;
uniform int u_iterations;

out vec4 fragColor;

const float TAU = 6.28318530718;

vec2 rotate(vec2 v, float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c) * v;
}

float hash(vec2 p) {
  p = fract(p * vec2(0.3183099, 0.3678794)) * 50.0;
  return fract(p.x * p.y * (p.x + p.y));
}

float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec3 flow(vec2 uv, float theta) {
  float radius = smoothstep(0.0, 1.0, length(uv - 0.5));
  float center = 1.0 - radius;
  for (int n = 1; n <= 2; n++) {
    float i = float(n);
    uv.x += u_distortion * center / i
      * sin(u_pace * theta + i * 0.4 * smoothstep(0.0, 1.0, uv.y))
      * cos(theta + i * 2.4 * smoothstep(0.0, 1.0, uv.y));
    uv.y += u_distortion * center / i
      * cos(u_pace * theta + i * 2.0 * smoothstep(0.0, 1.0, uv.x));
  }
  uv = rotate(uv - 0.5, -3.0 * u_swirl * radius) + 0.5;

  vec3 color = vec3(0.0);
  float total = 0.0;
  for (int n = 0; n < ${MAX_SHADER_COLORS}; n++) {
    if (n >= u_count) break;
    float i = float(n);
    float a = i * 0.37 + u_seed;
    float kx = (mod(i, 2.0) + 1.0) * u_pace;
    float ky = (mod(i + 1.0, 3.0) < 0.5 ? 2.0 : 1.0) * u_pace;
    vec2 point = 0.5 + 0.5 * vec2(sin(kx * theta + a), cos(ky * theta + a * 1.5));
    float d = pow(length(uv - point), 3.5);
    float w = 1.0 / (d + 1e-3);
    color += u_colors[n] * w;
    total += w;
  }
  return color / max(total, 1e-4);
}

vec3 warp(vec2 uv, float theta) {
  uv = rotate(uv - 0.5, u_rotation) * 4.0 / u_scale;

  // Drifting through the noise on a circle rather than a line, so the field
  // comes back to where it started at the end of the loop.
  vec2 drift = 0.3 * vec2(cos(u_pace * theta), sin(u_pace * theta));
  float n1 = valueNoise(uv + drift);
  float n2 = valueNoise(uv * 2.0 - drift);
  float angle = n1 * TAU;
  uv += 4.0 * u_distortion * n2 * vec2(cos(angle), sin(angle));

  for (int n = 1; n <= 20; n++) {
    if (n >= u_iterations) break;
    float i = float(n);
    uv.x += u_swirl / i * cos(u_pace * theta + i * 1.5 * uv.y);
    uv.y += u_swirl / i * cos(u_pace * theta + i * uv.x);
  }

  float proportion = clamp(u_proportion, 0.0, 1.0);
  float shape;
  if (u_shape == 0) {
    vec2 checks = uv * (0.5 + 3.5 * u_shapeScale);
    shape = 0.5 + 0.5 * sin(checks.x) * cos(checks.y);
    shape += 0.48 * sign(proportion - 0.5) * pow(abs(proportion - 0.5), 0.5);
  } else if (u_shape == 1) {
    float f = fract(uv.y * 2.0 * u_shapeScale);
    shape = smoothstep(0.0, 0.55, f) * (1.0 - smoothstep(0.45, 1.0, f));
    shape += 0.48 * sign(proportion - 0.5) * pow(abs(proportion - 0.5), 0.5);
  } else {
    float spread = 5.0 * (1.0 - u_shapeScale);
    float e0 = 0.45 - spread;
    float e1 = 0.55 + spread;
    shape = smoothstep(min(e0, e1), max(e0, e1), 1.0 - uv.y + 0.3 * (proportion - 0.5));
  }

  float mixer = shape * float(u_count - 1);
  vec3 color = u_colors[0];
  float aa = fwidth(shape);
  for (int n = 1; n < ${MAX_SHADER_COLORS}; n++) {
    if (n >= u_count) break;
    float m = clamp(mixer - float(n - 1), 0.0, 1.0);
    float start = floor(m);
    float soft = 0.5 * u_softness + fwidth(m);
    float smoothed = smoothstep(
      max(0.0, 0.5 - soft - aa),
      min(1.0, 0.5 + soft + aa),
      m - start
    );
    m = mix(start + smoothed, m, clamp(u_softness, 0.0, 1.0));
    color = mix(color, u_colors[n], m);
  }
  return color;
}

void main() {
  float side = max(u_resolution.x, u_resolution.y);
  vec2 frag = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
  vec2 uv = (frag - 0.5 * u_resolution) / side + 0.5;
  float theta = u_phase * TAU;

  vec3 color = u_kind == 0 ? flow(uv, theta) : warp(uv, theta);

  // A step of noise under one level of eight bits. A slow gradient across a
  // large frame otherwise lands in visible bands, worse once H.264 has had it.
  color += (hash(gl_FragCoord.xy + 0.5) - 0.5) / 255.0;
  fragColor = vec4(color, 1.0);
}
`;

/** "#rrggbb" as three 0 to 1 channels. */
export function hexChannels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const SHAPES: Record<WarpShape, number> = { checks: 0, stripes: 1, edge: 2 };

export interface ShaderRenderer {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  /** Draws the field at a phase, resizing the canvas to the size first. */
  draw(field: ShaderField, phase: number, width: number, height: number): void;
  /** Releases the context now rather than whenever the collector gets to it. */
  dispose(): void;
}

/**
 * A renderer bound to one canvas, or null where WebGL2 is not available.
 *
 * `preserveDrawingBuffer` is on so a frame can be copied out with `drawImage`
 * after the draw has returned, which is how the swatches, the still export and
 * the encode read it.
 */
export function createShaderRenderer(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): ShaderRenderer | null {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    preserveDrawingBuffer: true,
    premultipliedAlpha: false,
  }) as WebGL2RenderingContext | null;
  if (!gl) return null;

  const program = link(gl);
  if (!program) return null;

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(program);

  const at = (name: string) => gl.getUniformLocation(program, name);
  const u = {
    resolution: at("u_resolution"),
    phase: at("u_phase"),
    kind: at("u_kind"),
    colors: at("u_colors"),
    count: at("u_count"),
    distortion: at("u_distortion"),
    swirl: at("u_swirl"),
    pace: at("u_pace"),
    seed: at("u_seed"),
    shape: at("u_shape"),
    scale: at("u_scale"),
    rotation: at("u_rotation"),
    shapeScale: at("u_shapeScale"),
    proportion: at("u_proportion"),
    softness: at("u_softness"),
    iterations: at("u_iterations"),
  };

  const palette = new Float32Array(MAX_SHADER_COLORS * 3);

  return {
    canvas,
    draw(field, phase, width, height) {
      const w = Math.max(1, Math.round(width));
      const h = Math.max(1, Math.round(height));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      gl.viewport(0, 0, w, h);

      const colors = field.colors.slice(0, MAX_SHADER_COLORS);
      palette.fill(0);
      colors.forEach((hex, i) => palette.set(hexChannels(hex), i * 3));

      gl.uniform2f(u.resolution, w, h);
      gl.uniform1f(u.phase, phase);
      gl.uniform3fv(u.colors, palette);
      gl.uniform1i(u.count, colors.length);
      gl.uniform1f(u.distortion, field.distortion);
      gl.uniform1f(u.swirl, field.swirl);
      gl.uniform1f(u.pace, field.pace);

      if (field.kind === "flow") {
        gl.uniform1i(u.kind, 0);
        gl.uniform1f(u.seed, field.seed);
      } else {
        gl.uniform1i(u.kind, 1);
        gl.uniform1i(u.shape, SHAPES[field.shape]);
        gl.uniform1f(u.scale, field.scale);
        gl.uniform1f(u.rotation, (field.rotation * Math.PI) / 180);
        gl.uniform1f(u.shapeScale, field.shapeScale);
        gl.uniform1f(u.proportion, field.proportion);
        gl.uniform1f(u.softness, field.softness);
        gl.uniform1i(u.iterations, field.iterations);
      }

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

function link(gl: WebGL2RenderingContext): WebGLProgram | null {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  };
  const vertex = compile(gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
  if (!vertex || !fragment) return null;

  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

let supported: boolean | null = null;

/**
 * Whether this browser can draw a moving background, asked once.
 *
 * Asked of an `OffscreenCanvas`, since that is what the encode draws on inside
 * its worker: a browser with WebGL2 on the page but not off it would preview
 * motion it cannot export. Where the answer is no, a moving preset shows its
 * CSS stand-in everywhere, so the preview never promises what the file lacks.
 */
export function shaderSupported(): boolean {
  if (supported !== null) return supported;
  if (typeof OffscreenCanvas === "undefined") return (supported = false);
  const renderer = createShaderRenderer(new OffscreenCanvas(1, 1));
  renderer?.dispose();
  return (supported = renderer !== null);
}

/**
 * One renderer shared by every swatch in the picker.
 *
 * A browser allows a handful of live WebGL contexts and drops the oldest past
 * that, so a context per swatch would lose most of them. Each swatch draws
 * here and copies the frame onto its own 2D canvas.
 */
let shared: ShaderRenderer | null | undefined;

export function sharedRenderer(): ShaderRenderer | null {
  if (shared !== undefined) return shared;
  shared =
    typeof OffscreenCanvas === "undefined"
      ? null
      : createShaderRenderer(new OffscreenCanvas(1, 1));
  return shared;
}
