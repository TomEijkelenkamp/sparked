<template>
  <div class="app">
    <aside class="controls">
      <h2>Particle Flow</h2>

      <section class="control-group">
        <h3>Movement</h3>
        <label v-for="m in modes" :key="m.value">
          <input type="radio" :value="m.value" v-model="movementMode" />
          {{ m.label }}
        </label>
      </section>

      <section class="control-group">
        <h3>Particles</h3>
        <div class="row">
          <label>Count: <strong>{{ particleCount }}</strong></label>
          <input type="range" min="100" max="6000" step="50" v-model.number="particleCount" />
        </div>
        <div class="row">
          <label>Min size: <strong>{{ minSize.toFixed(1) }}</strong> px</label>
          <input type="range" min="0.5" max="6" step="0.1" v-model.number="minSize" />
        </div>
        <div class="row">
          <label>Max size: <strong>{{ maxSize.toFixed(1) }}</strong> px</label>
          <input type="range" min="0.5" max="50" step="0.1" v-model.number="maxSize" />
        </div>
        <div class="row">
          <label>Min speed: <strong>{{ minSpeed.toFixed(0) }}</strong> px/s</label>
          <input type="range" min="5" max="200" step="1" v-model.number="minSpeed" />
        </div>
        <div class="row">
          <label>Max speed: <strong>{{ maxSpeed.toFixed(0) }}</strong> px/s</label>
          <input type="range" min="5" max="400" step="1" v-model.number="maxSpeed" />
        </div>
        <button class="btn" @click="regenerate">Regenerate</button>
      </section>

      <section class="control-group">
        <h3>Color Range (HSV)</h3>

        <div class="hsv-block">
          <div class="hsv-header">
            <span>Start</span>
            <span class="swatch" :style="{ background: hsvToCss(hsvStart) }"></span>
          </div>
          <div class="row">
            <label>H: <strong>{{ hsvStart.h }}</strong>°</label>
            <input type="range" min="0" max="360" step="1" v-model.number="hsvStart.h" />
          </div>
          <div class="row">
            <label>S: <strong>{{ hsvStart.s }}</strong>%</label>
            <input type="range" min="0" max="100" step="1" v-model.number="hsvStart.s" />
          </div>
          <div class="row">
            <label>V: <strong>{{ hsvStart.v }}</strong>%</label>
            <input type="range" min="0" max="100" step="1" v-model.number="hsvStart.v" />
          </div>
        </div>

        <div class="hsv-block">
          <div class="hsv-header">
            <span>End</span>
            <span class="swatch" :style="{ background: hsvToCss(hsvEnd) }"></span>
          </div>
          <div class="row">
            <label>H: <strong>{{ hsvEnd.h }}</strong>°</label>
            <input type="range" min="0" max="360" step="1" v-model.number="hsvEnd.h" />
          </div>
          <div class="row">
            <label>S: <strong>{{ hsvEnd.s }}</strong>%</label>
            <input type="range" min="0" max="100" step="1" v-model.number="hsvEnd.s" />
          </div>
          <div class="row">
            <label>V: <strong>{{ hsvEnd.v }}</strong>%</label>
            <input type="range" min="0" max="100" step="1" v-model.number="hsvEnd.v" />
          </div>
        </div>

        <div class="row">
          <label>Color jitter: <strong>{{ colorJitter.toFixed(2) }}</strong></label>
          <input type="range" min="0" max="0.5" step="0.01" v-model.number="colorJitter" />
        </div>
        <button class="btn" @click="recolor">Recolor</button>

        <div class="hsv-block">
          <div class="hsv-header">
            <span>Value Range</span>
            <!-- preview swatch uses current hue/sat with max value -->
            <span class="swatch" :style="{ background: hsvToCss({ h: hsvEnd.h, s: hsvEnd.s, v: valueMax }) }"></span>
          </div>
          <div class="row">
            <label>V min: <strong>{{ valueMin }}</strong>%</label>
            <input type="range" min="0" max="100" step="1" v-model.number="valueMin" />
          </div>
          <div class="row">
            <label>V max: <strong>{{ valueMax }}</strong>%</label>
            <input type="range" min="0" max="100" step="1" v-model.number="valueMax" />
          </div>
        </div>

      </section>

      <section class="control-group">
        <h3>Display</h3>
        <div class="row">
          <label>Trail fade: <strong>{{ (trailFade*100)|0 }}%</strong></label>
          <input type="range" min="0" max="0.2" step="0.005" v-model.number="trailFade" />
        </div>
        <div class="row">
          <label>Line mode</label>
          <input type="checkbox" v-model="drawTrails" />
        </div>
      </section>

      <section class="control-group">
        <h3>Lightning</h3>

        <div class="row">
          <label>Enable</label>
          <input type="checkbox" v-model="lightning.cfg.enabled" />
        </div>

        <div class="row">
          <label>Spawn delay (ms)</label>
          <input type="range" min="0" max="3000" step="50" v-model.number="lightning.cfg.initialDelayMs" />
        </div>
        <div class="row">
          <label>Interval (ms)</label>
          <input type="range" min="200" max="5000" step="50" v-model.number="lightning.cfg.intervalMs" />
        </div>
        <div class="row">
          <label>Hop delay (ms)</label>
          <input type="range" min="0" max="400" step="5" v-model.number="lightning.cfg.hopDelayMs" />
        </div>

        <div class="row">
          <label>Left column (px)</label>
          <input type="range" min="10" max="400" step="2" v-model.number="lightning.cfg.leftColWidth" />
        </div>
        <div class="row">
          <label>Right column (px)</label>
          <input type="range" min="10" max="400" step="2" v-model.number="lightning.cfg.rightColWidth" />
        </div>
        <div class="row">
          <label>Max hop dist (px)</label>
          <input type="range" min="20" max="400" step="2" v-model.number="lightning.cfg.maxStepDist" />
        </div>
        <div class="row">
          <label>Max steps/branch</label>
          <input type="range" min="5" max="200" step="1" v-model.number="lightning.cfg.maxStepsPerBranch" />
        </div>
        <div class="row">
          <label>Split chance</label>
          <input type="range" min="0" max="1" step="0.01" v-model.number="lightning.cfg.splitChance" />
        </div>

        <div class="row">
          <label>Hue</label>
          <input type="range" min="0" max="360" step="1" v-model.number="lightning.cfg.hsvBase.h" />
        </div>
        <div class="row">
          <label>Sat</label>
          <input type="range" min="0" max="100" step="1" v-model.number="lightning.cfg.hsvBase.s" />
        </div>
        <div class="row">
          <label>Val</label>
          <input type="range" min="0" max="100" step="1" v-model.number="lightning.cfg.hsvBase.v" />
        </div>
        <div class="row">
          <label>Preview</label>
          <div :style="{width:'28px',height:'16px',borderRadius:'6px',border:'1px solid #555', background: lightning.colorPreview}"></div>
        </div>

        <div class="row">
          <label>Core width</label>
          <input type="range" min="0.5" max="20" step="0.1" v-model.number="lightning.cfg.lineWidth" />
        </div>
        <div class="row">
          <label>Core alpha</label>
          <input type="range" min="0.05" max="1" step="0.01" v-model.number="lightning.cfg.preAlpha" />
        </div>

        <!-- Feather/halo controls -->
        <div class="row">
          <label>Halo width ×</label>
          <input type="range" min="0" max="4" step="0.05" v-model.number="lightning.cfg.haloWidthMult" />
        </div>
        <div class="row">
          <label>Halo alpha ×</label>
          <input type="range" min="0" max="1" step="0.02" v-model.number="lightning.cfg.haloAlphaMult" />
        </div>
        <div class="row">
          <label>Halo blur</label>
          <input type="range" min="0" max="30" step="1" v-model.number="lightning.cfg.haloBlur" />
        </div>

        <!-- Spark-up timings -->
        <div class="row">
          <label>Rise (ms)</label>
          <input type="range" min="10" max="600" step="5" v-model.number="lightning.cfg.riseMs" />
        </div>
        <div class="row">
          <label>Spark rise (ms)</label>
          <input type="range" min="10" max="600" step="5" v-model.number="lightning.cfg.sparkRiseMs" />
        </div>
        <div class="row">
          <label>Spark hold (ms)</label>
          <input type="range" min="50" max="2000" step="10" v-model.number="lightning.cfg.sparkHoldMs" />
        </div>
        <div class="row">
          <label>Fade (ms)</label>
          <input type="range" min="50" max="4000" step="10" v-model.number="lightning.cfg.fadeMs" />
        </div>
        <div class="row">
          <label>No-win delay (ms)</label>
          <input type="range" min="0" max="2000" step="10" v-model.number="lightning.cfg.noWinDelayMs" />
        </div>

        <!-- Winner vs others -->
        <div class="row">
          <label>Win width ×</label>
          <input type="range" min="1" max="6" step="0.05" v-model.number="lightning.cfg.sparkWidthMult" />
        </div>
        <div class="row">
          <label>Lose width ×</label>
          <input type="range" min="0.1" max="2" step="0.05" v-model.number="lightning.cfg.loserWidthMult" />
        </div>
        <div class="row">
          <label>Win alpha ×</label>
          <input type="range" min="1" max="4" step="0.05" v-model.number="lightning.cfg.sparkAlphaMult" />
        </div>
        <div class="row">
          <label>Lose alpha ×</label>
          <input type="range" min="0.05" max="1" step="0.05" v-model.number="lightning.cfg.loserAlphaMult" />
        </div>

        <div class="row">
          <label>Color noise H (±°)</label>
          <input type="range" min="0" max="180" step="1" v-model.number="lightning.cfg.colorNoiseH" />
        </div>
        <div class="row">
          <label>Color noise S (±)</label>
          <input type="range" min="0" max="100" step="1" v-model.number="lightning.cfg.colorNoiseS" />
        </div>
        <div class="row">
          <label>Color noise V (±)</label>
          <input type="range" min="0" max="100" step="1" v-model.number="lightning.cfg.colorNoiseV" />
        </div>
        <div class="row">
          <label>Width noise (±%)</label>
          <input type="range" min="0" max="1" step="0.01" v-model.number="lightning.cfg.widthNoisePct" />
        </div>

        <!-- Base phase -->
        <div class="row">
          <label>Base form</label>
          <select v-model="lightning.cfg.renderModeBase">
            <option value="stroke">Stroke</option><option value="rect">Rect</option><option value="capsule">Capsule</option>
          </select>
        </div>
        <div class="row" v-if="lightning.cfg.renderModeBase==='stroke'">
          <label>Base line cap</label>
          <select v-model="lightning.cfg.lineCapBase">
            <option>butt</option><option>round</option><option>square</option>
          </select>
        </div>

        <!-- Spark phase -->
        <div class="row">
          <label>Spark winner form</label>
          <select v-model="lightning.cfg.renderModeSparkWin">
            <option value="stroke">Stroke</option><option value="rect">Rect</option><option value="capsule">Capsule</option>
          </select>
        </div>
        <div class="row">
          <label>Spark loser form</label>
          <select v-model="lightning.cfg.renderModeSparkLose">
            <option value="stroke">Stroke</option><option value="rect">Rect</option><option value="capsule">Capsule</option>
          </select>
        </div>
        <div class="row" v-if="lightning.cfg.renderModeSparkWin==='stroke' || lightning.cfg.renderModeSparkLose==='stroke'">
          <label>Spark line cap</label>
          <select v-model="lightning.cfg.lineCapSpark">
            <option>butt</option><option>round</option><option>square</option>
          </select>
        </div>

        <!-- Colors with previews -->
        <div class="row">
          <label>Base HSV</label>
          <input type="range" min="0" max="360" step="1" v-model.number="lightning.cfg.hsvBase.h">
          <input type="range" min="0" max="100" step="1" v-model.number="lightning.cfg.hsvBase.s">
          <input type="range" min="0" max="100" step="1" v-model.number="lightning.cfg.hsvBase.v">
          <div :style="{width:'28px',height:'16px',border:'1px solid #555',borderRadius:'6px',background: lightning.colorPreviewBase}"></div>
        </div>
        <div class="row">
          <label>Spark WIN HSV</label>
          <input type="range" min="0" max="360" step="1" v-model.number="lightning.cfg.hsvSparkWin.h">
          <input type="range" min="0" max="100" step="1" v-model.number="lightning.cfg.hsvSparkWin.s">
          <input type="range" min="0" max="100" step="1" v-model.number="lightning.cfg.hsvSparkWin.v">
          <div :style="{width:'28px',height:'16px',border:'1px solid #555',borderRadius:'6px',background: lightning.colorPreviewWin}"></div>
        </div>
        <div class="row">
          <label>Spark LOSE HSV</label>
          <input type="range" min="0" max="360" step="1" v-model.number="lightning.cfg.hsvSparkLose.h">
          <input type="range" min="0" max="100" step="1" v-model.number="lightning.cfg.hsvSparkLose.s">
          <input type="range" min="0" max="100" step="1" v-model.number="lightning.cfg.hsvSparkLose.v">
          <div :style="{width:'28px',height:'16px',border:'1px solid #555',borderRadius:'6px',background: lightning.colorPreviewLose}"></div>
        </div>

        <!-- Noise -->
        <div class="row">
          <label>Base color noise (±H/S/V)</label>
          <input type="range" min="0" max="180" step="1" v-model.number="lightning.cfg.colorNoiseBase.h">
          <input type="range" min="0" max="100" step="1" v-model.number="lightning.cfg.colorNoiseBase.s">
          <input type="range" min="0" max="100" step="1" v-model.number="lightning.cfg.colorNoiseBase.v">
        </div>
        <div class="row">
          <label>Spark color noise (±H/S/V)</label>
          <input type="range" min="0" max="180" step="1" v-model.number="lightning.cfg.colorNoiseSpark.h">
          <input type="range" min="0" max="100" step="1" v-model.number="lightning.cfg.colorNoiseSpark.s">
          <input type="range" min="0" max="100" step="1" v-model.number="lightning.cfg.colorNoiseSpark.v">
        </div>
        <div class="row">
          <label>Width noise (±%)</label>
          <input type="range" min="0" max="1" step="0.01" v-model.number="lightning.cfg.widthNoisePct">
        </div>


        <button class="btn" @click="lightning.spawnNow()">Spawn now</button>
      </section>

    </aside>

    <main class="stage">
      <canvas ref="canvasEl"></canvas>
    </main>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, reactive, watch } from 'vue'
import { useLightning } from './useLightning.js'

/* ----------------------- Reactive controls ----------------------- */
const modes = [
  // existing base
  { value: 'brownian',   label: 'Brownian drift' },
  { value: 'sineflow',   label: 'Sine flow field' },
  { value: 'swirl',      label: 'Swirl around center' },
  { value: 'curlish',    label: 'Curl-like field' },
  { value: 'perlinish',  label: 'Perlin-ish noise' },
  { value: 'lissajous',  label: 'Lissajous field' },
  { value: 'orbits',     label: 'Orbiting hubs' },
  { value: 'multiwell',  label: 'Multi-attractor wells' },
  { value: 'vortexgrid', label: 'Vortex grid' },
  // previous +10
  { value: 'doublegyre',    label: 'Double gyre' },
  { value: 'shear',         label: 'Shear + meander' },
  { value: 'spiralwave',    label: 'Spiral wave' },
  { value: 'hexvortex',     label: 'Hex vortex lattice' },
  { value: 'lemniscate',    label: 'Bi-focal lemniscate' },
  { value: 'saddle',        label: 'Saddle flow' },
  { value: 'noisecurl',     label: 'Noise curl' },
  { value: 'jetstream',     label: 'Jet streams' },
  { value: 'galactic',      label: 'Galactic rotation' },
  { value: 'quasiperiodic', label: 'Quasi-periodic swirl' },
  // NEW +20
  { value: 'cellular',      label: 'Cellular sin×sin' },
  { value: 'catseye',       label: 'Kelvin–Helmholtz eyes' },
  { value: 'doublehelix',   label: 'Double helix lanes' },
  { value: 'mexicanring',   label: 'Mexican-hat ring' },
  { value: 'spiraltiles',   label: 'Tiled spirals' },
  { value: 'noisyswirl',    label: 'Swirl + noise' },
  { value: 'dipole',        label: 'Vortex dipole' },
  { value: 'quadrupole',    label: 'Vortex quadrupole' },
  { value: 'threebody',     label: 'Three-body swirls' },
  { value: 'slinky',        label: 'Traveling slinky' },
  { value: 'rantiles',      label: 'Random curl tiles' },
  { value: 'rose5',         label: 'Five-petal rose' },
  { value: 'barberpole',    label: 'Barber pole bands' },
  { value: 'polarjets',     label: 'Polar jets ring' },
  { value: 'crystal',       label: 'Diamond vortices' },
  { value: 'starfan',       label: 'Star fan' },
  { value: 'sunburst',      label: 'Breathing radial' },
  { value: 'latticewaves',  label: 'Lattice waves' },
  { value: 'bendfold',      label: 'Bend & fold' },
  { value: 'lognoise',      label: 'Log-spiral + noise' },
]
const movementMode = ref('sineflow')

const particleCount = ref(3000)
const minSize = ref(6.0)
const maxSize = ref(20.0)
const minSpeed = ref(30)
const maxSpeed = ref(100)

const hsvStart = reactive({ h: 200, s: 80, v: 90 })
const hsvEnd   = reactive({ h: 320, s: 80, v: 90 })
const colorJitter = ref(0.1)
const valueMin = ref(60)
const valueMax = ref(100)

const trailFade = ref(0.04)
const drawTrails = ref(true)

/* ----------------------- Canvas & particles ----------------------- */
const canvasEl = ref(null)
let ctx = null
let animationId = null
let lastT = 0

let W = 0, H = 0, DPR = Math.min(2, window.devicePixelRatio || 1)
let view = {
  W, H, DPR
}
let world = {
  W, H,
}
view.W = 0; view.H = 0, DPR = Math.min(2, window.devicePixelRatio || 1)
world.W = view.W + view.H
world.H = view.H + view.H

const particles = [] // {x,y,prevX,prevY,speed,size,hsvT,color,angle,tag}

const lightning = useLightning({
  getCtx: () => ctx,
  getSize: () => ({ W, H }),
  getParticles: () => particles,
})

/* ---------- utils ---------- */
function resizeCanvas() {
  const el = canvasEl.value
  if (!el) return
  view.W = el.clientWidth
  view.H = el.clientHeight
  el.width = Math.floor(view.W * DPR)
  el.height = Math.floor(view.H * DPR)
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
  lightning.setSize(view.W, view.H)
  world.W = view.W + view.H
  world.H = view.H + view.H
}
function rand(min, max) { return min + Math.random() * (max - min) }
function clamp01(x) { return Math.max(0, Math.min(1, x)) }
function norm(x,y){ const m=Math.hypot(x,y)||1; return {x:x/m,y:y/m} }

/* HSV <-> RGB utilities */
function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360
  s /= 100; v /= 100
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r=0,g=0,b=0
  if (0 <= h && h < 60)  { r=c; g=x; b=0 }
  else if (60 <= h && h < 120) { r=x; g=c; b=0 }
  else if (120 <= h && h < 180){ r=0; g=c; b=x }
  else if (180 <= h && h < 240){ r=0; g=x; b=c }
  else if (240 <= h && h < 300){ r=x; g=0; b=c }
  else { r=c; g=0; b=x }
  return { r: Math.round((r+m)*255), g: Math.round((g+m)*255), b: Math.round((b+m)*255) }
}
function rgbToCss({r,g,b}, a=1) { return `rgba(${r},${g},${b},${a})` }
function hsvToCss(hsv, a=1) { return rgbToCss(hsvToRgb(hsv.h, hsv.s, hsv.v), a) }
function lerp(a, b, t) { return a + (b - a) * t }
function lerpHSV(a, b, t) {
  let dh = ((b.h - a.h + 540) % 360) - 180
  return { h: (a.h + dh * t + 360) % 360, s: lerp(a.s, b.s, t), v: lerp(a.v, b.v, t) }
}

/* --- noise helpers --- */
function hash(x, y, z) { return Math.sin(x*12.9898 + y*78.233 + z*37.719) * 43758.5453 }
function fract(x){ return x - Math.floor(x) }
function noiseBilinear(X, Y, Z) {
  const x0 = Math.floor(X), y0 = Math.floor(Y)
  const tx = X - x0, ty = Y - y0
  const n00 = fract(hash(x0,   y0,   Z))
  const n10 = fract(hash(x0+1, y0,   Z))
  const n01 = fract(hash(x0,   y0+1, Z))
  const n11 = fract(hash(x0+1, y0+1, Z))
  const nx0 = n00*(1-tx) + n10*tx
  const nx1 = n01*(1-tx) + n11*tx
  return nx0*(1-ty) + nx1*ty
}
function noiseAngle(x, y, t) {
  const s = 0.002, tt = t * 0.0002
  const n = noiseBilinear(x*s, y*s, tt)
  return n * Math.PI * 2
}

/* ---------- particles ---------- */
function makeParticles() {
  particles.length = 0
  const n = particleCount.value
  const aspect = (world.W) / Math.max(1, (world.H))
  const cols = Math.ceil(Math.sqrt(n * aspect))
  const rows = Math.ceil(n / cols)
  const gx = world.W / cols
  const gy = world.H / rows

  for (let i = 0; i < n; i++) {
    const c = i % cols
    const r = Math.floor(i / cols)
    const x = (c + 0.5) * gx + rand(-0.45, 0.45) * gx
    const y = (r + 0.5) * gy + rand(-0.45, 0.45) * gy

    const size = rand(minSize.value, maxSize.value)
    const speed = rand(minSpeed.value, maxSpeed.value)
    const t = clamp01((i / (n - 1 || 1)) + rand(-colorJitter.value, colorJitter.value))
    const hsv = lerpHSV(hsvStart, hsvEnd, clamp01(t))
    hsv.v = Math.max(0, Math.min(100, rand(valueMin.value, valueMax.value)))
    const color = hsvToRgb(hsv.h, hsv.s, hsv.v)

    particles.push({
      x, y, prevX: x, prevY: y,
      size, speed, hsvT: t, color,
      angle: Math.random() * Math.PI * 2,
      tag: Math.random(),
    })
  }
}
function recolor() {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    const t = clamp01((i / (particles.length - 1 || 1)) + rand(-colorJitter.value, colorJitter.value))
    p.hsvT = t
    const hsv = lerpHSV(hsvStart, hsvEnd, clamp01(t))
    hsv.v = Math.max(0, Math.min(100, rand(valueMin.value, valueMax.value)))
    p.color = hsvToRgb(hsv.h, hsv.s, hsv.v)
  }
}

/* ---------- toroidal drawing (edge-cross fix) ---------- */
function strokeToroidal(x1, y1, x2, y2, lineWidth, color) {
  let ax = x1, ay = y1
  let dx = x2 - ax
  let dy = y2 - ay
  if (dx >  world.W/2) ax += world.W; else if (dx < -world.W/2) ax -= world.W
  if (dy >  world.H/2) ay += world.H; else if (dy < -world.H/2) ay -= world.H

  ctx.beginPath()
  ctx.moveTo(ax - view.H/2, ay - view.H/2)
  ctx.lineTo(x2 - view.H/2, y2 - view.H/2)
  ctx.lineWidth = lineWidth
  ctx.strokeStyle = color
  ctx.stroke()

  if (ax < 0) {
    ctx.beginPath(); ctx.moveTo(ax + world.W - view.H/2, ay - view.H/2); ctx.lineTo(x2 + world.W - view.H/2, y2 - view.H/2)
    ctx.lineWidth = lineWidth; ctx.strokeStyle = color; ctx.stroke()
  } else if (ax >= world.W) {
    ctx.beginPath(); ctx.moveTo(ax - world.W - view.H/2, ay - view.H/2); ctx.lineTo(x2 - world.W - view.H/2, y2 - view.H/2)
    ctx.lineWidth = lineWidth; ctx.strokeStyle = color; ctx.stroke()
  }
  if (ay < 0) {
    ctx.beginPath(); ctx.moveTo(ax - view.H/2, ay + world.H - view.H/2); ctx.lineTo(x2 - view.H/2, y2 + world.H - view.H/2)
    ctx.lineWidth = lineWidth; ctx.strokeStyle = color; ctx.stroke()
  } else if (ay >= world.H) {
    ctx.beginPath(); ctx.moveTo(ax - view.H/2, ay - world.H); ctx.lineTo(x2 - view.H/2, y2 - world.H)
    ctx.lineWidth = lineWidth; ctx.strokeStyle = color; ctx.stroke()
  }
}

/* ---------- base velocity fields ---------- */
function field_brownian(p, t) {
  p.angle += (Math.random() - 0.5) * 0.5
  return { x: Math.cos(p.angle), y: Math.sin(p.angle) }
}
function field_sineflow(p, t) {
  const k = 0.0025, T = t * 0.0006
  const vx = Math.sin((p.y * k) + T)
  const vy = Math.cos((p.x * k) - T)
  return norm(vx, vy)
}
function field_swirl(p, t) {
  const cx = world.W * 0.5, cy = world.H * 0.5
  const dx = p.x - cx, dy = p.y - cy
  let vx = -dy, vy = dx
  const wob = Math.sin(t * 0.001) * 0.3 + 1.0
  return norm(vx*wob, vy*wob)
}
function field_curlish(p, t) {
  const k = 0.003, T = t * 0.0007
  const vx = Math.cos(p.y * k - T)
  const vy = -Math.cos(p.x * k + T)
  return norm(vx, vy)
}

/* --- previously added algorithms --- */
function field_perlinish(p, t) {
  const a = noiseAngle(p.x, p.y, t)
  return { x: Math.cos(a), y: Math.sin(a) }
}
function field_lissajous(p, t) {
  const kx = 0.0022, ky = 0.0031
  const w = 0.0012 * t
  const vx = Math.sin(p.x * kx + 2.1 + w) + Math.sin(p.y * ky + 0.3 - w)
  const vy = Math.sin(p.x * ky + 1.7 - w) - Math.sin(p.y * kx + 2.8 + w)
  return norm(vx, vy)
}
function field_orbits(p, t) {
  const hubs = [
    { x: world.W*0.3 + Math.sin(t*0.0003)*world.W*0.1, y: world.H*0.4 + Math.cos(t*0.0002)*world.H*0.12 },
    { x: world.W*0.7 + Math.cos(t*0.00025)*world.W*0.1, y: world.H*0.6 + Math.sin(t*0.00018)*world.H*0.12 },
  ]
  const h = hubs[(p.tag * 2)|0]
  const dx = p.x - h.x, dy = p.y - h.y
  let vx = -dy - 0.2*dx, vy = dx - 0.2*dy
  return norm(vx, vy)
}
function field_multiwell(p, t) {
  const A = [
    { x: world.W*0.2 + Math.sin(t*0.0004+0.0)*world.W*0.08, y: world.H*0.3 + Math.cos(t*0.0003+1.0)*world.H*0.08 },
    { x: world.W*0.5 + Math.sin(t*0.0003+2.1)*world.W*0.05, y: world.H*0.5 + Math.cos(t*0.0005+0.2)*world.H*0.05 },
    { x: world.W*0.8 + Math.sin(t*0.00035+3.2)*world.W*0.07, y: world.H*0.7 + Math.cos(t*0.00028+2.2)*world.H*0.07 },
  ]
  let vx=0, vy=0
  for (const a of A) {
    const dx = a.x - p.x, dy = a.y - p.y
    const d2 = Math.max(100, dx*dx+dy*dy)
    vx += dx / d2; vy += dy / d2
  }
  const rx = -vy*0.6, ry = vx*0.6
  return norm(vx+rx, vy+ry)
}
function field_vortexgrid(p, t) {
  const cell = 140
  const cx = Math.floor(p.x / cell) * cell + cell/2
  const cy = Math.floor(p.y / cell) * cell + cell/2
  const dx = p.x - cx, dy = p.y - cy
  const gx = Math.floor(p.x / cell)
  const gy = Math.floor(p.y / cell)
  const dir = ((gx + gy) & 1) ? 1 : -1
  let vx = -dir * dy, vy = dir * dx
  const wob = 0.8 + 0.3*Math.sin((t*0.001) + (gx*0.7 + gy*1.3))
  return norm(vx*wob, vy*wob)
}
function field_doublegyre(p, t) {
  const x = p.x / world.W, y = p.y / world.H
  const A = 1.0, a = 0.1, w = 2*Math.PI*0.05
  const eps = Math.sin(w * t * 0.001)
  const f = a * eps * x*x + (1 - 2*a*eps) * x
  const dfdx = 2*a*eps*x + (1 - 2*a*eps)
  const u = -Math.PI * A * Math.sin(Math.PI * f) * Math.cos(Math.PI * y)
  const v =  Math.PI * A * Math.cos(Math.PI * f) * Math.sin(Math.PI * y) * dfdx
  return norm(u, v)
}
function field_shear(p, t) {
  const phase = t * 0.0007
  const ny = (p.y / world.H) * 2*Math.PI
  const nx = (p.x / world.W) * 2*Math.PI
  const jets = Math.sin(ny * 3 + 0.7*Math.sin(nx + phase))
  const cross = 0.5 * Math.sin(nx*1.3 - phase)
  return norm(jets, cross)
}
function field_spiralwave(p, t) {
  const cx = world.W*0.5 + Math.sin(t*0.0003)*world.W*0.05
  const cy = world.H*0.5 + Math.cos(t*0.00025)*world.H*0.05
  const dx = p.x - cx, dy = p.y - cy
  const r = Math.hypot(dx, dy) + 1e-3
  const rot = 1.0 + 0.3*Math.sin(t*0.001)
  let vx = -dy + 0.25*dx*Math.sign(Math.sin(t*0.0008))
  let vy =  dx + 0.25*dy*Math.sign(Math.sin(t*0.0008))
  return norm(vx*rot/r, vy*rot/r)
}
function field_hexvortex(p, t) {
  const cell = 160
  const row = Math.floor(p.y / (cell * 0.866))
  const col = Math.floor((p.x - (row%2 ? cell/2 : 0)) / cell)
  const cx = col*cell + (row%2 ? cell/2 : 0) + cell/2
  const cy = row*(cell*0.866) + (cell*0.866)/2
  const dx = p.x - cx, dy = p.y - cy
  const dir = ((row + col) & 1) ? 1 : -1
  let vx = -dir * dy, vy = dir * dx
  const wob = 0.85 + 0.25*Math.sin(t*0.001 + row*0.9 + col*0.7)
  return norm(vx*wob, vy*wob)
}
function field_lemniscate(p, t) {
  const s = 0.25 + 0.05*Math.sin(t*0.0007)
  const f1 = { x: world.W*(0.5 - s), y: world.H*0.5 }
  const f2 = { x: world.W*(0.5 + s), y: world.H*0.5 }
  function tangential(fx, fy) {
    const dx = p.x - fx, dy = p.y - fy
    const r2 = dx*dx + dy*dy + 200
    return { x: -dy / r2, y: dx / r2 }
  }
  const v1 = tangential(f1.x, f1.y)
  const v2 = tangential(f2.x, f2.y)
  return norm(v1.x + v2.x, v1.y + v2.y)
}
function field_saddle(p, t) {
  const cx = world.W*0.5, cy = world.H*0.5
  const dx = (p.x - cx), dy = (p.y - cy)
  const ang = t*0.0003
  const ca = Math.cos(ang), sa = Math.sin(ang)
  const rx = ca*dx - sa*dy, ry = sa*dx + ca*dy
  return norm(rx, -ry)
}
function field_noisecurl(p, t) {
  const s = 0.003, tt = t * 0.0003, e = 0.5
  const X = p.x * s, Y = p.y * s, Z = tt
  const nx = noiseBilinear(X, Y+e, Z) - noiseBilinear(X, Y-e, Z)
  const ny = noiseBilinear(X+e, Y, Z) - noiseBilinear(X-e, Y, Z)
  return norm(nx, -ny)
}
function field_jetstream(p, t) {
  const ny = (p.y / world.H) * 2*Math.PI
  let vx = Math.sin(ny * 5 + 0.5*Math.sin(p.x*0.004 + t*0.001))
  let vy = 0.4 * Math.sin(p.x*0.002 - t*0.0008)
  return norm(vx, vy)
}
function field_galactic(p, t) {
  const cx = world.W*0.5, cy = world.H*0.5
  const dx = p.x - cx, dy = p.y - cy
  const r = Math.hypot(dx, dy) + 1e-3
  let vx = -dy / r, vy = dx / r
  const wave = 0.3*Math.sin(0.004*(dx) + 0.004*(dy) + t*0.0006)
  vx += wave * (dx/r); vy += wave * (dy/r)
  return norm(vx, vy)
}
function field_quasiperiodic(p, t) {
  const c1 = { x: world.W*0.35 + Math.sin(t*0.00037)*world.W*0.06, y: world.H*0.45 + Math.cos(t*0.00041)*world.H*0.05 }
  const c2 = { x: world.W*0.65 + Math.cos(t*0.00029)*world.W*0.07, y: world.H*0.55 + Math.sin(t*0.00033)*world.H*0.06 }
  function swirl(cx, cy) {
    const dx = p.x - cx, dy = p.y - cy
    const r2 = dx*dx + dy*dy + 150
    return { x: -dy / r2, y: dx / r2 }
  }
  const v1 = swirl(c1.x, c1.y)
  const v2 = swirl(c2.x, c2.y)
  return norm(v1.x + v2.x, v1.y + v2.y)
}

/* --- 20 NEW algorithms --- */

// 1) Cellular sin×sin (divergence-free from streamfunction ψ = sin kx sin ky)
function field_cellular(p, t){
  const k = 2*Math.PI/180
  const vx =  Math.cos(p.y*k) * Math.sin(p.x*k)
  const vy = -Math.cos(p.x*k) * Math.sin(p.y*k)
  return norm(vx, vy)
}

// 2) Kelvin–Helmholtz Cat’s Eye
function field_catseye(p, t){
  const U = 1, Ly = 70, k = 2*Math.PI/220
  const ph = k*p.x - t*0.0006
  const sech2 = (y)=>{ const e=Math.cosh(y/Ly); return 1/(e*e) }
  const u = U*Math.tanh((p.y-world.H*0.5)/Ly) + 0.8*sech2(p.y-world.H*0.5)*Math.cos(ph)
  const v = -0.8*(2*(p.y-world.H*0.5)/Ly)*sech2(p.y-world.H*0.5)*Math.sin(ph)
  return norm(u, v)
}

// 3) Double helix lanes
function field_doublehelix(p, t){
  const k = 0.004, w = t*0.001
  const a = Math.sin(p.y*k + w)
  const b = Math.sin((p.y+80)*k - w)
  return norm(a + b, 0.6*Math.cos(p.x*k - w))
}

// 4) Mexican-hat ring vortex
function field_mexicanring(p, t){
  const cx=world.W/2, cy=world.H/2
  const dx=p.x-cx, dy=p.y-cy, r=Math.hypot(dx,dy)+1e-3
  const r0 = Math.min(world.W, world.H)*0.28
  const g = Math.exp(-((r-r0)*(r-r0))/(2*(r0*0.25)**2)) * (1+0.3*Math.sin(t*0.001))
  return norm(-dy*g, dx*g)
}

// 5) Tiled spirals
function field_spiraltiles(p, t){
  const cell=200
  const cx = Math.floor(p.x/cell)*cell + cell/2
  const cy = Math.floor(p.y/cell)*cell + cell/2
  const dx=p.x-cx, dy=p.y-cy, r=Math.hypot(dx,dy)+1e-3
  const spin = ((Math.floor(p.x/cell)+Math.floor(p.y/cell))&1)?1:-1
  return norm(spin*(-dy/r) + 0.25*(dx/r), spin*(dx/r) + 0.25*(dy/r))
}

// 6) Swirl + noise
function field_noisyswirl(p, t){
  const cx=world.W/2, cy=world.H/2, dx=p.x-cx, dy=p.y-cy
  const base = norm(-dy, dx)
  const a = noiseAngle(p.x*1.2, p.y*1.2, t)
  return norm(base.x + 0.6*Math.cos(a), base.y + 0.6*Math.sin(a))
}

// 7) Vortex dipole
function field_dipole(p, t){
  const s=0.22, c1={x:world.W*(0.5-s),y:world.H*0.5}, c2={x:world.W*(0.5+s),y:world.H*0.5}
  function v(cx,cy,sgn){ const dx=p.x-cx,dy=p.y-cy; const r2=dx*dx+dy*dy+120; return {x: sgn*(-dy/r2), y: sgn*(dx/r2)}}
  const v1=v(c1.x,c1.y,1), v2=v(c2.x,c2.y,-1)
  return norm(v1.x+v2.x, v1.y+v2.y)
}

// 8) Vortex quadrupole
function field_quadrupole(p, t){
  const d=world.W*0.18
  const C=[{x:world.W/2-d,y:world.H/2-d, s:1},{x:world.W/2+d,y:world.H/2-d,s:-1},{x:world.W/2-d,y:world.H/2+d,s:-1},{x:world.W/2+d,y:world.H/2+d,s:1}]
  let vx=0,vy=0
  for(const c of C){ const dx=p.x-c.x,dy=p.y-c.y; const r2=dx*dx+dy*dy+140; vx+=c.s*(-dy/r2); vy+=c.s*(dx/r2) }
  return norm(vx,vy)
}

// 9) Three-body swirls
function field_threebody(p, t){
  const R=world.W*0.25
  const c1={x:world.W/2+R*Math.cos(t*0.0004),y:world.H/2+R*Math.sin(t*0.0004)}
  const c2={x:world.W/2+R*Math.cos(t*0.0004+2.094),y:world.H/2+R*Math.sin(t*0.0004+2.094)}
  const c3={x:world.W/2+R*Math.cos(t*0.0004+4.188),y:world.H/2+R*Math.sin(t*0.0004+4.188)}
  const C=[c1,c2,c3]
  let vx=0,vy=0
  for(const c of C){ const dx=p.x-c.x,dy=p.y-c.y; const r2=dx*dx+dy*dy+180; vx+=-dy/r2; vy+=dx/r2 }
  return norm(vx,vy)
}

// 10) Traveling slinky
function field_slinky(p, t){
  const k=0.003, w=t*0.001
  const vx = Math.sin(k*p.x + Math.sin(k*p.y*0.7 + w))
  const vy = Math.sin(k*p.y + Math.sin(k*p.x*0.7 - w))
  return norm(vx,vy)
}

// 11) Random curl tiles
function field_rantiles(p, t){
  const cell=180
  const gx=Math.floor(p.x/cell), gy=Math.floor(p.y/cell)
  const phase = fract(hash(gx+31, gy-17, Math.floor(t*0.0008)))*Math.PI*2
  const cx=gx*cell+cell/2, cy=gy*cell+cell/2
  const dx=p.x-cx, dy=p.y-cy
  let vx=-dy, vy=dx
  const rot=Math.cos(phase)
  return norm(vx*rot - vy*(1-rot), vy*rot + vx*(1-rot))
}

// 12) Five-petal rose (angle driven by θ*5)
function field_rose5(p, t){
  const cx=world.W/2, cy=world.H/2
  const dx=p.x-cx, dy=p.y-cy
  const theta=Math.atan2(dy,dx), r=Math.hypot(dx,dy)+1e-3
  const a = 5*theta + 0.5*Math.sin(t*0.001)
  return norm(Math.cos(a) - dy/r, Math.sin(a) + dx/r)
}

// 13) Barber pole bands
function field_barberpole(p, t){
  const k=0.004
  const ph = k*(p.x+p.y) + t*0.0012
  return norm(Math.sin(ph), Math.cos(ph*0.7))
}

// 14) Polar jets ring (fast ring at radius r0)
function field_polarjets(p, t){
  const cx=world.W/2, cy=world.H/2
  const dx=p.x-cx, dy=p.y-cy, r=Math.hypot(dx,dy)+1e-3
  const r0=Math.min(world.W,world.H)*0.35
  const band = Math.exp(-((r-r0)**2)/(2*(r0*0.15)**2))
  return norm(-dy*band, dx*band)
}

// 15) Diamond vortices (rotate by 45° grid)
function field_crystal(p, t){
  const k=2*Math.PI/160
  const X=(p.x+p.y)*k, Y=(p.x-p.y)*k
  const vx =  Math.sin(X)*Math.cos(Y)
  const vy = -Math.cos(X)*Math.sin(Y)
  return norm(vx,vy)
}

// 16) Star fan (radial/tangential alternation by sector)
function field_starfan(p, t){
  const cx=world.W/2, cy=world.H/2
  const dx=p.x-cx, dy=p.y-cy
  const theta=Math.atan2(dy,dx)
  const sectors=8
  const s=((Math.floor((theta+Math.PI)/(2*Math.PI)*sectors))%2)?1:-1
  return s>0 ? norm(dx,dy) : norm(-dy,dx)
}

// 17) Sunburst (breathing radial)
function field_sunburst(p, t){
  const cx=world.W/2, cy=world.H/2
  const dx=p.x-cx, dy=p.y-cy
  const b = 0.3*Math.sin(t*0.001)
  return norm(dx*(1+b), dy*(1+b))
}

// 18) Lattice waves (two standing waves)
function field_latticewaves(p, t){
  const k=0.003, ph=t*0.001
  const vx = Math.sin(k*p.x+ph)+Math.sin(k*p.y*1.3-ph)
  const vy = Math.cos(k*p.y-ph)-Math.cos(k*p.x*1.1+ph)
  return norm(vx,vy)
}

// 19) Bend & fold (tanh-based folding map)
function field_bendfold(p, t){
  const s=0.006, ph=t*0.001
  const fx = Math.tanh(s*(p.y - world.H/2) + 0.5*Math.sin(ph))
  const fy = Math.tanh(s*(p.x - world.W/2) - 0.5*Math.cos(ph))
  return norm(fx, -fy)
}

// 20) Log-spiral + noise
function field_lognoise(p, t){
  const cx=world.W/2, cy=world.H/2, dx=p.x-cx, dy=p.y-cy
  const r=Math.hypot(dx,dy)+1e-3
  const tang = norm(-dy/r, dx/r)
  const a = noiseAngle(p.x, p.y, t)
  return norm(tang.x + 0.35*(dx/r) + 0.6*Math.cos(a), tang.y + 0.35*(dy/r) + 0.6*Math.sin(a))
}

function getField(mode) {
  switch (mode) {
    case 'brownian':   return field_brownian
    case 'sineflow':   return field_sineflow
    case 'swirl':      return field_swirl
    case 'curlish':    return field_curlish
    case 'perlinish':  return field_perlinish
    case 'lissajous':  return field_lissajous
    case 'orbits':     return field_orbits
    case 'multiwell':  return field_multiwell
    case 'vortexgrid': return field_vortexgrid
    case 'doublegyre':    return field_doublegyre
    case 'shear':         return field_shear
    case 'spiralwave':    return field_spiralwave
    case 'hexvortex':     return field_hexvortex
    case 'lemniscate':    return field_lemniscate
    case 'saddle':        return field_saddle
    case 'noisecurl':     return field_noisecurl
    case 'jetstream':     return field_jetstream
    case 'galactic':      return field_galactic
    case 'quasiperiodic': return field_quasiperiodic
    // new 20
    case 'cellular':      return field_cellular
    case 'catseye':       return field_catseye
    case 'doublehelix':   return field_doublehelix
    case 'mexicanring':   return field_mexicanring
    case 'spiraltiles':   return field_spiraltiles
    case 'noisyswirl':    return field_noisyswirl
    case 'dipole':        return field_dipole
    case 'quadrupole':    return field_quadrupole
    case 'threebody':     return field_threebody
    case 'slinky':        return field_slinky
    case 'rantiles':      return field_rantiles
    case 'rose5':         return field_rose5
    case 'barberpole':    return field_barberpole
    case 'polarjets':     return field_polarjets
    case 'crystal':       return field_crystal
    case 'starfan':       return field_starfan
    case 'sunburst':      return field_sunburst
    case 'latticewaves':  return field_latticewaves
    case 'bendfold':      return field_bendfold
    case 'lognoise':      return field_lognoise
    default:              return field_sineflow
  }
}

/* ---------- animation ---------- */
function step(ts) {
  if (!lastT) lastT = ts
  const dt = Math.min(0.05, (ts - lastT) / 1000)
  lastT = ts

  if (drawTrails.value && trailFade.value > 0) {
    ctx.fillStyle = `rgba(0,0,0,${trailFade.value})`
    ctx.fillRect(0-view.H/2, 0-view.H/2, world.W-view.H/2, world.H-view.H/2)
  } else {
    ctx.fillRect(0-view.H/2, 0-view.H/2, world.W-view.H/2, world.H-view.H/2)
  }

  const field = getField(movementMode.value)

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    const dir = field(p, ts)
    const vx = dir.x * p.speed * dt
    const vy = dir.y * p.speed * dt

    const oldX = p.x, oldY = p.y
    p.x += vx; p.y += vy

    // toroidal wrap
    if (p.x < 0) p.x += world.W
    if (p.x >= world.W) p.x -= world.W
    if (p.y < 0) p.y += world.H
    if (p.y >= world.H) p.y -= world.H

    if (drawTrails.value) {
      strokeToroidal(oldX, oldY, p.x, p.y, p.size, rgbToCss(p.color, 0.85))
    } else {
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fillStyle = rgbToCss(p.color, 0.9)
      ctx.fill()
    }
  }

  lightning.update() // draws lightning on top (additive blend)

  animationId = requestAnimationFrame(step)
}

/* ---------- lifecycle ---------- */
function regenerate() {
  makeParticles()
  ctx.fillStyle = 'rgba(0,0,0,1)'
  ctx.fillRect(0-view.H/2, 0-view.H/2, world.W-view.H/2, world.H-view.H/2)
}
onMounted(() => {
  ctx = canvasEl.value.getContext('2d', { alpha: false })
  resizeCanvas()
  makeParticles()
  ctx.fillStyle = 'rgba(0,0,0,1)'
  ctx.fillRect(0-view.H/2, 0-view.H/2, world.W-view.H/2, world.H-view.H/2)

  window.addEventListener('resize', () => {
    const prevW = world.W, prevH = world.H
    resizeCanvas()
    const sx = world.W / Math.max(1, prevW)
    const sy = world.H / Math.max(1, prevH)
    for (const p of particles) {
      p.x *= sx; p.y *= sy
    }
  })

  animationId = requestAnimationFrame(step)
})
onBeforeUnmount(() => {
  if (animationId) cancelAnimationFrame(animationId)
  lightning.dispose()
})

watch([minSize, maxSize], () => {
  if (minSize.value > maxSize.value) [minSize.value, maxSize.value] = [maxSize.value, minSize.value]
})
watch([minSpeed, maxSpeed], () => {
  if (minSpeed.value > maxSpeed.value) [minSpeed.value, maxSpeed.value] = [maxSpeed.value, minSpeed.value]
})
watch([valueMin, valueMax], () => {
  if (valueMin.value > valueMax.value) {
    [valueMin.value, valueMax.value] = [valueMax.value, valueMin.value]
  }
})
</script>

<style scoped>
:root {
  --bg: #0b0b0f;
  --panel: #14141b;
  --text: #eaeaf3;
  --muted: #a9a9b6;
  --accent: #7aa2ff;
  --border: #282836;
  --btn: #1f2535;
}

* { box-sizing: border-box; }

.app {
  display: grid;
  grid-template-columns: 320px 1fr;
  height: 100vh;
  width: 100vw;
  background: var(--bg);
  color: var(--text);
  overflow: hidden;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji";
}

.controls {
  padding: 16px 16px 24px;
  background: var(--panel);
  border-right: 1px solid var(--border);
  overflow-y: auto;
}

.controls h2 {
  margin: 0 0 12px;
  font-size: 20px;
  letter-spacing: 0.3px;
}

.control-group {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
  background: #101018;
}

.control-group h3 {
  margin: 0 0 10px;
  font-size: 14px;
  color: var(--muted);
  font-weight: 600;
  letter-spacing: 0.3px;
}

label {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
}

.row {
  display: grid;
  grid-template-columns: 130px 1fr;
  align-items: center;
  gap: 10px;
  margin: 8px 0;
}

input[type="range"] { width: 100%; }

.hsv-block {
  border: 1px dashed var(--border);
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 8px;
}

.hsv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 6px;
}

.swatch {
  width: 24px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid var(--border);
}

.btn {
  width: 100%;
  margin-top: 6px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  background: var(--btn);
  color: var(--text);
  border-radius: 10px;
  cursor: pointer;
  transition: filter 0.15s ease;
  font-weight: 600;
}
.btn:hover { filter: brightness(1.1); }

.stage { position: relative; height: 100%; width: 100%; }
canvas { display: block; width: 100%; height: 100%; background: black; }
</style>
