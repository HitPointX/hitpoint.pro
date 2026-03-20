uniform float uTime;
uniform vec3 uLightPos;
uniform float uOuterRadius;

varying vec3 vWorldPosition;
varying vec3 vNormalWorld;

void main() {
  vec3 normal = normalize(vNormalWorld);
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  vec3 lightDir = normalize(uLightPos - vWorldPosition);

  float radiusNorm = clamp(length(vWorldPosition.xz) / uOuterRadius, 0.0, 1.0);
  float innerDark = pow(1.0 - radiusNorm, 2.6);
  float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.5);
  float diffuse = max(dot(normal, lightDir), 0.0);

  float ripples = sin(radiusNorm * 42.0 - uTime * 0.65 + vWorldPosition.z * 0.12) * 0.5 + 0.5;
  float shimmer = sin(vWorldPosition.x * 0.18 + vWorldPosition.z * 0.17 + uTime * 0.3) * 0.5 + 0.5;
  float textureMix = mix(ripples, shimmer, 0.4);

  float orbGlow = smoothstep(12.0, 0.0, length(uLightPos - vWorldPosition));
  float rim = smoothstep(0.38, 1.0, radiusNorm);

  vec3 color = vec3(0.01, 0.01, 0.012);
  color += vec3(0.018) * rim;
  color += vec3(0.05) * fresnel * rim;
  color += vec3(0.028) * diffuse * rim;
  color += vec3(0.018) * textureMix * rim;
  color += vec3(0.14) * orbGlow * (0.25 + 0.75 * rim);
  color *= 1.0 - innerDark * 0.96;

  gl_FragColor = vec4(color, 1.0);
}
