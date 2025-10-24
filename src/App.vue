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

  <h3>Field Parameters</h3>
  <div v-if="FIELD_SCHEMAS[movementMode]">
    <div v-for="s in FIELD_SCHEMAS[movementMode].p" :key="s.key" class="row">
      <label :for="s.key">{{ s.label }}: {{ fmt(fieldParams[s.key], 2) }}</label>
      <input type="range"
            :id="s.key"
            :min="s.min" :max="s.max" :step="s.step"
            v-model.number="fieldParams[s.key]" />
    </div>
    <div v-for="s in FIELD_SCHEMAS[movementMode].q" :key="s.key" class="row">
      <label :for="s.key">{{ s.label }}: {{ fmt(fieldParams[s.key], 2) }}</label>
      <input type="range"
            :id="s.key"
            :min="s.min" :max="s.max" :step="s.step"
            v-model.number="fieldParams[s.key]" />
    </div>
  </div>


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
const pointScale = ref(3.0)

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

// Slider schema: label, key, range, default → mapped into uP (vec4) / uQ (vec4)
const FIELD_SCHEMAS = {
  // 1) SINE FLOW — uP = (cyclesX, cyclesY, tSpeedX, tSpeedY)
  sineflow: {
    p: [
      { key: 'cyclesX',  label: 'Cycles X',     min: 0,   max: 20,  step: 0.1,  def: 1.0 },
      { key: 'cyclesY',  label: 'Cycles Y',     min: 0,   max: 20,  step: 0.1,  def: 1.0 },
      { key: 'tSpeedX',  label: 'Time Speed X', min: -5,  max: 5,   step: 0.01, def: 0.35 },
      { key: 'tSpeedY',  label: 'Time Speed Y', min: -5,  max: 5,   step: 0.01, def: 0.27 },
    ],
    q: []
  },

  // 2) SWIRL — uP = (wobbleMin, wobbleMax, wobbleSpeed, radialPow), uQ = (spinScale, -, -, -)
  swirl: {
    p: [
      { key: 'wobbleMin',   label: 'Wobble Min',     min: 0,   max: 2,   step: 0.01, def: 0.7 },
      { key: 'wobbleMax',   label: 'Wobble Max',     min: 0,   max: 2,   step: 0.01, def: 1.0 },
      { key: 'wobbleSpeed', label: 'Wobble Speed',   min: 0,   max: 5,   step: 0.01, def: 0.6 },
      { key: 'radialPow',   label: 'Radial Falloff', min: 0,   max: 4,   step: 0.01, def: 0.0 },
    ],
    q: [
      { key: 'spinScale',   label: 'Spin Scale',     min: 0,   max: 3,   step: 0.01, def: 1.0 },
    ]
  },

  // 3) CURLISH — uP = (noiseScale, timeSpeedX, timeSpeedY, angleScaleMult)
  curlish: {
    p: [
      { key: 'noiseScale',  label: 'Noise Scale',    min: 0.1, max: 12,  step: 0.1,  def: 1.3 },
      { key: 'timeSpeedX',  label: 'Time Speed X',   min: -3,  max: 3,   step: 0.01, def: 1.0 },
      { key: 'timeSpeedY',  label: 'Time Speed Y',   min: -3,  max: 3,   step: 0.01, def: 1.8 },
      { key: 'angleScale',  label: 'Angle Scale',    min: 0,   max: 3,   step: 0.01, def: 1.0 },
    ],
    q: []
  },

  // 4) LISSAJOUS — uP = (aX, bX, tAmpX, tFreqX), uQ = (aY, bY, tAmpY, tFreqY)
  lissajous: {
    p: [
      { key: 'aX',      label: 'aX (x coeff)',       min: 0,   max: 8,   step: 0.01, def: 1.3 },
      { key: 'bX',      label: 'bX (y coeff)',       min: 0,   max: 8,   step: 0.01, def: 1.3 },
      { key: 'tAmpX',   label: 'Time Amp X',         min: 0,   max: 1,   step: 0.001,def: 0.55 },
      { key: 'tFreqX',  label: 'Time Freq X',        min: 0,   max: 5,   step: 0.01, def: 0.25 },
    ],
    q: [
      { key: 'aY',      label: 'aY (x coeff)',       min: 0,   max: 8,   step: 0.01, def: 1.4 },
      { key: 'bY',      label: 'bY (y coeff)',       min: 0,   max: 8,   step: 0.01, def: 1.4 },
      { key: 'tAmpY',   label: 'Time Amp Y',         min: 0,   max: 1,   step: 0.001,def: 0.8 },
      { key: 'tFreqY',  label: 'Time Freq Y',        min: 0,   max: 5,   step: 0.01, def: 1.6 },
    ]
  },

  // 5) ORBITS — uP = (c1AmpX, c1AmpY, c1FreqX, c1FreqY), uQ = (c2AmpX, c2AmpY, c2FreqX, c2FreqY)
  orbits: {
    p: [
      { key: 'c1AmpX',  label: 'C1 Amp X (screen)',  min: 0,   max: 0.5, step: 0.001,def: 0.25 },
      { key: 'c1AmpY',  label: 'C1 Amp Y (screen)',  min: 0,   max: 0.5, step: 0.001,def: 0.20 },
      { key: 'c1FreqX', label: 'C1 Freq X',          min: 0,   max: 3,   step: 0.001,def: 0.40 },
      { key: 'c1FreqY', label: 'C1 Freq Y',          min: 0,   max: 3,   step: 0.001,def: 0.31 },
    ],
    q: [
      { key: 'c2AmpX',  label: 'C2 Amp X (screen)',  min: 0,   max: 0.5, step: 0.001,def: 0.20 },
      { key: 'c2AmpY',  label: 'C2 Amp Y (screen)',  min: 0,   max: 0.5, step: 0.001,def: 0.25 },
      { key: 'c2FreqX', label: 'C2 Freq X',          min: 0,   max: 3,   step: 0.001,def: 0.22 },
      { key: 'c2FreqY', label: 'C2 Freq Y',          min: 0,   max: 3,   step: 0.001,def: 0.29 },
    ]
  },

  // 6) VORTEX GRID — uP = (cellsX, cellsY, baseSpin, tSpinAmp), uQ = (tSpinFreq, -, -, -)
  vortexgrid: {
    p: [
      { key: 'cellsX',   label: 'Cells X',           min: 1,   max: 32,  step: 1,    def: 6 },
      { key: 'cellsY',   label: 'Cells Y',           min: 1,   max: 32,  step: 1,    def: 6 },
      { key: 'baseSpin', label: 'Base Spin',         min: -10, max: 10,  step: 0.01, def: 4.0 },
      { key: 'tSpinAmp', label: 'Spin Amplitude',    min: 0,   max: 10,  step: 0.01, def: 10.0 },
    ],
    q: [
      { key: 'tSpinFreq',label: 'Spin Freq',         min: 0,   max: 5,   step: 0.01, def: 0.75 },
    ]
  },

  // 7) DOUBLE GYRE — uP = (A, omega, epsilon, -)
  doublegyre: {
    p: [
      { key: 'A',        label: 'Amplitude A',       min: 0,   max: 2,   step: 0.01, def: 1.0 },
      { key: 'omega',    label: 'Omega (Hz)',        min: 0,   max: 1,   step: 0.01, def: 0.10 },
      { key: 'epsilon',  label: 'Epsilon',           min: 0,   max: 0.9, step: 0.001,def: 0.25 },
      { key: 'pad',      label: '(unused)',          min: 0,   max: 0,   step: 1,    def: 0.0 },
    ],
    q: []
  },

  // 8) SHEAR — uP = (baseU, bandAmp, bandFreq, tShearSpeed), uQ = (vAmp, vFreqX, tVSpeed, -)
  shear: {
    p: [
      { key: 'baseU',      label: 'Base U',          min: -2,  max: 2,   step: 0.01, def: 0.6 },
      { key: 'bandAmp',    label: 'Band Amplitude',  min: 0,   max: 1,   step: 0.01, def: 0.4 },
      { key: 'bandFreq',   label: 'Band Frequency',  min: 0,   max: 8,   step: 0.01, def: 1.5 },
      { key: 'tShearSpeed',label: 'Time Speed',      min: 0,   max: 5,   step: 0.01, def: 0.7 },
    ],
    q: [
      { key: 'vAmp',       label: 'V Amplitude',     min: 0,   max: 1,   step: 0.01, def: 0.15 },
      { key: 'vFreqX',     label: 'V X Frequency',   min: 0,   max: 8,   step: 0.01, def: 2.0 },
      { key: 'tVSpeed',    label: 'V Time Speed',    min: 0,   max: 5,   step: 0.01, def: 0.2 },
    ]
  },

  // 9) HEX VORTEX — uP = (scale, spinBase, spinAmp, tSpinFreq)
  hexvortex: {
    p: [
      { key: 'scale',    label: 'Hex Scale',         min: 0.5, max: 20,  step: 0.1,  def: 6.0 },
      { key: 'spinBase', label: 'Base Spin',         min: -5,  max: 5,   step: 0.01, def: 1.0 },
      { key: 'spinAmp',  label: 'Spin Amplitude',    min: 0,   max: 5,   step: 0.01, def: 0.15 },
      { key: 'tSpinFreq',label: 'Spin Freq',         min: 0,   max: 5,   step: 0.01, def: 1.0 },
    ],
    q: []
  },

  // 10) JET STREAM — uP = (bandFreq, bandAmp, xFreq, tSpeed), uQ = (transAmp, transFreq, -, -)
  jetstream: {
    p: [
      { key: 'bandFreq',  label: 'Band Frequency',   min: 0,   max: 20,  step: 0.1,  def: 8.0 },
      { key: 'bandAmp',   label: 'Band Amplitude',   min: 0,   max: 1,   step: 0.01, def: 0.5 },
      { key: 'xFreq',     label: 'X Frequency',      min: 0,   max: 5,   step: 0.01, def: 2.0 },
      { key: 'tSpeed',    label: 'Time Speed',       min: 0,   max: 5,   step: 0.01, def: 0.6 },
    ],
    q: [
      { key: 'transAmp',  label: 'Transverse Amp',   min: 0,   max: 1,   step: 0.01, def: 0.2 },
      { key: 'transFreq', label: 'Transverse Freq',  min: 0,   max: 5,   step: 0.01, def: 0.3 },
    ]
  },

  // 11) GALACTIC — uP = (armAmp, armFreq, tArmSpeed, radialMix), uQ = (tangentialWeight, radialWeight, -, -)
  galactic: {
    p: [
      { key: 'armAmp',     label: 'Arm Amplitude',   min: 0,   max: 1,   step: 0.01, def: 0.25 },
      { key: 'armFreq',    label: 'Arm Frequency',   min: 0,   max: 8,   step: 0.01, def: 3.0 },
      { key: 'tArmSpeed',  label: 'Arm Time Speed',  min: 0,   max: 5,   step: 0.01, def: 0.4 },
      { key: 'radialMix',  label: 'Radial Mix',      min: -1,  max: 1,   step: 0.01, def: 0.0 },
    ],
    q: [
      { key: 'tangentialWeight', label: 'Tangential W', min: 0, max: 2, step: 0.01, def: 1.0 },
      { key: 'radialWeight',     label: 'Radial W',     min: 0, max: 2, step: 0.01, def: 1.0 },
    ]
  },

  // 12) CELLULAR — uP = (scale, xFreq, yFreq, tSpeed)
  cellular: {
    p: [
      { key: 'scale',   label: 'Cell Scale',        min: 0.25, max: 12,  step: 0.01, def: 1.0 },
      { key: 'xFreq',   label: 'X Frequency',       min: 0,    max: 6,   step: 0.01, def: 1.0 },
      { key: 'yFreq',   label: 'Y Frequency',       min: 0,    max: 6,   step: 0.01, def: 1.0 },
      { key: 'tSpeed',  label: 'Time Speed',        min: 0,    max: 5,   step: 0.01, def: 1.0 },
    ],
    q: []
  },
}

// selected mode already in movementMode
const fieldParams = ref({})   // holds current key→value for the selected field

function initFieldParams(mode) {
  const sch = FIELD_SCHEMAS[mode]
  const out = {}
  if (!sch) return out
  for (const s of sch.p) out[s.key] = s.def
  for (const s of sch.q) out[s.key] = s.def
  return out
}

function applyFieldParamsToUniforms() {
  if (!simMat) return
  const m = movementMode.value
  const sch = FIELD_SCHEMAS[m]
  const p = [0,0,0,0], q = [0,0,0,0]
  if (sch) {
    sch.p.forEach((s, i) => { if (i<4) p[i] = Number(fieldParams.value[s.key] ?? s.def) })
    sch.q.forEach((s, i) => { if (i<4) q[i] = Number(fieldParams.value[s.key] ?? s.def) })
  }
  simMat.uniforms.uP.value.set(p[0], p[1], p[2], p[3])
  simMat.uniforms.uQ.value.set(q[0], q[1], q[2], q[3])
}

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
uniform vec4 uP;  // primary param pack
uniform vec4 uQ;  // secondary param pack

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
// Helper constant
const float TAU = 6.28318530718;

// ──────────────────────────────────────────────────────────────────────────────
// 1) SINE FLOW
// uP = (cyclesX, cyclesY, tSpeedX, tSpeedY)
// uQ = (—unused—)
// ------------------------------------------------------------------------------
vec2 field_sineflow(vec2 p, float t, vec2 wh){
  float ax = TAU * (uP.x * (p.y/wh.y)) + t * uP.z;
  float ay = TAU * (uP.y * (p.x/wh.x)) - t * uP.w;
  vec2 v = vec2(sin(ax), sin(ay));
  float L = length(v); 
  return L>1e-6 ? v/L : vec2(0.0);
}

// ──────────────────────────────────────────────────────────────────────────────
// 2) SWIRL (centered spin with wobble)
// uP = (wobbleMin, wobbleMax, wobbleSpeed, radialFalloffPow >= 0)
// uQ = (spinScale,  —, —, —)
// ------------------------------------------------------------------------------
vec2 field_swirl(vec2 p, float t, vec2 wh){
  vec2 d = p - uCenter;
  float r = length(d) + 1e-6;
  float wob = mix(uP.x, uP.y, 0.5 + 0.5*sin(t*uP.z));
  float spin = uQ.x * pow(r / max(wh.x, wh.y), max(uP.w, 0.0));
  vec2 tang = vec2(-d.y, d.x) / r;
  vec2 v = tang * (wob + spin);
  float L = length(v);
  return L>1e-6 ? v/L : vec2(0.0);
}

// ──────────────────────────────────────────────────────────────────────────────
// 3) CURLISH NOISE (angle from noise)
// uP = (noiseScale, timeSpeedX, timeSpeedY, angleScaleMult)  // angleScaleMult multiplies 2π
// uQ = (—unused—)
// ------------------------------------------------------------------------------
vec2 field_curlish(vec2 p, float t, vec2 wh){
  vec2 q = p/wh * uP.x + vec2(t*uP.y, -t*uP.z);
  float a = noise(q) * TAU * max(uP.w, 0.0);
  return vec2(cos(a), sin(a));  // already unit-length
}

// ──────────────────────────────────────────────────────────────────────────────
// 4) LISSAJOUS-STYLE COUPLED SINES
// uP = (aX, bX, tAmpX, tFreqX)        // x-channel: sin(2π*(aX*x + bX*y + tAmpX*sin(tFreqX*t)))
// uQ = (aY, bY, tAmpY, tFreqY)        // y-channel: sin(2π*(aY*x + bY*y + tAmpY*cos(tFreqY*t)))
// ------------------------------------------------------------------------------
vec2 field_lissajous(vec2 p, float t, vec2 wh){
  float x = p.x / wh.x, y = p.y / wh.y;
  float phx = uP.z * sin(t * uP.w);
  float phy = uQ.z * cos(t * uQ.w);
  float vx = sin(TAU * (uP.x * x + uP.y * y + phx));
  float vy = sin(TAU * (uQ.x * x + uQ.y * y + phy));
  vec2 v = vec2(vx, vy);
  float L = length(v);
  return L>1e-6 ? v/L : vec2(0.0);
}

// ──────────────────────────────────────────────────────────────────────────────
// 5) ORBITS (two moving vortices)
// uP = (c1AmpX, c1AmpY, c1FreqX, c1FreqY)    // center 1 motion around uCenter
// uQ = (c2AmpX, c2AmpY, c2FreqX, c2FreqY)    // center 2 motion around uCenter
// ------------------------------------------------------------------------------
vec2 field_orbits(vec2 p, float t, vec2 wh){
  vec2 c1 = uCenter + vec2(uP.x*wh.x*sin(t*uP.z),  uP.y*wh.y*cos(t*uP.w));
  vec2 c2 = uCenter + vec2(uQ.x*wh.x*cos(t*uQ.z),  uQ.y*wh.y*sin(t*uQ.w));
  vec2 d1 = p - c1; float r1 = length(d1)+1e-6; vec2 v1 = vec2(-d1.y, d1.x)/r1;
  vec2 d2 = p - c2; float r2 = length(d2)+1e-6; vec2 v2 = vec2(-d2.y, d2.x)/r2;
  vec2 v = normalize(v1)*0.6 + normalize(v2)*0.4;
  float L = length(v);
  return L>1e-6 ? v/L : vec2(0.0);
}

// ──────────────────────────────────────────────────────────────────────────────
// 6) VORTEX GRID (checkerboard spinning cells)
// uP = (cellsX, cellsY, baseSpin, tSpinAmp)
// uQ = (tSpinFreq,  —, —, —)
// ------------------------------------------------------------------------------
vec2 field_vortexgrid(vec2 p, float t, vec2 wh){
  vec2 g = vec2(uP.x, uP.y);                  // grid resolution
  vec2 cellCoord = floor((p/wh) * g);
  vec2 local = fract((p/wh) * g) - 0.5;
  float parity = mod(cellCoord.x + cellCoord.y, 2.0) < 1.0 ? 1.0 : -1.0;
  float spin = uP.z + uP.w * sin(t * uQ.x);   // baseSpin + animated component
  float ang = atan(local.y, local.x) + parity * spin;
  vec2 v = vec2(-sin(ang), cos(ang));
  float L = length(v);
  return L>1e-6 ? v/L : vec2(0.0);
}

// ──────────────────────────────────────────────────────────────────────────────
// 7) DOUBLE GYRE (classic)
// uP = (A, omega, epsilon, —)    // A scales vertical velocity; omega time freq; epsilon oscillation
// uQ = (—unused—)
// ------------------------------------------------------------------------------
vec2 field_doublegyre(vec2 p, float t, vec2 wh){
  float A   = (uP.x) * 0.25 * wh.y;
  float w   = TAU * uP.y;
  float eps = uP.z;
  float a = eps * sin(w * t);
  float b = 1.0 - 2.0 * eps;
  float x = p.x/wh.x, y = p.y/wh.y;
  float f    = a*x*x + b*x;
  float dfdx = 2.0*a*x + b;
  float u = -3.14159265 * A * sin(3.14159265*f) * cos(3.14159265*y);
  float v =  3.14159265 * A * cos(3.14159265*f) * sin(3.14159265*y) * dfdx;
  vec2 vel = vec2(u, v);
  float L = length(vel);
  return L>1e-6 ? vel/L : vec2(0.0);
}

// ──────────────────────────────────────────────────────────────────────────────
/* 8) SHEAR (horizontal banded flow with vertical wiggles)
   uP = (baseU, bandAmp, bandFreq, tShearSpeed)    // horizontal component varies by y
   uQ = (vAmp,  vFreqX,  tVSpeed,  — )            // vertical wiggle varies by x and time
*/
vec2 field_shear(vec2 p, float t, vec2 wh){
  float y = p.y/wh.y;
  float u = uP.x + uP.y * sin(TAU * (uP.z * y) + t * uP.w);
  float v = uQ.x * sin(TAU * (uQ.y * (p.x/wh.x)) - t * uQ.z);
  vec2 vel = vec2(u, v);
  float L = length(vel);
  return L>1e-6 ? vel/L : vec2(0.0);
}

// ──────────────────────────────────────────────────────────────────────────────
// 9) HEX VORTEX LATTICE
// uP = (scale, spinBase, spinAmp, tSpinFreq)
// uQ = (—unused—)
// ------------------------------------------------------------------------------
vec2 field_hexvortex(vec2 p, float t, vec2 wh){
  // axial-like projection for hex tiling
  vec2 q = (p/wh) * max(uP.x, 0.0001);
  vec2 a = vec2(1.0, 0.0);
  vec2 b = vec2(0.5, 0.86602540378 * 1.15470053838); // ≈ √3/2 * 2/√3 to balance spacing
  vec2 uv = vec2(dot(q, a), dot(q, b));
  vec2 cell = floor(uv);
  vec2 f    = fract(uv) - 0.5;
  float parity = mod(cell.x + cell.y, 2.0) < 1.0 ? 1.0 : -1.0;
  float spin = uP.y + uP.z * sin(t * uP.w);
  float ang = atan(f.y, f.x) + parity * spin;
  vec2 v = vec2(-sin(ang), cos(ang));
  float L = length(v);
  return L>1e-6 ? v/L : vec2(0.0);
}

// ──────────────────────────────────────────────────────────────────────────────
// 10) JET STREAM (banded flow with transverse oscillation)
// uP = (bandFreq, bandAmp, xFreq, tSpeed)
// uQ = (transAmp, transFreq, —, —)
// ------------------------------------------------------------------------------
vec2 field_jetstream(vec2 p, float t, vec2 wh){
  float y = p.y/wh.y;
  float u = uP.y * sin(3.14159265 * (uP.x * y + 0.25*sin(t * uP.w)));
  u = 0.5 + u; // bias to keep generally rightward
  float v = uQ.x * sin(3.14159265 * (uP.z * (p.x/wh.x) - t * uQ.y));
  vec2 vel = vec2(u, v);
  float L = length(vel);
  return L>1e-6 ? vel/L : vec2(0.0);
}

// ──────────────────────────────────────────────────────────────────────────────
// 11) GALACTIC (spiral arms)
// uP = (armAmp, armFreq, tArmSpeed, radialMix)
// uQ = (tangentialWeight, radialWeight, —, —)
// ------------------------------------------------------------------------------
vec2 field_galactic(vec2 p, float t, vec2 wh){
  vec2 d = p - uCenter;
  float r = length(d) + 1e-4;
  float ang = atan(d.y, d.x);
  float arm = uP.x * sin(uP.y * ang - uP.z * t);
  vec2 tang   = vec2(-d.y, d.x) / r;
  vec2 radial = normalize(d);
  vec2 v = normalize(tang * uQ.x + radial * (uQ.y * arm + uP.w));
  float L = length(v);
  return L>1e-6 ? v/L : vec2(0.0);
}

// ──────────────────────────────────────────────────────────────────────────────
// 12) CELLULAR (separable sine/cosine cells with time shift)
// uP = (scale, xFreq, yFreq, tSpeed)
// uQ = (—unused—)
// ------------------------------------------------------------------------------
vec2 field_cellular(vec2 p, float t, vec2 wh){
  float x = p.x/wh.x * TAU * max(uP.x, 0.0001);
  float y = p.y/wh.y * TAU * max(uP.x, 0.0001);
  vec2 v = vec2(
    sin(uP.y * x) * cos(uP.z * (y + 0.3*t*uP.w)),
   -cos(uP.y * x) * sin(uP.z * (y - 0.2*t*uP.w))
  );
  float L = length(v);
  return L>1e-6 ? v/L : vec2(0.0);
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
      uP: { value: new THREE.Vector4(0,0,0,0) },
      uQ: { value: new THREE.Vector4(0,0,0,0) },
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
  
  // onMounted after materials exist:
  fieldParams.value = initFieldParams(movementMode.value)
  applyFieldParamsToUniforms()

  watch(movementMode, (m) => {
    fieldParams.value = initFieldParams(m)
    simMat.uniforms.uMode.value = MODE_MAP[m] ?? 0
    applyFieldParamsToUniforms()
  })

  watch(fieldParams, () => applyFieldParamsToUniforms(), { deep: true })

  watch([minSize, maxSize], ([a,b]) => { if (a > b) [minSize.value, maxSize.value] = [b, a] })
  watch([minSpeed, maxSpeed], ([a,b]) => { if (a > b) [minSpeed.value, maxSpeed.value] = [b, a] })
  watch([valueMin, valueMax], ([a,b]) => { if (a > b) [valueMin.value, valueMax.value] = [b, a] })


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
