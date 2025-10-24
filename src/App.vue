<template>
  <div class="panel">
  <h2>Particles</h2>

  <label>Field
    <select v-model="movementMode">
      <option value="sineflow">Sine Flow</option>
      <option value="swirl">Swirl</option>
      <option value="curlish">Curlish</option>
      <option value="lissajous">Lissajous</option>
      <option value="orbits">Orbits</option>
      <option value="vortexgrid">Vortex Grid</option>
      <option value="doublegyre">Double Gyre</option>
      <option value="shear">Shear</option>
      <option value="hexvortex">Hex Vortex</option>
      <option value="jetstream">Jet Stream</option>
      <option value="galactic">Galactic</option>
      <option value="cellular">Cellular</option>
    </select>
  </label>

  <label>Simulation speed: {{ fmt(simSpeed,2) }}×
    <input type="range" min="0" max="4" step="0.01" v-model.number="simSpeed" />
  </label>

  <label>Fade: {{ fmt(trailFade,2) }}
    <input type="range" min="0" max="0.4" step="0.005" v-model.number="trailFade" />
  </label>

  <label>Active particles: {{ activeCount }}
    <input type="range" :min="1" :max="maxParticles" step="1" v-model.number="activeCount" />
  </label>

  <label>Point scale: {{ fmt(pointScale,2) }}
    <input type="range" min="0.2" max="25" step="0.05" v-model.number="pointScale" />
  </label>

  <div class="row">
    <div><h2>Particle Colors</h2></div>
    <div>
      <label>Color A</label>
      <label>H
        <input type="range" min="0" max="1" step="0.001" v-model.number="hsvStart.h" />
      </label>

      <label>S
        <input type="range" min="0" max="1" step="0.001" v-model.number="hsvStart.s" />
      </label>

      <label>V
        <input type="range" min="0" max="1" step="0.001" v-model.number="hsvStart.v" />
      </label>
    </div>
    <div>
      <label>Color B</label>
      <label>H
        <input type="range" min="0" max="1" step="0.001" v-model.number="hsvEnd.h" />
      </label>

      <label>S
        <input type="range" min="0" max="1" step="0.001" v-model.number="hsvEnd.s" />
      </label>

      <label>V
        <input type="range" min="0" max="1" step="0.001" v-model.number="hsvEnd.v" />
      </label>
    </div>

  </div>

  <div class="bar big" :style="{ background: `linear-gradient(90deg, ${cssStart}, ${cssEnd})` }"></div>
</div>

  <div class="stage full-bleed-stage">
    <!-- three.js renderer draws here -->
    <canvas ref="glCanvas" class="layer"></canvas>
    <!-- 2D lightning overlay -->
    <canvas ref="fxCanvas" class="layer overlay"></canvas>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.162.0/build/three.module.js';
import * as LightningMod from './useLightning.js'

// accept default or named export
const useLightning = LightningMod.default || LightningMod.useLightning || null

// ───────────────── helpers ─────────────────
const fmt = (v, d = 1) => Number((v && v.value !== undefined ? v.value : v) ?? 0).toFixed(d)

function hsvToRgb(h, s, v) {
  if (h > 1) h = (h % 360) / 360
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  let r = 0, g = 0, b = 0
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break
    case 1: r = q; g = v; b = p; break
    case 2: r = p; g = v; b = t; break
    case 3: r = p; g = q; b = v; break
    case 4: r = t; g = p; b = v; break
    case 5: r = v; g = p; b = q; break
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) }
}
const rgbToCss = ({ r, g, b }, a = 1) => `rgba(${r}, ${g}, ${b}, ${a})`
const hsvToCss = (hsv, a = 1) => rgbToCss(hsvToRgb(hsv.h, hsv.s, hsv.v), a)

// ───────────────── reactive state ─────────────────
const movementMode = ref('sineflow')
const particleCount = ref(6000)
const trailFade = ref(0.07)
const pointScale = ref(1.0)

// new UI state
const simSpeed = ref(1.00)         // simulation speed multiplier
const maxParticles = ref(particleCount.value) // total allocated (no rebuild)
const activeCount = ref(particleCount.value)  // how many we simulate/draw now

// hex pickers for endpoints
const colorAhex = ref('#77a8d9')   // close to hsvStart default
const colorBhex = ref('#19ffb2')   // close to hsvEnd default

const minSize  = ref(0.7)
const maxSize  = ref(3.2)
const minSpeed = ref(40)
const maxSpeed = ref(160)
const valueMin = ref(0.85)
const valueMax = ref(1.00)

const hsvStart = ref({ h: 210/360, s: 0.45, v: 0.85 })
const hsvEnd   = ref({ h: 160/360, s: 0.90, v: 1.00 })
const hJitter  = ref(0.03)
const sJitter  = ref(0.05)
const vJitter  = ref(0.08)

const cssStart = computed(() => hsvToCss(hsvStart.value))
const cssEnd   = computed(() => hsvToCss(hsvEnd.value))

watch([minSize, maxSize], ([a,b]) => { if (a > b) [minSize.value, maxSize.value] = [b, a] })
watch([minSpeed, maxSpeed], ([a,b]) => { if (a > b) [minSpeed.value, maxSpeed.value] = [b, a] })
watch([valueMin, valueMax], ([a,b]) => { if (a > b) [valueMin.value, valueMax.value] = [b, a] })

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return { r: 255, g: 255, b: 255 }
  return { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) }
}
function rgbToHsv({r,g,b}) {
  r/=255; g/=255; b/=255
  const M=Math.max(r,g,b), m=Math.min(r,g,b), c=M-m
  let h=0
  if (c) {
    if (M===r) h=((g-b)/c)%6
    else if (M===g) h=(b-r)/c+2
    else h=(r-g)/c+4
    h/=6; if (h<0) h+=1
  }
  const s = M===0 ? 0 : c/M
  const v = M
  return { h, s, v }
}

// ───────────────── DOM refs ─────────────────
const glCanvas = ref(null)
const fxCanvas = ref(null)

// ───────────────── Three.js globals ─────────────────
let renderer, simScene, pointsScene, fsqScene, cameraSim, cameraPoints, cameraFSQ
let posRT = [], accumRT = [], posCur = 0, posNxt = 1, accCur = 0, accNxt = 1
let speedTex, hsvTex
let simMat, fadeMat, presentMat, pointsMat
let indicesAttr, points
let lightning = null
let rafId = 0

// mode map to int
const MODE_MAP = {
  sineflow:0, swirl:1, curlish:2, lissajous:3, orbits:4, vortexgrid:5,
  doublegyre:6, shear:7, hexvortex:8, jetstream:9, galactic:10, cellular:11
}

// DPR sizing
function sizeCanvas(el) {
  const DPR = Math.min(2, window.devicePixelRatio || 1)
  const r = el.getBoundingClientRect()
  el.width  = Math.max(1, Math.floor(r.width  * DPR))
  el.height = Math.max(1, Math.floor(r.height * DPR))
  return { w: el.width, h: el.height, DPR }
}

// ───────────────── shaders (GLSL3) ─────────────────

// fullscreen tri vertex
const FULLQUAD_VERT = /* glsl */`
precision highp float;
const vec2 P[3] = vec2[3]( vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0) );
void main(){ gl_Position = vec4(P[gl_VertexID],0.0,1.0); }`;

// simulation fragment (same fields as your WebGL2 version)
const SIM_FRAG = /* glsl */`
precision highp float;
out vec4 fragColor;
uniform sampler2D uPos;      // previous positions
uniform sampler2D uSpeed;    // speed (r) + size (g)
uniform vec2 uSimTexSize;    // cols, rows
uniform vec2 uWorldSize;     // width, height
uniform vec2 uCenter;        // world center
uniform float uTime;
uniform float uDt;
uniform int uMode;
uniform int uActiveCount;
uniform float uSpeedMul;

vec4 texel1D(sampler2D tex, float idx, vec2 ts){
  float cols = ts.x; float y = floor(idx/cols); float x = idx - y*cols;
  vec2 uv = (vec2(x,y)+0.5)/ts; return texture(tex, uv);
}
vec2 wrapTorus(vec2 p, vec2 wh){ p = mod(p, wh); if(p.x<0.0)p.x+=wh.x; if(p.y<0.0)p.y+=wh.y; return p; }
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.));
  vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

// fields (12)
vec2 field_sineflow(vec2 p, float t, vec2 wh){
  float ax = 6.2831853*(p.y/wh.y) + t*0.35;
  float ay = 6.2831853*(p.x/wh.x) - t*0.27;
  vec2 v = vec2(sin(ax), sin(ay)); float L=length(v); return L>1e-6? v/L : vec2(0);
}
vec2 field_swirl(vec2 p, float t, vec2 wh){
  vec2 d = p - uCenter; float r = length(d)+1e-6; vec2 tang = vec2(-d.y, d.x)/r;
  float wob = 0.7+0.3*sin(t*0.6); return tang*wob;
}
vec2 field_curlish(vec2 p, float t, vec2 wh){
  vec2 q=p/wh*4.0 + vec2(t*0.15, -t*0.11); float a=noise(q)*6.2831853; return vec2(cos(a),sin(a));
}
vec2 field_lissajous(vec2 p, float t, vec2 wh){
  float x=p.x/wh.x, y=p.y/wh.y;
  vec2 v=vec2( sin(6.28318*(3.0*x + 0.5*y + 0.05*sin(t))),
               sin(6.28318*(0.7*x + 2.0*y + 0.08*cos(0.7*t))) );
  float L=length(v); return L>1e-6? v/L : vec2(0);
}
vec2 field_orbits(vec2 p, float t, vec2 wh){
  vec2 c1 = uCenter + vec2(0.25*wh.x*sin(t*0.4), 0.2*wh.y*cos(t*0.31));
  vec2 c2 = uCenter + vec2(0.2*wh.x*cos(t*0.22+2.0), 0.25*wh.y*sin(t*0.29+1.0));
  vec2 d1=p-c1; float r1=length(d1)+1e-4; vec2 v1=vec2(-d1.y,d1.x)/r1;
  vec2 d2=p-c2; float r2=length(d2)+1e-4; vec2 v2=vec2(-d2.y,d2.x)/r2;
  vec2 v=normalize(v1)*0.6 + normalize(v2)*0.4; float L=length(v); return L>1e-6? v/L:vec2(0);
}
vec2 field_vortexgrid(vec2 p, float t, vec2 wh){
  vec2 g=(p/wh)*8.0; vec2 cell=floor(g); vec2 local=fract(g)-0.5;
  float s = mod(cell.x+cell.y,2.0)<1.0 ? 1.0 : -1.0;
  float ang=atan(local.y,local.x) + s*(1.2+0.2*sin(t));
  vec2 v=vec2(-sin(ang),cos(ang)); float L=length(v); return L>1e-6? v/L:vec2(0);
}
vec2 field_doublegyre(vec2 p, float t, vec2 wh){
  float A=0.25*wh.y, w=6.28318/10.0, eps=0.25, a=eps*sin(w*t), b=1.0-2.0*eps;
  float x=p.x/wh.x, y=p.y/wh.y; float f=a*x*x + b*x; float dfdx=2.0*a*x + b;
  float u = -3.14159*A*sin(3.14159*f)*cos(3.14159*y);
  float v =  3.14159*A*cos(3.14159*f)*sin(3.14159*y)*dfdx;
  vec2 vel=vec2(u,v); float L=length(vel); return L>1e-6? vel/L:vec2(0);
}
vec2 field_shear(vec2 p, float t, vec2 wh){
  float y=p.y/wh.y;
  vec2 v=vec2(0.6+0.4*sin(6.28318*y*1.5 + 0.7*t), 0.15*sin(6.28318*(p.x/wh.x*2.0 - 0.2*t)));
  float L=length(v); return L>1e-6? v/L:vec2(0);
}
vec2 field_hexvortex(vec2 p, float t, vec2 wh){
  vec2 q=(p/wh)*6.0; vec2 a=vec2(1.0,0.0); vec2 b=vec2(0.5, 0.8660254*1.1547005);
  vec2 uv=vec2(dot(q,a), dot(q,b)); vec2 cell=floor(uv); vec2 f=fract(uv)-0.5;
  float s=mod(cell.x+cell.y,2.0)<1.0?1.0:-1.0; float ang=atan(f.y,f.x)+s*(1.0+0.15*sin(t));
  vec2 v=vec2(-sin(ang),cos(ang)); float L=length(v); return L>1e-6? v/L:vec2(0);
}
vec2 field_jetstream(vec2 p, float t, vec2 wh){
  float y=p.y/wh.y;
  vec2 v=vec2(0.5+0.5*sin(3.14159*(y*8.0 + 0.25*sin(t*0.6))),
              0.2*sin(3.14159*(p.x/wh.x*2.0 - t*0.3)));
  float L=length(v); return L>1e-6? v/L:vec2(0);
}
vec2 field_galactic(vec2 p, float t, vec2 wh){
  vec2 d=p-uCenter; float r=length(d)+1e-4; float ang=atan(d.y,d.x);
  float arm=0.25*sin(3.0*ang - 0.4*t); vec2 tang=vec2(-d.y,d.x)/r; vec2 radial=normalize(d);
  vec2 v=normalize(tang + radial*arm); return v;
}
vec2 field_cellular(vec2 p, float t, vec2 wh){
  float x=p.x/wh.x*6.28318, y=p.y/wh.y*6.28318;
  vec2 v=vec2(sin(x)*cos(y+0.3*t), -cos(x)*sin(y-0.2*t));
  float L=length(v); return L>1e-6? v/L:vec2(0);
}
vec2 getField(vec2 p,float t,vec2 wh,int m){
  if(m==0) return field_sineflow(p,t,wh);
  if(m==1) return field_swirl(p,t,wh);
  if(m==2) return field_curlish(p,t,wh);
  if(m==3) return field_lissajous(p,t,wh);
  if(m==4) return field_orbits(p,t,wh);
  if(m==5) return field_vortexgrid(p,t,wh);
  if(m==6) return field_doublegyre(p,t,wh);
  if(m==7) return field_shear(p,t,wh);
  if(m==8) return field_hexvortex(p,t,wh);
  if(m==9) return field_jetstream(p,t,wh);
  if(m==10) return field_galactic(p,t,wh);
  return field_cellular(p,t,wh);
}

void main(){
  vec2 frag = gl_FragCoord.xy - 0.5;
  float idx = frag.y * uSimTexSize.x + frag.x;

  vec2 posOld = texel1D(uPos, idx, uSimTexSize).xy;

  // if this texel is beyond activeCount, just pass through previous pos
  if (idx >= float(uActiveCount)) {
    fragColor = vec4(posOld, 0.0, 1.0);
    return;
  }

  float speed = texel1D(uSpeed, idx, uSimTexSize).r;
  vec2 dir = getField(posOld, uTime, uWorldSize, uMode);
  vec2 pos = posOld + dir * speed * uSpeedMul * uDt;
  pos = wrapTorus(pos, uWorldSize);
  fragColor = vec4(pos, 0.0, 1.0);
}`;

// fade trails
const FADE_FRAG = /* glsl */`
precision highp float;
out vec4 fragColor;
uniform sampler2D uAccum;
uniform float uFade;
void main(){
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(uAccum,0));
  vec4 c = texture(uAccum, uv);
  fragColor = c * (1.0 - uFade);
}`;

// present (force opaque)
const PRESENT_FRAG = /* glsl */`
precision highp float;
out vec4 fragColor;
uniform sampler2D uAccum;
void main(){
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(uAccum,0));
  vec3 rgb = texture(uAccum, uv).rgb;
  fragColor = vec4(rgb, 1.0);
}`;

// points: vertex fetches pos + size + hsv; fragment draws soft circle, hsv->rgb
const POINTS_VERT = /* glsl */`
precision highp float;
layout (location=0) in float aIndex;
uniform sampler2D uPos;
uniform sampler2D uSpeed;
uniform sampler2D uHSV;
uniform vec2 uSimTexSize;
uniform vec2 uWorldSize;
uniform float uPointScale;
out vec3 vHSV;
out float vAlpha;

// Map a logical particle idx -> a pseudo-random texel in [0 .. cols*rows-1]
// Uses a low-discrepancy hash (golden ratio) for uniform coverage.
float hash01(float i) {
  // golden ratio conjugate gives great stratified coverage
  return fract(i * 0.6180339887498948482); // φ' = 1/φ ≈ 0.618...
}

vec4 sampleHSVByIndex(sampler2D tex, float idx, vec2 ts) {
  float cols = ts.x, rows = ts.y;
  float N = cols * rows;          // total texels available
  // pick a pseudo-random slot across the whole texture
  float j = floor(hash01(idx) * N);
  float y = floor(j / cols);
  float x = j - y * cols;
  vec2 uv = (vec2(x, y) + 0.5) / ts;
  return texture(tex, uv);
}

vec4 texel1D(sampler2D tex, float idx, vec2 ts){
  float cols=ts.x; float y=floor(idx/cols); float x=idx - y*cols;
  vec2 uv=(vec2(x,y)+0.5)/ts; return texture(tex, uv);
}

void main(){
  float idx=aIndex;
  vec2 pos = texel1D(uPos, idx, uSimTexSize).xy;
  vec4 sp  = texel1D(uSpeed, idx, uSimTexSize);
  vHSV = sampleHSVByIndex(uHSV, idx, uSimTexSize).xyz;
  vAlpha = 0.9;
  vec2 ndc = (pos / uWorldSize)*2.0 - 1.0; ndc.y = -ndc.y;
  gl_PointSize = max(1.0, sp.g * uPointScale);
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

const POINTS_FRAG = /* glsl */`
precision highp float;
in vec3 vHSV;
in float vAlpha;
out vec4 fragColor;

vec3 hsv2rgb(vec3 c){
  vec3 rgb = clamp(abs(mod(c.x*6.0 + vec3(0.0,4.0,2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return c.z * mix(vec3(1.0), rgb, c.y);
}

void main(){
  vec2 p = gl_PointCoord*2.0 - 1.0;
  float r2 = dot(p,p);
  // if (r2 > 1.0) discard;
  float soft = smoothstep(1.0, 0.0, r2);
  vec3 rgb = hsv2rgb(vHSV);
  fragColor = vec4(rgb, 1.0);
}`;

// ───────────────── setup / teardown ─────────────────
function makeDataTextureFloat(data, width, height) {
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType)
  tex.needsUpdate = true
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

function buildThree({ w, h, count }) {
  // renderer
  renderer = new THREE.WebGLRenderer({
    canvas: glCanvas.value,
    alpha: false,
    antialias: false,
    premultipliedAlpha: false
  })
  renderer.setSize(w, h, false)
  renderer.setPixelRatio(1) // already sized in device px
  renderer.autoClear = false
  const gl = renderer.getContext()

  // caps & extensions
  const hasColorBufferFloat = !!renderer.extensions.get('EXT_color_buffer_float')
  const hasFloatBlend = !!renderer.extensions.get('EXT_float_blend')

  // scenes & cameras
  simScene = new THREE.Scene()
  pointsScene = new THREE.Scene()
  fsqScene = new THREE.Scene()

  // fullscreen-quad camera
  cameraFSQ = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  // points render uses NDC positions already; any camera works but we keep an ortho
  cameraPoints = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  cameraSim = cameraFSQ // sim is full-screen

  // grid / indices
  const cols = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / cols)
  const simTexSize = new THREE.Vector2(cols, rows)
  const worldSize = new THREE.Vector2(w, h)

  // init CPU data
  const posInit = new Float32Array(cols*rows*4)
  const spInit  = new Float32Array(cols*rows*4)
  const hsvInit = new Float32Array(cols*rows*4)
  for (let i=0;i<count;i++){
    const x = Math.random()*w
    const y = Math.random()*h
    posInit[i*4+0]=x; posInit[i*4+1]=y; posInit[i*4+2]=0; posInit[i*4+3]=1
    const speed = minSpeed.value + Math.random()*(maxSpeed.value - minSpeed.value)
    const size  = minSize.value  + Math.random()*(maxSize.value  - minSize.value)
    spInit[i*4+0]=speed; spInit[i*4+1]=size; spInit[i*4+2]=0; spInit[i*4+3]=1
    const t = i/(count-1 || 1)
    let hH = hsvStart.value.h + (hsvEnd.value.h - hsvStart.value.h)*t + (Math.random()*2-1)*hJitter.value
    let sS = hsvStart.value.s + (hsvEnd.value.s - hsvStart.value.s)*t + (Math.random()*2-1)*sJitter.value
    let vV = valueMin.value    + (valueMax.value    - valueMin.value)*t + (Math.random()*2-1)*vJitter.value
    hH = hH - Math.floor(hH); sS = Math.max(0, Math.min(1, sS)); vV = Math.max(0, Math.min(1, vV))
    hsvInit[i*4+0]=hH; hsvInit[i*4+1]=sS; hsvInit[i*4+2]=vV; hsvInit[i*4+3]=1
  }

  // textures (speed, hsv as DataTexture; positions as render targets)
  speedTex = makeDataTextureFloat(spInit, cols, rows)
  hsvTex   = makeDataTextureFloat(hsvInit, cols, rows)

  const rtOptsSim = {
    depthBuffer: false,
    stencilBuffer: false,
    type: THREE.FloatType,
    format: THREE.RGBAFormat,
    magFilter: THREE.NearestFilter,
    minFilter: THREE.NearestFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping
  }
  posRT[0] = new THREE.WebGLRenderTarget(cols, rows, rtOptsSim)
  posRT[1] = new THREE.WebGLRenderTarget(cols, rows, rtOptsSim)

  // seed both pos textures
  const seedTex = makeDataTextureFloat(posInit, cols, rows)
  renderer.setRenderTarget(posRT[0]); renderer.clear()
  renderer.setRenderTarget(posRT[1]); renderer.clear()
  // a tiny single-use shader to blit seedTex into both RTs
  const seedMat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: FULLQUAD_VERT,
    fragmentShader: /* glsl */`
    precision highp float; out vec4 fc; uniform sampler2D uTex;
    void main(){ vec2 uv = gl_FragCoord.xy / vec2(textureSize(uTex,0)); fc = texture(uTex, uv); }`,
    uniforms: { uTex: { value: seedTex } }
  })
  const fsqGeo = new THREE.BufferGeometry()
  fsqGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([
      -1, -1, 0,
      3, -1, 0,
      -1,  3, 0
    ]), 3)
  )
  const fsqSeed = new THREE.Mesh(fsqGeo, seedMat); simScene.add(fsqSeed)
  renderer.setRenderTarget(posRT[0]); renderer.render(simScene, cameraSim)
  renderer.setRenderTarget(posRT[1]); renderer.render(simScene, cameraSim)
  simScene.remove(fsqSeed); seedMat.dispose(); seedTex.dispose()

  // accum ping-pong (float if float blend available, else RGBA8)
  const accumType = hasFloatBlend ? THREE.FloatType : THREE.UnsignedByteType
  const rtOptsAccum = {
    depthBuffer: false, stencilBuffer:false,
    type: accumType, format: THREE.RGBAFormat,
    magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter,
    wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping
  }
  accumRT[0] = new THREE.WebGLRenderTarget(w, h, rtOptsAccum)
  accumRT[1] = new THREE.WebGLRenderTarget(w, h, rtOptsAccum)
  renderer.setRenderTarget(accumRT[0]); renderer.clearColor(); renderer.clear(true, true, true)
  renderer.setRenderTarget(accumRT[1]); renderer.clearColor(); renderer.clear(true, true, true)

  // materials
  simMat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: FULLQUAD_VERT,
    fragmentShader: SIM_FRAG,
    uniforms: {
      uPos: { value: posRT[posCur].texture },
      uSpeed: { value: speedTex },
      uSimTexSize: { value: simTexSize },
      uWorldSize: { value: worldSize },
      uCenter: { value: new THREE.Vector2(w*0.5, h*0.5) },
      uTime: { value: 0 },
      uDt: { value: 0 },
      uMode: { value: MODE_MAP[movementMode.value] ?? 0 },
      uActiveCount: { value: activeCount.value },
      uSpeedMul: { value: simSpeed.value },
    },
    depthTest: false, depthWrite: false
  })

  fadeMat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: FULLQUAD_VERT,
    fragmentShader: FADE_FRAG,
    uniforms: {
      uAccum: { value: accumRT[accCur].texture },
      uFade: { value: trailFade.value }
    },
    depthTest: false, depthWrite: false, transparent: false
  })

  presentMat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: FULLQUAD_VERT,
    fragmentShader: PRESENT_FRAG,
    uniforms: { uAccum: { value: accumRT[accNxt].texture } },
    depthTest: false, depthWrite: false, transparent: false
  })

  // points geometry: single attribute aIndex in range [0..count)
    const idx = new Float32Array(count)
  for (let i=0;i<count;i++) idx[i] = i

  const geom = new THREE.BufferGeometry()
  indicesAttr = new THREE.BufferAttribute(idx, 1)
  geom.setAttribute('aIndex', indicesAttr)

  // ➜ three.js expects a 'position' attribute for bounding volumes.
  // We don't use it in the shader, but add a dummy one (all zeros).
  const dummyPos = new Float32Array(count * 3) // all 0s
  geom.setAttribute('position', new THREE.BufferAttribute(dummyPos, 3))

  // Set a large bounding sphere so three.js skips computing it.
  geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), Math.max(w, h) * 1.5)

  pointsMat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: POINTS_VERT,
    fragmentShader: POINTS_FRAG,
    uniforms: {
      uPos: { value: posRT[posCur].texture },
      uSpeed: { value: speedTex },
      uHSV: { value: hsvTex },
      uSimTexSize: { value: simTexSize },
      uWorldSize: { value: worldSize },
      uPointScale: { value: pointScale.value }
    },
    blending: THREE.NormalBlending,
    depthTest: false, depthWrite: false, transparent: true
  })

  points = new THREE.Points(geom, pointsMat)

  // Also disable frustum culling since the true bounds are dynamic in the shader.
  points.frustumCulled = false

  pointsScene.add(points)

  // FSQ for passes
  const fsq = new THREE.Mesh(fsqGeo, simMat) // we’ll swap materials per pass
  fsqScene.add(fsq)

  // expose for step() closures
  return {
    gl, fsq, simTexSize, worldSize, hasColorBufferFloat, hasFloatBlend
  }
}

// recolor HSV texture
// replace your existing recolorHSV with this version:
function recolorHSV(countOverride) {
  if (!hsvTex || !pointsMat) return

  const cols = pointsMat.uniforms.uSimTexSize.value.x | 0
  const rows = pointsMat.uniforms.uSimTexSize.value.y | 0
  const maxCount = cols * rows
  const count = Math.min(countOverride ?? (indicesAttr?.count || maxCount), maxCount)

  const data = hsvTex.image?.data
  if (!data || data.length < cols * rows * 4) return

  for (let i = 0; i < count; i++) {
    const t = (count > 1) ? (i / (count - 1)) : 0
    let h = hsvStart.value.h + (hsvEnd.value.h - hsvStart.value.h) * t + (Math.random()*2-1) * hJitter.value
    let s = hsvStart.value.s + (hsvEnd.value.s - hsvStart.value.s) * t + (Math.random()*2-1) * sJitter.value
    let v = hsvStart.value.v + (hsvEnd.value.v - hsvStart.value.v) * t + (Math.random()*2-1) * vJitter.value

    h = h - Math.floor(h)      // wrap hue
    s = Math.min(1, Math.max(0, s))
    v = Math.min(1, Math.max(0, v))
    const k = i * 4
    data[k+0] = h; data[k+1] = s; data[k+2] = v; data[k+3] = 1
  }

  // (optional) leave the rest unchanged; those particles aren’t drawn when inactive

  hsvTex.needsUpdate = true
}


// ───────────────── frame loop ─────────────────
let lastT = 0, t0 = 0
function step() {
  const now = performance.now()*0.001
  console.log('step', now)
  if (!t0) { t0 = now; lastT = now }
  const dt = Math.min(0.033, Math.max(0, now - lastT))
  lastT = now

  // 1) SIM: pos[cur] -> pos[nxt]
  simMat.uniforms.uPos.value = posRT[posCur].texture
  simMat.uniforms.uTime.value = now - t0
  simMat.uniforms.uDt.value = dt
  simMat.uniforms.uActiveCount.value = activeCount.value
  simMat.uniforms.uSpeedMul.value = simSpeed.value
  const fsqMesh = fsqScene.children[0]
  fsqMesh.material = simMat
  renderer.setRenderTarget(posRT[posNxt])
  renderer.clear()
  renderer.render(fsqScene, cameraSim)
  renderer.setRenderTarget(null)
  // swap pos ping-pong
  ;[posCur, posNxt] = [posNxt, posCur]

  // after pos swap:
  pointsMat.uniforms.uPos.value = posRT[posCur].texture

  // enforce draw range for points (so we only draw activeCount)
  if (points && points.geometry) {
    points.geometry.setDrawRange(0, activeCount.value)
  }

  // 2) FADE: accum[cur] * (1 - fade) -> accum[nxt]
  fadeMat.uniforms.uAccum.value = accumRT[accCur].texture
  fsqMesh.material = fadeMat
  renderer.setRenderTarget(accumRT[accNxt])
  renderer.clear()
  renderer.render(fsqScene, cameraFSQ)

  // 3) DRAW POINTS additively into accum[nxt]
  pointsMat.uniforms.uPos.value = posRT[posCur].texture // current positions after swap
  renderer.setRenderTarget(accumRT[accNxt])
  renderer.state.setBlending(THREE.NormalBlending)
  renderer.render(pointsScene, cameraPoints)
  renderer.state.setBlending(THREE.NormalBlending)
  renderer.setRenderTarget(null)

  // 4) PRESENT: accum[nxt] -> screen (opaque)
  presentMat.uniforms.uAccum.value = accumRT[accNxt].texture
  fsqMesh.material = presentMat
  renderer.setRenderTarget(null)
  renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height)
  renderer.clearColor()
  renderer.clear(true, true, true)
  renderer.render(fsqScene, cameraFSQ)

  // 5) SWAP accum
  ;[accCur, accNxt] = [accNxt, accCur]
}

function animate() {
  step()
  if (useLightning && lightning) {
    const ctx = fxCanvas.value.getContext('2d')
    lightning.update(performance.now(), ctx)
  }
  rafId = requestAnimationFrame(animate)
}

// ───────────────── resize / rebuild ─────────────────
function recreate(count) {
  // dispose previous if any
  disposeThree()

  const { w, h } = sizeCanvas(glCanvas.value)
  sizeCanvas(fxCanvas.value)

  const built = buildThree({ w, h, count })
  // lightning attach/resize
  if (useLightning && !lightning) {
    const getCtx  = () => fxCanvas.value.getContext('2d')
    const getSize = () => ({ W: fxCanvas.value.width, H: fxCanvas.value.height })
    const getParticles = () => null
    lightning = useLightning({ getCtx, getSize, getParticles })
  }
  lightning && lightning.setSize(fxCanvas.value.width, fxCanvas.value.height)
}

function resizeRendererToDisplaySize() {
  const r1 = sizeCanvas(glCanvas.value)
  sizeCanvas(fxCanvas.value)
  if (!renderer) return
  renderer.setSize(r1.w, r1.h, false)

  // rebuild accum RTs (match viewport size)
  const accum0 = accumRT[0], accum1 = accumRT[1]
  if (accum0 && (accum0.width !== r1.w || accum0.height !== r1.h)) {
    accum0.dispose(); accum1.dispose()
    const hasFloatBlend = !!renderer.extensions.get('EXT_float_blend')
    const type = hasFloatBlend ? THREE.FloatType : THREE.UnsignedByteType
    const opts = {
      depthBuffer:false, stencilBuffer:false,
      type, format:THREE.RGBAFormat,
      magFilter:THREE.NearestFilter, minFilter:THREE.NearestFilter,
      wrapS:THREE.ClampToEdgeWrapping, wrapT:THREE.ClampToEdgeWrapping
    }
    accumRT[0] = new THREE.WebGLRenderTarget(r1.w, r1.h, opts)
    accumRT[1] = new THREE.WebGLRenderTarget(r1.w, r1.h, opts)
    renderer.setRenderTarget(accumRT[0]); renderer.clear(true,true,true)
    renderer.setRenderTarget(accumRT[1]); renderer.clear(true,true,true)
  }

  // update uniforms world size & center
  if (simMat) {
    simMat.uniforms.uWorldSize.value.set(r1.w, r1.h)
    simMat.uniforms.uCenter.value.set(r1.w*0.5, r1.h*0.5)
  }
  if (pointsMat) {
    pointsMat.uniforms.uWorldSize.value.set(r1.w, r1.h)
  }
}

function disposeThree() {
  try {
    cancelAnimationFrame(rafId)
  } catch {}
  // dispose materials / targets / textures / geometry
  ;[simMat, fadeMat, presentMat, pointsMat].forEach(m => m && m.dispose && m.dispose())
  simMat = fadeMat = presentMat = pointsMat = null
  ;[0,1].forEach(i => { posRT[i]?.dispose?.(); accumRT[i]?.dispose?.() })
  posRT = []; accumRT = []
  speedTex?.dispose?.(); hsvTex?.dispose?.()
  speedTex = hsvTex = null
  pointsScene && points && pointsScene.remove(points)
  points = null
  if (renderer) {
    renderer.dispose()
    renderer.forceContextLoss && renderer.forceContextLoss()
    renderer = null
  }
}

// ───────────────── Vue lifecycle ─────────────────
onMounted(async () => {
  await nextTick()
  recreate(particleCount.value)

  // watchers
  watch(movementMode, v => { simMat && (simMat.uniforms.uMode.value = MODE_MAP[v] ?? 0) })
  watch(trailFade, v => { fadeMat && (fadeMat.uniforms.uFade.value = v) })
  watch(pointScale, v => { pointsMat && (pointsMat.uniforms.uPointScale.value = v) })
  // HSV sliders → recolor texture
  watch(
    [
      () => hsvStart.value.h, () => hsvStart.value.s, () => hsvStart.value.v,
      () => hsvEnd.value.h,   () => hsvEnd.value.s,   () => hsvEnd.value.v,
      () => valueMin.value,   () => valueMax.value,
      () => hJitter.value,    () => sJitter.value,    () => vJitter.value
    ],
    () => {
      recolorHSV(activeCount.value)   // or recolorHSV()
    }
  )

  watch(particleCount, v => recreate(v))
  // Field
  watch(movementMode, v => { simMat && (simMat.uniforms.uMode.value = MODE_MAP[v] ?? 0) })

  // Simulation speed
  watch(simSpeed, v => { simMat && (simMat.uniforms.uSpeedMul.value = v) })

  // Fade
  watch(trailFade, v => { fadeMat && (fadeMat.uniforms.uFade.value = v) })

  // Active particle count (no rebuild)
  watch(activeCount, (n) => {
    // clamp to [1, maxParticles]
    const maxN = maxParticles.value
    if (n < 1) activeCount.value = 1
    if (n > maxN) activeCount.value = maxN

    // sim sees it via uActiveCount each frame; points use drawRange above
  })

  // Point size
  watch(pointScale, v => { pointsMat && (pointsMat.uniforms.uPointScale.value = v) })

  // Colors → recolor HSV only
  watch([hsvStart, hsvEnd, hJitter, sJitter, vJitter, valueMin, valueMax, colorAhex, colorBhex], () => {
    if (!hsvTex || !pointsMat) return
    const cols = pointsMat.uniforms.uSimTexSize.value.x|0
    const rows = pointsMat.uniforms.uSimTexSize.value.y|0
    // only recolor up to activeCount (saves time), or all if you prefer
    recolorHSV(activeCount.value, cols, rows)
  })
  watch(
    [() => hsvStart.value.h, () => hsvStart.value.s, () => hsvStart.value.v,
    () => hsvEnd.value.h,   () => hsvEnd.value.s,   () => hsvEnd.value.v],
    () => {
      if (!hsvTex) return
      recolorHSV(activeCount.value) // reuse your existing recolor function
    }
  )
  watch(colorAhex, (hex) => {
    const hsv = rgbToHsv(hexToRgb(hex))
    hsvStart.value = { h: hsv.h, s: Math.max(0.1, hsv.s), v: Math.max(0.1, hsv.v) }
  })
  watch(colorBhex, (hex) => {
    const hsv = rgbToHsv(hexToRgb(hex))
    hsvEnd.value = { h: hsv.h, s: Math.max(0.1, hsv.s), v: Math.max(0.1, hsv.v) }
  })


  // resize
  const onResize = () => {
    resizeRendererToDisplaySize()
    lightning && lightning.setSize(fxCanvas.value.width, fxCanvas.value.height)
  }
  window.addEventListener('resize', onResize)
  fxCanvas.value._onResize = onResize

  // start loop
  t0 = 0; lastT = 0
  rafId = requestAnimationFrame(function go(){ animate() })
})

onBeforeUnmount(() => {
  if (fxCanvas.value?._onResize) window.removeEventListener('resize', fxCanvas.value._onResize)
  try { lightning && lightning.dispose && lightning.dispose() } catch {}
  disposeThree()
})
</script>

<style scoped>
.panel {
  position: fixed;
  left: 0; top: 0; bottom: 0;
  width: 320px;
  overflow-y: auto;
  padding: 16px 14px;
  box-sizing: border-box;
  background: rgba(10, 12, 18, 0.9);
  color: #e2e6ee;
  border-right: 1px solid rgba(255,255,255,0.08);
  backdrop-filter: blur(6px);
  z-index: 10;
}
.panel h2 { margin: 0 0 12px; font: 600 14px/1.2 system-ui, sans-serif; letter-spacing: .02em; }
.panel label { display: block; margin: 12px 0; font-size: 12px; }
.panel input[type="range"] { width: 100%; }
.panel select, .panel input[type="color"] { width: 100%; margin-top: 6px; }
.panel .row { display: flex; gap: 12px; align-items: center; }
.panel .color { flex: 1; }
.bar.big {
  width: 100%; height: 10px; border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.15);
  margin-top: 8px;
}

/* make the stage fill everything to the right of the panel */
.full-bleed-stage {
  position: fixed;
  top: 0; right: 0; bottom: 0;
  left: 320px;            /* reserve space for the panel */
}
.layer { width: 100%; height: 100%; background:#000; } /* ensure it stretches */
.overlay { pointer-events: none; }

</style>
