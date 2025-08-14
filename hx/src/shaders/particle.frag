uniform vec3 uLightPos;
uniform float uDrawHold;
uniform float uCollapsePhase;
varying vec3 vColor;
varying float vDarken;
varying float vSeed;
varying vec2 vTrailDir;
void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float d = length(uv);
  if (d > 0.5) discard;
  // Base circular falloff
  float alpha = smoothstep(0.5, 0.0, d);
  float shade = 0.5 + 0.5 * dot(normalize(uLightPos), vec3(0.0, 0.0, 1.0));
  // base color
  vec3 base = vColor;
  // if drawing, override to baby blue/navy gradient
  if (uDrawHold > 0.5) {
    vec3 babyBlue = vec3(0.6, 0.85, 1.0);
    vec3 navy = vec3(0.05, 0.12, 0.35);
    base = mix(navy, babyBlue, vSeed);
  }
  vec3 col = base * shade;
  // silhouette outline darkening
  col *= (1.0 - clamp(vDarken, 0.0, 0.9));
  // gentle glow toward center
  col += vec3(0.15, 0.2, 0.25) * (1.0 - d);
  // Blue-only subtle tail: elongate alpha along vTrailDir for bluish particles
  float blueBias = smoothstep(0.45, 0.75, vColor.b - max(vColor.r, vColor.g));
  if (blueBias > 0.0) {
    // project uv onto trail axis (vTrailDir) and its perpendicular
    vec2 t = normalize(vTrailDir);
    float along = dot(uv, t);
    float perp = dot(uv, vec2(-t.y, t.x));
    // anisotropic shaping: tighter across, looser along (one-sided for trailing)
    float ellipse = sqrt(perp*perp*8.0 + max(0.0, -along)*max(0.0, -along)*2.5);
    float tail = smoothstep(0.5, 0.0, ellipse);
    // mix a bit of tail into alpha; clamp to avoid overdraw
    alpha = clamp(max(alpha, tail * (0.6 + 0.4*vSeed)) * (0.85 + 0.15*blueBias), 0.0, 1.0);
  }

  // extra brightness near collapse
  if (uCollapsePhase > 0.0) {
    float glow = pow(1.0 - d, 2.0) * uCollapsePhase * 1.5;
    col += vec3(1.0, 0.95, 0.9) * glow;
  }
  gl_FragColor = vec4(col, alpha);
}
