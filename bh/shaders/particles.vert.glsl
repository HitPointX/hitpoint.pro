uniform float uTime;
uniform float uOuterRadius;
uniform float uCoreRadius;
uniform float uDepth;
uniform float uReduceMotion;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamForward;

attribute vec4 aParams;
attribute vec4 aParams2;

varying vec2 vUv;
varying float vAlpha;
varying float vCoreFade;
varying float vHoleMask;
varying float vDistanceFade;

float funnelHeight(float radius) {
  float rNorm = clamp(radius / uOuterRadius, 0.0, 1.0);
  return -pow(1.0 - rNorm, 2.32) * uDepth;
}

vec3 spiralPosition(float phase) {
  float speed = mix(0.041, 0.12, aParams.w);
  float progress = fract(aParams.z + phase * speed * mix(0.34, 1.0, 1.0 - uReduceMotion));
  float inward = pow(progress, 0.92);
  float radius = mix(aParams.y, uCoreRadius, inward);
  float radiusNorm = clamp(radius / uOuterRadius, 0.0, 1.0);

  float turnLift = mix(1.0, 6.5, 1.0 - radiusNorm);
  float angularBreakup = (aParams2.z * 2.0 - 1.0) * mix(0.26, 0.04, 1.0 - radiusNorm);
  angularBreakup += sin(phase * 0.11 + aParams.x * 5.0 + aParams2.y * 9.0) * mix(0.1, 0.02, 1.0 - radiusNorm);
  float theta = aParams.x + progress * (3.1 + aParams.w * 3.6) + turnLift + angularBreakup;

  float shellThickness = mix(0.55, 7.6, radiusNorm);
  float shellOffset = (aParams2.y * 2.0 - 1.0) * shellThickness * mix(0.1, 1.0, radiusNorm);
  float wobble = sin(theta * 1.6 + phase * 0.25 + aParams2.w * 12.0) * mix(0.04, 0.18, radiusNorm);
  float y = funnelHeight(radius) + shellOffset + wobble;
  y -= pow(1.0 - radiusNorm, 2.0) * 1.15;

  return vec3(cos(theta) * radius, y, sin(theta) * radius);
}

void main() {
  vUv = uv;

  vec3 worldPos = spiralPosition(uTime);
  vec3 nextWorldPos = spiralPosition(uTime + 0.032);
  vec3 velocity = normalize(nextWorldPos - worldPos);

  float radiusNorm = clamp(length(worldPos.xz) / uOuterRadius, 0.0, 1.0);
  float stretch = mix(0.38, 2.2, smoothstep(0.08, 0.72, radiusNorm)) * mix(0.82, 1.35, aParams2.z);
  float thickness = mix(0.018, 0.072, aParams2.x) * mix(0.72, 1.0, radiusNorm);
  float farFade = 1.0 - smoothstep(0.76, 1.02, radiusNorm);
  stretch *= mix(1.0, 0.78, smoothstep(0.6, 1.0, radiusNorm));
  thickness *= mix(1.0, 0.72, smoothstep(0.68, 1.0, radiusNorm));
  stretch *= mix(1.0, 0.44, uReduceMotion);

  vec3 projected = velocity - uCamForward * dot(velocity, uCamForward);
  float projectedLength = length(projected);
  vec3 streakAxis = projectedLength > 0.0001 ? projected / projectedLength : uCamUp;
  vec3 streakNormal = normalize(cross(uCamForward, streakAxis));

  vec3 displaced = worldPos;
  displaced += streakNormal * position.x * thickness;
  displaced += streakAxis * position.y * stretch;

  vAlpha = mix(0.45, 1.0, aParams2.x);
  vCoreFade = 1.0 - radiusNorm;
  vHoleMask = smoothstep(0.045, 0.16, radiusNorm);
  vDistanceFade = farFade;

  gl_Position = projectionMatrix * viewMatrix * vec4(displaced, 1.0);
}
