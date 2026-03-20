varying vec2 vUv;
varying float vAlpha;
varying float vCoreFade;
varying float vHoleMask;
varying float vDistanceFade;

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  float edgeAA = fwidth(uv.x) * 3.0;
  float radialAA = fwidth(length(vec2(uv.x * 1.55, uv.y))) * 2.5;
  float width = 1.0 - smoothstep(1.0 - edgeAA, 1.0 + edgeAA, abs(uv.x));
  float lengthMask = 1.0 - smoothstep(1.15 - radialAA, 1.15 + radialAA, length(vec2(uv.x * 1.55, uv.y)));
  float headGlow = smoothstep(1.0, -0.15, uv.y);
  float tailFalloff = smoothstep(-1.0, 0.55, uv.y);

  float alpha = width * lengthMask * headGlow * tailFalloff * vAlpha * vHoleMask * vDistanceFade;
  vec3 color = mix(vec3(0.62), vec3(0.96), clamp(vCoreFade * 0.75, 0.0, 1.0));
  color *= mix(0.7, 1.0, vHoleMask);
  color *= mix(0.82, 1.0, vDistanceFade);

  if (alpha < 0.01) {
    discard;
  }

  gl_FragColor = vec4(color, alpha);
}
