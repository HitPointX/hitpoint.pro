varying vec2 vUv;
varying float vAlpha;
varying float vCoreFade;
varying float vHoleMask;

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  float width = smoothstep(1.0, 0.0, abs(uv.x));
  float lengthMask = smoothstep(1.15, 0.25, length(vec2(uv.x * 1.55, uv.y)));
  float headGlow = smoothstep(1.0, -0.15, uv.y);
  float tailFalloff = smoothstep(-1.0, 0.55, uv.y);

  float alpha = width * lengthMask * headGlow * tailFalloff * vAlpha * vHoleMask;
  vec3 color = mix(vec3(0.68), vec3(0.96), clamp(vCoreFade * 0.75, 0.0, 1.0));
  color *= mix(0.7, 1.0, vHoleMask);

  if (alpha < 0.01) {
    discard;
  }

  gl_FragColor = vec4(color, alpha);
}
