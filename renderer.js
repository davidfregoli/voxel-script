// Zero-dependency WebGL2 Diorama Engine
// Features:
//  - 2048x2048 directional sun PCF soft shadow mapping
//  - Exact per-vertex 4-corner voxel ambient occlusion + micro-chamfer edge highlight
//  - Automatic dynamic point lights from .vox emissive clusters
//  - Additive soft glow halos for glowing lanterns, windows, signs & crystals
//  - Shadow-catching floating studio ground disc
//  - Live Z-slice layer scrubbing (uMaxZ)
//  - Smooth Perspective <-> Orthographic camera with inertial orbit & 4-angle isometric snap

export const MOODS = {
  day: {
    label: 'Day',
    sunAz: -38,
    sunEl: 54,
    sunColor: [1.08, 1.03, 0.94],
    sunStrength: 1.08,
    skyColor: [0.56, 0.72, 0.94],
    groundColor: [0.24, 0.22, 0.25],
    ambientStrength: 0.46,
    rimColor: [0.46, 0.64, 0.88],
    rimStrength: 0.18,
    pointLightBoost: 0.42,
    haloBoost: 0.45,
    bgTop: '#24344d',
    bgBottom: '#151c29',
    shadowTint: [0.07, 0.10, 0.16],
    shadowAlpha: 0.36,
  },
  golden: {
    label: 'Golden',
    sunAz: -62,
    sunEl: 28,
    sunColor: [1.26, 0.84, 0.48],
    sunStrength: 1.15,
    skyColor: [0.48, 0.40, 0.66],
    groundColor: [0.28, 0.17, 0.14],
    ambientStrength: 0.40,
    rimColor: [0.95, 0.56, 0.34],
    rimStrength: 0.26,
    pointLightBoost: 0.78,
    haloBoost: 0.78,
    bgTop: '#31233c',
    bgBottom: '#17121e',
    shadowTint: [0.10, 0.06, 0.12],
    shadowAlpha: 0.42,
  },
  dusk: {
    label: 'Dusk',
    sunAz: -28,
    sunEl: 34,
    sunColor: [0.84, 0.76, 1.02],
    sunStrength: 0.68,
    skyColor: [0.30, 0.40, 0.66],
    groundColor: [0.14, 0.16, 0.26],
    ambientStrength: 0.42,
    rimColor: [0.54, 0.74, 0.98],
    rimStrength: 0.24,
    pointLightBoost: 1.18,
    haloBoost: 1.05,
    bgTop: '#1d2740',
    bgBottom: '#101422',
    shadowTint: [0.05, 0.07, 0.14],
    shadowAlpha: 0.44,
  },
  night: {
    label: 'Night',
    sunAz: 35,
    sunEl: 46,
    sunColor: [0.46, 0.62, 0.96],
    sunStrength: 0.46,
    skyColor: [0.16, 0.24, 0.44],
    groundColor: [0.07, 0.08, 0.14],
    ambientStrength: 0.34,
    rimColor: [0.32, 0.52, 0.88],
    rimStrength: 0.22,
    pointLightBoost: 1.68,
    haloBoost: 1.38,
    bgTop: '#101627',
    bgBottom: '#080b14',
    shadowTint: [0.02, 0.04, 0.09],
    shadowAlpha: 0.48,
  },
}

// --- Minimal column-major 4x4 matrix math (Z up) ---
function mat4Identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
}
function mat4Mul(a, b) {
  const out = new Float32Array(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3]
    }
  }
  return out
}
function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
function mat4LookAt(eye, target, up) {
  const z = normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]])
  const x = normalize(cross(up, z))
  const y = cross(z, x)
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ])
}
function mat4Perspective(fovRad, aspect, near, far) {
  const f = 1 / Math.tan(fovRad / 2)
  const nf = 1 / (near - far)
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ])
}
function mat4Ortho(l, r, b, t, n, f) {
  const lr = 1 / (l - r), bt = 1 / (b - t), nf = 1 / (n - f)
  return new Float32Array([
    -2 * lr, 0, 0, 0,
    0, -2 * bt, 0, 0,
    0, 0, 2 * nf, 0,
    (l + r) * lr, (t + b) * bt, (f + n) * nf, 1,
  ])
}
function dirFromAzEl(azDeg, elDeg) {
  const az = (azDeg * Math.PI) / 180
  const el = (elDeg * Math.PI) / 180
  // Matches voxel-script/render.mjs exactly: az=0 looks from -Y, +az moves toward +X
  return [Math.cos(el) * Math.sin(az), -Math.cos(el) * Math.cos(az), Math.sin(el)]
}

// --- GLSL Shaders ---
const SHADOW_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
uniform mat4 uLightVP;
uniform float uMaxZ;
out float vWorldZ;
void main() {
  vWorldZ = aPos.z;
  gl_Position = uLightVP * vec4(aPos, 1.0);
}
`
const SHADOW_FS = `#version 300 es
precision highp float;
in float vWorldZ;
uniform float uMaxZ;
void main() {
  if (vWorldZ > uMaxZ + 0.001) discard;
}
`

const VOXEL_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNorm;
layout(location = 2) in vec3 aColor;
layout(location = 3) in vec2 aUv;
layout(location = 4) in float aAo;
layout(location = 5) in float aEmissive;

uniform mat4 uViewProj;
uniform mat4 uLightVP;

out vec3 vPos;
out vec3 vNorm;
out vec3 vColor;
out vec2 vUv;
out float vAo;
out float vEmissive;
out vec4 vLightPos;

void main() {
  vPos = aPos;
  vNorm = aNorm;
  vColor = aColor;
  vUv = aUv;
  vAo = aAo;
  vEmissive = aEmissive;
  vLightPos = uLightVP * vec4(aPos + aNorm * 0.24, 1.0);
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`

const VOXEL_FS = `#version 300 es
precision highp float;

in vec3 vPos;
in vec3 vNorm;
in vec3 vColor;
in vec2 vUv;
in float vAo;
in float vEmissive;
in vec4 vLightPos;

uniform sampler2D uShadowMap;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunStrength;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform float uAmbientStrength;
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform float uPointBoost;
uniform float uMaxZ;
uniform float uTime;
uniform int uLightCount;
uniform vec4 uLightPosRad[8];
uniform vec4 uLightColStr[8];

out vec4 fragColor;

vec3 toLinear(vec3 c) {
  return pow(max(c, vec3(0.0)), vec3(2.2));
}
vec3 toSrgb(vec3 c) {
  return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
}
vec3 acesTone(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float calcShadow(vec4 lp, float ndl) {
  vec3 proj = lp.xyz / lp.w * 0.5 + 0.5;
  if (proj.x < 0.0 || proj.x > 1.0 || proj.y < 0.0 || proj.y > 1.0 || proj.z > 1.0) return 1.0;
  float bias = max(0.0014 * (1.0 - ndl), 0.0007);
  vec2 texel = 1.0 / vec2(textureSize(uShadowMap, 0));
  float lit = 0.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      float depth = texture(uShadowMap, proj.xy + vec2(dx, dy) * texel * 1.15).r;
      lit += (proj.z - bias <= depth) ? 1.0 : 0.0;
    }
  }
  return lit / 9.0;
}

void main() {
  if (vPos.z > uMaxZ + 0.001) discard;

  vec3 albedo = toLinear(vColor);
  vec3 n = normalize(vNorm);

  // Subtle tactile micro-bevel along each voxel face edge (makes voxels look handcrafted!)
  vec2 edge = min(vUv, 1.0 - vUv);
  float edgeDist = min(edge.x, edge.y);
  float bevel = smoothstep(0.0, 0.11, edgeDist);
  float edgeSheen = mix(1.045, 1.0, bevel);

  if (vEmissive > 0.5) {
    float pulse = 0.94 + 0.08 * sin(uTime * 2.6 + vPos.x * 0.25 + vPos.y * 0.3);
    vec3 glow = albedo * 1.55 * pulse;
    fragColor = vec4(toSrgb(acesTone(glow)), 1.0);
    return;
  }

  // Directional sunlight + PCF soft shadow
  float ndl = max(dot(n, uSunDir), 0.0);
  float shadow = ndl > 0.0 ? calcShadow(vLightPos, ndl) : 0.0;
  // Soften shadow floor slightly so shadows feel rich, not pitch black
  float litFactor = mix(0.06, 1.0, shadow);

  // Hemisphere sky/ground ambient + subtle face-direction warmth
  float hemi = n.z * 0.5 + 0.5;
  vec3 ambient = mix(uGroundColor, uSkyColor, hemi) * uAmbientStrength;

  // Back/side rim light for toy-diorama silhouette separation
  vec3 viewDir = normalize(uCamPos - vPos);
  float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 2.2) * (0.4 + 0.6 * hemi);
  vec3 rimLight = uRimColor * rim * uRimStrength;

  // Dynamic point lights extracted automatically from .vox emissive clusters
  vec3 pointAccum = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    if (i >= uLightCount) break;
    vec3 toL = uLightPosRad[i].xyz - vPos;
    float dist = length(toL);
    float rad = uLightPosRad[i].w;
    if (dist < rad) {
      vec3 ldir = toL / max(dist, 0.001);
      float att = pow(1.0 - dist / rad, 2.0);
      // Wrap diffuse slightly so lantern light wraps warmly onto adjacent voxel edges
      float wrap = max((dot(n, ldir) + 0.35) / 1.35, 0.0);
      pointAccum += toLinear(uLightColStr[i].rgb) * uLightColStr[i].w * att * wrap * uPointBoost;
    }
  }

  vec3 direct = uSunColor * (ndl * litFactor * uSunStrength);
  vec3 color = albedo * (ambient * vAo + direct * mix(0.55, 1.0, vAo) + pointAccum * mix(0.65, 1.0, vAo) + rimLight * vAo);
  color *= edgeSheen;

  // Highlight cut plane gently when user is scrubbing the Z-slice slider
  if (abs(vPos.z - uMaxZ) < 0.08 && uMaxZ < 63.5) {
    color += vec3(0.08, 0.14, 0.18);
  }

  fragColor = vec4(toSrgb(acesTone(color)), 1.0);
}
`

const GROUND_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
uniform mat4 uViewProj;
uniform mat4 uLightVP;
uniform float uRadius;
out vec2 vLocal;
out vec4 vLightPos;
void main() {
  vLocal = aPos;
  vec3 wp = vec3(aPos * uRadius, -0.04);
  vLightPos = uLightVP * vec4(wp, 1.0);
  gl_Position = uViewProj * vec4(wp, 1.0);
}
`

const GROUND_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec4 vLightPos;
uniform sampler2D uShadowMap;
uniform vec3 uShadowTint;
uniform float uShadowAlpha;
out vec4 fragColor;

void main() {
  float r = length(vLocal);
  if (r > 1.0) discard;
  float radialFade = smoothstep(1.0, 0.25, r);

  // Soft shadow cast onto the invisible studio floor
  vec3 proj = vLightPos.xyz / vLightPos.w * 0.5 + 0.5;
  float shadow = 0.0;
  if (proj.x > 0.0 && proj.x < 1.0 && proj.y > 0.0 && proj.y < 1.0 && proj.z <= 1.0) {
    vec2 texel = 1.0 / vec2(textureSize(uShadowMap, 0));
    float occ = 0.0;
    for (int dy = -2; dy <= 2; dy++) {
      for (int dx = -2; dx <= 2; dx++) {
        float d = texture(uShadowMap, proj.xy + vec2(dx, dy) * texel * 1.4).r;
        occ += (proj.z - 0.0015 > d) ? 1.0 : 0.0;
      }
    }
    shadow = occ / 25.0;
  }

  // Subtle ambient contact pool right under the diorama base
  float contact = smoothstep(0.68, 0.12, r) * 0.22;
  float alpha = (shadow * uShadowAlpha + contact) * radialFade;
  fragColor = vec4(uShadowTint, alpha);
}
`

const SPRITE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aCenter;
layout(location = 1) in vec4 aColorAlpha;
layout(location = 2) in float aSize;

uniform mat4 uViewProj;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uShape; // 0 = soft radial halo, 1 = crisp voxel particle

out vec2 vQuad;
out vec4 vColor;
out float vShape;

void main() {
  int vid = gl_VertexID % 6;
  vec2 offsets[6] = vec2[6](
    vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(1.0, 1.0),
    vec2(-1.0, -1.0), vec2(1.0, 1.0), vec2(-1.0, 1.0)
  );
  vec2 q = offsets[vid];
  vQuad = q;
  vColor = aColorAlpha;
  vShape = uShape;
  vec3 wp = aCenter + (uRight * q.x + uUp * q.y) * aSize;
  gl_Position = uViewProj * vec4(wp, 1.0);
}
`

const SPRITE_FS = `#version 300 es
precision highp float;
in vec2 vQuad;
in vec4 vColor;
in float vShape;
out vec4 fragColor;

void main() {
  if (vShape < 0.5) {
    // Dreamy radial glow halo
    float d = length(vQuad);
    if (d > 1.0) discard;
    float falloff = pow(1.0 - d, 2.4);
    fragColor = vec4(vColor.rgb * falloff, vColor.a * falloff);
  } else {
    // Crisp soft-edged voxel particle
    float edge = max(abs(vQuad.x), abs(vQuad.y));
    float a = smoothstep(1.0, 0.55, edge) * vColor.a;
    if (a < 0.01) discard;
    fragColor = vec4(vColor.rgb, a);
  }
}
`

function compileShader(gl, type, src) {
  const s = gl.createShader(type)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('Shader compile error: ' + gl.getShaderInfoLog(s))
  }
  return s
}

function createProgram(gl, vsSrc, fsSrc) {
  const p = gl.createProgram()
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vsSrc))
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fsSrc))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('Program link error: ' + gl.getProgramInfoLog(p))
  }
  return p
}

export class VoxelRenderer {
  constructor(canvas) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: false })
    if (!gl) throw new Error('WebGL2 is required to view interactive 3D dioramas')
    this.gl = gl

    // Programs
    this.shadowProg = createProgram(gl, SHADOW_VS, SHADOW_FS)
    this.voxelProg = createProgram(gl, VOXEL_VS, VOXEL_FS)
    this.groundProg = createProgram(gl, GROUND_VS, GROUND_FS)
    this.spriteProg = createProgram(gl, SPRITE_VS, SPRITE_FS)

    // Shadow map FBO (2048x2048 depth texture)
    this.shadowSize = 2048
    this.shadowTex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, this.shadowSize, this.shadowSize, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    this.shadowFbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0)
    gl.drawBuffers([gl.NONE])
    gl.readBuffer(gl.NONE)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    // Ground quad VAO
    this.groundVao = gl.createVertexArray()
    gl.bindVertexArray(this.groundVao)
    const gBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, gBuf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    // Dynamic sprite buffer VAO (for halos + ambient voxel particles)
    this.maxSprites = 256
    this.spriteData = new Float32Array(this.maxSprites * 6 * 8) // 6 verts * (3 pos + 4 rgba + 1 size)
    this.spriteVao = gl.createVertexArray()
    gl.bindVertexArray(this.spriteVao)
    this.spriteVbo = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteVbo)
    gl.bufferData(gl.ARRAY_BUFFER, this.spriteData.byteLength, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 12)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 28)
    gl.bindVertexArray(null)

    // Voxel mesh VAO/VBO/IBO
    this.meshVao = null
    this.meshVbo = null
    this.meshIbo = null
    this.mesh = null
    this.particles = null

    // Camera state (damped target -> current)
    this.cam = {
      az: 40, el: 32, dist: 120, zoom: 1.0,
      targetAz: 40, targetEl: 32, targetZoom: 1.0,
      panX: 0, panY: 0, panZ: 22,
      targetPanX: 0, targetPanY: 0, targetPanZ: 22,
      ortho: false,
      autoRotate: true,
    }
    this.moodName = 'day'
    this.mood = this.cloneMood(MOODS.day)
    this.targetMood = MOODS.day
    this.maxZ = 64
    this.showParticles = true
    this.sunAzOffset = 0
  }

  cloneMood(m) {
    return {
      sunAz: m.sunAz,
      sunEl: m.sunEl,
      sunColor: [...m.sunColor],
      sunStrength: m.sunStrength,
      skyColor: [...m.skyColor],
      groundColor: [...m.groundColor],
      ambientStrength: m.ambientStrength,
      rimColor: [...m.rimColor],
      rimStrength: m.rimStrength,
      pointLightBoost: m.pointLightBoost,
      haloBoost: m.haloBoost,
      shadowTint: [...m.shadowTint],
      shadowAlpha: m.shadowAlpha,
    }
  }

  setMood(name) {
    if (!MOODS[name]) return
    this.moodName = name
    this.targetMood = MOODS[name]
  }

  setMesh(mesh, particleSystem = null, cameraPreset = null) {
    const gl = this.gl
    if (this.meshVao) gl.deleteVertexArray(this.meshVao)
    if (this.meshVbo) gl.deleteBuffer(this.meshVbo)
    if (this.meshIbo) gl.deleteBuffer(this.meshIbo)

    this.mesh = mesh
    this.particles = particleSystem
    this.maxZ = mesh.bounds.sz

    this.meshVao = gl.createVertexArray()
    gl.bindVertexArray(this.meshVao)

    this.meshVbo = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshVbo)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW)

    this.meshIbo = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.meshIbo)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW)

    const stride = 13 * 4
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0)  // pos
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12) // norm
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24) // color
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36) // uv
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 44) // ao
    gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 48) // emissive
    gl.bindVertexArray(null)

    const { sz, radius } = mesh.bounds
    this.cam.dist = radius * 3.18
    this.cam.targetPanX = 0
    this.cam.targetPanY = 0
    this.cam.targetPanZ = sz * 0.34
    if (cameraPreset) {
      this.cam.targetAz = cameraPreset.az ?? 40
      this.cam.targetEl = cameraPreset.el ?? 32
      this.cam.targetZoom = cameraPreset.zoom ?? 1.0
    }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr))
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr))
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
  }

  step(dt, time) {
    // Smooth mood interpolation
    const t = 1 - Math.exp(-dt * 5.0)
    const lerp = (a, b) => a + (b - a) * t
    const lerp3 = (a, b) => [lerp(a[0], b[0]), lerp(a[1], b[1]), lerp(a[2], b[2])]
    const m = this.mood, tm = this.targetMood
    m.sunAz = lerp(m.sunAz, tm.sunAz)
    m.sunEl = lerp(m.sunEl, tm.sunEl)
    m.sunColor = lerp3(m.sunColor, tm.sunColor)
    m.sunStrength = lerp(m.sunStrength, tm.sunStrength)
    m.skyColor = lerp3(m.skyColor, tm.skyColor)
    m.groundColor = lerp3(m.groundColor, tm.groundColor)
    m.ambientStrength = lerp(m.ambientStrength, tm.ambientStrength)
    m.rimColor = lerp3(m.rimColor, tm.rimColor)
    m.rimStrength = lerp(m.rimStrength, tm.rimStrength)
    m.pointLightBoost = lerp(m.pointLightBoost, tm.pointLightBoost)
    m.haloBoost = lerp(m.haloBoost, tm.haloBoost)
    m.shadowTint = lerp3(m.shadowTint, tm.shadowTint)
    m.shadowAlpha = lerp(m.shadowAlpha, tm.shadowAlpha)

    // Smooth camera orbit damping + turntable auto-rotation
    if (this.cam.autoRotate) {
      this.cam.targetAz += dt * 7.5
    }
    const ct = 1 - Math.exp(-dt * 9.5)
    this.cam.az += (this.cam.targetAz - this.cam.az) * ct
    this.cam.el += (this.cam.targetEl - this.cam.el) * ct
    this.cam.zoom += (this.cam.targetZoom - this.cam.zoom) * ct
    this.cam.panX += (this.cam.targetPanX - this.cam.panX) * ct
    this.cam.panY += (this.cam.targetPanY - this.cam.panY) * ct
    this.cam.panZ += (this.cam.targetPanZ - this.cam.panZ) * ct

    if (this.particles && this.showParticles) {
      this.particles.update(dt, time)
    }
  }

  render(time) {
    this.resize()
    const gl = this.gl
    const w = this.canvas.width, h = this.canvas.height
    gl.viewport(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    if (!this.mesh) return

    const { radius, sz } = this.mesh.bounds
    const sunDir = normalize(dirFromAzEl(this.mood.sunAz + this.sunAzOffset, this.mood.sunEl))
    const target = [this.cam.panX, this.cam.panY, this.cam.panZ]

    // Light orthographic frustum tightly framing the diorama
    const sunCenter = [0, 0, sz * 0.4]
    const sunEye = [
      sunCenter[0] + sunDir[0] * radius * 2.6,
      sunCenter[1] + sunDir[1] * radius * 2.6,
      sunCenter[2] + sunDir[2] * radius * 2.6,
    ]
    const lightView = mat4LookAt(sunEye, sunCenter, [0, 0, 1])
    const sExt = radius * 1.32
    const lightProj = mat4Ortho(-sExt, sExt, -sExt, sExt, 4, radius * 5.6)
    const lightVP = mat4Mul(lightProj, lightView)

    // --- PASS 1: Directional Sun Shadow Map ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo)
    gl.viewport(0, 0, this.shadowSize, this.shadowSize)
    gl.clear(gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.CULL_FACE)
    gl.cullFace(gl.BACK)
    gl.useProgram(this.shadowProg)
    gl.uniformMatrix4fv(gl.getUniformLocation(this.shadowProg, 'uLightVP'), false, lightVP)
    gl.uniform1f(gl.getUniformLocation(this.shadowProg, 'uMaxZ'), this.maxZ)
    gl.bindVertexArray(this.meshVao)
    gl.drawElements(gl.TRIANGLES, this.mesh.indexCount, gl.UNSIGNED_INT, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    // --- Camera matrices ---
    const aspect = w / h
    const camDir = dirFromAzEl(this.cam.az, this.cam.el)
    const camDist = this.cam.dist / this.cam.zoom
    const camPos = [
      target[0] + camDir[0] * camDist,
      target[1] + camDir[1] * camDist,
      target[2] + camDir[2] * camDist,
    ]
    const view = mat4LookAt(camPos, target, [0, 0, 1])
    let proj
    if (this.cam.ortho) {
      const halfH = (radius * 1.42) / this.cam.zoom
      const halfW = halfH * aspect
      proj = mat4Ortho(-halfW, halfW, -halfH, halfH, -radius * 6, radius * 8)
    } else {
      proj = mat4Perspective((34 * Math.PI) / 180, aspect, 1.0, radius * 14)
    }
    const viewProj = mat4Mul(proj, view)

    // Extract camera right & up vectors for billboarding sprites/halos
    const camRight = [view[0], view[4], view[8]]
    const camUp = [view[1], view[5], view[9]]

    // --- PASS 2: Shadow-Catching Studio Ground Disc ---
    gl.viewport(0, 0, w, h)
    gl.enable(gl.DEPTH_TEST)
    gl.depthMask(false)
    gl.disable(gl.CULL_FACE)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(this.groundProg)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex)
    gl.uniform1i(gl.getUniformLocation(this.groundProg, 'uShadowMap'), 0)
    gl.uniformMatrix4fv(gl.getUniformLocation(this.groundProg, 'uViewProj'), false, viewProj)
    gl.uniformMatrix4fv(gl.getUniformLocation(this.groundProg, 'uLightVP'), false, lightVP)
    gl.uniform1f(gl.getUniformLocation(this.groundProg, 'uRadius'), radius * 1.65)
    gl.uniform3fv(gl.getUniformLocation(this.groundProg, 'uShadowTint'), this.mood.shadowTint)
    gl.uniform1f(gl.getUniformLocation(this.groundProg, 'uShadowAlpha'), this.mood.shadowAlpha)
    gl.bindVertexArray(this.groundVao)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    // --- PASS 3: Main Lit Voxel Diorama ---
    gl.depthMask(true)
    gl.disable(gl.BLEND)
    gl.enable(gl.CULL_FACE)
    gl.cullFace(gl.BACK)
    gl.useProgram(this.voxelProg)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex)
    gl.uniform1i(gl.getUniformLocation(this.voxelProg, 'uShadowMap'), 0)
    gl.uniformMatrix4fv(gl.getUniformLocation(this.voxelProg, 'uViewProj'), false, viewProj)
    gl.uniformMatrix4fv(gl.getUniformLocation(this.voxelProg, 'uLightVP'), false, lightVP)
    gl.uniform3fv(gl.getUniformLocation(this.voxelProg, 'uCamPos'), camPos)
    gl.uniform3fv(gl.getUniformLocation(this.voxelProg, 'uSunDir'), sunDir)
    gl.uniform3fv(gl.getUniformLocation(this.voxelProg, 'uSunColor'), this.mood.sunColor)
    gl.uniform1f(gl.getUniformLocation(this.voxelProg, 'uSunStrength'), this.mood.sunStrength)
    gl.uniform3fv(gl.getUniformLocation(this.voxelProg, 'uSkyColor'), this.mood.skyColor)
    gl.uniform3fv(gl.getUniformLocation(this.voxelProg, 'uGroundColor'), this.mood.groundColor)
    gl.uniform1f(gl.getUniformLocation(this.voxelProg, 'uAmbientStrength'), this.mood.ambientStrength)
    gl.uniform3fv(gl.getUniformLocation(this.voxelProg, 'uRimColor'), this.mood.rimColor)
    gl.uniform1f(gl.getUniformLocation(this.voxelProg, 'uRimStrength'), this.mood.rimStrength)
    gl.uniform1f(gl.getUniformLocation(this.voxelProg, 'uPointBoost'), this.mood.pointLightBoost)
    gl.uniform1f(gl.getUniformLocation(this.voxelProg, 'uMaxZ'), this.maxZ)
    gl.uniform1f(gl.getUniformLocation(this.voxelProg, 'uTime'), time)

    // Upload automatic emissive cluster point lights
    const posRad = new Float32Array(8 * 4)
    const colStr = new Float32Array(8 * 4)
    const activeLights = this.mesh.lights.filter((l) => l.pos[2] <= this.maxZ + 0.5)
    for (let i = 0; i < activeLights.length; i++) {
      const l = activeLights[i]
      posRad.set([l.pos[0], l.pos[1], l.pos[2], l.radius], i * 4)
      const shimmer = 0.92 + 0.1 * Math.sin(time * 3.1 + i * 1.9)
      colStr.set([l.color[0], l.color[1], l.color[2], l.strength * shimmer], i * 4)
    }
    gl.uniform1i(gl.getUniformLocation(this.voxelProg, 'uLightCount'), activeLights.length)
    gl.uniform4fv(gl.getUniformLocation(this.voxelProg, 'uLightPosRad'), posRad)
    gl.uniform4fv(gl.getUniformLocation(this.voxelProg, 'uLightColStr'), colStr)

    gl.bindVertexArray(this.meshVao)
    gl.drawElements(gl.TRIANGLES, this.mesh.indexCount, gl.UNSIGNED_INT, 0)

    // --- PASS 4: Additive Soft Emissive Glow Halos ---
    if (activeLights.length > 0 && this.mood.haloBoost > 0.05) {
      let ptr = 0
      let count = 0
      const fwd = normalize([camPos[0] - target[0], camPos[1] - target[1], camPos[2] - target[2]])
      for (let i = 0; i < activeLights.length; i++) {
        const l = activeLights[i]
        const pulse = 0.92 + 0.1 * Math.sin(time * 2.4 + i * 1.7)
        const alpha = Math.min(0.42, 0.17 * this.mood.haloBoost * l.strength * pulse)
        const cx = l.pos[0] + fwd[0] * 2.2
        const cy = l.pos[1] + fwd[1] * 2.2
        const cz = l.pos[2] + fwd[2] * 2.2
        const szHalo = l.haloSize * (0.85 + 0.2 * this.mood.haloBoost)
        for (let k = 0; k < 6; k++) {
          this.spriteData[ptr++] = cx
          this.spriteData[ptr++] = cy
          this.spriteData[ptr++] = cz
          this.spriteData[ptr++] = l.color[0]
          this.spriteData[ptr++] = l.color[1]
          this.spriteData[ptr++] = l.color[2]
          this.spriteData[ptr++] = alpha
          this.spriteData[ptr++] = szHalo
        }
        count++
      }
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
      gl.depthMask(false)
      gl.disable(gl.CULL_FACE)
      gl.useProgram(this.spriteProg)
      gl.uniformMatrix4fv(gl.getUniformLocation(this.spriteProg, 'uViewProj'), false, viewProj)
      gl.uniform3fv(gl.getUniformLocation(this.spriteProg, 'uRight'), camRight)
      gl.uniform3fv(gl.getUniformLocation(this.spriteProg, 'uUp'), camUp)
      gl.uniform1f(gl.getUniformLocation(this.spriteProg, 'uShape'), 0.0)
      gl.bindVertexArray(this.spriteVao)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteVbo)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.spriteData.subarray(0, ptr))
      gl.drawArrays(gl.TRIANGLES, 0, count * 6)
    }

    // --- PASS 5: Living Ambient Voxel Particles ---
    if (this.showParticles && this.particles && this.particles.particles.length > 0) {
      let ptr = 0
      let count = 0
      for (const p of this.particles.particles) {
        if (count >= this.maxSprites) break
        if (p.z > this.maxZ + 18) continue
        const a = p.liveAlpha ?? p.alpha
        if (a <= 0.01) continue
        for (let k = 0; k < 6; k++) {
          this.spriteData[ptr++] = p.x
          this.spriteData[ptr++] = p.y
          this.spriteData[ptr++] = p.z
          this.spriteData[ptr++] = p.color[0]
          this.spriteData[ptr++] = p.color[1]
          this.spriteData[ptr++] = p.color[2]
          this.spriteData[ptr++] = a
          this.spriteData[ptr++] = p.size * 0.5
        }
        count++
      }
      if (count > 0) {
        const additive = this.particles.preset === 'fireflies' || this.particles.preset === 'stardust'
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.SRC_ALPHA, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA)
        gl.depthMask(false)
        gl.disable(gl.CULL_FACE)
        gl.useProgram(this.spriteProg)
        gl.uniformMatrix4fv(gl.getUniformLocation(this.spriteProg, 'uViewProj'), false, viewProj)
        gl.uniform3fv(gl.getUniformLocation(this.spriteProg, 'uRight'), camRight)
        gl.uniform3fv(gl.getUniformLocation(this.spriteProg, 'uUp'), camUp)
        gl.uniform1f(gl.getUniformLocation(this.spriteProg, 'uShape'), 1.0)
        gl.bindVertexArray(this.spriteVao)
        gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteVbo)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.spriteData.subarray(0, ptr))
        gl.drawArrays(gl.TRIANGLES, 0, count * 6)
      }
    }

    gl.depthMask(true)
    gl.disable(gl.BLEND)
  }
}
