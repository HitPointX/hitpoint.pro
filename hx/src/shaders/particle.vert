uniform float uTime;
uniform float uSize;
uniform float uRadius;
// audio visualizer
uniform float uAudioActive;
uniform float uAudioBass;
uniform float uAudioMid;
uniform float uAudioTreble;
// music pulse and beat burst
uniform float uPulse;       // ~[-0.2, +0.2] global scale (shrink/grow)
uniform float uBeatPulse;   // 0..1 short burst on detected beat
// solar flares
uniform vec3 uFlareDir[6];        // unit vectors
uniform float uFlareSpawn[6];     // spawn times (seconds), -1 for inactive
uniform float uFlareCone[6];      // cone threshold: cos(halfAngle), higher is tighter
uniform float uFlarePower[6];     // world units of outward push at peak
uniform float uFlareDur[6];       // duration per flare (seconds)
// pink edge spouts (mini tornadoes anchored on sphere surface)
uniform vec3 uSpoutDir[8];        // unit vectors (anchors on sphere)
uniform float uSpoutSpawn[8];     // spawn times (seconds), -1 for inactive
uniform float uSpoutCone[8];      // cos(halfAngle)
uniform float uSpoutPower[8];     // strength scalar (affects spin and lift)
uniform float uSpoutDur[8];       // duration per spout (seconds)
// tornado spin (inner swirl)
uniform float uTornadoStart;  // seconds, -1 inactive
uniform float uTornadoDur;    // seconds
uniform vec3  uTornadoAxis;   // unit
uniform float uTornadoSpeed;  // radians per second at full weight
uniform float uTornadoInner;  // normalized radius where effect starts to fade (0..1)
// star formation event (one-time)
uniform float uStarStart;     // seconds, -1 inactive
uniform float uStarHold;      // seconds to hold formation (10..15)
uniform float uStarExplode;   // seconds to explode back to sphere
uniform int   uStarPoints;    // number of star points (e.g., 5)
uniform float uStarRadius;    // world units outer radius of the star
uniform float uStarInner;     // inner radius ratio (0.2..0.6)
uniform float uStarStrength;  // 0..1 attraction strength
uniform vec3  uStarCenter;    // center of star plane
uniform float uStarSpin;      // radians, rotation of star arms over time
// collapse phase near track end
uniform float uCollapsePhase; // 0..1
// blue-face event
uniform float uFaceStart;   // seconds, -1 inactive
uniform float uFaceDur;     // seconds
uniform int   uFaceStyle;   // 0..11
uniform vec3  uFaceCenter;  // world position of face center
uniform float uFaceScale;   // world units half-width
uniform float uFaceStrength;// 0..1
// interaction
uniform vec3 uPointer;
uniform float uPointerStrength;
uniform float uPointerRadius;
uniform vec3 uBulletStart[3];
uniform vec3 uBulletDir[3];
uniform float uBulletSpawn[3];
uniform float uBulletSpeed;
uniform float uBulletRadius;
uniform float uBulletFade;
// hearts
uniform vec3 uHeartStart[2];
uniform vec3 uHeartDir[2];
uniform float uHeartSpawn[2];
uniform float uHeartSpeed;
uniform float uHeartScale;
uniform float uHeartFade;
// dancing silhouettes
uniform float uDanceActive;   // 0 or 1
uniform float uDanceClock;    // seconds, loops every ~600s
uniform float uDanceScale;    // size scale
uniform float uDanceWidth;    // silhouette thickness (push amount)
uniform float uDanceOutline;  // outline strength
uniform float uDanceIntensity;// how strongly particles are displaced
uniform float uDancePlane;    // half-thickness of active z-slab
uniform float uDanceFill;     // additional push for interior (body) region
uniform float uDanceSizeBoost;// point size multiplier at edge
// drawing stroke (right-drag)
uniform vec3 uDrawPts[64];
uniform int uDrawCount;
uniform float uDrawRadius;
uniform float uDrawHold;      // 1 while dragging, 0 after release
uniform float uDrawFadeStart; // time seconds
uniform float uDrawFadeDur;
uniform float uDrawScatter;   // sideways jitter amount within stroke region

// Cat formation (2D silhouette on plane z = uCatCenter.z)
uniform float uCatStart;     // seconds, -1 inactive
uniform float uCatDur;       // seconds duration
uniform vec3  uCatCenter;    // world center
uniform float uCatScale;     // world units half-width
uniform float uCatStrength;  // 0..1 push strength
uniform float uCatPlane;     // half-thickness of active z-slab

attribute float aSeed;
attribute vec3 aColor;
varying vec3 vColor;
varying float vDarken;
varying float vSeed;
varying vec2 vTrailDir;

// 2D helpers
mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
float sdCircle(vec2 p, float r){ return length(p) - r; }
float sdCapsule(vec2 p, vec2 a, vec2 b, float r){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba)/dot(ba,ba), 0.0, 1.0);
  return length(pa - ba*h) - r;
}

// Signed distance to a triangle (Inigo Quilez)
float sdTriangle(vec2 p, vec2 a, vec2 b, vec2 c)
{
  vec2 ba = b - a; vec2 pa = p - a;
  vec2 cb = c - b; vec2 pb = p - b;
  vec2 ac = a - c; vec2 pc = p - c;
  vec2 nor = vec2(ba.y, -ba.x) + vec2(cb.y, -cb.x) + vec2(ac.y, -ac.x);
  float s = sign(dot(nor, a) + dot(nor, b) + dot(nor, c));
  float d = min(min(
    dot(pa - ba*clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0), pa - ba*clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0)),
    dot(pb - cb*clamp(dot(pb,cb)/dot(cb,cb),0.0,1.0), pb - cb*clamp(dot(pb,cb)/dot(cb,cb),0.0,1.0))),
    dot(pc - ac*clamp(dot(pc,ac)/dot(ac,ac),0.0,1.0), pc - ac*clamp(dot(pc,ac)/dot(ac,ac),0.0,1.0)) );
  return s * sqrt(d + 1e-8);
}

// A playful standing cat silhouette: head + ears + body + arms up + legs + tail
float sdCat(vec2 p)
{
  float d = 1e9;
  // Head
  d = min(d, sdCircle(p - vec2(0.0, 0.68), 0.25));
  // Ears (two small triangles)
  vec2 eL0 = vec2(-0.18, 0.78), eL1 = vec2(-0.05, 1.02), eL2 = vec2(-0.32, 0.95);
  vec2 eR0 = vec2( 0.18, 0.78), eR1 = vec2( 0.05, 1.02), eR2 = vec2( 0.32, 0.95);
  d = min(d, sdTriangle(p, eL0, eL1, eL2));
  d = min(d, sdTriangle(p, eR0, eR1, eR2));
  // Body (rounded capsule)
  d = min(d, sdCapsule(p, vec2(0.0, 0.55), vec2(0.0, -0.35), 0.33));
  // Arms raised
  vec2 sL = vec2(-0.16, 0.52);
  vec2 pL = sL + rot(-0.9) * vec2(0.0, 0.54);
  vec2 sR = vec2( 0.16, 0.52);
  vec2 pR = sR + rot( 0.9) * vec2(0.0, 0.54);
  d = min(d, sdCapsule(p, sL, pL, 0.10));
  d = min(d, sdCapsule(p, sR, pR, 0.10));
  // Legs
  vec2 hL = vec2(-0.10, -0.32);
  vec2 fL = vec2(-0.13, -0.80);
  vec2 hR = vec2( 0.10, -0.32);
  vec2 fR = vec2( 0.13, -0.78);
  d = min(d, sdCapsule(p, hL, fL, 0.11));
  d = min(d, sdCapsule(p, hR, fR, 0.11));
  // Tail (two curved segments approximated by capsules)
  vec2 t0 = vec2(0.30, -0.10);
  vec2 t1 = vec2(0.58,  0.12);
  vec2 t2 = vec2(0.74,  0.42);
  d = min(d, sdCapsule(p, t0, t1, 0.08));
  d = min(d, sdCapsule(p, t1, t2, 0.07));
  return d;
}

float sdHumanoid(vec2 p, float t, float mirrorSign){
  // Mirror across Y axis for right dancer
  p.x *= mirrorSign;
  // Base proportions (rough, unit space)
  float head = sdCircle(p - vec2(0.0, 1.8), 0.35);
  float torso = sdCapsule(p, vec2(0.0, 1.6), vec2(0.0, 0.6), 0.28);
  // Shoulder sway and hip sway
  float s1 = sin(t*0.7 + 0.3)*0.35;
  float h1 = sin(t*0.53 + 1.2)*0.25;
  vec2 Ls = vec2(-0.42 + s1, 1.45);
  vec2 Rs = vec2( 0.42 + s1, 1.45);
  vec2 Lh = vec2(-0.18 + h1, 0.6);
  vec2 Rh = vec2( 0.18 + h1, 0.6);

  // Arms with animated bend
  float aL = 0.8 + 0.5*sin(t*0.9 + 0.4);
  float aR = -0.8 + 0.5*sin(t*0.85 + 1.7);
  vec2 Lel = Ls + (rot(aL)*vec2(0.0,-0.6));
  vec2 Rel = Rs + (rot(aR)*vec2(0.0,-0.6));
  vec2 Lhnd = Lel + (rot(aL-0.9)*vec2(0.0,-0.7));
  vec2 Rhnd = Rel + (rot(aR+0.9)*vec2(0.0,-0.7));

  // Legs with animated bend
  float lL = 0.2 + 0.4*sin(t*0.6 + 0.6);
  float lR = -0.2 + 0.4*sin(t*0.62 + 2.1);
  vec2 Lkn = Lh + (rot(lL)*vec2(0.05,-0.55));
  vec2 Rkn = Rh + (rot(lR)*vec2(-0.05,-0.55));
  vec2 Lft = Lkn + (rot(lL-0.2)*vec2(0.0,-0.7));
  vec2 Rft = Rkn + (rot(lR+0.2)*vec2(0.0,-0.7));

  float d = head;
  d = min(d, torso);
  d = min(d, sdCapsule(p, Ls, Lel, 0.18));
  d = min(d, sdCapsule(p, Lel, Lhnd, 0.15));
  d = min(d, sdCapsule(p, Rs, Rel, 0.18));
  d = min(d, sdCapsule(p, Rel, Rhnd, 0.15));
  d = min(d, sdCapsule(p, Lh, Lkn, 0.22));
  d = min(d, sdCapsule(p, Lkn, Lft, 0.18));
  d = min(d, sdCapsule(p, Rh, Rkn, 0.22));
  d = min(d, sdCapsule(p, Rkn, Rft, 0.18));
  return d;
}
void main() {
  vColor = aColor;
  vDarken = 0.0;
  vSeed = fract(aSeed);
  // Base position
  vec3 pos = position;
  // Organic motion using trigs seeded per-particle
  float t = uTime * (0.6 + fract(aSeed));
  vec3 jiggle = vec3(
    sin(t + pos.y * 0.15 + aSeed),
    cos(t * 1.2 + pos.z * 0.1 + aSeed * 1.3),
    sin(t * 0.8 + pos.x * 0.12 + aSeed * 2.1)
  );
  // stronger reaction to music
  float musicAmp = mix(1.0, clamp(uAudioBass*2.2 + uAudioMid*1.8 + uAudioTreble*1.0, 0.0, 4.0), step(0.5, uAudioActive));
  pos += jiggle * (3.0 * musicAmp);
  // global pulse shrink/grow
  pos *= clamp(1.0 + uPulse, 0.6, 1.6);

  // Solar flare pulses: push particles near the surface within a directional cone
  // Blue-face convergence: after 2:00 (scheduled in JS), for duration uFaceDur,
  // attract bluish particles into simple eye/mouth shapes.
  if (uFaceStart >= 0.0) {
    float ageF = uTime - uFaceStart;
    if (ageF >= 0.0 && ageF <= uFaceDur) {
      // only bluish particles participate strongly
      float blueish = smoothstep(0.15, 0.45, vColor.b - max(vColor.r, vColor.g));
      if (blueish > 0.0) {
        // temporal envelope with eased in/out
        float x = clamp(ageF / max(0.001, uFaceDur), 0.0, 1.0);
        float env = smoothstep(0.0, 0.2, x) * smoothstep(1.0, 0.8, x);
        // project to 2D face plane (z from center)
        vec3 rel = pos - uFaceCenter;
        vec2 p = rel.xy / max(1e-3, uFaceScale);
        // eye and mouth params
        // eyes around x = +-0.5, y = +0.35; mouth around y = -0.3..-0.45
        float eyeRad = 0.12;
        vec2 eyeL = vec2(-0.42, 0.35);
        vec2 eyeR = vec2( 0.42, 0.35);
        float dEye = min(length(p - eyeL), length(p - eyeR)) - eyeRad;
        float eyeMask = 1.0 - smoothstep(0.06, 0.18, abs(dEye));
        // mouth shape varies by style
        float mouth = 1.0; // 1 outside, 0 inside
        float y0 = -0.42;
        if (uFaceStyle == 0) { // :)
          float k = (p.y - (y0 + 0.04)) - 0.25 * (p.x*p.x - 0.4);
          mouth = smoothstep(0.02, 0.0, -abs(k) + 0.03);
        } else if (uFaceStyle == 1) { // :|
          float k = abs(p.y - y0) - 0.02;
          mouth = smoothstep(0.02, 0.0, -k);
        } else if (uFaceStyle == 2) { // :(
          float k = (p.y - (y0 - 0.06)) + 0.25 * (p.x*p.x - 0.4);
          mouth = smoothstep(0.02, 0.0, -abs(k) + 0.03);
        } else if (uFaceStyle == 3) { // :D
          float k = (p.y - (y0 + 0.02)) - 0.18 * (p.x*p.x - 0.5);
          mouth = smoothstep(0.02, 0.0, -k);
        } else if (uFaceStyle == 4) { // :O
          float k = length(p - vec2(0.0, y0+0.02)) - 0.16;
          mouth = smoothstep(0.02, 0.0, -k);
        } else if (uFaceStyle == 5) { // D:
          float k = (p.y - (y0 + 0.02)) - 0.3 * (p.x + 0.25);
          mouth = smoothstep(0.02, 0.0, -k);
        } else if (uFaceStyle == 6) { // :P
          float k = (p.y - (y0 + 0.02)) - 0.2 * (p.x*p.x - 0.45);
          float tongue = smoothstep(0.02, 0.0, -(p.y - (y0 - 0.05)) + 0.06) * smoothstep(0.5, 0.2, abs(p.x));
          mouth = max(smoothstep(0.02, 0.0, -k), tongue);
        } else if (uFaceStyle == 7) { // ;p wink
          vec2 eyeL2 = eyeL; eyeL2.y -= 0.02; // closed
          dEye = min(length(p - eyeL2), length(p - eyeR)) - eyeRad;
          eyeMask = 1.0 - smoothstep(0.06, 0.18, abs(dEye));
          float k = (p.y - (y0 + 0.02)) - 0.2 * (p.x*p.x - 0.45);
          float tongue = smoothstep(0.02, 0.0, -(p.y - (y0 - 0.05)) + 0.06) * smoothstep(0.5, 0.2, abs(p.x));
          mouth = max(smoothstep(0.02, 0.0, -k), tongue);
        } else if (uFaceStyle == 8) { // :X
          float d1 = abs(p.y - y0) - 0.015 + abs(p.x)*0.02;
          float d2 = abs(p.y - (y0+0.02) + p.x*0.5) - 0.015;
          mouth = smoothstep(0.02, 0.0, -min(d1,d2));
        } else if (uFaceStyle == 9) { // :S
          float k = sin(p.x*8.0) * 0.04 + (p.y - (y0 + 0.0));
          mouth = smoothstep(0.02, 0.0, -abs(k) + 0.02);
        } else if (uFaceStyle == 10) { // :3
          float k = (p.y - (y0 + 0.02)) - 0.16 * (abs(p.x) - 0.25);
          mouth = smoothstep(0.02, 0.0, -k);
        } else { // :V
          float k = (p.y - (y0 + 0.02)) - 0.28 * (abs(p.x) - 0.15);
          mouth = smoothstep(0.02, 0.0, -k);
        }
        // target mask: eyes OR mouth band
        float target = max(eyeMask, mouth);
        if (target > 0.001) {
          // gradient toward curve: nudge p toward nearest curve centerline
          // approximate normal by sampling small offsets
          float e = 0.01;
          float dE = min(length(p+vec2(e,0.0) - eyeL), length(p+vec2(e,0.0) - eyeR)) - eyeRad;
          float dW = min(length(p-vec2(e,0.0) - eyeL), length(p-vec2(e,0.0) - eyeR)) - eyeRad;
          float dN = min(length(p+vec2(0.0,e) - eyeL), length(p+vec2(0.0,e) - eyeR)) - eyeRad;
          float dS = min(length(p-vec2(0.0,e) - eyeL), length(p-vec2(0.0,e) - eyeR)) - eyeRad;
          vec2 gradEye = vec2(dE-dW, dN-dS);
          // simple mouth gradient using function differences
          vec2 gradM = vec2(0.0);
          {
            float px = p.x, py = p.y;
            float k0;
            if (uFaceStyle == 4) { // circle
              k0 = length(p - vec2(0.0, y0+0.02)) - 0.16;
            } else if (uFaceStyle == 1) {
              k0 = abs(py - y0) - 0.02;
            } else if (uFaceStyle == 5) {
              k0 = (py - (y0 + 0.02)) - 0.3 * (px + 0.25);
            } else {
              k0 = (py - (y0 + 0.02)) - 0.2 * (px*px - 0.45);
            }
            float kx1 = ( (py - (y0 + 0.02)) - 0.2 * ((px+e)*(px+e) - 0.45) );
            float kx0 = ( (py - (y0 + 0.02)) - 0.2 * ((px-e)*(px-e) - 0.45) );
            float ky1 = ( ((py+e) - (y0 + 0.02)) - 0.2 * (px*px - 0.45) );
            float ky0 = ( ((py-e) - (y0 + 0.02)) - 0.2 * (px*px - 0.45) );
            gradM = vec2(kx1 - kx0, ky1 - ky0);
          }
          vec2 grad = normalize(gradEye + gradM + 1e-5);
          // convert back to world movement within face plane, and add a bit of in-plane falloff
          float fall = smoothstep(0.98, 0.2, length(p));
          vec3 push = vec3(grad, 0.0) * (uFaceStrength * env * blueish * fall * 8.0);
          // damp z so particles sit on the plane gently
          pos.z = mix(pos.z, uFaceCenter.z, env * 0.6);
          pos.xy += push.xy;
        }
      }
    }
  }

  // outward and then pull back in quickly.
  float flareExtend = 0.0; // allowance to exceed rLimit while flare active
  for (int i = 0; i < 6; i++) {
    float spawn = uFlareSpawn[i];
    if (spawn >= 0.0) {
      float age = uTime - spawn;
      float dur = uFlareDur[i];
      if (age >= 0.0 && age <= dur) {
        vec3 nrm = normalize(pos + 1e-5);
        float cosang = dot(nrm, normalize(uFlareDir[i]));
        // mask by cone around uFlareDir; uFlareCone is cos(halfAngle)
        float cone = smoothstep(uFlareCone[i], min(1.0, uFlareCone[i] + 0.06), cosang);
        // favor near-surface particles
        float rN = length(pos) / max(0.0001, uRadius);
        float shell = smoothstep(0.5, 0.95, rN);
        // temporal envelope: slow outward rise, fast pullback
        float x = clamp(age / max(0.001, dur), 0.0, 1.0);
        float rise = smoothstep(0.0, 0.7, x);
        float fall = 1.0 - smoothstep(0.6, 1.0, x);
        float env = rise * fall;
        float amp = uFlarePower[i] * env * cone * shell;
        pos += nrm * amp;
        // allow temporary extension beyond the sphere during the flare
        flareExtend = max(flareExtend, amp);
      }
    }
  }

  // Pink-only edge spouts: rotate particles around local surface normal and lift outward
  // Multiple can be active concurrently. Heavily biased to near-surface, pinkish particles.
  {
    // measure pinkish-ness: magenta bias (R/B high, G low)
    float pinkish = smoothstep(0.10, 0.45, max(vColor.r, vColor.b) - vColor.g);
    if (pinkish > 0.0) {
      for (int i = 0; i < 8; i++) {
        float spawn = uSpoutSpawn[i];
        if (spawn >= 0.0) {
          float age = uTime - spawn;
          float dur = uSpoutDur[i];
          if (age >= 0.0 && age <= dur) {
            float x = clamp(age / max(0.001, dur), 0.0, 1.0);
            // punchy in/out envelope
            float env = sin(3.14159265 * x);
            vec3 axis = normalize(uSpoutDir[i]);
            vec3 nrm = normalize(pos + 1e-5);
            float cosang = dot(nrm, axis);
            float cone = smoothstep(uSpoutCone[i], min(1.0, uSpoutCone[i] + 0.06), cosang);
            float rN = length(pos) / max(0.0001, uRadius);
            float shell = smoothstep(0.75, 0.98, rN);
            float w = pinkish * cone * shell * env;
            if (w > 1e-4) {
              // spin around the axis
              float ang = uSpoutPower[i] * 0.9 * w; // radians
              float c = cos(ang), s = sin(ang);
              pos = pos * c + cross(axis, pos) * s + axis * dot(axis, pos) * (1.0 - c);
              // lift slightly outward along the anchor axis to form a spout
              float lift = uSpoutPower[i] * 1.4 * w;
              pos += axis * lift;
              flareExtend = max(flareExtend, lift);
            }
          }
        }
      }
    }
  }

  // Star formation: attract all particles into a planar n-point star for uStarHold seconds,
  // then explode outward over uStarExplode seconds back toward a sphere.
  if (uStarStart >= 0.0) {
    float ageS = uTime - uStarStart;
    float totalS = uStarHold + uStarExplode;
    if (ageS >= 0.0 && ageS <= totalS) {
      vec3 rel = pos - uStarCenter;
      vec2 p = rel.xy;
      float r = length(p);
  // Rotate star arms by adding uStarSpin to the angular evaluation
  float a = atan(p.y, p.x) + uStarSpin;
      float n = float(uStarPoints);
      // radial profile: mix inner and outer radius based on |cos(n*a)| power for crisp points
      float wave = pow(abs(cos(a * n)), 3.0);
      float outerR = uStarRadius;
      float innerR = uStarRadius * clamp(uStarInner, 0.05, 0.95);
      float targetR = mix(innerR, outerR, wave);
      vec2 dir = normalize(p + 1e-5);
      // envelopes
      float holdW = uStarHold > 0.0 ? clamp(ageS / max(0.001, uStarHold), 0.0, 1.0) : 1.0;
      float inEnv = smoothstep(0.0, 0.18, holdW); // quick lock-in
      float outEnv = (ageS > uStarHold) ? smoothstep(0.0, 1.0, (ageS - uStarHold) / max(0.001, uStarExplode)) : 0.0;
      // attraction toward star during hold
      float w = uStarStrength * inEnv * (1.0 - outEnv);
      if (w > 0.0) {
        float newR = mix(r, targetR, w);
        pos.xy = dir * newR;
        // flatten gently to plane for a clean shape
        pos.z = mix(pos.z, uStarCenter.z, w * 0.92);
      }
      // explode outward during release
      if (outEnv > 0.0) {
        vec3 nrm = normalize(rel + 1e-5);
        float push = (uStarRadius * 0.9) * outEnv;
        pos += nrm * push;
        // allow temporary expansion
        flareExtend = max(flareExtend, push);
      }
    }
  }

  // Cat formation: during [uCatStart, uCatStart+uCatDur], attract into a cat silhouette.
  if (uCatStart >= 0.0) {
    float ageC = uTime - uCatStart;
    if (ageC >= 0.0 && ageC <= uCatDur) {
      // project to plane and evaluate SDF
      vec3 rel = pos - uCatCenter;
      float planeW = 1.0 - smoothstep(uCatPlane, uCatPlane*1.8, abs(rel.z));
      vec2 P = rel.xy / max(1e-3, uCatScale);
      float d = sdCat(P);
      // gradient approx
      float e = 0.01;
      float dx = sdCat(P + vec2(e,0.0)) - d;
      float dy = sdCat(P + vec2(0.0,e)) - d;
      vec2 n2 = normalize(vec2(dx, dy) + 1e-5);
      vec3 n = normalize(vec3(n2, 0.0));
      // edge and interior masks
      float w = 0.08;
      float edge = 1.0 - smoothstep(w*0.6, w, abs(d));
      float inside = smoothstep(0.0, 0.35, -d);
      // temporal envelope (ease in/out over duration)
      float x = clamp(ageC / max(0.001, uCatDur), 0.0, 1.0);
      float env = smoothstep(0.0, 0.15, x) * smoothstep(1.0, 0.85, x);
      // Always exert some pull, stronger when near the plane
      float strength = uCatStrength * env * mix(0.25, 1.0, planeW);
      // push toward silhouette
      pos += n * (uCatScale * 0.25 * (edge * 1.2 + inside * 0.6) * strength);
      // flatten to plane for crispness (weighted by plane proximity)
      pos.z = mix(pos.z, uCatCenter.z, strength * (0.5 + 0.5*planeW));
      // slight darkening at edges for contrast
      vDarken = max(vDarken, edge * planeW * 0.8);
    }
  }

  // Tornado: rotate inner particles around an axis for a short burst
  if (uTornadoStart >= 0.0) {
    float ageT = uTime - uTornadoStart;
    if (ageT >= 0.0 && ageT <= uTornadoDur) {
      float x = clamp(ageT / max(0.001, uTornadoDur), 0.0, 1.0);
      // punchy envelope
      float env = sin(3.14159265 * x);
      float rN = length(pos) / max(0.0001, uRadius);
      // weight: strongest near center, fades out by uTornadoInner..uTornadoInner*1.6
      float w = 1.0 - smoothstep(uTornadoInner, min(1.0, uTornadoInner*1.6), rN);
      if (w > 0.0) {
        float ang = uTornadoSpeed * env * w;
        // rotate around axis through origin (Rodrigues)
        vec3 a = normalize(uTornadoAxis);
        float c = cos(ang), s = sin(ang);
        pos = pos * c + cross(a, pos) * s + a * dot(a, pos) * (1.0 - c);
      }
    }
  }
  // Pointer scatter (radial push away from uPointer), decays via uPointerStrength
  {
    vec3 toP = pos - uPointer;
    float d = length(toP);
    float fall = 1.0 - smoothstep(0.0, uPointerRadius, d);
    if (fall > 0.0) {
      vec3 dir = normalize(toP + 1e-5);
      pos += dir * (6.0 * uPointerStrength * fall);
    }
  }

  // Bullet tunnels - compute closest distance from particle to ray(s) at current time
  // subtract along the radial direction to form a cylindrical hole, fading with age
  for (int i = 0; i < 3; i++) {
    float spawn = uBulletSpawn[i];
    if (spawn >= 0.0) {
      float age = uTime - spawn;
      if (age <= uBulletFade) {
        vec3 s = uBulletStart[i] + uBulletDir[i] * (age * uBulletSpeed);
        // distance from point pos to line (s, dir)
        vec3 w = pos - s;
        vec3 d = uBulletDir[i];
        float t = dot(w, d);
        vec3 c = s + d * t; // closest point on ray line
        float dist = length(pos - c);
        float hole = 1.0 - smoothstep(uBulletRadius * 0.6, uBulletRadius, dist);
        if (hole > 0.0) {
          // push particle outward perpendicular to the ray axis
          vec3 n = normalize((pos - c) + 1e-5);
          float fade = 1.0 - (age / uBulletFade);
          pos += n * (uBulletRadius * 0.9 * hole * fade);
        }
      }
    }
  }

  // Heart-shaped tunnels (2 max)
  // Project particle onto plane perpendicular to heart ray and evaluate a 2D heart SDF.
  // We use a simple analytic heart: (x^2 + y^2 - 1)^3 - x^2 y^3 = 0 scaled by uHeartScale.
  for (int i = 0; i < 2; i++) {
    float spawn = uHeartSpawn[i];
    if (spawn >= 0.0) {
      float age = uTime - spawn;
      if (age <= uHeartFade) {
        vec3 d = normalize(uHeartDir[i]);
        vec3 s = uHeartStart[i] + d * (age * uHeartSpeed);
        // Build orthonormal basis for plane perpendicular to d
        vec3 up = abs(d.y) < 0.99 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0);
        vec3 xAxis = normalize(cross(up, d));
        vec3 yAxis = normalize(cross(d, xAxis));
        vec3 rel = pos - s;
        float x = dot(rel, xAxis) / uHeartScale;
        float y = dot(rel, yAxis) / uHeartScale;
        // heart implicit function value
        float k = pow(x*x + y*y - 1.0, 3.0) - x*x*y*y*y; // < 0 inside
        // convert to a soft mask with falloff
        float inside = smoothstep(0.25, -0.15, k); // broaden with thresholds
        if (inside > 0.0) {
          // push outward from the heart contour normal approx
          // gradient of f approximates normal
          float eps = 0.01;
          float fx = ((pow((x+eps)*(x+eps) + y*y - 1.0, 3.0) - (x+eps)*(x+eps)*y*y*y) -
                      (pow((x-eps)*(x-eps) + y*y - 1.0, 3.0) - (x-eps)*(x-eps)*y*y*y)) / (2.0*eps);
          float fy = ((pow(x*x + (y+eps)*(y+eps) - 1.0, 3.0) - x*x*(y+eps)*(y+eps)*(y+eps)) -
                      (pow(x*x + (y-eps)*(y-eps) - 1.0, 3.0) - x*x*(y-eps)*(y-eps)*(y-eps))) / (2.0*eps);
          vec2 n2 = normalize(vec2(fx, fy));
          vec3 n = normalize(n2.x * xAxis + n2.y * yAxis);
          float fade = 1.0 - (age / uHeartFade);
          pos += n * (uHeartScale * 0.8 * inside * fade);
        }
      }
    }
  }

  // Dancing silhouettes: project onto plane z=0 in object space and form two figures
  if (uDanceActive > 0.5) {
    float th = uDancePlane; // half-thickness along z
    float plane = 1.0 - smoothstep(th, th*1.8, abs(pos.z));
    if (plane > 0.0) {
      float scale = uDanceScale; // world units
      vec2 P = vec2(pos.x, pos.y) / (scale * 0.5);
      float t = uDanceClock * 0.25 + aSeed*0.001; // slow anim, slight per-particle offset
      // place two dancers offset in X and mirrored
      float sep = 1.8;
      float dL = sdHumanoid(P - vec2(-sep, 0.0), t, 1.0);
      float dR = sdHumanoid(P - vec2( sep, 0.0), t + 0.3, -1.0);
      float d = min(dL, dR);
      // gradient (approx) once for both edge and interior pushes
      float e = 0.01;
      float dLx = sdHumanoid(P + vec2(e,0.0) - vec2(-sep,0.0), t, 1.0);
      float dRx = sdHumanoid(P + vec2(e,0.0) - vec2( sep,0.0), t+0.3, -1.0);
      float dLy = sdHumanoid(P + vec2(0.0,e) - vec2(-sep,0.0), t, 1.0);
      float dRy = sdHumanoid(P + vec2(0.0,e) - vec2( sep,0.0), t+0.3, -1.0);
      float dx = d - min(dLx, dRx);
      float dy = d - min(dLy, dRy);
      vec2 n2 = normalize(vec2(dx, dy) + 1e-5);
      vec3 n = normalize(vec3(n2, 0.0));
      // masks
      float w = 0.08; // edge width in SDF units
      float edge = 1.0 - smoothstep(w*0.6, w, abs(d));
      float inside = smoothstep(0.0, 0.35, -d); // body interior
      // edge push (strong ring)
      if (edge > 0.0) {
        float pushE = uDanceWidth * uDanceIntensity * plane * edge;
        pos += n * pushE;
        vDarken = max(vDarken, edge * plane * (uDanceOutline * 1.2));
      }
      // interior push (fill the silhouette)
      if (inside > 0.0) {
        float pushI = uDanceFill * uDanceIntensity * plane * inside;
        pos += n * pushI;
        vDarken = max(vDarken, inside * plane * (uDanceOutline * 0.5));
      }
    }
  }

  // Right-drag drawing: repel from the drawn path using line segments (cylindrical separation).
  if (uDrawCount > 1) {
    float fade = 1.0;
    if (uDrawHold < 0.5) {
      float age = max(0.0, uTime - uDrawFadeStart);
      fade = 1.0 - clamp(age / max(0.001, uDrawFadeDur), 0.0, 1.0);
    }
    if (fade > 0.0) {
      float r0 = uDrawRadius;
      // Iterate segments [i -> i+1]
      for (int i = 0; i < 63; i++) {
        if (i >= uDrawCount - 1) break;
        vec3 a = uDrawPts[i];
        vec3 b = uDrawPts[i+1];
        vec3 ab = b - a;
        float ab2 = dot(ab, ab);
        if (ab2 < 1e-6) continue;
        float tSeg = clamp(dot(pos - a, ab) / ab2, 0.0, 1.0);
        vec3 c = a + ab * tSeg; // closest point on segment
        vec3 d = pos - c;
        float dist = length(d);
        float hard = 1.0 - smoothstep(r0*0.6, r0, dist);
        if (hard > 0.0) {
          vec3 n = normalize(d + 1e-5);
          // push outward along normal
          pos += n * (r0 * 0.9 * hard * fade);
          // add sideways scatter using a stable per-particle random tangent
          vec3 rdir = normalize(vec3(
            fract(sin(aSeed*12.9898)*43758.5453),
            fract(sin((aSeed+1.23)*78.233)*43758.5453),
            fract(sin((aSeed+2.34)*39.425)*43758.5453)
          ) * 2.0 - 1.0);
          vec3 tvec = rdir - n * dot(rdir, n);
          float tl2 = dot(tvec, tvec);
          if (tl2 > 1e-6) {
            vec3 tdir = tvec * inversesqrt(tl2);
            pos += tdir * (uDrawScatter * hard * fade);
          }
        }
      }
    }
  }

  // Keep particles within a dynamic sphere to allow visible expansion on music pulses
  float r = length(pos);
  float rLimit = uRadius * (1.0 + max(uPulse, 0.0) * 0.35 + uBeatPulse * 0.25) + flareExtend;
  // beat burst pushes near the edge outward briefly
  if (uBeatPulse > 0.0) {
    float edgeMask = smoothstep(rLimit*0.45, rLimit*0.95, r);
    vec3 nrm = normalize(pos + 1e-5);
    pos += nrm * (uBeatPulse * 7.0 * edgeMask);
    r = length(pos);
  }
  if (r > rLimit) {
    pos *= (rLimit / r);
  }
  // Collapse to a singular bright particle as uCollapsePhase -> 1
  if (uCollapsePhase > 0.0) {
    float cp = uCollapsePhase;
    // pull toward center nonlinearly and reduce spread
    pos *= mix(1.0, 0.02, smoothstep(0.0, 1.0, cp));
  }
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

  // Screen-space radial direction (for cheap tail orientation)
  {
    vec3 radial = normalize(pos + 1e-5);
    vec3 vdir3 = (modelViewMatrix * vec4(radial, 0.0)).xyz; // direction in view space
    vec2 d2 = normalize(vdir3.xy + vec2(1e-5));
    vTrailDir = d2;
  }
  gl_Position = projectionMatrix * mvPosition;
  float sizeMul = 1.0;
  if (uDanceActive > 0.5) {
    // boost point size along the silhouette edge for visibility
    float scale = uDanceScale;
    vec2 P2 = vec2(pos.x, pos.y) / (scale * 0.5);
    float t2 = uDanceClock * 0.25 + aSeed*0.001;
    float sep2 = 1.8;
    float dL2 = sdHumanoid(P2 - vec2(-sep2, 0.0), t2, 1.0);
    float dR2 = sdHumanoid(P2 - vec2( sep2, 0.0), t2 + 0.3, -1.0);
    float d2 = min(dL2, dR2);
    float w2 = 0.08;
    float edge2 = 1.0 - smoothstep(w2*0.6, w2, abs(d2));
    float plane2 = 1.0 - smoothstep(uDancePlane, uDancePlane*1.8, abs(pos.z));
    sizeMul = mix(1.0, uDanceSizeBoost, clamp(edge2 * plane2, 0.0, 1.0));
  }
  gl_PointSize = uSize * (300.0 / -mvPosition.z) * sizeMul;
  // subtle size pop on beat
  gl_PointSize *= (1.0 + uBeatPulse * 0.45);
}
