// useLightning.js
// Incremental growth; full-path winner lighting.
// DRAW FROM LIVE PARTICLE POSITIONS every frame.
// Smart tree structure: unique edges keyed by (fromIdx -> toIdx), so shared roots are not drawn twice.

import { reactive, computed, watch } from 'vue'

/* -------------------- utils -------------------- */
const clamp01 = (x) => Math.max(0, Math.min(1, x))
const lerp = (a, b, t) => a + (b - a) * t
const nowMs = () => performance.now()
const randSym = (a) => (Math.random() * 2 - 1) * a
const edgeKey = (a,b) => `${a}->${b}`

function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360
  s = Math.max(0, Math.min(100, s)) / 100
  v = Math.max(0, Math.min(100, v)) / 100
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
const rgbCss = ({r,g,b}, a=1) => `rgba(${r},${g},${b},${a})`

// ----- toroidal helpers -----
  function torusDelta(d, size) {
    if (d >  size / 2) return d - size
    if (d < -size / 2) return d + size
    return d
  }

  // Adjust the *start* point so the direct vector to (x2,y2) is the shortest across wrap
  function torusAdjustStart(x1, y1, x2, y2, W, H) {
    let ax = x1, ay = y1
    const dx = x2 - ax
    const dy = y2 - ay
    if (dx >  W / 2) ax += W; else if (dx < -W / 2) ax -= W
    if (dy >  H / 2) ay += H; else if (dy < -H / 2) ay -= H
    return [ax, ay]
  }

/* -------------------- spatial hash -------------------- */
function makeSpatialHash(particles, cellSize) {
  const inv = 1 / Math.max(1, cellSize)
  const grid = new Map()
  const keyOf = (x, y) => `${x},${y}`
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    const gx = Math.floor(p.x * inv)
    const gy = Math.floor(p.y * inv)
    const k = keyOf(gx, gy)
    let bucket = grid.get(k)
    if (!bucket) { bucket = []; grid.set(k, bucket) }
    bucket.push(i)
  }
  function kNearest(x, y, kWanted, maxDist, W, H) {
    const gx = Math.floor(x * inv)
    const gy = Math.floor(y * inv)
    const maxRing = Math.ceil(maxDist * inv) + 1
    const candidates = []
    const pushCell = (cx, cy) => {
      const bucket = grid.get(keyOf(cx, cy))
      if (!bucket) return
      for (const idx of bucket) {
        const pt = particles[idx]
        const dx = torusDelta(pt.x - x, W)
        const dy = torusDelta(pt.y - y, H)
        const d2 = dx*dx + dy*dy
        if (d2 <= maxDist*maxDist) candidates.push({ idx, d2 })
      }
    }
    for (let ring=0; ring<=maxRing; ring++) {
      for (let ox=-ring; ox<=ring; ox++) {
        pushCell(gx+ox, gy-ring)
        pushCell(gx+ox, gy+ring)
      }
      for (let oy=-ring+1; oy<=ring-1; oy++) {
        pushCell(gx-ring, gy+oy)
        pushCell(gx+ring, gy+oy)
      }
      if (candidates.length >= kWanted) break
    }
    candidates.sort((a,b)=>a.d2-b.d2)
    return kWanted > 0 ? candidates.slice(0, kWanted) : candidates
  }
  return { kNearest }
}

/* -------------------- engine -------------------- */
export function useLightning({ getCtx, getSize, getParticles }) {
  const cfg = reactive({
    enabled: true,

    /* Spawning & cadence */
    initialDelayMs: 400,
    intervalMs: 1000,

    /* Incremental growth pacing */
    hopDelayMs: 10,
    riseMs: 70,
    sparkRiseMs: 100,
    sparkHoldMs: 240,
    fadeMs: 700,
    noWinDelayMs: 180,

    /* Logic & geometry */
    leftColWidth: 100,
    rightColWidth: 50,
    maxStepDist: 140,
    maxStepsPerBranch: 70,
    splitChance: 0.02,

    /* Visuals (solid shapes only; no halo) */
    renderModeBase:  'rect',  // 'rect' | 'stroke' | 'capsule'
    lineCapBase:     'butt',
    renderModeSparkWin:  'rect',
    renderModeSparkLose: 'rect',
    lineCapSpark:    'butt',

    lineWidth: 20.0,
    preAlpha: 0.7,

    // Colors (HSV) for base and spark phases
    hsvBase:      { h: 200, s: 90, v: 100 },
    hsvSparkWin:  { h: 200, s: 90, v: 100 },
    hsvSparkLose: { h: 200, s: 60, v: 80  },

    /* Per-edge noise */
    colorNoiseBase: { h: 0, s: 0, v: 0 },  // ±
    colorNoiseSpark:{ h: 0, s: 0, v: 0 },  // ±
    widthNoisePct: 0,                      // ±% around lineWidth (0..1)

    /* Winner vs others multipliers at spark */
    sparkWidthMult: 2.6,
    loserWidthMult: 0.50,
    sparkAlphaMult: 1.9,
    loserAlphaMult: 0.45,

    /* Corner filling */
    cornerEnabled: true,           // add triangles at joints to fill gaps
    cornerMiterLimit: 4.0,         // cap miter length as multiple of half-width

    /* Legacy single-control compatibility (optional) */
    renderMode: 'rect',
    lineCapStyle: 'butt',
  })

  // Back-compat alias for older UIs
  cfg.hsv = cfg.hsvBase

  // Simple previews (use in your UI if you want)
  const colorPreviewBase = computed(() => rgbCss(hsvToRgb(cfg.hsvBase.h, cfg.hsvBase.s, cfg.hsvBase.v), 1))
  const colorPreviewWin  = computed(() => rgbCss(hsvToRgb(cfg.hsvSparkWin.h, cfg.hsvSparkWin.s, cfg.hsvSparkWin.v), 1))
  const colorPreviewLose = computed(() => rgbCss(hsvToRgb(cfg.hsvSparkLose.h, cfg.hsvSparkLose.s, cfg.hsvSparkLose.v), 1))

  // Legacy select mirrors to detailed keys
  watch(() => cfg.renderMode, v => {
    cfg.renderModeBase = v
    cfg.renderModeSparkWin  = v
    cfg.renderModeSparkLose = v
  })
  watch(() => cfg.lineCapStyle, v => {
    cfg.lineCapBase = v
    cfg.lineCapSpark = v
  })

  let W = 0, H = 0
  const setSize = (w, h) => { W = w; H = h }

  // scheduler
  let nextSpawnAt = 0
  const scheduleFirst = () => { nextSpawnAt = nowMs() + cfg.initialDelayMs }
  const scheduleNext  = () => { nextSpawnAt = nowMs() + cfg.intervalMs }

  // active bolt state
  let bolt = null

  // guards
  watch(() => cfg.maxStepDist, v => { if (v < 8) cfg.maxStepDist = 8 })
  watch(() => cfg.lineWidth,   v => { if (v < 0.1) cfg.lineWidth   = 0.1 })
  watch(() => cfg.preAlpha,    v => { if (v < 0.01) cfg.preAlpha   = 0.01 })
  watch(() => cfg.widthNoisePct, v => { if (v < 0) cfg.widthNoisePct = 0 })

  /* ----- structures ----- */
  // Edge: unique link between two particle indices, drawn once from LIVE positions.
  // {
  //   fromIdx, toIdx,
  //   t0, baseWidth, baseAlpha,
  //   peakWidth, peakAlpha,
  //   isWinner,
  //   colorBaseRgb, colorSparkWinRgb, colorSparkLoseRgb
  // }
  //
  // Branch: { id, tipIdx, nodes:number[], edges:string[], dead:boolean }
  //
  // Bolt:
  // { edges: Map<string,Edge>, branches: Branch[], claimed:Set<number>, winnerBranch, eventT, ended, nextGrowAt, kNear, baseWidth, preAlpha }

  function newBolt() {
    const s = getSize && getSize()
    if (s && s.W && s.H) { W = s.W; H = s.H }
    const particles = getParticles()
    if (!particles || !particles.length || !W || !H) return null

    // choose start in left column
    const starters = []
    for (let i=0;i<particles.length;i++) if (particles[i].x <= cfg.leftColWidth + H/2 && particles[i].x > H/2 && particles[i].y > H/2 && particles[i].y <= H + H/2) starters.push(i)
    if (!starters.length) return null
    const startIdx = starters[(Math.random()*starters.length)|0]

    const hash = makeSpatialHash(particles, Math.max(32, cfg.maxStepDist))
    const kNear = (x,y) => hash.kNearest(x,y, 128, cfg.maxStepDist, W, H)

    const b = {
      edges: new Map(),
      branches: [],
      claimed: new Set([startIdx]),
      winnerBranch: null,
      eventT: null,
      ended: false,
      nextGrowAt: nowMs(),
      kNear,
      baseWidth: cfg.lineWidth,
      preAlpha:  cfg.preAlpha,
    }

    b.branches.push({
      id: 0,
      tipIdx: startIdx,
      nodes: [startIdx],     // particle indices
      edges: [],             // edge keys in order
      dead: false,
    })

    return b
  }

  /* ----- noise helpers ----- */
  function jitterColor(hsv, noise) {
    const h = hsv.h + randSym(noise.h || 0)
    const s = hsv.s + randSym(noise.s || 0)
    const v = hsv.v + randSym(noise.v || 0)
    return hsvToRgb(h, s, v)
  }
  function jitterWidth() {
    const pct = clamp01(Math.abs(cfg.widthNoisePct))
    const mult = 1 + randSym(pct)
    return Math.max(0.1, cfg.lineWidth * mult)
  }

  /* ----- choose closest rightward target avoiding claimed ----- */
  function closestRight(particles, kNear, tipIdx, avoidSet) {
    const tip = particles[tipIdx]
    const cand = kNear(tip.x, tip.y)
    for (let i=0;i<cand.length;i++) {
      const idx = cand[i].idx
      if (idx === tipIdx) continue
      if (avoidSet && avoidSet.has(idx)) continue
      const pt = particles[idx]
      if (pt.x <= tip.x) continue
      const dxWrapped = torusDelta(pt.x - tip.x, W)
      if (dxWrapped <= 0) continue
      return idx
    }
    return null
  }

  /* ----- add (or reuse) unique edge ----- */
  function addEdge(bolt, fromIdx, toIdx) {
    const key = edgeKey(fromIdx, toIdx)
    let e = bolt.edges.get(key)
    if (!e) {
      e = {
        fromIdx, toIdx,
        t0: nowMs(),
        baseWidth: jitterWidth(),
        baseAlpha: bolt.preAlpha,
        peakWidth: null,
        peakAlpha: null,
        isWinner: false,
        colorBaseRgb:      jitterColor(cfg.hsvBase,      cfg.colorNoiseBase),
        colorSparkWinRgb:  jitterColor(cfg.hsvSparkWin,  cfg.colorNoiseSpark),
        colorSparkLoseRgb: jitterColor(cfg.hsvSparkLose, cfg.colorNoiseSpark),
      }
      bolt.edges.set(key, e)
    }
    return key
  }

  /* ----- one growth tick ----- */
  function growOneStep(b) {
    const particles = getParticles()
    if (!particles || !particles.length) return

    let progressed = false

    for (const br of b.branches) {
      if (br.dead) continue
      if (br.nodes.length >= cfg.maxStepsPerBranch + 1) { br.dead = true; continue }

      const forkIdx = br.tipIdx

      // MAIN hop (avoid globally-claimed destinations)
      const nextMain = closestRight(particles, b.kNear, forkIdx, b.claimed)
      if (nextMain == null) { br.dead = true; continue }

      progressed = true
      {
        const ek = addEdge(b, forkIdx, nextMain)
        br.edges.push(ek)
        br.tipIdx = nextMain
        br.nodes.push(nextMain)
        b.claimed.add(nextMain)

        const to = particles[nextMain]
        if (to.x >= (W - cfg.rightColWidth + H/2) && b.winnerBranch === null) {
          b.winnerBranch = br.id
        }
      }

      // SPLIT from same fork
      if (Math.random() < cfg.splitChance && br.nodes.length >= 2 && br.nodes.length < cfg.maxStepsPerBranch + 1) {
        const avoid = new Set(b.claimed)
        avoid.add(br.tipIdx)
        const nextSplit = closestRight(particles, b.kNear, forkIdx, avoid)
        if (nextSplit != null) {
          progressed = true
          const nbId = b.branches.length
          const child = {
            id: nbId,
            // share prefix nodes up to fork, then branch
            nodes: br.nodes.slice(0, br.nodes.length - 1).concat([forkIdx, nextSplit]),
            tipIdx: nextSplit,
            edges: br.edges.slice(), // inherit edge prefix
            dead: false,
          }
          const ek = addEdge(b, forkIdx, nextSplit)
          child.edges.push(ek)
          b.branches.push(child)
          b.claimed.add(nextSplit)

          const to = particles[nextSplit]
          if (to.x >= (W - cfg.rightColWidth + H/2) && b.winnerBranch === null) {
            b.winnerBranch = nbId
          }
        }
      }
    }

    if (!progressed) {
      for (const br of b.branches) br.dead = true
    }

    // Winner found → finalize (mark full path edges as winners)
    if (b.winnerBranch !== null && b.eventT === null) {
      const winEdges = new Set(b.branches[b.winnerBranch].edges)
      for (const [_, e] of b.edges) {
        const isWin = winEdges.has(edgeKey(e.fromIdx, e.toIdx))
        e.isWinner  = isWin
        e.peakWidth = e.baseWidth * (isWin ? cfg.sparkWidthMult : cfg.loserWidthMult)
        e.peakAlpha = e.baseAlpha * (isWin ? cfg.sparkAlphaMult : cfg.loserAlphaMult)
      }
      b.eventT = nowMs()
      for (const br of b.branches) br.dead = true
    }

    // All dead & no winner → loser fade
    if (b.branches.every(br => br.dead) && b.eventT === null) {
      for (const [_, e] of b.edges) {
        e.isWinner  = false
        e.peakWidth = e.baseWidth * cfg.loserWidthMult
        e.peakAlpha = e.baseAlpha * cfg.loserAlphaMult
      }
      b.eventT = nowMs() + cfg.noWinDelayMs
    }

    // schedule next growth
    if (b.eventT === null) b.nextGrowAt = nowMs() + cfg.hopDelayMs
  }

  /* -------------------- drawing helpers (solid) -------------------- */

  function drawSegmentStroke(ctx, x1, y1, x2, y2, width, rgbaCss) {
    ctx.lineWidth = width
    ctx.strokeStyle = rgbaCss
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  function drawSegmentRect(ctx, x1, y1, x2, y2, width, rgbaCss) {
    // Use shortest path on the torus by shifting the start point near the end
    let [ax, ay] = torusAdjustStart(x1, y1, x2, y2, W, H)

    const drawOne = (X1, Y1, X2, Y2) => {
      const dx = X2 - X1, dy = Y2 - Y1
      const len = Math.hypot(dx, dy) || 1e-6
      const ang = Math.atan2(dy, dx)
      const cx = (X1 + X2) * 0.5
      const cy = (Y1 + Y2) * 0.5
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(ang)
      ctx.fillStyle = rgbaCss
      ctx.fillRect(-len / 2, -width / 2, len, width)
      ctx.restore()
    }

    // main draw
    drawOne(ax, ay, x2, y2)

    // duplicate across seams if the aligned start fell outside,
    // so the segment renders seamlessly on both sides
    if (ax < 0)          drawOne(ax + W, ay, x2 + W, y2)
    else if (ax >= W)    drawOne(ax - W, ay, x2 - W, y2)
    if (ay < 0)          drawOne(ax, ay + H, x2, y2 + H)
    else if (ay >= H)    drawOne(ax, ay - H, x2, y2 - H)
  }

  // function drawSegmentRect(ctx, x1, y1, x2, y2, width, rgbaCss) {
  //   const dx = x2 - x1, dy = y2 - y1
  //   const len = Math.hypot(dx, dy) || 0.0001
  //   const ang = Math.atan2(dy, dx)
  //   const cx = (x1 + x2) * 0.5
  //   const cy = (y1 + y2) * 0.5
  //   ctx.save()
  //   ctx.translate(cx, cy)
  //   ctx.rotate(ang)
  //   ctx.fillStyle = rgbaCss
  //   ctx.fillRect(-len / 2, -width / 2, len, width)
  //   ctx.restore()
  // }
  function edgeVisualState(b, e, tNow) {
    // returns { alpha, width, colorRgb } matching current phase
    let alpha = 0, width = 0, colorRgb = e.colorBaseRgb;
    if (b.eventT === null || tNow < b.eventT) {
      alpha = e.baseAlpha; width = e.baseWidth; colorRgb = e.colorBaseRgb;
    } else {
      const te = tNow - b.eventT;
      if (te < cfg.sparkRiseMs) {
        const k = Math.min(1, Math.max(0, te / cfg.sparkRiseMs));
        alpha = e.baseAlpha + (e.peakAlpha - e.baseAlpha) * k;
        width = e.baseWidth + (e.peakWidth - e.baseWidth) * k;
      } else if (te < cfg.sparkRiseMs + cfg.sparkHoldMs) {
        alpha = e.peakAlpha; width = e.peakWidth;
      } else if (te < cfg.sparkRiseMs + cfg.sparkHoldMs + cfg.fadeMs) {
        const k = Math.min(1, Math.max(0, (te - cfg.sparkRiseMs - cfg.sparkHoldMs) / cfg.fadeMs));
        alpha = e.peakAlpha * (1 - k);
        width = e.peakWidth * (1 - k);
      } else { alpha = 0; width = 0; }
      colorRgb = e.isWinner ? e.colorSparkWinRgb : e.colorSparkLoseRgb;
    }
    return { alpha, width, colorRgb };
  }

  function drawSegmentCapsuleToroidal(ctx, x1, y1, x2, y2, width, rgbaCss) {
    // 1) choose shortest toroidal path by shifting the start point
    let [ax, ay] = torusAdjustStart(x1, y1, x2, y2, W, H)
    const dx = x2 - ax
    const dy = y2 - ay
    const len = Math.hypot(dx, dy)
    if (len < 1e-6 || width <= 0) return

    // single draw (main copy)
    drawOne(ax, ay, x2, y2)

    // 2) duplicate if we started outside bounds, like strokeToroidal does
    if (ax < 0)          drawOne(ax + W, ay, x2 + W, y2)
    else if (ax >= W)    drawOne(ax - W, ay, x2 - W, y2)
    if (ay < 0)          drawOne(ax, ay + H, x2, y2 + H)
    else if (ay >= H)    drawOne(ax, ay - H, x2, y2 - H)

    function drawOne(sx, sy, ex, ey) {
      const ddx = ex - sx, ddy = ey - sy
      const L = Math.hypot(ddx, ddy)
      if (L < 1e-6) return
      const ang = Math.atan2(ddy, ddx)

      ctx.save()
      // your renderer subtracts view offset ~H/2; keep that consistent:
      ctx.translate((sx + ex) / 2 - H/2, (sy + ey) / 2 - H/2)
      ctx.rotate(ang)
      ctx.fillStyle = rgbaCss
      // rectangle “capsule” (if you have rounded ends elsewhere, keep that style)
      ctx.fillRect(-L / 2, -width / 2, L, width)
      ctx.restore()
    }
  }


  function drawSegmentCapsule(ctx, x1, y1, x2, y2, width, rgbaCss) {
    const dx = x2 - x1, dy = y2 - y1
    const len = Math.hypot(dx, dy) || 0.0001
    const ang = Math.atan2(dy, dx)
    const cx = (x1 + x2) * 0.5
    const cy = (y1 + y2) * 0.5
    const r = width / 2
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(ang)
    ctx.fillStyle = rgbaCss
    // center rect
    ctx.beginPath()
    ctx.rect(-len / 2, -r, len, 2 * r)
    ctx.fill()
    // end caps
    ctx.beginPath()
    ctx.arc(-len / 2, 0, r, Math.PI / 2, -Math.PI / 2, true)
    ctx.arc( len / 2, 0, r, -Math.PI / 2, Math.PI / 2, true)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
  /* ----- corner helpers ----- */
  function edgeVisualState(b, e, tNow) {
    // Returns current {alpha, width, colorRgb}
    let alpha = 0, width = 0, colorRgb = e.colorBaseRgb
    if (b.eventT === null) {
      // base phase (pre-spark)
      alpha = e.baseAlpha
      width = e.baseWidth
      colorRgb = e.colorBaseRgb
    } else if (tNow < b.eventT) {
      alpha = e.baseAlpha
      width = e.baseWidth
      colorRgb = e.colorBaseRgb
    } else {
      const te = tNow - b.eventT
      if (te < cfg.sparkRiseMs) {
        const k = clamp01(te / cfg.sparkRiseMs)
        alpha = lerp(e.baseAlpha, e.peakAlpha, k)
        width = lerp(e.baseWidth, e.peakWidth, k)
      } else if (te < cfg.sparkRiseMs + cfg.sparkHoldMs) {
        alpha = e.peakAlpha
        width = e.peakWidth
      } else if (te < cfg.sparkRiseMs + cfg.sparkHoldMs + cfg.fadeMs) {
        const k = clamp01((te - cfg.sparkRiseMs - cfg.sparkHoldMs) / cfg.fadeMs)
        alpha = e.peakAlpha * (1 - k)
        width = lerp(e.peakWidth, 0, k)
      } else {
        alpha = 0
        width = 0
      }
      const isW = e.isWinner
      colorRgb = isW ? e.colorSparkWinRgb : e.colorSparkLoseRgb
    }
    return { alpha, width, colorRgb }
  }

  function drawCornerDiamond(ctx, A, P, B, width, rgbaCss) {
    // A = previous node, P = corner node, B = next node
    const ax = A.x - H/2, ay = A.y - H/2;
    const px = P.x - H/2, py = P.y - H/2;
    const bx = B.x - H/2, by = B.y - H/2;

    // direction vectors
    let u1x = px - ax, u1y = py - ay;
    let u2x = bx - px, u2y = by - py;
    const l1 = Math.hypot(u1x, u1y);
    const l2 = Math.hypot(u2x, u2y);
    if (l1 < 1e-4 || l2 < 1e-4) return;

    u1x /= l1; u1y /= l1;
    u2x /= l2; u2y /= l2;

    // compute which side is the inside of the bend
    const cross = u1x * u2y - u1y * u2x;
    const flip = cross < 0 ? -1 : 1;

    // inward normals
    const n1x = flip * (-u1y), n1y = flip * u1x;
    const n2x = flip * (-u2y), n2y = flip * u2x;

    const r = width / 2;

    // points on both sides of each segment
    const p1_in = { x: px + n1x * r, y: py + n1y * r };
    const p2_in = { x: px + n2x * r, y: py + n2y * r };
    const p1_out = { x: px - n1x * r, y: py - n1y * r };
    const p2_out = { x: px - n2x * r, y: py - n2y * r };

    // diamond shape: connect inner and outer corners
    ctx.fillStyle = rgbaCss;
    ctx.beginPath();
    ctx.moveTo(p1_in.x, p1_in.y);
    ctx.lineTo(p2_in.x, p2_in.y);
    ctx.lineTo(p2_out.x, p2_out.y);
    ctx.lineTo(p1_out.x, p1_out.y);
    ctx.closePath();
    ctx.fill();
  }


  /* -------------------- draw bolt (from LIVE positions; losers first, winner last) -------------------- */
  function drawBolt(ctx, b) {
    const tNow = nowMs()
    const particles = getParticles()
    if (!particles || !particles.length) return

    const prevOp  = ctx.globalCompositeOperation
    const prevCap = ctx.lineCap
    const prevJoin= ctx.lineJoin

    ctx.globalCompositeOperation = 'lighter'
    ctx.lineJoin = 'miter'

    // split edges into losers/winners for ordering
    const losers = []
    const winners= []
    for (const [_, e] of b.edges) (e.isWinner ? winners : losers).push(e)

    let alive = false

    const drawList = (list) => {
      for (const e of list) {
        const a = particles[e.fromIdx]
        const bpt = particles[e.toIdx]
        if (!a || !bpt) continue

        // phase envelope
        let alpha = 0
        let width = e.baseWidth
        let colorRgb = e.colorBaseRgb
        let mode = cfg.renderModeBase
        let cap  = cfg.lineCapBase

        const tSeg = tNow - e.t0
        if (tSeg < 0) continue

        if (tSeg < cfg.riseMs) {
          const k = clamp01(tSeg / cfg.riseMs)
          alpha = e.baseAlpha * k
          width = lerp(0.5, e.baseWidth, k)
          colorRgb = e.colorBaseRgb
          mode = cfg.renderModeBase
          cap  = cfg.lineCapBase
        } else if (b.eventT === null || tNow < b.eventT) {
          alpha = e.baseAlpha
          width = e.baseWidth
          colorRgb = e.colorBaseRgb
          mode = cfg.renderModeBase
          cap  = cfg.lineCapBase
        } else {
          const te = tNow - b.eventT
          if (te < cfg.sparkRiseMs) {
            const k = clamp01(te / cfg.sparkRiseMs)
            alpha = lerp(e.baseAlpha, e.peakAlpha, k)
            width = lerp(e.baseWidth, e.peakWidth, k)
          } else if (te < cfg.sparkRiseMs + cfg.sparkHoldMs) {
            alpha = e.peakAlpha
            width = e.peakWidth
          } else if (te < cfg.sparkRiseMs + cfg.sparkHoldMs + cfg.fadeMs) {
            const k = clamp01((te - cfg.sparkRiseMs - cfg.sparkHoldMs) / cfg.fadeMs)
            alpha = e.peakAlpha * (1 - k)
            width = lerp(e.peakWidth, 0, k)
          } else {
            alpha = 0
          }
          // spark phase uses winner/loser colors + modes
          const isW = e.isWinner
          colorRgb = isW ? e.colorSparkWinRgb : e.colorSparkLoseRgb
          mode = isW ? cfg.renderModeSparkWin : cfg.renderModeSparkLose
          cap  = cfg.lineCapSpark
        }

        if (alpha <= 0.001) continue
        alive = true
        const col = rgbCss(colorRgb, alpha)

        const x1 = a.x - H/2, y1 = a.y - H/2, x2 = bpt.x - H/2, y2 = bpt.y - H/2
        if (mode === 'rect') {
          drawSegmentRect(ctx, x1, y1, x2, y2, width, col)
        } else if (mode === 'capsule') {
          drawSegmentCapsuleToroidal(ctx, x1, y1, x2, y2, width, color)
        } else {
          ctx.lineCap = cap
          drawSegmentStroke(ctx, x1, y1, x2, y2, width, col)
        }
      }
    }

    // losers first, winners last
    drawList(losers)
    drawList(winners)

    
    // --- corner fill at joints (per-branch) ---
    if (cfg.cornerEnabled) {
      for (const br of b.branches) {
        const nodes = br.nodes
        if (!nodes || nodes.length < 3) continue
        for (let i=1;i<nodes.length-1;i++) {
          const aIdx = nodes[i-1], pIdx = nodes[i], bIdx = nodes[i+1]
          const e1 = b.edges.get(edgeKey(aIdx, pIdx))
          const e2 = b.edges.get(edgeKey(pIdx, bIdx))
          if (!e1 || !e2) continue
          const s1 = edgeVisualState(b, e1, tNow)
          const s2 = edgeVisualState(b, e2, tNow)
          const alpha = Math.max(s1.alpha, s2.alpha)
          if (alpha <= 0.001) continue
          const width = Math.min(s1.width, s2.width)
          if (width <= 0.01) continue
          const colorRgb = (s1.alpha >= s2.alpha) ? s1.colorRgb : s2.colorRgb
          const col = rgbCss(colorRgb, alpha)
          const A = particles[aIdx], P = particles[pIdx], B = particles[bIdx]
          if (!A || !P || !B) continue
          drawCornerDiamond(ctx, A, P, B, width, col);
        }
      }
    }
ctx.globalCompositeOperation = prevOp
    ctx.lineCap  = prevCap
    ctx.lineJoin = prevJoin

    if (!alive && b.eventT !== null) b.ended = true
  }

  /* -------------------- public API -------------------- */
  function spawnNow() {
    bolt = newBolt()
    if (!bolt) nextSpawnAt = nowMs() + Math.max(200, cfg.initialDelayMs)
    else nextSpawnAt = nowMs() + cfg.intervalMs
  }

  function update() {
    if (!cfg.enabled) return
    const ctx = getCtx()
    if (!ctx) return

    if (!nextSpawnAt) scheduleFirst()
    const t = nowMs()

    if (!bolt && t >= nextSpawnAt) {
      bolt = newBolt()
      if (!bolt) nextSpawnAt = t + Math.max(200, cfg.initialDelayMs)
    }

    if (bolt && bolt.eventT === null && t >= bolt.nextGrowAt) {
      growOneStep(bolt)
    }

    if (bolt) {
      drawBolt(ctx, bolt)
      if (bolt.ended) {
        bolt = null
        scheduleNext()
      }
    }
  }

  function dispose() { /* no-op */ }

  return {
    cfg,
    colorPreview: colorPreviewBase, // legacy alias
    colorPreviewBase,
    colorPreviewWin,
    colorPreviewLose,
    setSize,
    update,
    dispose,
    spawnNow,
  }
}
