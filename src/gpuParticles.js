// gpuParticles.js — WebGL2 particle sim + trails + per-particle HSV + 12 vector fields

// ====== FULLSCREEN TRIANGLE VERTEX (shared) ======
const QUAD_VERT = `#version 300 es
precision highp float;
const vec2 P[3] = vec2[3](
  vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0)
);
void main(){ gl_Position = vec4(P[gl_VertexID],0.0,1.0); }
`;

// ====== SIMULATION FRAGMENT (updates positions) ======
const SIM_FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D uPos;       // RG: x,y world units
uniform sampler2D uSpeed;     // R: speed, G: size(px)
uniform vec2 uSimTexSize;     // cols, rows
uniform vec2 uWorldSize;      // W,H world units
uniform float uTime;          // seconds
uniform float uDt;            // seconds (clamped)
uniform int uMode;            // 0..11 (12 fields)
uniform vec2 uCenter;         // world center (W/2,H/2)

// ---- helpers ----
vec4 texel1D(sampler2D tex, float idx, vec2 texSize){
  float cols = texSize.x;
  float y = floor(idx / cols);
  float x = idx - y*cols;
  vec2 uv = (vec2(x,y)+0.5)/texSize;
  return texture(tex, uv);
}
vec2 wrapTorus(vec2 p, vec2 wh){
  p = mod(p, wh);
  if(p.x<0.0)p.x+=wh.x;
  if(p.y<0.0)p.y+=wh.y;
  return p;
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.,0.));
  float c = hash(i + vec2(0.,1.));
  float d = hash(i + vec2(1.,1.));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
vec2 n2(vec2 p){ return vec2(noise(p), noise(p+17.2)); }

// ---- vector fields (normalized) ----
// 0) sineflow: orthogonal sines with time wobble
vec2 field_sineflow(vec2 p, float t, vec2 wh){
  float ax = 6.2831853*(p.y/wh.y) + t*0.35;
  float ay = 6.2831853*(p.x/wh.x) - t*0.27;
  vec2 v = vec2(sin(ax), sin(ay));
  float L = length(v); return L>1e-6 ? v/L : vec2(0.0);
}
// 1) swirl: rotate around center with slight breathing
vec2 field_swirl(vec2 p, float t, vec2 wh){
  vec2 c = uCenter;
  vec2 d = p - c;
  float r = length(d) + 1e-6;
  vec2 tang = vec2(-d.y, d.x)/r;
  float wob = 0.7 + 0.3*sin(t*0.6);
  return tang * wob;
}
// 2) curlish: angle from noise
vec2 field_curlish(vec2 p, float t, vec2 wh){
  vec2 q = p/wh*4.0 + vec2(t*0.15, -t*0.11);
  float a = noise(q)*6.2831853;
  return vec2(cos(a), sin(a));
}
// 3) lissajous: coupled sines
vec2 field_lissajous(vec2 p, float t, vec2 wh){
  float x = p.x/wh.x, y = p.y/wh.y;
  float fx = sin(2.0*3.14159*(3.0*x + 0.5*y + 0.05*sin(t)));
  float fy = sin(2.0*3.14159*(0.7*x + 2.0*y + 0.08*cos(0.7*t)));
  vec2 v = vec2(fx, fy);
  float L = length(v); return L>1e-6 ? v/L : vec2(0.0);
}
// 4) orbits: multiple moving hubs
vec2 field_orbits(vec2 p, float t, vec2 wh){
  vec2 c1 = uCenter + vec2(0.25*wh.x*sin(t*0.4), 0.2*wh.y*cos(t*0.31));
  vec2 c2 = uCenter + vec2(0.2*wh.x*cos(t*0.22+2.0), 0.25*wh.y*sin(t*0.29+1.0));
  vec2 d1 = p - c1; float r1 = length(d1)+1e-4; vec2 v1 = vec2(-d1.y, d1.x)/r1;
  vec2 d2 = p - c2; float r2 = length(d2)+1e-4; vec2 v2 = vec2(-d2.y, d2.x)/r2;
  vec2 v = normalize(v1) * 0.6 + normalize(v2) * 0.4;
  float L = length(v); return L>1e-6 ? v/L : vec2(0.0);
}
// 5) vortexgrid: small alternating vortices
vec2 field_vortexgrid(vec2 p, float t, vec2 wh){
  vec2 g = (p/wh)*8.0;
  vec2 cell = floor(g);
  vec2 local = fract(g) - 0.5;
  float s = mod(cell.x + cell.y, 2.0) < 1.0 ? 1.0 : -1.0;
  float ang = atan(local.y, local.x) + s*(1.2 + 0.2*sin(t));
  vec2 v = vec2(-sin(ang), cos(ang));
  float L = length(v); return L>1e-6 ? v/L : vec2(0.0);
}
// 6) double gyre (classic)
vec2 field_doublegyre(vec2 p, float t, vec2 wh){
  float A = 0.25*wh.y, w = 2.0*3.14159/10.0, eps = 0.25, a = eps*sin(w*t), b = 1.0 - 2.0*eps;
  float x = p.x/wh.x, y = p.y/wh.y;
  float f = a*x*x + b*x;
  float dfdx = 2.0*a*x + b;
  float u = -3.14159*A*sin(3.14159*f)*cos(3.14159*y);
  float v =  3.14159*A*cos(3.14159*f)*sin(3.14159*y)*dfdx;
  vec2 vel = vec2(u, v);
  float L = length(vel); return L>1e-6 ? vel/L : vec2(0.0);
}
// 7) shear bands with meanders
vec2 field_shear(vec2 p, float t, vec2 wh){
  float y = p.y/wh.y;
  float base = sin(2.0*3.14159*y*3.0 + 0.7*t);
  vec2 v = vec2(0.6 + 0.4*base, 0.15*sin(2.0*3.14159*(p.x/wh.x*2.0 - t*0.2)));
  float L = length(v); return L>1e-6 ? v/L : vec2(0.0);
}
// 8) hex vortex lattice (approx axial coords)
vec2 field_hexvortex(vec2 p, float t, vec2 wh){
  vec2 q = (p/wh)*6.0;
  float r = 0.57735027; // 1/sqrt(3)
  vec2 a = vec2(1.0, 0.0);
  vec2 b = vec2(0.5, r*0.8660254*2.0); // skewed basis
  vec2 uv = vec2(dot(q,a), dot(q,b));
  vec2 cell = floor(uv);
  vec2 f = fract(uv) - 0.5;
  float s = mod(cell.x + cell.y, 2.0) < 1.0 ? 1.0 : -1.0;
  float ang = atan(f.y, f.x) + s*(1.0 + 0.15*sin(t));
  vec2 v = vec2(-sin(ang), cos(ang));
  float L = length(v); return L>1e-6 ? v/L : vec2(0.0);
}
// 9) jetstream bands
vec2 field_jetstream(vec2 p, float t, vec2 wh){
  float y = p.y/wh.y;
  float jets = sin(3.14159*(y*8.0 + 0.25*sin(t*0.6)));
  vec2 v = vec2(0.5 + 0.5*jets, 0.2*sin(3.14159*(p.x/wh.x*2.0 - t*0.3)));
  float L = length(v); return L>1e-6 ? v/L : vec2(0.0);
}
// 10) galactic spiral-ish rotation
vec2 field_galactic(vec2 p, float t, vec2 wh){
  vec2 d = p - uCenter;
  float r = length(d)+1e-4;
  float ang = atan(d.y, d.x);
  float arm = 0.25*sin(3.0*ang - 0.4*t);
  vec2 tang = vec2(-d.y, d.x)/r;
  vec2 radial = normalize(d);
  vec2 v = normalize(tang*(1.0) + radial*arm);
  return v;
}
// 11) cellular sin×sin
vec2 field_cellular(vec2 p, float t, vec2 wh){
  float x = p.x/wh.x*6.2831853, y = p.y/wh.y*6.2831853;
  vec2 v = vec2(sin(x)*cos(y+0.3*t), -cos(x)*sin(y-0.2*t));
  float L = length(v); return L>1e-6 ? v/L : vec2(0.0);
}

vec2 getField(vec2 p, float t, vec2 wh, int m){
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

  vec2 pos = texel1D(uPos, idx, uSimTexSize).xy;
  float speed = texel1D(uSpeed, idx, uSimTexSize).r;

  vec2 dir = getField(pos, uTime, uWorldSize, uMode);
  pos += dir * speed * uDt;
  pos = wrapTorus(pos, uWorldSize);
  fragColor = vec4(pos, 0.0, 1.0);
}
`;

// ====== TRAIL FADE PASS ======
const FADE_FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform sampler2D uAccum;
uniform float uFade; // 0..1
void main(){
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(uAccum,0));
  vec4 c = texture(uAccum, uv);
  fragColor = c * (1.0 - uFade);
}
`;

// ====== POINT RENDER (reads pos + per-particle HSV, converts to RGB) ======
const POINT_VERT = `#version 300 es
precision highp float;
layout (location=0) in float aIndex;
uniform sampler2D uPos;
uniform sampler2D uSpeed;
uniform vec2 uSimTexSize;
uniform vec2 uWorldSize;
uniform float uPointScale;

vec4 texel1D(sampler2D tex, float idx, vec2 texSize){
  float cols = texSize.x;
  float y = floor(idx / cols);
  float x = idx - y*cols;
  vec2 uv = (vec2(x,y)+0.5)/texSize;
  return texture(tex, uv);
}

out float vSizePx;
void main(){
  float idx = aIndex;
  vec2 pos = texel1D(uPos, idx, uSimTexSize).xy;
  float sizePx = texel1D(uSpeed, idx, uSimTexSize).g;
  vSizePx = max(1.0, sizePx * uPointScale);

  vec2 ndc = (pos / uWorldSize) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  gl_PointSize = vSizePx;
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

const POINT_FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D uHSV;      // per-particle HSV in a 2D texture (packed by index)
uniform vec2 uSimTexSize;
uniform float uCount;        // total particles as float (for index math)
uniform float uAlpha;        // base alpha
in float vSizePx;

// manual gl_PointCoord circle
vec3 hsv2rgb(vec3 c){
  // c.x: hue in [0,1), c.y: s, c.z: v
  vec3 rgb = clamp( abs(mod(c.x*6.0 + vec3(0.0,4.0,2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0 );
  return c.z * mix(vec3(1.0), rgb, c.y);
}

vec4 texel1D(sampler2D tex, float idx, vec2 texSize){
  float cols = texSize.x;
  float y = floor(idx / cols);
  float x = idx - y*cols;
  vec2 uv = (vec2(x,y)+0.5)/texSize;
  return texture(tex, uv);
}

void main(){
  vec2 p = gl_PointCoord*2.0 - 1.0;
  float r2 = dot(p,p);
  if (r2 > 1.0) discard;
  float soft = smoothstep(1.0, 0.0, r2);

  // derive index from gl_FragCoord trick not reliable; rely on flat index per-vertex is not available in frag.
  // So we pack HSV aligned with position texture order and fetch using gl_FrontFacing? Not available for index.
  // Instead, we render points in one drawArrays; GPU will not give us the instance id here.
  // Workaround: encode point index into varying is not available with gl.POINTS. Alternative: put HSV into the same texel coord as position and use gl_FragCoord? Not correct.
  // Practical solution: in vertex we cannot pass index (no flat qualifier for ES 3.0), but we can compute it here using gl_FragCoord is wrong.
  // Simpler: Bind uHSV to the same UV lookup we used in vertex by re-deriving from gl_PointCoord isn't possible.
  // => New plan: use a second pass that renders a screen-aligned quad per point = too heavy.
  // Better: Put HSV into uSpeed texture's BA channels (we have room). We'll do that instead to keep perf high.

  // NOTE: This shader will be replaced by a variant that reads HSV from uSpeed's BA.
  fragColor = vec4(1.0,1.0,1.0, uAlpha*soft);
}
`;

// ====== REVISED POINT SHADERS (HSV in uColorTex separate to avoid BA collision with speed/size) ======
const POINT_VERT_HSV = `#version 300 es
precision highp float;
layout (location=0) in float aIndex;
uniform sampler2D uPos;
uniform sampler2D uSpeed;
uniform sampler2D uHSV;       // per-particle HSV
uniform vec2 uSimTexSize;
uniform vec2 uWorldSize;
uniform float uPointScale;

out vec3 vHSV;
out float vAlpha;

vec4 texel1D(sampler2D tex, float idx, vec2 texSize){
  float cols = texSize.x;
  float y = floor(idx / cols);
  float x = idx - y*cols;
  vec2 uv = (vec2(x,y)+0.5)/texSize;
  return texture(tex, uv);
}

void main(){
  float idx = aIndex;
  vec2 pos = texel1D(uPos, idx, uSimTexSize).xy;
  vec4 sp = texel1D(uSpeed, idx, uSimTexSize);
  float sizePx = sp.g;

  vHSV = texel1D(uHSV, idx, uSimTexSize).xyz;
  vAlpha = 0.9;

  vec2 ndc = (pos / uWorldSize) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  gl_PointSize = max(1.0, sizePx * uPointScale);
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

const POINT_FRAG_HSV = `#version 300 es
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
  if (r2 > 1.0) discard;
  float soft = smoothstep(1.0, 0.0, r2);
  vec3 rgb = hsv2rgb(vHSV);
  fragColor = vec4(rgb, vAlpha * soft);
}
`;

// ====== GL BOILERPLATE ======
function createProgram(gl, vsSrc, fsSrc){
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, vsSrc); gl.compileShader(vs);
  if(!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(vs));
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, fsSrc); gl.compileShader(fs);
  if(!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(fs));
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.deleteShader(vs); gl.deleteShader(fs);
  return prog;
}
function makeFloatTex(gl, w, h, data=null){
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}
function makeFbo(gl, colorTex){
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  if(!ok) throw new Error('FBO incomplete');
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fb;
}
const ceilDiv = (a,b)=>Math.ceil(a/b);

// ====== PUBLIC API ======
export function createGPUParticles(canvas, opts={}){
  const gl = canvas.getContext('webgl2', { antialias:false, premultipliedAlpha:false });
  if(!gl) throw new Error('WebGL2 not available');
  if(!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float required');

  const cfg = Object.assign({
    count: 1000,
    worldW: canvas.width,
    worldH: canvas.height,
    trailFade: 0.06,
    mode: 0, // 0..11
    maxDt: 0.033,
    pointScale: 1.0,

    // HSV gradient controls (same semantics as your CPU version)
    hsvStart: { h: 210/360, s: 0.4, v: 0.85 },
    hsvEnd:   { h: 160/360, s: 0.9, v: 1.00 },
    hJitter:  0.04,
    sJitter:  0.06,
    vJitter:  0.08,
  }, opts);

  // layout
  const cols = Math.ceil(Math.sqrt(cfg.count));
  const rows = ceilDiv(cfg.count, cols);
  const simSize = [cols, rows];

  // initial data
  const posInit = new Float32Array(cols*rows*4);
  const spInit  = new Float32Array(cols*rows*4);
  const hsvInit = new Float32Array(cols*rows*4);
  for(let i=0;i<cfg.count;i++){
    const x = Math.random()*cfg.worldW;
    const y = Math.random()*cfg.worldH;
    posInit[i*4+0]=x; posInit[i*4+1]=y; posInit[i*4+2]=0; posInit[i*4+3]=1;

    const speed = 40 + Math.random()*120;
    const size  = 0.7 + Math.random()*2.5;
    spInit[i*4+0]=speed; spInit[i*4+1]=size; spInit[i*4+2]=0; spInit[i*4+3]=1;

    // per-particle HSV from gradient + jitter
    const t = i/(cfg.count-1);
    let h = mix(cfg.hsvStart.h, cfg.hsvEnd.h, t) + (Math.random()*2-1)*cfg.hJitter;
    let s = mix(cfg.hsvStart.s, cfg.hsvEnd.s, t) + (Math.random()*2-1)*cfg.sJitter;
    let v = mix(cfg.hsvStart.v, cfg.hsvEnd.v, t) + (Math.random()*2-1)*cfg.vJitter;
    h = h - floor(h); // wrap 0..1
    s = clamp01(s);
    v = clamp01(v);
    hsvInit[i*4+0]=h; hsvInit[i*4+1]=s; hsvInit[i*4+2]=v; hsvInit[i*4+3]=1;
  }

  // GL resources
  const posTex = [ makeFloatTex(gl, cols, rows, posInit), makeFloatTex(gl, cols, rows, posInit) ];
  const spTex  = makeFloatTex(gl, cols, rows, spInit);
  const hsvTex = makeFloatTex(gl, cols, rows, hsvInit);
  const posFbo = [ makeFbo(gl, posTex[0]), makeFbo(gl, posTex[1]) ];
  let cur=0, nxt=1;

  function makeAccum(w,h){
    const tex = makeFloatTex(gl, w, h, null);
    const fb = makeFbo(gl, tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0,0,w,h);
    gl.clearColor(0,0,0,1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
  }
  let accum = makeAccum(canvas.width, canvas.height);

  const simProg   = createProgram(gl, QUAD_VERT, SIM_FRAG);
  const fadeProg  = createProgram(gl, QUAD_VERT, FADE_FRAG);
  const pointProg = createProgram(gl, POINT_VERT_HSV, POINT_FRAG_HSV);

  const idxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, idxBuf);
  const indices = new Float32Array(cfg.count);
  for(let i=0;i<cfg.count;i++) indices[i]=i;
  gl.bufferData(gl.ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  // timing
  let t0 = performance.now()*0.001;
  let last = t0;

  function step(nowSec){
    const now = nowSec ?? performance.now()*0.001;
    const dt  = Math.min(cfg.maxDt, Math.max(0.0, now - last));
    last = now;

    // SIM
    gl.useProgram(simProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, posFbo[nxt]);
    gl.viewport(0,0,simSize[0],simSize[1]);
    let L = n=>gl.getUniformLocation(simProg,n);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, posTex[cur]); gl.uniform1i(L('uPos'),0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, spTex);       gl.uniform1i(L('uSpeed'),1);
    gl.uniform2f(L('uSimTexSize'), simSize[0], simSize[1]);
    gl.uniform2f(L('uWorldSize'), cfg.worldW, cfg.worldH);
    gl.uniform2f(L('uCenter'), cfg.worldW*0.5, cfg.worldH*0.5);
    gl.uniform1f(L('uTime'), now - t0);
    gl.uniform1f(L('uDt'), dt);
    gl.uniform1i(L('uMode'), cfg.mode);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    cur ^= 1; nxt ^= 1;

    // FADE trails
    gl.useProgram(fadeProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, accum.fb);
    gl.viewport(0,0,accum.w,accum.h);
    let F = n=>gl.getUniformLocation(fadeProg,n);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, accum.tex); gl.uniform1i(F('uAccum'),0);
    gl.uniform1f(F('uFade'), cfg.trailFade);
    gl.drawArrays(gl.TRIANGLES,0,3);

    // DRAW points (additive)
    gl.useProgram(pointProg);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, accum.fb);
    gl.viewport(0,0,accum.w,accum.h);
    let P = n=>gl.getUniformLocation(pointProg,n);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, posTex[cur]); gl.uniform1i(P('uPos'),0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, spTex);       gl.uniform1i(P('uSpeed'),1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, hsvTex);      gl.uniform1i(P('uHSV'),2);
    gl.uniform2f(P('uSimTexSize'), simSize[0], simSize[1]);
    gl.uniform2f(P('uWorldSize'),  cfg.worldW, cfg.worldH);
    gl.uniform1f(P('uPointScale'), cfg.pointScale);
    gl.bindBuffer(gl.ARRAY_BUFFER, idxBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, cfg.count);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // PRESENT
    gl.useProgram(fadeProg);
    gl.viewport(0,0,canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, accum.tex);
    gl.uniform1i(F('uAccum'),0);
    gl.uniform1f(F('uFade'), 0.0);
    gl.drawArrays(gl.TRIANGLES,0,3);
  }

  function resize(w,h){
    if(w===accum.w && h===accum.h) return;
    gl.deleteTexture(accum.tex); gl.deleteFramebuffer(accum.fb);
    accum = makeAccum(w,h);
    gl.viewport(0,0,w,h);
    // If your world equals view: keep them in sync
    // (else, updateConfig with your custom world size/offset)
    cfg.worldW = w; cfg.worldH = h;
  }

  function updateConfig(patch){
    if(!patch) return;
    Object.assign(cfg, patch);
  }

  // -- per-particle recolor (updates hsvTex only) --
  function recolor({ hsvStart, hsvEnd, hJitter, sJitter, vJitter }){
    if(hsvStart) cfg.hsvStart = hsvStart;
    if(hsvEnd)   cfg.hsvEnd   = hsvEnd;
    if(hJitter!==undefined) cfg.hJitter = hJitter;
    if(sJitter!==undefined) cfg.sJitter = sJitter;
    if(vJitter!==undefined) cfg.vJitter = vJitter;

    const data = new Float32Array(cols*rows*4);
    for(let i=0;i<cfg.count;i++){
      const t = i/(cfg.count-1);
      let h = mix(cfg.hsvStart.h, cfg.hsvEnd.h, t) + (Math.random()*2-1)*cfg.hJitter;
      let s = mix(cfg.hsvStart.s, cfg.hsvEnd.s, t) + (Math.random()*2-1)*cfg.sJitter;
      let v = mix(cfg.hsvStart.v, cfg.hsvEnd.v, t) + (Math.random()*2-1)*cfg.vJitter;
      h = h - Math.floor(h);
      s = clamp01(s);
      v = clamp01(v);
      data[i*4+0]=h; data[i*4+1]=s; data[i*4+2]=v; data[i*4+3]=1;
    }
    gl.bindTexture(gl.TEXTURE_2D, hsvTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RGBA, gl.FLOAT, data);
  }

  function dispose(){
    [0,1].forEach(i=>{ gl.deleteTexture(posTex[i]); gl.deleteFramebuffer(posFbo[i]); });
    gl.deleteTexture(spTex);
    gl.deleteTexture(hsvTex);
    gl.deleteTexture(accum.tex);
    gl.deleteFramebuffer(accum.fb);
    gl.deleteBuffer(idxBuf);
    // (program deletion optional)
  }

  return { gl, step, resize, updateConfig, recolor, dispose, config: cfg, simSize };
}

// ====== tiny utils used above ======
function clamp01(x){ return x<0?0:x>1?1:x; }
function mix(a,b,t){ return a + (b-a)*t; }
