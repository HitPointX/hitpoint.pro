import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.154.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.154.0/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "https://cdn.jsdelivr.net/npm/three@0.154.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://cdn.jsdelivr.net/npm/three@0.154.0/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://cdn.jsdelivr.net/npm/three@0.154.0/examples/jsm/postprocessing/UnrealBloomPass.js";

const canvas = document.getElementById("scene");
const omenCanvas = document.getElementById("omenCanvas");
const loadingScreen = document.getElementById("loadingScreen");
const loadingText = document.getElementById("loadingText");
const statusText = document.getElementById("statusText");
const motionToggle = document.getElementById("motionToggle");
const messageLayer = document.getElementById("messageLayer");
const messageText = document.getElementById("messageText");
const glyphLayer = document.getElementById("glyphLayer");
const glyphText = document.getElementById("glyphText");
const whiteout = document.getElementById("whiteout");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const CONFIG = {
  outerRadius: 30,
  funnelRadius: 56,
  coreRadius: 0.9,
  depth: 18,
  shellRadius: 2.9,
  shellTheta: -0.48,
  farTarget: new THREE.Vector3(0.18, -9.7, -0.18),
  nearTargetBias: new THREE.Vector3(0.28, 1.38, 0.02),
};

const state = {
  reduceMotion: prefersReducedMotion.matches,
  orbZoomMix: 0,
  orbEvents: {
    observedTime: 0,
    active: null,
    lastEventId: "",
    smoothed: null,
  },
  orbAwakening: {
    active: false,
    started: false,
    phase: "idle",
    elapsed: 0,
    afkTime: 0,
    messageIndex: -1,
    messageCharIndex: 0,
    messageElapsed: 0,
    messageText: "",
    glyphString: "",
    whiteout: 0,
    redirectQueued: false,
    attackTimer: 0,
    burstTimer: 0,
    interactionCooldown: 0,
  },
};

const tempVecA = new THREE.Vector3();
const tempVecB = new THREE.Vector3();
const tempVecC = new THREE.Vector3();

let renderer;
let composer;
let bloomPass;
let scene;
let camera;
let controls;
let funnel;
let particles;
let figure;
let figureBody;
let orb;
let orbHalo;
let shelf;
let shelfGlow;
let coreMist;
let figureHalo;
let focusTarget;
let shellCenter;
let figureBase;
let orbBase;
let zoomTarget;
let elapsed = 0;
let lastFrame = performance.now();
let orbCoreLight;
let orbCatchLight;
let orbMaterial;
let omenContext;
let userIdleAt = performance.now();
let orbBaseColor;

const ORB_AFK_TRIGGER_SECONDS = 15 * 60;
const ORB_AFK_MAX_ZOOM = 0.97;
const ORB_ATTACK_STAGE_TIME = 12;
const ORB_RED = new THREE.Color(2.6, 0.05, 0.05);
const ORB_WHITE = new THREE.Color(1, 1, 1);
const ORB_HALO_RED = new THREE.Color(1.6, 0.08, 0.08);
const ORB_LIGHT_RED = new THREE.Color(1, 0.08, 0.08);
const ORB_CATCH_RED = new THREE.Color(1, 0.12, 0.12);

const AWAKENING_MESSAGES = [
  { text: "I '  V E\nB E E N \nW A I T I N G\nF O R\nY O U", typeSpeed: 0.22, hold: 3.6 },
  { text: "L I S T E N\nC A R E F U L L Y", typeSpeed: 0.24, hold: 3.4 },
  { text: "W E\nA R E\nR U N N I N G\nO U T\nO F \nT I M E", typeSpeed: 0.21, hold: 3.8 },
  { text: "Y O U\nC A N\nC H A N G E\nT H I S", typeSpeed: 0.24, hold: 3.6 },
  { text: "B U T\nO N L Y\nI F\nY O U", typeSpeed: 0.24, hold: 3.4 },
  { text: "B E L I E V E", typeSpeed: 0.28, hold: 3.8 },
  { text: "L O O K\nA T \nH O W\nF A R\nY O U ' VE\nC O M E", typeSpeed: 0.22, hold: 4.2 },
  { text: "I ' V E\nB E E N\nO B S E R V I N G\nY O U R\nE V E R Y\nM O M E N T", typeSpeed: 0.18, hold: 4.8 },
  { text: "L E T\nM E \nS H O W\nY O U", typeSpeed: 0.25, hold: 4.0 },
  { text: "T A K E\nM Y\nE N E R G Y", typeSpeed: 0.26, hold: 8.0, energy: true },
  { text: "T A K E \nT H I S\nG I F T", typeSpeed: 0.24, hold: 5.2, gift: true },
];

const ORB_BASE = {
  orbScale: 1,
  orbBrightness: 2.4,
  haloScale: 2.2,
  haloOpacity: 0.16,
  lightIntensity: 1.7,
  catchIntensity: 0.12,
  mistOpacity: 0.03,
  mistScale: 3.4,
};

orbBaseColor = new THREE.Color(ORB_BASE.orbBrightness, ORB_BASE.orbBrightness, ORB_BASE.orbBrightness);

const ORB_EVENT_INTERVAL = 15;
const ORB_EVENT_MIN_ZOOM = 0.9;

const ORB_EVENT_LIBRARY = [
  {
    id: "acknowledge-rise",
    duration: 2.8,
    apply(mod, p) {
      const arc = Math.sin(p * Math.PI);
      mod.offsetY += arc * 0.28;
      mod.scale += arc * 0.08;
      mod.light += arc * 0.2;
    },
  },
  {
    id: "double-bob",
    duration: 3.2,
    apply(mod, p) {
      const beats = Math.max(0.0, Math.sin(p * Math.PI * 4.0));
      mod.offsetY += beats * 0.16;
      mod.scale += beats * 0.04;
      mod.haloOpacity += beats * 0.05;
    },
  },
  {
    id: "slow-orbit",
    duration: 5.4,
    apply(mod, p, seed) {
      const sign = seedSign(seed);
      const angle = p * Math.PI * 2.0;
      mod.offsetX += Math.cos(angle) * 0.18;
      mod.offsetZ += Math.sin(angle) * 0.14 * sign;
      mod.offsetY += Math.sin(angle * 0.5) * 0.08;
    },
  },
  {
    id: "figure-eight",
    duration: 5.8,
    apply(mod, p) {
      const angle = p * Math.PI * 2.0;
      mod.offsetX += Math.sin(angle) * 0.16;
      mod.offsetY += Math.sin(angle * 2.0) * 0.08;
      mod.haloScale += 0.06;
    },
  },
  {
    id: "inward-breath",
    duration: 4.2,
    apply(mod, p) {
      const inhale = Math.sin(p * Math.PI);
      mod.scale -= inhale * 0.1;
      mod.haloScale -= inhale * 0.12;
      mod.light -= inhale * 0.14;
      mod.mistOpacity -= inhale * 0.01;
    },
  },
  {
    id: "outward-breath",
    duration: 4.4,
    apply(mod, p) {
      const exhale = Math.sin(p * Math.PI);
      mod.scale += exhale * 0.14;
      mod.haloScale += exhale * 0.22;
      mod.haloOpacity += exhale * 0.07;
      mod.light += exhale * 0.24;
    },
  },
  {
    id: "heartbeat",
    duration: 3.8,
    apply(mod, p) {
      const beatA = gaussianPulse(p, 0.22, 0.05);
      const beatB = gaussianPulse(p, 0.36, 0.05);
      const beat = beatA + beatB * 0.92;
      mod.scale += beat * 0.1;
      mod.light += beat * 0.38;
      mod.haloOpacity += beat * 0.08;
    },
  },
  {
    id: "halo-bloom",
    duration: 3.6,
    apply(mod, p) {
      const bloom = Math.sin(p * Math.PI);
      mod.haloScale += bloom * 0.44;
      mod.haloOpacity += bloom * 0.12;
      mod.light += bloom * 0.18;
      mod.mistScale += bloom * 0.24;
    },
  },
  {
    id: "dark-blink",
    duration: 2.8,
    apply(mod, p) {
      const blink = gaussianPulse(p, 0.36, 0.055);
      mod.brightness -= blink * 0.92;
      mod.light -= blink * 0.86;
      mod.haloOpacity -= blink * 0.14;
    },
  },
  {
    id: "triple-blink",
    duration: 4.0,
    apply(mod, p) {
      const blink = gaussianPulse(p, 0.16, 0.04) + gaussianPulse(p, 0.34, 0.04) + gaussianPulse(p, 0.56, 0.05);
      mod.brightness -= blink * 0.74;
      mod.light -= blink * 0.7;
      mod.haloOpacity -= blink * 0.12;
    },
  },
  {
    id: "glitch-jitter",
    duration: 3.2,
    apply(mod, p, seed) {
      const stepped = steppedNoise(p, 18.0, seed);
      mod.offsetX += (stepped - 0.5) * 0.18;
      mod.offsetY += (steppedNoise(p, 24.0, seed + 2.1) - 0.5) * 0.22;
      mod.haloOpacity += (fract(p * 24.0) > 0.55 ? 0.08 : -0.03);
      mod.light += (fract(p * 16.0 + seed) > 0.62 ? 0.26 : -0.08);
    },
  },
  {
    id: "glitch-stutter",
    duration: 2.8,
    apply(mod, p, seed) {
      const jump = steppedNoise(p, 12.0, seed);
      mod.offsetX += (jump - 0.5) * 0.28;
      mod.offsetZ += (steppedNoise(p, 10.0, seed + 5.0) - 0.5) * 0.16;
      mod.scale += (fract(p * 12.0 + seed) > 0.6 ? 0.08 : -0.02);
      mod.brightness += (fract(p * 19.0 + seed * 0.3) > 0.75 ? 0.2 : -0.08);
    },
  },
  {
    id: "phase-slip",
    duration: 3.6,
    apply(mod, p, seed) {
      const fade = gaussianPulse(p, 0.22, 0.08) + gaussianPulse(p, 0.58, 0.08);
      mod.offsetX += seedSign(seed) * fade * 0.2;
      mod.offsetY += fade * 0.08;
      mod.brightness -= fade * 0.68;
      mod.haloOpacity -= fade * 0.08;
    },
  },
  {
    id: "observer-nod",
    duration: 4.8,
    apply(mod, p) {
      const nod = Math.sin(p * Math.PI);
      mod.offsetZ += nod * 0.22;
      mod.scale += nod * 0.05;
      mod.light += nod * 0.16;
    },
  },
  {
    id: "retreat-and-return",
    duration: 5.2,
    apply(mod, p) {
      const retreat = Math.sin(p * Math.PI);
      mod.offsetZ -= retreat * 0.24;
      mod.offsetY += retreat * 0.06;
      mod.brightness -= retreat * 0.18;
      mod.light -= retreat * 0.16;
    },
  },
  {
    id: "warning-flare",
    duration: 3.4,
    apply(mod, p) {
      const flare = Math.max(0.0, Math.sin(p * Math.PI));
      mod.scale += flare * 0.12;
      mod.light += flare * 0.46;
      mod.haloScale += flare * 0.32;
      mod.haloOpacity += flare * 0.1;
      mod.mistOpacity += flare * 0.02;
    },
  },
  {
    id: "beacon-call",
    duration: 5.2,
    apply(mod, p) {
      const ripple = 0.5 + 0.5 * Math.sin(p * Math.PI * 6.0);
      mod.haloScale += ripple * 0.2;
      mod.haloOpacity += ripple * 0.05;
      mod.light += ripple * 0.14;
    },
  },
  {
    id: "spiral-knot",
    duration: 5.0,
    apply(mod, p, seed) {
      const angle = p * Math.PI * 3.0 * seedSign(seed);
      const radius = 0.1 + Math.sin(p * Math.PI) * 0.06;
      mod.offsetX += Math.cos(angle) * radius;
      mod.offsetY += Math.sin(angle) * radius * 0.6;
      mod.offsetZ += Math.sin(angle * 0.5) * 0.08;
    },
  },
  {
    id: "pendulum-sway",
    duration: 5.4,
    apply(mod, p, seed) {
      const sign = seedSign(seed);
      const sway = Math.sin(p * Math.PI * 2.0) * sign;
      mod.offsetX += sway * 0.22;
      mod.offsetY += (1.0 - Math.cos(p * Math.PI * 2.0)) * 0.04;
    },
  },
  {
    id: "hesitant-rise",
    duration: 4.4,
    apply(mod, p) {
      const rise = smoothBell(p);
      const tremor = Math.sin(p * Math.PI * 10.0) * 0.02;
      mod.offsetY += rise * 0.24 + tremor;
      mod.light += rise * 0.12;
    },
  },
  {
    id: "false-collapse",
    duration: 3.8,
    apply(mod, p) {
      const squeeze = smoothBell(p);
      mod.scale -= squeeze * 0.18;
      mod.brightness -= squeeze * 0.3;
      mod.light -= squeeze * 0.28;
      mod.haloScale -= squeeze * 0.24;
    },
  },
  {
    id: "echo-pulse",
    duration: 5.6,
    apply(mod, p) {
      const pulse = gaussianPulse(fract(p * 3.0), 0.2, 0.12);
      mod.scale += pulse * 0.08;
      mod.haloScale += pulse * 0.18;
      mod.haloOpacity += pulse * 0.06;
      mod.mistScale += pulse * 0.1;
    },
  },
  {
    id: "side-glance",
    duration: 4.6,
    apply(mod, p, seed) {
      const sign = seedSign(seed);
      const drift = Math.sin(p * Math.PI) * sign;
      mod.offsetX += drift * 0.16;
      mod.offsetZ += Math.sin(p * Math.PI) * 0.08;
      mod.brightness += Math.sin(p * Math.PI) * 0.08;
    },
  },
  {
    id: "low-whisper",
    duration: 6.4,
    apply(mod, p, seed) {
      const ripple = noiseWave(p, 3.0, seed) * 0.5 + 0.5;
      mod.offsetY += ripple * 0.06;
      mod.haloOpacity += ripple * 0.03;
      mod.mistOpacity += ripple * 0.012;
      mod.light += ripple * 0.08;
    },
  },
  {
    id: "crown-flare",
    duration: 3.2,
    apply(mod, p) {
      const flare = gaussianPulse(p, 0.26, 0.12);
      mod.offsetY += flare * 0.18;
      mod.haloScale += flare * 0.36;
      mod.light += flare * 0.34;
      mod.brightness += flare * 0.16;
    },
  },
];

const handleReducedMotionChange = (event) => {
  setReducedMotion(event.matches);
};

if (typeof prefersReducedMotion.addEventListener === "function") {
  prefersReducedMotion.addEventListener("change", handleReducedMotionChange);
} else if (typeof prefersReducedMotion.addListener === "function") {
  prefersReducedMotion.addListener(handleReducedMotionChange);
}

if (motionToggle) {
  motionToggle.addEventListener("click", () => {
    setReducedMotion(!state.reduceMotion);
  });
}

window.addEventListener("pointerdown", markUserActivity, { passive: true });
window.addEventListener("pointermove", markUserActivity, { passive: true });
window.addEventListener("wheel", markUserActivity, { passive: true });
window.addEventListener("keydown", markUserActivity);
window.addEventListener("touchstart", markUserActivity, { passive: true });
window.addEventListener("touchmove", markUserActivity, { passive: true });

boot().catch((error) => {
  console.error(error);
  setStatus("Renderer setup failed.");
  setLoading(`This browser could not open the scene. ${error.message || error}`);
});

async function boot() {
  if (!isWebGLAvailable()) {
    throw new Error("WebGL is unavailable on this device.");
  }

  syncMotionToggle();
  setStatus("Loading shaders and staging geometry.");
  setLoading("Loading funnel and particle shaders.");

  const [particleVertex, particleFragment, funnelVertex, funnelFragment] = await Promise.all([
    loadText("./shaders/particles.vert.glsl"),
    loadText("./shaders/particles.frag.glsl"),
    loadText("./shaders/funnel.vert.glsl"),
    loadText("./shaders/funnel.frag.glsl"),
  ]);

  setLoading("Configuring renderer, camera, and atmosphere.");
  createRenderer();
  createScene();
  shellCenter = getShellCenter();
  createCamera();
  createControls();
  createPost();

  setLoading("Cutting the funnel and placing the core light.");
  createFunnel(funnelVertex, funnelFragment);
  createOrb();
  createMist();

  setLoading("Seeding the spiral field.");
  createParticles(particleVertex, particleFragment);

  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", () => {
    lastFrame = performance.now();
  });

  applyMotionProfile();
  omenContext = omenCanvas ? omenCanvas.getContext("2d") : null;
  onResize();
  setStatus("Drag to orbit. Scroll to close the gap. The camera stays above the floor and out of the focal objects.");
  loadingScreen.classList.add("hidden");
  requestAnimationFrame(animate);
}

function createRenderer() {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(getPixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.setClearColor(0x000000, 1);
}

function createScene() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.045);

  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x050505, 0.28);
  scene.add(hemisphere);

  const fill = new THREE.DirectionalLight(0xffffff, 0.18);
  fill.position.set(-8, 12, 10);
  scene.add(fill);
}

function createCamera() {
  camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 160);
  focusTarget = CONFIG.farTarget.clone();
  zoomTarget = focusTarget.clone();
  camera.position.set(-0.6, 10.2, 41.5);
  camera.lookAt(focusTarget);
}

function createControls() {
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(focusTarget);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.rotateSpeed = 0.42;
  controls.zoomSpeed = 0.5;
  controls.minDistance = 4.8;
  controls.maxDistance = 46;
  controls.minPolarAngle = 0.14;
  controls.maxPolarAngle = 1.18;
}

function createPost() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.95, 0.75, 0.2);
  composer.addPass(bloomPass);
}

function createFunnel(vertexShader, fragmentShader) {
  const geometry = createFunnelGeometry(CONFIG.funnelRadius, CONFIG.coreRadius, 180, 72);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uLightPos: { value: new THREE.Vector3() },
      uOuterRadius: { value: CONFIG.funnelRadius },
    },
  });

  funnel = new THREE.Mesh(geometry, material);
  scene.add(funnel);
}

function createShelf() {
  const center = shellCenter.clone();

  shelf = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.8, 0.42, 72, 1, false),
    new THREE.MeshStandardMaterial({
      color: 0x080808,
      roughness: 0.92,
      metalness: 0.03,
      emissive: 0x060606,
      emissiveIntensity: 0.35,
    }),
  );
  shelf.position.copy(center);
  shelf.position.y += 0.16;
  scene.add(shelf);

  shelfGlow = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 3.4, 64),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.085,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  shelfGlow.rotation.x = -Math.PI / 2;
  shelfGlow.position.copy(center);
  shelfGlow.position.y += 0.38;
  scene.add(shelfGlow);
}

function createFigure() {
  figure = new THREE.Group();
  const silhouetteTexture = createHumanoidSilhouetteTexture();
  const bodyMaterial = new THREE.MeshBasicMaterial({
    map: silhouetteTexture,
    transparent: true,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
  });
  figureBody = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 3.68), bodyMaterial);
  figureBody.position.set(0.0, 1.76, 0.0);
  figureBody.renderOrder = 8;

  const glowTexture = createRadialTexture("rgba(255,255,255,0.95)", "rgba(255,255,255,0)");
  figureHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  figureHalo.position.set(0.0, 1.78, -0.14);
  figureHalo.scale.set(2.6, 5.4, 1);

  figure.add(figureHalo, figureBody);
  figure.scale.setScalar(1.0);
  figure.position.copy(shellCenter);
  figure.position.set(figure.position.x - 0.56, figure.position.y + 0.3, figure.position.z + 0.1);
  figureBase = figure.position.clone();
  scene.add(figure);
}

function createOrb() {
  const center = new THREE.Vector3(0, funnelHeightFromRadius(1.15), 0);
  const orbTexture = createRadialTexture("#ffffff", "rgba(255,255,255,0)");

  orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 32, 32),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.4, 2.4, 2.4),
    }),
  );
  orbMaterial = orb.material;
  orb.position.set(center.x, center.y + 0.84, center.z - 0.08);
  scene.add(orb);
  orbBase = orb.position.clone();

  const haloMaterial = new THREE.SpriteMaterial({
    map: orbTexture,
    color: 0xffffff,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  orbHalo = new THREE.Sprite(haloMaterial);
  orbHalo.scale.setScalar(ORB_BASE.haloScale);
  orb.add(orbHalo);

  orbCoreLight = new THREE.PointLight(0xffffff, ORB_BASE.lightIntensity, 7, 2);
  orbCoreLight.position.set(0, 0, 0);
  orb.add(orbCoreLight);

  orbCatchLight = new THREE.PointLight(0xffffff, ORB_BASE.catchIntensity, 3.8, 2);
  orbCatchLight.position.set(center.x, center.y + 1.2, center.z + 1.1);
  scene.add(orbCatchLight);
}

function createMist() {
  const mistTexture = createRadialTexture("rgba(255,255,255,0.75)", "rgba(255,255,255,0)");

  coreMist = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: mistTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0.035,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  coreMist.position.set(0, funnelHeightFromRadius(1.2), 0);
  coreMist.scale.set(3.4, 3.4, 1);
  scene.add(coreMist);
}

function createParticles(vertexShader, fragmentShader) {
  const count = getParticleCount();
  const base = new THREE.PlaneGeometry(1, 1, 1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute("position", base.attributes.position);
  geometry.setAttribute("uv", base.attributes.uv);

  const params = new Float32Array(count * 4);
  const params2 = new Float32Array(count * 4);
  const innerBand = CONFIG.coreRadius + 5;

  for (let i = 0; i < count; i += 1) {
    const i4 = i * 4;
    const radiusBias = Math.pow(Math.random(), 0.38);
    params[i4] = Math.random() * Math.PI * 2;
    params[i4 + 1] = THREE.MathUtils.lerp(innerBand, CONFIG.outerRadius * 1.08, radiusBias);
    params[i4 + 2] = Math.random();
    params[i4 + 3] = 0.65 + Math.random() * 0.95;

    params2[i4] = 0.52 + Math.random() * 0.48;
    params2[i4 + 1] = Math.random();
    params2[i4 + 2] = Math.random();
    params2[i4 + 3] = Math.random();
  }

  geometry.setAttribute("aParams", new THREE.InstancedBufferAttribute(params, 4));
  geometry.setAttribute("aParams2", new THREE.InstancedBufferAttribute(params2, 4));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -CONFIG.depth * 0.35, 0), CONFIG.outerRadius * 2.1);

  const uniforms = {
    uTime: { value: 0 },
    uOuterRadius: { value: CONFIG.outerRadius },
    uCoreRadius: { value: CONFIG.coreRadius },
    uDepth: { value: CONFIG.depth },
    uReduceMotion: { value: state.reduceMotion ? 1 : 0 },
    uCamRight: { value: new THREE.Vector3(1, 0, 0) },
    uCamUp: { value: new THREE.Vector3(0, 1, 0) },
    uCamForward: { value: new THREE.Vector3(0, 0, -1) },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  particles = new THREE.Mesh(geometry, material);
  particles.frustumCulled = false;
  particles.renderOrder = 2;
  scene.add(particles);
  base.dispose();
}

function animate(now) {
  requestAnimationFrame(animate);

  const dt = Math.min((now - lastFrame) * 0.001, 0.05);
  lastFrame = now;

  if (document.hidden) {
    return;
  }

  elapsed += dt;
  updateFocusTarget();
  updateAwakening(dt);
  updateOrbEventState(dt);
  controls.update();
  enforceCameraBounds();
  animateFocalObjects(dt);
  updateUniforms();
  composer.render();
  renderOmenCanvas(dt);
}

function animateFocalObjects(dt) {
  const motionFactor = THREE.MathUtils.lerp(1, 0.18, state.reduceMotion ? 1 : 0);
  const orbMod = createOrbModifiers();
  applyOrbEventModifiers(orbMod);
  applyAwakeningOrbModifiers(orbMod);
  const resolvedOrbMod = smoothOrbModifiers(orbMod, dt);
  const baseBobY = Math.sin(elapsed * 0.9) * 0.06 * motionFactor;
  const baseBobX = Math.sin(elapsed * 0.42) * 0.02 * motionFactor;
  const basePulse = 1 + Math.sin(elapsed * 1.8) * 0.06 * motionFactor;
  const baseHaloOpacity = 0.16 + Math.sin(elapsed * 1.5) * 0.025 * motionFactor;
  const baseMistOpacity = 0.03 + Math.sin(elapsed * 0.7) * 0.008 * motionFactor;
  const baseMistScale = 3.4 + Math.sin(elapsed * 0.65) * 0.12 * motionFactor;

  if (orb) {
    orb.position.copy(orbBase);
    orb.position.x += baseBobX + resolvedOrbMod.offsetX;
    orb.position.y += baseBobY + resolvedOrbMod.offsetY;
    orb.position.z += resolvedOrbMod.offsetZ;
    orb.scale.setScalar(ORB_BASE.orbScale * resolvedOrbMod.scale);
  }

  if (orbMaterial) {
    const brightness = Math.max(0.08, ORB_BASE.orbBrightness * resolvedOrbMod.brightness);
    orbMaterial.color.copy(orbBaseColor).lerp(ORB_RED, THREE.MathUtils.clamp(resolvedOrbMod.redness, 0, 1));
    orbMaterial.color.multiplyScalar(brightness / ORB_BASE.orbBrightness);
  }

  if (orbHalo) {
    orbHalo.scale.setScalar(ORB_BASE.haloScale * basePulse * resolvedOrbMod.haloScale);
    orbHalo.material.opacity = THREE.MathUtils.clamp(baseHaloOpacity * resolvedOrbMod.haloOpacity, 0.0, 0.48);
    orbHalo.material.color.copy(ORB_WHITE).lerp(ORB_HALO_RED, THREE.MathUtils.clamp(resolvedOrbMod.redness * 0.9, 0, 1));
  }

  if (orbCoreLight) {
    orbCoreLight.intensity = Math.max(0.02, ORB_BASE.lightIntensity * resolvedOrbMod.light);
    orbCoreLight.color.copy(ORB_WHITE).lerp(ORB_LIGHT_RED, THREE.MathUtils.clamp(resolvedOrbMod.redness, 0, 1));
  }

  if (orbCatchLight) {
    orbCatchLight.intensity = Math.max(0.01, ORB_BASE.catchIntensity * resolvedOrbMod.catchLight);
    orbCatchLight.color.copy(ORB_WHITE).lerp(ORB_CATCH_RED, THREE.MathUtils.clamp(resolvedOrbMod.redness, 0, 1));
  }

  if (coreMist) {
    coreMist.material.opacity = THREE.MathUtils.clamp(baseMistOpacity * resolvedOrbMod.mistOpacity, 0.0, 0.12);
    coreMist.scale.setScalar(baseMistScale * resolvedOrbMod.mistScale);
  }
}

function updateFocusTarget() {
  if (!orbBase) {
    return;
  }

  const nearTarget = orbBase.clone().add(new THREE.Vector3(0.0, 0.22, 0.0));
  const currentDistance = camera.position.distanceTo(controls.target);
  const zoomMix = THREE.MathUtils.clamp((controls.maxDistance - currentDistance) / (controls.maxDistance - controls.minDistance), 0, 1);
  state.orbZoomMix = zoomMix;
  zoomTarget.copy(CONFIG.farTarget).lerp(nearTarget, Math.pow(zoomMix, 1.3));
  controls.target.lerp(zoomTarget, 0.075);
}

function updateOrbEventState(dt) {
  if (state.orbAwakening.started) {
    return;
  }

  const observing = state.orbZoomMix >= ORB_EVENT_MIN_ZOOM;
  const orbEvents = state.orbEvents;

  if (orbEvents.active) {
    orbEvents.active.elapsed += dt;
    if (orbEvents.active.elapsed >= orbEvents.active.duration) {
      orbEvents.lastEventId = orbEvents.active.id;
      orbEvents.active = null;
    }
  }

  if (!observing) {
    orbEvents.observedTime = 0;
    return;
  }

  if (orbEvents.active) {
    return;
  }

  orbEvents.observedTime += dt;
  if (orbEvents.observedTime < ORB_EVENT_INTERVAL) {
    return;
  }

  orbEvents.observedTime = 0;
  const triggerChance = THREE.MathUtils.lerp(0.3, 0.5, Math.random());
  if (Math.random() > triggerChance) {
    return;
  }

  const eventDef = pickOrbEvent();
  orbEvents.active = {
    id: eventDef.id,
    duration: eventDef.duration,
    apply: eventDef.apply,
    elapsed: 0,
    seed: Math.random() * 1000 + elapsed,
  };
}

function pickOrbEvent() {
  if (ORB_EVENT_LIBRARY.length === 1) {
    return ORB_EVENT_LIBRARY[0];
  }

  let eventDef = ORB_EVENT_LIBRARY[Math.floor(Math.random() * ORB_EVENT_LIBRARY.length)];
  let safety = 0;

  while (eventDef.id === state.orbEvents.lastEventId && safety < 6) {
    eventDef = ORB_EVENT_LIBRARY[Math.floor(Math.random() * ORB_EVENT_LIBRARY.length)];
    safety += 1;
  }

  return eventDef;
}

function createOrbModifiers() {
  return {
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
    scale: 1,
    brightness: 1,
    haloScale: 1,
    haloOpacity: 1,
    light: 1,
    catchLight: 1,
    mistOpacity: 1,
    mistScale: 1,
    redness: 0,
  };
}

function smoothOrbModifiers(target, dt) {
  const orbEvents = state.orbEvents;
  if (!orbEvents.smoothed) {
    orbEvents.smoothed = { ...target };
    return orbEvents.smoothed;
  }

  const blend = 1 - Math.exp(-Math.min(dt, 0.05) * 7.5);
  for (const key of Object.keys(target)) {
    orbEvents.smoothed[key] = THREE.MathUtils.lerp(orbEvents.smoothed[key], target[key], blend);
  }
  return orbEvents.smoothed;
}

function applyOrbEventModifiers(modifiers) {
  const active = state.orbEvents.active;
  if (!active) {
    return;
  }

  const progress = THREE.MathUtils.clamp(active.elapsed / active.duration, 0, 1);
  active.apply(modifiers, progress, active.seed);
}

function updateUniforms() {
  if (particles) {
    const particleUniforms = particles.material.uniforms;
    particleUniforms.uTime.value = elapsed;
    particleUniforms.uReduceMotion.value = state.reduceMotion ? 1 : 0;

    camera.updateMatrixWorld();
    camera.getWorldDirection(particleUniforms.uCamForward.value);
    particleUniforms.uCamForward.value.normalize();
    particleUniforms.uCamRight.value.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    particleUniforms.uCamUp.value.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  }

  if (funnel) {
    funnel.material.uniforms.uTime.value = elapsed;
    funnel.material.uniforms.uLightPos.value.copy(orb ? orb.getWorldPosition(tempVecA) : new THREE.Vector3());
  }
}

function enforceCameraBounds() {
  tempVecA.copy(camera.position).sub(controls.target);
  const distance = tempVecA.length();
  if (distance < controls.minDistance) {
    tempVecA.setLength(controls.minDistance);
    camera.position.copy(controls.target).add(tempVecA);
  }
  if (distance > controls.maxDistance) {
    tempVecA.setLength(controls.maxDistance);
    camera.position.copy(controls.target).add(tempVecA);
  }

  keepCameraAboveSurface(camera.position, 1.9);
  keepOutsideSphere(camera.position, orb?.position, 0.82);

  controls.target.x = THREE.MathUtils.clamp(controls.target.x, -2.6, 2.8);
  controls.target.y = THREE.MathUtils.clamp(controls.target.y, -13.6, -8.2);
  controls.target.z = THREE.MathUtils.clamp(controls.target.z, -2.8, 2.8);
}

function keepCameraAboveSurface(position, lift) {
  const radius = Math.hypot(position.x, position.z);
  const surfaceY = funnelHeightFromRadius(Math.min(radius, CONFIG.outerRadius));
  position.y = Math.max(position.y, surfaceY + lift);
}

function keepOutsideSphere(position, center, radius) {
  if (!center) {
    return;
  }

  tempVecB.copy(position).sub(center);
  const distance = tempVecB.length();
  if (distance === 0) {
    tempVecB.set(0, 1, 0);
  }

  if (distance < radius) {
    tempVecB.setLength(radius);
    position.copy(center).add(tempVecB);
  }
}

function setReducedMotion(nextValue) {
  state.reduceMotion = Boolean(nextValue);
  syncMotionToggle();
  applyMotionProfile();
  setStatus(
    state.reduceMotion
      ? "Reduced motion is active. Trails shorten, bloom softens, and the idle drift nearly stops."
      : "Full motion is active. Drag to orbit. Scroll to close the gap without crossing the core light.",
  );
}

function applyMotionProfile() {
  if (bloomPass) {
    bloomPass.strength = state.reduceMotion ? 0.26 : 0.46;
    bloomPass.radius = state.reduceMotion ? 0.24 : 0.4;
  }
}

function syncMotionToggle() {
  if (motionToggle) {
    motionToggle.setAttribute("aria-pressed", String(state.reduceMotion));
  }
}

function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(getPixelRatio());
  renderer.setSize(width, height);
  composer.setSize(width, height);
  composer.setPixelRatio(getPixelRatio());
  if (omenCanvas) {
    omenCanvas.width = Math.floor(width * getPixelRatio());
    omenCanvas.height = Math.floor(height * getPixelRatio());
    omenCanvas.style.width = `${width}px`;
    omenCanvas.style.height = `${height}px`;
  }
}

function setLoading(message) {
  loadingText.textContent = message;
}

function setStatus(message) {
  if (statusText) {
    statusText.textContent = message;
  }
}

function loadText(path) {
  return fetch(path, { cache: "no-store" }).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to load ${path} (${response.status})`);
    }
    return response.text();
  });
}

function isWebGLAvailable() {
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
  } catch {
    return false;
  }
}

function getPixelRatio() {
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const cap = coarsePointer ? 1.2 : 1.5;
  return Math.min(window.devicePixelRatio || 1, cap);
}

function getParticleCount() {
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  if (state.reduceMotion) {
    return coarsePointer ? 9000 : 18000;
  }
  return coarsePointer ? 18000 : 42000;
}

function createFunnelGeometry(outerRadius, coreRadius, radialSegments, heightSegments) {
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let yIndex = 0; yIndex <= heightSegments; yIndex += 1) {
    const theta = (yIndex / heightSegments) * Math.PI * 2;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);

    for (let xIndex = 0; xIndex <= radialSegments; xIndex += 1) {
      const rNorm = xIndex / radialSegments;
      const radius = THREE.MathUtils.lerp(coreRadius, outerRadius, rNorm);
      positions.push(cosTheta * radius, funnelHeightFromRadius(radius), sinTheta * radius);
      uvs.push(rNorm, yIndex / heightSegments);
    }
  }

  for (let yIndex = 0; yIndex < heightSegments; yIndex += 1) {
    for (let xIndex = 0; xIndex < radialSegments; xIndex += 1) {
      const row = radialSegments + 1;
      const a = yIndex * row + xIndex;
      const b = a + row;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function funnelHeightFromRadius(radius) {
  const rNorm = THREE.MathUtils.clamp(radius / CONFIG.outerRadius, 0, 1);
  return -Math.pow(1 - rNorm, 2.32) * CONFIG.depth;
}

function getShellCenter() {
  const x = Math.cos(CONFIG.shellTheta) * CONFIG.shellRadius;
  const z = Math.sin(CONFIG.shellTheta) * CONFIG.shellRadius;
  return new THREE.Vector3(x, funnelHeightFromRadius(CONFIG.shellRadius), z);
}

function createRadialTexture(innerColor, outerColor) {
  const size = 256;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const context = textureCanvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is unavailable.");
  }
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, innerColor);
  gradient.addColorStop(1, outerColor);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function gaussianPulse(value, center, width) {
  const delta = (value - center) / Math.max(width, 0.0001);
  return Math.exp(-delta * delta);
}

function smoothBell(value) {
  return Math.sin(THREE.MathUtils.clamp(value, 0, 1) * Math.PI);
}

function seedSign(seed) {
  return Math.sin(seed * 19.173) >= 0 ? 1 : -1;
}

function steppedNoise(value, steps, seed) {
  const bucket = Math.floor(value * steps);
  const noise = Math.sin(bucket * 12.9898 + seed * 78.233) * 43758.5453;
  return fract(noise);
}

function noiseWave(value, frequency, seed) {
  return Math.sin(value * Math.PI * 2 * frequency + seed * 0.37) * 0.6
    + Math.sin(value * Math.PI * 2 * (frequency * 0.57) + seed * 1.13) * 0.4;
}

function fract(value) {
  return value - Math.floor(value);
}

function markUserActivity() {
  userIdleAt = performance.now();
  if (!state.orbAwakening.started) {
    state.orbAwakening.afkTime = 0;
  }
}

function updateAwakening(dt) {
  const awakening = state.orbAwakening;
  if (!awakening.started) {
    const idleSeconds = (performance.now() - userIdleAt) * 0.001;
    if (state.orbZoomMix >= ORB_AFK_MAX_ZOOM && idleSeconds > 1.0) {
      awakening.afkTime += dt;
      if (awakening.afkTime >= ORB_AFK_TRIGGER_SECONDS) {
        startAwakeningSequence();
      }
    } else {
      awakening.afkTime = 0;
    }
    return;
  }

  awakening.elapsed += dt;
  awakening.interactionCooldown = Math.max(0, awakening.interactionCooldown - dt);
  awakening.attackTimer -= dt;
  awakening.burstTimer = Math.max(0, awakening.burstTimer - dt);

  if (awakening.attackTimer <= 0) {
    spawnAwakeningStreakBurst();
    const rage = getAwakeningRage();
    awakening.attackTimer = THREE.MathUtils.lerp(1.4, 0.35, rage) + Math.random() * 0.35;
    awakening.burstTimer = 0.55 + Math.random() * 0.4;
  }

  if (awakening.phase === "anger") {
    if (awakening.elapsed >= ORB_ATTACK_STAGE_TIME) {
      awakening.phase = "messages";
      awakening.elapsed = 0;
      startAwakeningMessage(0);
    }
    return;
  }

  if (awakening.phase === "messages") {
    updateAwakeningMessages(dt);
    return;
  }

  if (awakening.phase === "glyph") {
    awakening.whiteout = THREE.MathUtils.lerp(awakening.whiteout, 1, 0.05);
    if (whiteout) {
      whiteout.style.opacity = String(awakening.whiteout);
    }
    awakening.messageElapsed += dt;
    if (awakening.messageElapsed >= 5.4 && !awakening.redirectQueued) {
      awakening.redirectQueued = true;
      window.setTimeout(() => {
        window.location.assign(new URL("/x/", window.location.href).href);
      }, 600);
    }
  }
}

function startAwakeningSequence() {
  const awakening = state.orbAwakening;
  awakening.started = true;
  awakening.active = true;
  awakening.phase = "anger";
  awakening.elapsed = 0;
  awakening.afkTime = ORB_AFK_TRIGGER_SECONDS;
  awakening.attackTimer = 0.3;
  awakening.burstTimer = 0.7;
  awakening.interactionCooldown = 0;
  awakening.messageElapsed = 0;
  awakening.messageIndex = -1;
  awakening.messageCharIndex = 0;
  awakening.messageText = "";
  awakening.whiteout = 0;
  awakening.redirectQueued = false;
  awakening.glyphString = buildGlyphGift();
  state.orbEvents.active = null;
  state.orbEvents.observedTime = 0;
  if (messageLayer) {
    messageLayer.classList.remove("active");
  }
  if (glyphLayer) {
    glyphLayer.classList.remove("active");
  }
  if (whiteout) {
    whiteout.style.opacity = "0";
  }
}

function updateAwakeningMessages(dt) {
  const awakening = state.orbAwakening;
  if (awakening.messageIndex < 0 || awakening.messageIndex >= AWAKENING_MESSAGES.length) {
    return;
  }

  const current = AWAKENING_MESSAGES[awakening.messageIndex];
  awakening.messageElapsed += dt;

  const charsVisible = Math.min(
    current.text.length,
    Math.floor(awakening.messageElapsed / current.typeSpeed),
  );

  if (charsVisible !== awakening.messageCharIndex) {
    awakening.messageCharIndex = charsVisible;
    awakening.messageText = current.text.slice(0, charsVisible);
    renderAwakeningMessage(current);
  }

  if (current.energy && charsVisible >= current.text.length) {
    const typedDuration = current.text.length * current.typeSpeed;
    const holdProgress = THREE.MathUtils.clamp((awakening.messageElapsed - typedDuration) / current.hold, 0, 1);
    const pulse = 0.86 + Math.sin(elapsed * 3.6) * 0.14;
    if (messageText) {
      messageText.style.transform = `scale(${1 + holdProgress * 0.72 * pulse})`;
    }
    awakening.whiteout = Math.max(awakening.whiteout, holdProgress * 0.9);
    if (whiteout) {
      whiteout.style.opacity = String(awakening.whiteout);
    }
  }

  if (current.gift && charsVisible >= current.text.length) {
    if (whiteout) {
      whiteout.style.opacity = "1";
    }
    if (glyphLayer) {
      glyphLayer.classList.add("active");
    }
    if (glyphText) {
      glyphText.textContent = awakening.glyphString;
    }
  }

  const totalDuration = current.text.length * current.typeSpeed + current.hold;
  if (awakening.messageElapsed < totalDuration) {
    return;
  }

  if (awakening.messageIndex === AWAKENING_MESSAGES.length - 1) {
    awakening.phase = "glyph";
    awakening.messageElapsed = 0;
    if (messageLayer) {
      messageLayer.classList.remove("active");
    }
    return;
  }

  startAwakeningMessage(awakening.messageIndex + 1);
}

function startAwakeningMessage(index) {
  const awakening = state.orbAwakening;
  awakening.messageIndex = index;
  awakening.messageElapsed = 0;
  awakening.messageCharIndex = 0;
  awakening.messageText = "";
  if (messageLayer) {
    messageLayer.classList.add("active");
  }
  if (messageText) {
    messageText.textContent = "";
    messageText.classList.remove("energy", "expand");
    messageText.style.transform = "";
  }
}

function renderAwakeningMessage(current) {
  if (!messageText) {
    return;
  }

  messageText.textContent = state.orbAwakening.messageText;
  messageText.classList.toggle("energy", Boolean(current.energy));
  if (current.energy && state.orbAwakening.messageCharIndex >= current.text.length) {
    messageText.classList.add("expand");
  } else {
    messageText.classList.remove("expand");
  }
}

function applyAwakeningOrbModifiers(modifiers) {
  const awakening = state.orbAwakening;
  if (!awakening.started) {
    return;
  }

  const rage = getAwakeningRage();
  const burst = awakening.burstTimer > 0 ? awakening.burstTimer / 0.95 : 0;
  modifiers.redness += rage;
  modifiers.brightness += rage * 0.22;
  modifiers.light += rage * 0.9 + burst * 0.4;
  modifiers.haloOpacity += rage * 0.22;
  modifiers.haloScale += rage * 0.2;
  modifiers.mistOpacity += rage * 0.4;
  modifiers.mistScale += rage * 0.36;
  modifiers.catchLight += rage * 0.45;

  const violentX = (steppedNoise(elapsed * 0.23, 28.0, 9.2) - 0.5) * rage * 0.5;
  const violentY = (steppedNoise(elapsed * 0.27, 34.0, 18.7) - 0.5) * rage * 0.38;
  modifiers.offsetX += violentX;
  modifiers.offsetY += violentY + burst * 0.25;
  modifiers.offsetZ += Math.sin(elapsed * (8 + rage * 14)) * 0.03 * rage;
  modifiers.scale += Math.sin(elapsed * (4 + rage * 6)) * 0.06 * rage + burst * 0.12;

  if (awakening.phase === "messages" || awakening.phase === "glyph") {
    modifiers.offsetY += Math.sin(elapsed * 5.5) * 0.04 * rage;
    modifiers.offsetX += Math.sin(elapsed * 7.2) * 0.02 * rage;
  }
}

function getAwakeningRage() {
  const awakening = state.orbAwakening;
  if (!awakening.started) {
    return 0;
  }

  if (awakening.phase === "anger") {
    return THREE.MathUtils.clamp(awakening.elapsed / ORB_ATTACK_STAGE_TIME, 0, 1);
  }

  if (awakening.phase === "messages") {
    const bonus = awakening.messageIndex >= 9 ? 0.35 : awakening.messageIndex >= 6 ? 0.2 : 0;
    return THREE.MathUtils.clamp(0.82 + bonus, 0, 1.2);
  }

  return 1.25;
}

function spawnAwakeningStreakBurst() {
  const awakening = state.orbAwakening;
  if (!omenCanvas || !omenContext || !orb) {
    return;
  }

  const origin = getOrbScreenPosition();
  if (!origin) {
    return;
  }

  if (!awakening.streaks) {
    awakening.streaks = [];
  }

  const rage = getAwakeningRage();
  const count = 3 + Math.floor(Math.random() * 4 + rage * 2);
  for (let i = 0; i < count; i += 1) {
    const targetX = omenCanvas.width * (0.25 + Math.random() * 0.5);
    const targetY = omenCanvas.height * (0.08 + Math.random() * 0.28);
    awakening.streaks.push({
      x1: origin.x,
      y1: origin.y,
      x2: targetX + (Math.random() - 0.5) * omenCanvas.width * 0.12,
      y2: targetY + (Math.random() - 0.5) * omenCanvas.height * 0.08,
      life: 0,
      maxLife: 0.18 + Math.random() * 0.32,
      width: 1 + Math.random() * 2 + rage * 2,
      alpha: 0.45 + Math.random() * 0.35,
    });
  }
}

function renderOmenCanvas(dt) {
  if (!omenCanvas || !omenContext) {
    return;
  }

  omenContext.clearRect(0, 0, omenCanvas.width, omenCanvas.height);
  const awakening = state.orbAwakening;
  if (!awakening.started || !awakening.streaks || awakening.streaks.length === 0) {
    return;
  }

  const remaining = [];
  for (const streak of awakening.streaks) {
    streak.life += dt;
    if (streak.life >= streak.maxLife) {
      continue;
    }

    const progress = streak.life / streak.maxLife;
    const alpha = (1 - progress) * streak.alpha;
    const gradient = omenContext.createLinearGradient(streak.x1, streak.y1, streak.x2, streak.y2);
    gradient.addColorStop(0, `rgba(255, 120, 120, ${alpha})`);
    gradient.addColorStop(0.4, `rgba(255, 40, 40, ${alpha * 0.9})`);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    omenContext.strokeStyle = gradient;
    omenContext.lineWidth = streak.width * getPixelRatio();
    omenContext.beginPath();
    omenContext.moveTo(streak.x1, streak.y1);
    omenContext.lineTo(streak.x2, streak.y2);
    omenContext.stroke();
    remaining.push(streak);
  }

  awakening.streaks = remaining;
}

function getOrbScreenPosition() {
  if (!orb || !camera || !omenCanvas) {
    return null;
  }

  tempVecC.copy(orb.position);
  tempVecC.project(camera);

  return {
    x: (tempVecC.x * 0.5 + 0.5) * omenCanvas.width,
    y: (-tempVecC.y * 0.5 + 0.5) * omenCanvas.height,
  };
}

function buildGlyphGift() {
  const glyphs = [];
  const alphabet = "ABEKLMNOPRSTUVWXYZ0123456789+-=:";
  for (let row = 0; row < 7; row += 1) {
    let line = "";
    const columns = 24 + Math.floor(Math.random() * 8);
    for (let col = 0; col < columns; col += 1) {
      const index = Math.floor(Math.random() * alphabet.length);
      line += alphabet[index];
      if (col < columns - 1) {
        line += " ";
      }
    }
    glyphs.push(line);
  }
  return glyphs.join("\n");
}

function createHumanoidSilhouetteTexture() {
  const width = 512;
  const height = 1024;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = width;
  textureCanvas.height = height;
  const context = textureCanvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas 2D context is unavailable.");
  }

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#ffffff";
  context.lineCap = "round";
  context.lineJoin = "round";

  context.beginPath();
  context.ellipse(268, 165, 68, 92, -0.06, 0, Math.PI * 2);
  context.fill();

  context.beginPath();
  context.moveTo(216, 254);
  context.bezierCurveTo(206, 322, 206, 404, 214, 480);
  context.bezierCurveTo(220, 570, 220, 666, 214, 752);
  context.bezierCurveTo(210, 804, 188, 888, 180, 968);
  context.lineTo(226, 968);
  context.bezierCurveTo(236, 896, 252, 820, 258, 760);
  context.bezierCurveTo(266, 668, 266, 566, 260, 476);
  context.bezierCurveTo(254, 390, 252, 320, 256, 254);
  context.closePath();
  context.fill();

  context.beginPath();
  context.moveTo(258, 254);
  context.bezierCurveTo(266, 322, 272, 400, 274, 476);
  context.bezierCurveTo(278, 566, 280, 670, 278, 762);
  context.bezierCurveTo(276, 816, 292, 890, 314, 968);
  context.lineTo(360, 968);
  context.bezierCurveTo(332, 890, 320, 808, 320, 750);
  context.bezierCurveTo(320, 654, 320, 554, 312, 458);
  context.bezierCurveTo(304, 372, 294, 304, 286, 248);
  context.closePath();
  context.fill();

  context.beginPath();
  context.moveTo(194, 266);
  context.bezierCurveTo(156, 296, 140, 356, 144, 426);
  context.bezierCurveTo(150, 522, 168, 632, 182, 714);
  context.lineTo(216, 710);
  context.bezierCurveTo(210, 632, 202, 530, 202, 444);
  context.bezierCurveTo(202, 362, 216, 302, 242, 270);
  context.closePath();
  context.fill();

  context.beginPath();
  context.moveTo(285, 244);
  context.bezierCurveTo(332, 286, 350, 352, 352, 432);
  context.bezierCurveTo(354, 520, 350, 634, 336, 714);
  context.lineTo(292, 714);
  context.bezierCurveTo(306, 634, 308, 532, 304, 446);
  context.bezierCurveTo(300, 360, 282, 300, 250, 260);
  context.closePath();
  context.fill();

  context.lineWidth = 54;
  context.beginPath();
  context.moveTo(184, 332);
  context.quadraticCurveTo(146, 446, 142, 606);
  context.stroke();

  context.lineWidth = 46;
  context.beginPath();
  context.moveTo(324, 348);
  context.quadraticCurveTo(350, 470, 338, 644);
  context.stroke();

  context.lineWidth = 34;
  context.beginPath();
  context.moveTo(232, 238);
  context.lineTo(282, 238);
  context.stroke();

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
