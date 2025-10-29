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
// let lightning = null
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
  // renderer.render(fsqScene, cameraFSQ)

  // 5) SWAP accum
  ;[accCur, accNxt] = [accNxt, accCur]

  lightning.stepLightning()
}

function animate() {
  step()
  // if (useLightning && lightning) {
  //   const ctx = fxCanvas.value.getContext('2d')
  //   lightning.update(performance.now(), ctx)
  // }
  rafId = requestAnimationFrame(animate)
}

// ───────────────── resize / rebuild ─────────────────
function recreate(count) {
  // dispose previous if any
  disposeThree()

  const { w, h } = sizeCanvas(glCanvas.value)
  sizeCanvas(fxCanvas.value)

  const built = buildThree({ w, h, count })
  // // lightning attach/resize
  // if (useLightning && !lightning) {
  //   const getCtx  = () => fxCanvas.value.getContext('2d')
  //   const getSize = () => ({ W: fxCanvas.value.width, H: fxCanvas.value.height })
  //   const getParticles = () => null
  //   lightning = useLightning({ getCtx, getSize, getParticles })
  // }
  // lightning && lightning.setSize(fxCanvas.value.width, fxCanvas.value.height)
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

  lightning.init(
    renderer,
    ()=>posRT[posCur],               // supply current positions RT
    pointsMat.uniforms.uSimTexSize.value, // vec2(cols,rows)
    new THREE.Vector2(glCanvas.value.width, glCanvas.value.height)
  );

  // resize
  const onResize = () => {
    resizeRendererToDisplaySize()
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
const lightning = (() => {
  // ─────────────────────────────────────────────────────────────────────────────
  // ⚡ LightningGPU — fully on-GPU particle-hopping lightning for your sim
  // Paste inside <script setup> after your Three.js setup (renderer, posRT[], etc).
  // Exposes: lightning.init(...), lightning.hopIfDue(), lightning.renderOverlay(),
  // lightning.resize(), lightning.resetDischarge()
  // ─────────────────────────────────────────────────────────────────────────────

  /* ========= Parameters (reactive, connect to your UI sliders) ========= */
  const lightningColor      = ref('#7fc7ff');
  const baseThicknessPx     = ref(1.5);
  const hopDelayMs          = ref(60);
  const splitChance0        = ref(0.35);
  const splitDecay          = ref(0.55);
  const maxHopDistPx        = ref(120);
  const finishMarginPx      = ref(12);
  const lightUpThicknessPx  = ref(5.0);
  const lightUpColor        = ref('#aef7ff');
  const fadeThicknessPx     = ref(0.6);
  const fadeColor           = ref('#1a2a38');

  // grid cell size for spatial tiles (expose if you want)
  const gridCellPx          = ref(40);

  /* ========= Tiny FSQ / RT helpers ========= */
  const FULLQUAD_VERT = /* glsl */`
  precision highp float;
  const vec2 P[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));
  void main(){ gl_Position=vec4(P[gl_VertexID],0.,1.); }
  `;

  function makeRowRT(width, { type=THREE.FloatType, format=THREE.RGBAFormat } = {}) {
    return new THREE.WebGLRenderTarget(width, 1, {
      type, format, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthBuffer: false, stencilBuffer: false,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    });
  }
  function makeTexRT(w,h,{ type=THREE.FloatType, format=THREE.RGBAFormat, depth=false }={}) {
    return new THREE.WebGLRenderTarget(w, h, {
      type, format, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthBuffer: depth, stencilBuffer: false,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    });
  }
  const fsqScene = new THREE.Scene();
  const fsqMesh  = new THREE.Mesh(new THREE.PlaneGeometry(2,2), null);
  fsqScene.add(fsqMesh);
  const fsqCam   = new THREE.Camera();
  function renderTo(target){
    renderer.setRenderTarget(target||null);
    renderer.clear(false,true,false);
    renderer.render(fsqScene, fsqCam);
    renderer.setRenderTarget(null);
  }
  function makePass(fragmentShader, uniforms={}) {
    return new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FULLQUAD_VERT,
      fragmentShader,
      uniforms,
      depthTest:false, depthWrite:false, transparent:false,
    });
  }

  /* ========= Bitonic sort (row RG stores {key,idx}) ========= */
  const bitonicMat = makePass(/* glsl */`
  precision highp float;
  out vec4 fc;
  uniform sampler2D uSrc;
  uniform float uK, uStage, uStep;
  vec4 at(float i){ return texture(uSrc, vec2((i+0.5)/uK,0.5)); }
  void main(){
    float i=floor(gl_FragCoord.x-0.5);
    if(i<0.||i>=uK){ fc=vec4(0); return; }
    float j= i - mod(i, uStep*2.) + mod(i + uStep, uStep*2.);
    vec4 A=at(i), B=at(j);
    float dir= mod(floor(i/uStage),2.);
    bool swap= (dir<.5) ? (A.r>B.r) : (A.r<B.r);
    fc = swap ? B : A;
  }`);
  function bitonicSort(srcRT, tmpRT, K){
    let cur=srcRT, nxt=tmpRT;
    fsqMesh.material = bitonicMat;
    for (let stage=2; stage<=K; stage<<=1){
      for (let step=stage>>1; step>0; step>>=1){
        bitonicMat.uniforms.uSrc={value:cur.texture};
        bitonicMat.uniforms.uK={value:K};
        bitonicMat.uniforms.uStage={value:stage};
        bitonicMat.uniforms.uStep={value:step};
        renderTo(nxt);
        [cur,nxt]=[nxt,cur];
      }
    }
    return cur; // sorted {key,idx}
  }

  /* ========= Keying pass: pack (cellKey, idx) ========= */
  const KEY_FRAG = /* glsl */`
  precision highp float;
  out vec4 fc;
  uniform sampler2D uPos;
  uniform vec2 uSimTex;   // cols, rows
  uniform vec2 uWorld;    // W,H
  uniform vec2 uCell;     // cellW,cellH
  uniform float uK;

  vec4 texel1D(sampler2D tex, float idx, vec2 ts){
    float cols=ts.x; float y=floor(idx/cols); float x=idx - y*cols;
    vec2 uv=(vec2(x,y)+.5)/ts; return texture(tex,uv);
  }
  void main(){
    float idx=floor(gl_FragCoord.x-.5);
    if(idx<0.||idx>=uK){ fc=vec4(0); return; }
    vec2 pos=texel1D(uPos, idx, uSimTex).xy;
    float cx=floor(pos.x/uCell.x);
    float cy=floor(pos.y/uCell.y);
    float gcols=floor(uWorld.x/uCell.x);
    cx=clamp(cx,0.,gcols-1.);
    cy=clamp(cy,0.,floor(uWorld.y/uCell.y)-1.);
    float key= cx + cy*gcols;
    fc=vec4(key, idx, 0., 0.);
  }`;
  const keyMat = makePass(KEY_FRAG, {
    uPos:{value:null}, uSimTex:{value:new THREE.Vector2()}, uWorld:{value:new THREE.Vector2()},
    uCell:{value:new THREE.Vector2()}, uK:{value:0},
  });

  /* ========= Cell range via depth argmin/argmax ========= */
  // We render K GL_POINTS positioned over their cell pixel; depth encodes index.
  // Small “point cloud” scene:
  let cellPointScene=null, cellPointCam=null, cellStartMat=null, cellEndMat=null, cellGeom=null;
  function buildCellPointPipeline(K){
    if (cellPointScene) return;
    // geometry with attribute 'aIndex' = 0..K-1
    const a = new Float32Array(K); for (let i=0;i<K;i++) a[i]=i;
    cellGeom = new THREE.BufferGeometry();
    cellGeom.setAttribute('aIndex', new THREE.BufferAttribute(a, 1));
    cellPointScene = new THREE.Scene();
    cellPointCam   = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    const CELL_VERT = /* glsl */`
    precision highp float;
    layout(location=0) in float aIndex;
    uniform sampler2D uSorted;
    uniform float uK;
    uniform vec2 uGrid; // cols,rows
    void main(){
      float i=aIndex;
      // read key at position i
      vec2 uv=vec2((i+.5)/uK,.5);
      vec4 kv=texture(uSorted,uv);
      float key=kv.r;
      float gx=mod(key,uGrid.x), gy=floor(key/uGrid.x);
      vec2 uv2=(vec2(gx+.5,gy+.5)/uGrid)*2.-1.;
      gl_Position=vec4(uv2,0.,1.);
      // encode depth as i (smaller i wins)
      float z=(i+.5)/uK; gl_Position.z = z*2.-1.;
      gl_PointSize=1.;
    }`;
    const CELL_START_FRAG = /* glsl */`
    precision highp float; out vec4 fc;
    uniform float uWriteVal; // i
    void main(){ fc = vec4(uWriteVal, 0., 0., 1.); }`;
    const CELL_END_FRAG = /* glsl */`
    precision highp float; out vec4 fc;
    uniform float uWriteVal;
    void main(){ fc = vec4(uWriteVal, 0., 0., 1.); }`;
    cellStartMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: CELL_VERT, fragmentShader: CELL_START_FRAG,
      uniforms:{ uSorted:{value:null}, uK:{value:K}, uGrid:{value:new THREE.Vector2()}, uWriteVal:{value:0}},
      depthTest:true, depthWrite:true,
    });
    cellEndMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: CELL_VERT, fragmentShader: CELL_END_FRAG,
      uniforms:{ uSorted:{value:null}, uK:{value:K}, uGrid:{value:new THREE.Vector2()}, uWriteVal:{value:0}},
      depthTest:true, depthWrite:true,
    });
    const ptsStart = new THREE.Points(cellGeom, cellStartMat);
    const ptsEnd   = new THREE.Points(cellGeom, cellEndMat);
    ptsStart.name='cellStart'; ptsEnd.name='cellEnd';
    cellPointScene.add(ptsStart);
    cellPointScene.add(ptsEnd);
  }
  function writeCellRanges(sortedRT, gridCols, gridRows, cellStartRT, cellEndRT){
    // START (argmin): smaller depth wins → depthTest LESS, depth cleared to 1
    cellStartMat.uniforms.uSorted.value = sortedRT.texture;
    cellStartMat.uniforms.uGrid.value.set(gridCols, gridRows);
    renderer.setRenderTarget(cellStartRT);
    renderer.getContext().depthFunc(renderer.getContext().LESS);
    renderer.clear(true,true,true);
    renderer.render(cellPointScene.getObjectByName('cellStart'), cellPointCam);
    renderer.setRenderTarget(null);
    // END (argmax): render with reversed depth so later indices win (we flip Z)
    // Quick trick: reuse same vert but reverse logic by clearing depth to 0 and using GREATER
    cellEndMat.uniforms.uSorted.value = sortedRT.texture;
    cellEndMat.uniforms.uGrid.value.set(gridCols, gridRows);
    const gl = renderer.getContext();
    renderer.setRenderTarget(cellEndRT);
    gl.depthFunc(gl.GREATER);
    gl.clearDepth(0.0);
    renderer.clear(true,true,true);
    renderer.render(cellPointScene.getObjectByName('cellEnd'), cellPointCam);
    // restore defaults
    gl.clearDepth(1.0);
    gl.depthFunc(gl.LESS);
    renderer.setRenderTarget(null);
  }

  /* ========= Candidate reduction (per tip) ========= */
  const CANDIDATE_FRAG = /* glsl */`
  precision highp float; out vec4 fc;
  uniform sampler2D uTips;        // tipsCap×1: {idx, prob, alive, _}
  uniform sampler2D uPos;         // positions
  uniform sampler2D uSorted;      // row K: {key, idx}
  uniform sampler2D uStart;       // cellStart: start index (in sorted)
  uniform sampler2D uEnd;         // cellEnd:   end index  (in sorted)
  uniform vec2  uSimTex;          // cols,rows
  uniform vec2  uWorld;           // W,H
  uniform vec2  uCell;            // cellW,cellH
  uniform vec2  uGrid;            // gridCols,gridRows
  uniform float uMaxDist;         // px
  uniform float uTipsCap;
  uniform float uK;

  vec4 texel1D(sampler2D tex, float idx, vec2 ts){
    float cols=ts.x; float y=floor(idx/cols); float x=idx - y*cols;
    vec2 uv=(vec2(x,y)+.5)/ts; return texture(tex,uv);
  }
  vec2 posOf(float idx){ return texel1D(uPos, idx, uSimTex).xy; }
  float startOf(float cx,float cy){ return texture(uStart, (vec2(cx,cy)+.5)/uGrid).r; }
  float endOf  (float cx,float cy){ return texture(uEnd,   (vec2(cx,cy)+.5)/uGrid).r; }

  void main(){
    float tipI=floor(gl_FragCoord.x-.5);
    if(tipI<0.||tipI>=uTipsCap){ fc=vec4(-1.); return; }
    vec4 tip=texture(uTips, vec2((tipI+.5)/uTipsCap, .5));
    if(tip.b<.5){ fc=vec4(-1.); return; } // not alive
    float fromIdx=tip.r;
    vec2  A=posOf(fromIdx);
    float maxD2=uMaxDist*uMaxDist;

    vec2 c0=floor(A/uCell);
    float Rcx=ceil(uMaxDist/uCell.x);
    float Rcy=ceil(uMaxDist/uCell.y);

    float bestIdx=-1., bestD2=maxD2;
    for(float dy=-64.; dy<=64.; dy+=1.){  // bound
      if(dy<-Rcy||dy>Rcy) continue;
      float cy=c0.y+dy; if(cy<0.||cy>=uGrid.y) continue;
      for(float dx=0.; dx<=64.; dx+=1.){
        if(dx>Rcx) continue;
        float cx=c0.x+dx; if(cx<0.||cx>=uGrid.x) continue;
        float s=startOf(cx,cy), e=endOf(cx,cy);
        if(s<0.||e<=s) continue;
        for(float k=0.; k<4096.; k+=1.){
          float ii=s+k; if(ii>=e) break;
          vec4 kv = texture(uSorted, vec2((ii+.5)/uK, .5));
          float j  = kv.g;
          if(j==fromIdx) continue;
          vec2 B = posOf(j);
          if(B.x<=A.x) continue;
          vec2 d=B-A; float d2=dot(d,d);
          if(d2<bestD2){ bestD2=d2; bestIdx=j; }
        }
      }
    }
    // write bestIdx, bestD2, nextProb, alive=1
    float nextProb = tip.g * ${/* decayed later in split pass if needed */''} 1.0;
    fc = vec4(bestIdx, bestD2, nextProb, 1.0);
  }`;
  const candidateMat = makePass(CANDIDATE_FRAG, {
    uTips:{value:null}, uPos:{value:null}, uSorted:{value:null},
    uStart:{value:null}, uEnd:{value:null},
    uSimTex:{value:new THREE.Vector2()}, uWorld:{value:new THREE.Vector2()},
    uCell:{value:new THREE.Vector2()}, uGrid:{value:new THREE.Vector2()},
    uMaxDist:{value:0}, uTipsCap:{value:0}, uK:{value:0},
  });

  /* ========= Emit counts (0/1/2), Scan (exclusive), Scatter (tips+segments) ========= */
  const EMIT_COUNTS_FRAG = /* glsl */`
  precision highp float; out vec4 fc;
  uniform sampler2D uCand; uniform float uTipsCap;
  float rnd(float x){ return fract(sin(x*43758.5453)*12345.6789); }
  void main(){
    float i=floor(gl_FragCoord.x-.5);
    if(i<0.||i>=uTipsCap){ fc=vec4(0); return; }
    vec4 c=texture(uCand, vec2((i+.5)/uTipsCap,.5));
    float bestIdx=c.r, prob=c.b;
    float count=0.;
    if(bestIdx>=0.){ count=1.; if(rnd(i+prob*9973.)<prob) count=2.; }
    fc=vec4(count,0,0,1);
  }`;
  const emitCountsMat = makePass(EMIT_COUNTS_FRAG, { uCand:{value:null}, uTipsCap:{value:0} });

  // Scan up/down (exclusive)
  const SCAN_UP_FRAG = /* glsl */`
  precision highp float; out vec4 fc;
  uniform sampler2D uSrc; uniform float uN; uniform float uStride;
  float at(float i){ return texture(uSrc, vec2((i+.5)/uN,.5)).r; }
  void main(){
    float i=floor(gl_FragCoord.x-.5);
    if(i<0.||i>=uN){ fc=vec4(0); return; }
    float s=uStride;
    if(mod(i+1.,2.*s)<.5){ fc=vec4(at(i),0,0,1); return; }
    float left=i-s;
    fc=vec4(at(left)+at(i),0,0,1);
  }`;
  const SCAN_DOWN_FRAG = /* glsl */`
  precision highp float; out vec4 fc;
  uniform sampler2D uSrc; uniform float uN; uniform float uStride;
  float at(float i){ return texture(uSrc, vec2((i+.5)/uN,.5)).r; }
  void main(){
    float i=floor(gl_FragCoord.x-.5);
    if(i<0.||i>=uN){ fc=vec4(0); return; }
    float s=uStride;
    if(mod(i+1.,2.*s)<.5){ fc=vec4(at(i),0,0,1); return; }
    float left=i-s;
    float tLeft=at(left), tHere=at(i);
    float newHere=tLeft+tHere;
    fc=vec4(newHere,0,0,1);
  }`;
  const SCAN_DOWN_LEFT_FRAG = /* glsl */`
  precision highp float; out vec4 fc;
  uniform sampler2D uSrc; uniform float uN; uniform float uStride;
  float at(float i){ return texture(uSrc, vec2((i+.5)/uN,.5)).r; }
  void main(){
    float i=floor(gl_FragCoord.x-.5);
    if(i<0.||i>=uN){ fc=vec4(0); return; }
    float s=uStride;
    bool isLeft = mod(i+s+1.,2.*s)<.5;
    if(!isLeft){ fc=vec4(at(i),0,0,1); return; }
    float right=i+s;
    float tRight=at(right);
    fc=vec4(tRight,0,0,1);
  }`;
  const scanUpMat   = makePass(SCAN_UP_FRAG, {uSrc:{value:null}, uN:{value:0}, uStride:{value:1}});
  const scanDownMat = makePass(SCAN_DOWN_FRAG, {uSrc:{value:null}, uN:{value:0}, uStride:{value:1}});
  const scanDownLMat= makePass(SCAN_DOWN_LEFT_FRAG, {uSrc:{value:null}, uN:{value:0}, uStride:{value:1}});
  function scanExclusiveRow(srcRT, tmpRT, N){
    // upsweep
    fsqMesh.material=scanUpMat;
    let cur=srcRT, nxt=tmpRT;
    for (let s=1; s<N; s<<=1){ scanUpMat.uniforms.uSrc.value=cur.texture; scanUpMat.uniforms.uN.value=N; scanUpMat.uniforms.uStride.value=s; renderTo(nxt); [cur,nxt]=[nxt,cur]; }
    // set last to 0
    const setLastMat=makePass(/* glsl */`
    precision highp float; out vec4 fc; uniform sampler2D uSrc; uniform float uN;
    void main(){ float i=floor(gl_FragCoord.x-.5); float v=texture(uSrc, vec2((i+.5)/uN,.5)).r; if(i==uN-1.) v=0.; fc=vec4(v,0,0,1); }`,
    {uSrc:{value:cur.texture}, uN:{value:N}});
    fsqMesh.material=setLastMat; renderTo(nxt); [cur,nxt]=[nxt,cur];
    // downsweep
    for (let s=N>>1; s>=1; s>>=1){ 
      fsqMesh.material=scanDownMat;
      scanDownMat.uniforms.uSrc.value=cur.texture; scanDownMat.uniforms.uN.value=N; scanDownMat.uniforms.uStride.value=s; renderTo(nxt); [cur,nxt]=[nxt,cur];
      fsqMesh.material=scanDownLMat;
      scanDownLMat.uniforms.uSrc.value=cur.texture; scanDownLMat.uniforms.uN.value=N; scanDownLMat.uniforms.uStride.value=s; renderTo(nxt); [cur,nxt]=[nxt,cur];
    }
    return cur;
  }

  /* ========= Line renderer (instanced quads) ========= */
  function makeLineGeo(){ // 6 vertices per instance (two tris), attribute 'corner'
    const quad=new Float32Array([ -1,-1, 1,-1, 1,1,  -1,-1, 1,1, -1,1 ]);
    const g=new THREE.InstancedBufferGeometry();
    g.setAttribute('corner', new THREE.BufferAttribute(quad,2));
    // dummy pos attr (unused)
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6*3),3));
    g.instanceCount=0; return g;
  }
  const LINE_VERT = /* glsl */`
  precision highp float;
  in vec2 corner;
  uniform sampler2D uPos; uniform vec2 uSimTex; uniform vec2 uWorld;
  uniform sampler2D uSegBuf; uniform float uSegCount;
  uniform float uThickness;
  out float vSegId;

  vec4 texel1D(sampler2D tex, float idx, vec2 ts){
    float cols=ts.x; float y=floor(idx/cols); float x=idx - y*cols;
    vec2 uv=(vec2(x,y)+.5)/ts; return texture(tex,uv);
  }
  vec2 posOf(float idx){ return texel1D(uPos, idx, uSimTex).xy; }

  void main(){
    float id=float(gl_InstanceID);
    if(id>=uSegCount){ gl_Position=vec4(0); return; }
    vec4 seg = texture(uSegBuf, vec2((id+.5)/uSegCount, .5));
    vec2 A=posOf(seg.r), B=posOf(seg.g);
    vec2 d=B-A; float L=max(length(d),1e-4); vec2 n=normalize(vec2(-d.y,d.x));
    float halfW=uThickness*.5;
    vec2 C=mix(A,B,(corner.x+1.)*.5);
    vec2 P=C + n*(corner.y*halfW);
    vec2 ndc=(P/uWorld)*2.-1.; ndc.y=-ndc.y;
    gl_Position=vec4(ndc,0.,1.);
    vSegId=id;
  }`;
  const LINE_FRAG = /* glsl */`
  precision highp float; out vec4 fc;
  uniform vec3 uColor, uLightUpColor, uFadeColor;
  uniform float uThickness, uLightUpThickness, uFadeThickness;
  uniform sampler2D uWinner; uniform float uSegCount;
  in float vSegId;
  void main(){
    float w = texture(uWinner, vec2((vSegId+.5)/uSegCount, .5)).r;
    bool win = w>.5;
    vec3 col = win ? uLightUpColor : uFadeColor;
    if (w==0.) col = uColor;
    fc = vec4(col, 1.0);
  }`;
  // let lineGeo=null, lineMat=null, lineMesh=null;

  /* ========= LightningGPU object ========= */
  // ───────────── private mutable state ─────────────
  const state = {
    // RTs
    keyA: null, keyB: null, sorted: null,
    startRT: null, endRT: null,
    tipsA: null, tipsB: null, candRT: null,
    emitCountRT: null, emitTmpRT: null, emitBaseRT: null,
    segBufRT: null, winnerRT: null, visitedRT: null,

    // sizes / caps
    K: 0, tipsCap: 512, maxSegs: 8192,
    gridCols: 0, gridRows: 0,

    // counters / flags
    liveTips: 0, segCount: 0, lastHop: 0, resolving: false, resolveT: 0,

    // deps
    getPosRT: null,
    simTexSize: null,
    worldSize: null,
  };

  // line renderer objects (private)
  let lineGeo = null, lineMat = null, lineMesh = null;

  // ───────────── public methods ─────────────
  function init(renderer_, getPosRT, simTexSize, worldSize) {
    // sizes
    const K = (simTexSize.x * simTexSize.y) | 0;
    state.K = K;
    const W = worldSize.x, H = worldSize.y;
    state.gridCols = Math.ceil(W / gridCellPx.value);
    state.gridRows = Math.ceil(H / gridCellPx.value);

    // RTs
    state.keyA = makeRowRT(K);
    state.keyB = makeRowRT(K);
    state.startRT = makeTexRT(state.gridCols, state.gridRows, { depth: true });
    state.endRT   = makeTexRT(state.gridCols, state.gridRows, { depth: true });
    state.tipsA   = makeRowRT(state.tipsCap);
    state.tipsB   = makeRowRT(state.tipsCap);
    state.candRT  = makeRowRT(state.tipsCap);
    state.emitCountRT = makeRowRT(state.tipsCap, { format: THREE.RedFormat });
    state.emitTmpRT   = makeRowRT(state.tipsCap, { format: THREE.RedFormat });
    state.emitBaseRT_A  = makeRowRT(state.tipsCap, { format: THREE.RedFormat });
    state.emitBaseRT_B  = makeRowRT(state.tipsCap, { format: THREE.RedFormat });
    state.emitBaseIndex = 0;
    state.segBufRT    = makeRowRT(state.maxSegs);
    state.winnerRT    = makeRowRT(state.maxSegs, { format: THREE.RedFormat });
    state.visitedRT   = makeTexRT(simTexSize.x, simTexSize.y, { type: THREE.UnsignedByteType });
    state.lightningRT = new THREE.WebGLRenderTarget(W, H, {
      type: THREE.UnsignedByteType, format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter
    });

    // instanced line renderer
    if (!lineGeo) lineGeo = makeLineGeo();
    if (!lineMat) {
      lineMat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: LINE_VERT,
        fragmentShader: LINE_FRAG,
        uniforms: {
          uPos:              { value: getPosRT().texture },
          uSimTex:           { value: simTexSize },
          uWorld:            { value: worldSize },
          uSegBuf:           { value: state.segBufRT.texture },
          uSegCount:         { value: 0 },
          uColor:            { value: new THREE.Color(lightningColor.value) },
          uLightUpColor:     { value: new THREE.Color(lightUpColor.value) },
          uFadeColor:        { value: new THREE.Color(fadeColor.value) },
          uThickness:        { value: baseThicknessPx.value },
          uLightUpThickness: { value: lightUpThicknessPx.value }, // ← fix: Px
          uFadeThickness:    { value: fadeThicknessPx.value },
          uWinner:           { value: state.winnerRT.texture },
        },
        depthTest: false,
        depthWrite: false,
        transparent: true,
        blending: THREE.AdditiveBlending, // or NormalBlending if preferred
      });
    }
    if (!lineMesh) {
      lineMesh = new THREE.Mesh(lineGeo, lineMat);
      pointsScene.add(lineMesh); // overlay in same scene
    }

    // cell-range pipeline (build once with K)
    buildCellPointPipeline(K);

    // seed tips & clear buffers
    resetDischarge();
    console.log('Discharge reset');

    logTipCountGPU(renderer, state.tipsA, state.tipsCap);
    logTipCountGPU(renderer, state.tipsB, state.tipsCap);

    // deps
    state.getPosRT = getPosRT;
    state.simTexSize = simTexSize;
    state.worldSize = worldSize;
  }

  function resetDischarge() {
    state.liveTips = 8; // starters
    // init tipsA [0..liveTips): {idx, prob, alive, _}
    const data = new Float32Array(state.tipsCap * 4);
    for (let i = 0; i < state.liveTips; i++) {
      data[i*4+0] = i;                        // seed index (left-ish ones will be chosen first hop)
      data[i*4+1] = splitChance0.value;       // initial split probability
      data[i*4+2] = 1.0;                      // alive
      data[i*4+3] = 0.0;
    }
    const dt = new THREE.DataTexture(data, state.tipsCap, 1, THREE.RGBAFormat, THREE.FloatType);
    dt.needsUpdate = true;
    const copyMat = makePass(/*glsl*/`
      precision highp float; out vec4 fc; uniform sampler2D uSrc; uniform float uW;
      void main(){ fc = texture(uSrc, vec2(gl_FragCoord.x / uW, 0.5)); }`,
      { uSrc: { value: dt }, uW: { value: state.tipsCap } });
    fsqMesh.material = copyMat; renderTo(state.tipsA);

    // clear seg/visited/winner
    renderer.setRenderTarget(state.segBufRT); renderer.clearColor(); renderer.clear(true,true,false); renderer.setRenderTarget(null);
    renderer.setRenderTarget(state.visitedRT); renderer.clearColor(); renderer.clear(true,true,false); renderer.setRenderTarget(null);
    renderer.setRenderTarget(state.winnerRT); renderer.clearColor(); renderer.clear(true,true,false); renderer.setRenderTarget(null);

    state.segCount = 0;
    state.resolving = false;
    state.resolveT = 0;
    state.lastHop = 0;
  }

  function hopIfDue(nowMs) {
    if (nowMs - state.lastHop < hopDelayMs.value) return;
    // console.log('LightningGPU hop at', nowMs);
    state.lastHop = nowMs;

    // 1) key particles (cell key, idx)
    keyMat.uniforms.uPos.value = state.getPosRT().texture;
    keyMat.uniforms.uSimTex.value.copy(state.simTexSize);
    keyMat.uniforms.uWorld.value.copy(state.worldSize);
    keyMat.uniforms.uCell.value.set(gridCellPx.value, gridCellPx.value);
    keyMat.uniforms.uK.value = state.K;
    fsqMesh.material = keyMat; renderTo(state.keyA);
    
    // 2) sort by key
    const sorted = bitonicSort(state.keyA, state.keyB, state.K);
    state.sorted = sorted;

    // 3) cell ranges via depth argmin/argmax
    writeCellRanges(sorted, state.gridCols, state.gridRows, state.startRT, state.endRT);

    // 4) nearest-right candidate per tip
    candidateMat.uniforms.uTips.value    = state.tipsA.texture;
    candidateMat.uniforms.uPos.value     = state.getPosRT().texture;
    candidateMat.uniforms.uSorted.value  = sorted.texture;
    candidateMat.uniforms.uStart.value   = state.startRT.texture;
    candidateMat.uniforms.uEnd.value     = state.endRT.texture;
    candidateMat.uniforms.uSimTex.value.copy(state.simTexSize);
    candidateMat.uniforms.uWorld.value.copy(state.worldSize);
    candidateMat.uniforms.uCell.value.set(gridCellPx.value, gridCellPx.value);
    candidateMat.uniforms.uGrid.value.set(state.gridCols, state.gridRows);
    candidateMat.uniforms.uMaxDist.value = maxHopDistPx.value;
    candidateMat.uniforms.uTipsCap.value = state.tipsCap;
    candidateMat.uniforms.uK.value       = state.K;
    fsqMesh.material = candidateMat; renderTo(state.candRT);
    
    // 5) emit counts (0/1/2)
    emitCountsMat.uniforms.uCand.value = state.candRT.texture;
    emitCountsMat.uniforms.uTipsCap.value = state.tipsCap;
    fsqMesh.material = emitCountsMat; renderTo(state.emitCountRT);

    // 6) exclusive scan → bases (if you compact; here we keep simple 1:1 packing)
    const bases = scanExclusiveRow(state.emitCountRT, state.emitTmpRT, state.tipsCap);
    const copyBase = makePass(/*glsl*/`
      precision highp float; out vec4 fc; uniform sampler2D uSrc; uniform float uW;
      void main(){ fc = texture(uSrc, vec2(gl_FragCoord.x / uW, 0.5)); }`,
      { uSrc: { value: bases.texture }, uW: { value: state.tipsCap } });
    copyBase.uniforms.uSrc.value = bases.texture;
    fsqMesh.material = copyBase; renderTo(state.emitBaseRT);

    // after hopIfDue() or after scatter()
    logTipCountGPU(renderer, state.tipsA, state.tipsCap);
    logTipCountGPU(renderer, state.tipsB, state.tipsCap);

    // ↓ Paste this function call right here:
    // logSegmentCountGPU(renderer, bases, state.emitCountRT, state.tipsCap);

    // // 6) exclusive scan → bases (if you compact; here we keep simple 1:1 packing)
    // const bases = scanExclusiveRow(state.emitCountRT, state.emitTmpRT, state.tipsCap);
    // const copyBase = makePass(/*glsl*/`
    //   precision highp float; out vec4 fc; uniform sampler2D uSrc; uniform float uW;
    //   void main(){ fc = texture(uSrc, vec2(gl_FragCoord.x / uW, 0.5)); }`,
    //   { uSrc: { value: bases.texture }, uW: { value: state.tipsCap } });
    // copyBase.uniforms.uSrc.value = bases.texture;
    // fsqMesh.material = copyBase; renderTo(state.emitBaseRT);
    
    // 7) scatter first emits into tipsB (simple: pack to same indices) + write segments
    const SCATTER_TIPS_FRAG = /* glsl */`
      precision highp float; out vec4 fc;
      uniform sampler2D uOldTips, uCand, uCounts;
      uniform float uTipsCap, uSplitDecay;
      void main(){
        float i=floor(gl_FragCoord.x-.5);
        if(i<0.||i>=uTipsCap){ fc=vec4(0); return; }
        float cnt=texture(uCounts, vec2((i+.5)/uTipsCap,.5)).r;
        if(cnt<.5){ fc=vec4(0); return; }
        vec4 c=texture(uCand, vec2((i+.5)/uTipsCap,.5));
        fc = vec4(c.r, max(c.b*uSplitDecay, 0.0), 1.0, 0.0);
      }`;
    const scatterTipsMat = makePass(SCATTER_TIPS_FRAG, {
      uOldTips:   { value: state.tipsA.texture },
      uCand:      { value: state.candRT.texture },
      uCounts:    { value: state.emitCountRT.texture },
      uTipsCap:   { value: state.tipsCap },
      uSplitDecay:{ value: splitDecay.value },
    });
    fsqMesh.material = scatterTipsMat; renderTo(state.tipsB);

    const SCATTER_SEGS_FRAG = /* glsl */`
      precision highp float; out vec4 fc;
      uniform sampler2D uOldTips, uCand, uCounts;
      uniform float uTipsCap, uNowMs;
      void main(){
        float i=floor(gl_FragCoord.x-.5);
        if(i<0.||i>=uTipsCap){ fc=vec4(0); return; }
        float cnt=texture(uCounts, vec2((i+.5)/uTipsCap,.5)).r;
        if(cnt<.5){ fc=vec4(0); return; }
        vec4 tip=texture(uOldTips, vec2((i+.5)/uTipsCap,.5));
        vec4 c  =texture(uCand,    vec2((i+.5)/uTipsCap,.5));
        fc = vec4(tip.r, c.r, uNowMs, 0.0); // (fromIdx,toIdx,time,flags)
      }`;
    const scatterSegsMat = makePass(SCATTER_SEGS_FRAG, {
      uOldTips: { value: state.tipsA.texture },
      uCand:    { value: state.candRT.texture },
      uCounts:  { value: state.emitCountRT.texture },
      uTipsCap: { value: state.tipsCap },
      uNowMs:   { value: nowMs },
    });
    fsqMesh.material = scatterSegsMat; renderTo(state.segBufRT);

    // swap tips
    [state.tipsA, state.tipsB] = [state.tipsB, state.tipsA];
    state.liveTips = state.tipsCap; // (keeping simple 1:1 packing in this trimmed version)

    // (winner detection/propagation omitted here for brevity; you can add the propagation passes and write winner mask to state.winnerRT)
    state.resolving = true; state.resolveT = 0;
  }

  function ensureSafeLightningTarget(state) {
    const cur = renderer.getRenderTarget();
    const badRTs = [
      state && state.segBufRT,
      state && state.winnerRT,
      // if your positions are an RT too, include the current one:
      posRT && posRT[posCur],
    ].filter(Boolean);

    if (cur && badRTs.some(rt => rt && cur.texture === rt.texture)) {
      console.warn('⚠️ Feedback hazard: switching lightning draw to the backbuffer.',
                  { current: cur, segBuf: state.segBufRT, winner: state.winnerRT, pos: posRT[posCur] });
      renderer.setRenderTarget(null); // draw to screen / backbuffer
    }
  }

  function logSegmentCountGPU(renderer, baseRT, countRT, N) {
    if (!baseRT || !baseRT.texture || !countRT || !countRT.texture) {
      console.warn('[Lightning] Segment count skipped — missing inputs');
      return;
    }

    const S = (state._segLog ||= {});
    S.rt ||= new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.UnsignedByteType,  // RGBA8 — always supported
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });

    if (!S.mat) {
      const vert = `
        precision highp float;
        attribute vec3 position;
        attribute vec2 uv;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }`;

      // Packs total (base[last] + count[last]) into RG = hi/lo bytes
      const frag = `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uBase, uCount;
        uniform float uN;
        void main() {
          float last = uN - 1.0;
          // fetch last base + last count
          float baseLast  = texture2D(uBase,  vec2((last + 0.5) / uN, 0.5)).r;
          float countLast = texture2D(uCount, vec2((last + 0.5) / uN, 0.5)).r;
          float total = baseLast + countLast;

          // pack into two bytes
          float hi = floor(total / 256.0);
          float lo = total - hi * 256.0;
          gl_FragColor = vec4(hi / 255.0, lo / 255.0, 0.0, 1.0);
        }`;

      S.mat = new THREE.RawShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: {
          uBase:  { value: null },
          uCount: { value: null },
          uN:     { value: 0 },
        },
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
        transparent: false,
      });

      S.geom = new THREE.PlaneGeometry(2, 2);
      S.mesh = new THREE.Mesh(S.geom, S.mat);
      S.scene = new THREE.Scene();
      S.scene.add(S.mesh);
      S.cam = new THREE.Camera();
    }

    // bind inputs
    S.mat.uniforms.uBase.value  = baseRT.texture;   // the scan result (bases)
    S.mat.uniforms.uCount.value = countRT.texture;  // emitCountRT
    S.mat.uniforms.uN.value     = N;

    // draw to the 1×1 RGBA8 target
    renderer.setRenderTarget(S.rt);
    renderer.render(S.scene, S.cam);
    renderer.setRenderTarget(null);

    // read back packed bytes
    const gl = renderer.getContext();
    const buf = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);

    const hi = buf[0];
    const lo = buf[1];
    const total = hi * 256 + lo;

    console.log(`[Lightning] Segments emitted this hop: ${total}`);
  }

  // Counts active tips where ALIVE = (tip.b > 0.5)
  // tipsRT: the current tips texture (e.g. state.tipsA)
  // tipsCap: width (number of tips in the 1×N row)
  function logTipCountGPU(renderer, tipsRT, tipsCap) {
    if (!tipsRT || !tipsRT.texture) {
      console.warn('[Lightning] tipsRT is null');
      return;
    }

    // cache re-usable objects on your global "state"
    const S = (state._tipLog ||= {});
    S.rt ||= new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.UnsignedByteType,   // RGBA8 — portable
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });

    if (!S.mat) {
      const vert = `
        precision highp float;
        attribute vec3 position; attribute vec2 uv;
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }`;

      // NOTE: alive test is tip.b > 0.5  (B channel)
      // Scans first 4096 tips; increase loop bound if your tipsCap is larger
      const frag = `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uTips;
        uniform float uN;
        void main(){
          float cnt = 0.0;
          for (int i = 0; i < 4096; ++i) {
            float idx = float(i);
            if (idx >= uN) break;
            vec4 tip = texture2D(uTips, vec2((idx + 0.5)/uN, 0.5));
            if (tip.b > 0.5) cnt += 1.0;  // <-- ALIVE = B channel
          }
          // pack cnt into RG (hi/lo bytes)
          float hi = floor(cnt / 256.0);
          float lo = cnt - hi * 256.0;
          gl_FragColor = vec4(hi/255.0, lo/255.0, 0.0, 1.0);
        }`;

      S.mat = new THREE.RawShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: { uTips: { value: null }, uN: { value: 0 } },
        depthTest: false, depthWrite: false, blending: THREE.NoBlending, transparent: false,
      });

      S.geom = new THREE.PlaneGeometry(2, 2);
      S.mesh = new THREE.Mesh(S.geom, S.mat);
      S.scene = new THREE.Scene();
      S.scene.add(S.mesh);
      S.cam = new THREE.Camera();
    }

    // bind inputs
    S.mat.uniforms.uTips.value = tipsRT.texture;
    S.mat.uniforms.uN.value    = tipsCap;

    // render to 1×1
    renderer.setRenderTarget(S.rt);
    renderer.render(S.scene, S.cam);
    renderer.setRenderTarget(null);

    // read back as UNSIGNED_BYTE and unpack
    const gl = renderer.getContext();
    const buf = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const hi = buf[0], lo = buf[1];
    const tipCount = hi * 256 + lo;

    console.log(`[Lightning] Active tips (B>0.5): ${tipCount}`);
  }


  function renderOverlay(nowMs, dt) {
    if (state.resolving) state.resolveT = Math.min(1, state.resolveT + dt / 250);

    ensureSafeLightningTarget(state);

    // update line uniforms and draw overlay
    if (lineMat) {
      lineMat.uniforms.uPos.value = state.getPosRT().texture;
      lineMat.uniforms.uWorld.value.copy(state.worldSize);
      lineMat.uniforms.uSegBuf.value = state.segBufRT.texture;
      lineMat.uniforms.uSegCount.value = state.tipsCap; // or real seg count if you track it
      lineMat.uniforms.uThickness.value = baseThicknessPx.value;
      lineMat.uniforms.uLightUpThickness.value = lightUpThicknessPx.value;
      lineMat.uniforms.uFadeThickness.value = fadeThicknessPx.value;
      lineMat.uniforms.uColor.value.set(lightningColor.value);
      lineMat.uniforms.uLightUpColor.value.set(lightUpColor.value);
      lineMat.uniforms.uFadeColor.value.set(fadeColor.value);
      lineGeo.instanceCount = state.tipsCap; // or state.segCount if maintained
    }
    renderer.setRenderTarget(state.lightningRT);
    renderer.clear(true, true, true);
    renderer.render(pointsScene, cameraPoints);
    renderer.setRenderTarget(null);  // ← always

    // Vertex (GLSL1)
    const fsqVert = `
    precision highp float;
    attribute vec3 position;
    attribute vec2 uv;
    varying vec2 vUv;
    void main() {
      vUv = uv;                       // or: vUv = position.xy*0.5+0.5;
      gl_Position = vec4(position, 1.0);
    }`;

    // Fragment (GLSL1)
    const fsqFrag = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uTex;
    void main() {
      gl_FragColor = texture2D(uTex, vUv);
    }`;

    // Build material (ShaderMaterial or RawShaderMaterial)
    const showLightning = new THREE.RawShaderMaterial({
      vertexShader: fsqVert,
      fragmentShader: fsqFrag,
      uniforms: { uTex: { value: state.lightningRT.texture } },
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      transparent: false,
    });

    fsqMesh.material = showLightning;
    renderer.setRenderTarget(null);
    renderer.render(fsqScene, fsqCam); // ensure the camera var name matches
  }

  function resize(worldSize) {
    state.worldSize = worldSize;
    state.gridCols = Math.ceil(worldSize.x / gridCellPx.value);
    state.gridRows = Math.ceil(worldSize.y / gridCellPx.value);
    state.startRT = makeTexRT(state.gridCols, state.gridRows, { depth: true });
    state.endRT   = makeTexRT(state.gridCols, state.gridRows, { depth: true });
    if (lineMat) lineMat.uniforms.uWorld.value.copy(worldSize);
    state.lightningRT = new THREE.WebGLRenderTarget(worldSize.x, worldSize.y, {
      type: THREE.UnsignedByteType, format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter
    });
  }

  // 2) Each frame (in your step loop), right after you swap pos ping-pong:
  // lightning hop cadence + render overlay lines
  let lastMs = performance.now();
  function stepLightning(){
    const now = performance.now();
    const dt = now - lastMs; lastMs = now;
    lightning.hopIfDue(now);
    lightning.renderOverlay(now, dt);
  }
  // call stepLightning() once per frame after your trail present

  // 3) On resize:
  function onResize(){
    const W = glCanvas.value.width, H = glCanvas.value.height;
    lightning.resize(new THREE.Vector2(W,H));
  }
  window.addEventListener('resize', onResize);

  // 4) UI bindings update instantly (already reactive):
  watch([lightningColor, baseThicknessPx, lightUpColor, fadeColor,
        lightUpThicknessPx, fadeThicknessPx, maxHopDistPx, splitDecay], ()=>{ /* uniforms are read on render */});
  watch(hopDelayMs, ()=>{ /* cadence used in hopIfDue */ });

  /* Optional: button to restart a discharge with current params */
  function newDischarge(){ lightning.resetDischarge(); }
  return { init, hopIfDue, renderOverlay, resize, resetDischarge, stepLightning };
})();
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
