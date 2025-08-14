// Assumes THREE is loaded globally from CDN
// Provide a local alias so any accidental bare `THREE` references won't crash.
var THREE = (typeof window !== 'undefined') ? window.THREE : undefined;
if (typeof THREE === 'undefined') {
  console.error('THREE not found on window. Ensure the CDN script loads before ParticleSystem.js');
}



async function loadShader(path) {
  return fetch(path).then(r => r.text());
}

window.ParticleSystem = class ParticleSystem {
  constructor(canvas, count) {
    this.canvas = canvas;
    this.count = count;
    this.ready = false;
    this.initThree();
    this.loadShadersAndInitParticles();
    this.animate();
  }

  async loadShadersAndInitParticles() {
    const [vertexShader, fragmentShader] = await Promise.all([
      loadShader('src/shaders/particle.vert'),
      loadShader('src/shaders/particle.frag')
    ]);
    this.vertexShader = vertexShader;
    this.fragmentShader = fragmentShader;
    this.ready = true;
    this.initParticles();
  }

  initThree() {
    console.log('Initializing Three.js...');
    this.renderer = new window.THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  this.renderer.setClearColor(0x000000, 1); // darker background
    this.scene = new window.THREE.Scene();
    this.camera = new window.THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 0, 60);
    this.camera.lookAt(0, 0, 0);
    this.light = new window.THREE.PointLight(0xffffff, 1.5, 1000);
    this.light.position.set(50, 50, 50);
    this.scene.add(this.light);
    this.scene.add(new window.THREE.AmbientLight(0xffffff, 0.4));
  // Axes helper (hidden by default, toggle with 'G')
  this.axes = new window.THREE.AxesHelper(50);
  this.axes.visible = false;
  this.scene.add(this.axes);
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Interaction helpers
    this.raycaster = new window.THREE.Raycaster();
    this.ndc = new window.THREE.Vector2();
    this.pointerPos = new window.THREE.Vector3();
    this.pointerLastMove = 0;
    this.pointerRadius = 6;
    this.pointerDecayMs = 350; // decay back to normal

    this.maxBullets = 3;
    this.bullets = Array.from({ length: this.maxBullets }, () => ({
      start: new window.THREE.Vector3(0,0,0),
      dir: new window.THREE.Vector3(0,0,-1),
      spawn: -1
    }));
    this.bulletSpeed = 120; // units per second
    this.bulletRadius = 7;
    this.bulletFade = 1.1; // seconds

    // Heart-shaped piercers
    this.maxHearts = 2;
    this.hearts = Array.from({ length: this.maxHearts }, () => ({
      start: new window.THREE.Vector3(0,0,0),
      dir: new window.THREE.Vector3(0,0,-1),
      spawn: -1
    }));
    this.heartSpeed = 110;
    this.heartScale = 11; // larger than bullet radius
    this.heartFade = 1.3;

  this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
  this.canvas.addEventListener('click', (e) => this.onClick(e));
  // middle-click for heart effect (auxclick for compatibility)
  this.canvas.addEventListener('auxclick', (e) => this.onAuxClick(e));
  this.canvas.addEventListener('mousedown', (e) => { if (e.button === 1) this.onAuxClick(e); });

    // Long-press to reveal dancers
    this.leftDownSince = -1;
    this.danceActive = false;
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.leftDownSince = performance.now();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.leftDownSince = -1;
        this.danceActive = false;
  // keep wasDanceHold until next click to suppress it
        if (this.points) {
          const m = this.points.material;
          m.uniforms.uDanceActive.value = 0.0;
          if (m.blending !== window.THREE.AdditiveBlending) {
            m.blending = window.THREE.AdditiveBlending;
            m.needsUpdate = true;
          }
        }
      }
    });

    // Performance HUD
    this._frames = 0;
    this._lastFpsTs = performance.now();
    this._lastFrameTs = performance.now();
    this._emaDt = 16.7;
    this.fpsEl = document.getElementById('fps');
    this.gpuEl = document.getElementById('gpu');
    this.memEl = document.getElementById('mem');
  // optional: show audio levels in MEM label suffix
  this._audioLevelText = '';

    // GPU timer query (best-effort)
    this.gpuExt = null;
    this.gpuIsWebGL2 = false;
    try {
      const gl = this.renderer.getContext();
      if (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) {
        const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        if (ext) { this.gpuExt = ext; this.gpuIsWebGL2 = true; }
      } else {
        const ext = gl.getExtension('EXT_disjoint_timer_query');
        if (ext) { this.gpuExt = ext; this.gpuIsWebGL2 = false; }
      }
    } catch {}
    this._gpuActiveQuery = null;
    this._gpuLastMs = null;

  // Audio/Visualizer
  this.audioCtx = null;
  this.audio = null;
  this.analyser = null;
  this.freqData = null;
  this.audioStarted = false;
  this.audioEnded = false;
  this.usingBuffer = false;
  this.bufferSource = null;
  this.bufferStartAt = 0;
  this.bufferDuration = 0;
  this.audioBands = { bass:[20,140], mid:[140,2000], treb:[2000,8000] };
  this.bandIdx = null; // computed after audio context known
  this.trackDuration = 459; // seconds (7:39) fallback
  this.collapseDur = 15; // seconds
  // Auto particle growth config
  this.maxParticles = 150000;
  this._autoGrowEnabled = true;
  this._lastGrowCheck = performance.now();
  this._growCount = this.count || 2;
  // start audio on first interaction
    this.installAudioGestureListeners();
    // visible fallback button
    this.audioBtn = document.createElement('button');
    this.audioBtn.textContent = 'Load music';
    Object.assign(this.audioBtn.style, {
      position: 'fixed', right: '14px', bottom: '12px', zIndex: 10000,
      padding: '8px 12px', background: '#0b5', color: '#fff', border: 'none',
      borderRadius: '6px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      display: 'none'
    });
    this.audioBtn.addEventListener('click', () => this.ensureAudio());
    document.body.appendChild(this.audioBtn);

    // HUD toggle (H) and axes toggle (G)
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'g') {
        if (this.axes) this.axes.visible = !this.axes.visible;
      } else if (e.key.toLowerCase() === 'h') {
        const hud = document.getElementById('hud');
        if (hud) hud.style.display = (hud.style.display === 'none') ? 'block' : 'none';
      } else if (e.key.toLowerCase() === 'm') {
        // toggle music mute
        if (this._gainOut) {
          this._gainOut.gain.value = this._gainOut.gain.value > 0 ? 0.0 : 1.0;
        }
      } else if (e.key.toLowerCase() === 'b') {
        // quick test beep to verify output routing
        try {
          if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
          const osc = this.audioCtx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = 440;
          const g = this.audioCtx.createGain();
          g.gain.value = 0.05;
          osc.connect(g); g.connect(this.audioCtx.destination);
          osc.start();
          setTimeout(() => { try { osc.stop(); } catch {} }, 350);
        } catch {}
      }
    });

  // Always try to resume the AudioContext on any user gesture
  const resumeCtx = () => { try { if (this.audioCtx && this.audioCtx.state !== 'running') this.audioCtx.resume(); } catch {} };
  window.addEventListener('pointerdown', resumeCtx);
  window.addEventListener('click', resumeCtx);
  window.addEventListener('keydown', resumeCtx);

    // Right-drag drawing state
  this.maxDraw = 64;
  this.drawRadius = 9.0; // thicker default draw stroke
  this.drawScatter = 2.5; // sideways jitter amount
    this.drawCount = 0;
    this.isRightDown = false;
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) {
        this.isRightDown = true;
        if (this.points) {
          const m = this.points.material;
          this.drawCount = 0;
          m.uniforms.uDrawCount.value = 0;
          m.uniforms.uDrawHold.value = 1.0; // enable blue palette while drawing
          m.uniforms.uDrawRadius.value = this.drawRadius;
        }
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) {
        this.isRightDown = false;
        if (this.points) {
          const m = this.points.material;
          m.uniforms.uDrawHold.value = 0.0; // revert to normal palette after release
          m.uniforms.uDrawFadeStart.value = performance.now() * 0.001;
        }
      }
    });
  }

  initParticles() {
    if (!this.ready) return;
    // Clean up previous (only if we truly need to rebuild; normally we build once)
    if (this.points) {
      this.scene.remove(this.points);
      try { this.points.geometry.dispose(); } catch {}
      try { this.points.material.dispose(); } catch {}
      this.points = null;
    }

    const radius = 40;
    this.sphereRadius = radius;
    const capacity = Math.max(this.maxParticles || 0, this.count || 0);
    const geometry = new window.THREE.BufferGeometry();
    const positions = new Float32Array(capacity * 3);
    const colors = new Float32Array(capacity * 3);
    const seeds = new Float32Array(capacity);

    const colorA = new window.THREE.Color('#6dd5ed'); // cyan
    const colorB = new window.THREE.Color('#cc2b5e'); // magenta/red
    const tmp = new window.THREE.Color();

  for (let i = 0; i < capacity; i++) {
      // Random point uniformly inside sphere
      const u = Math.random();
      const v = Math.random();
      const theta = 2.0 * Math.PI * u;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = radius * Math.cbrt(Math.random());
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      const p3 = i * 3;
      positions[p3] = x;
      positions[p3 + 1] = y;
      positions[p3 + 2] = z;
      const t = (r / radius);
      tmp.copy(colorA).lerp(colorB, t);
      colors[p3] = tmp.r;
      colors[p3 + 1] = tmp.g;
      colors[p3 + 2] = tmp.b;
      seeds[i] = Math.random() * 1000.0;
    }
  geometry.setAttribute('position', new window.THREE.BufferAttribute(positions, 3));
  // use custom color attribute name to avoid three.js injected color varyings
  geometry.setAttribute('aColor', new window.THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSeed', new window.THREE.BufferAttribute(seeds, 1));
  // Only draw the current active count; we reveal more via drawRange without reallocating
  geometry.setDrawRange(0, Math.max(1, this.count || 1));

  const material = new window.THREE.ShaderMaterial({
      vertexShader: this.vertexShader,
      fragmentShader: this.fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: window.THREE.AdditiveBlending,
      vertexColors: false,
      uniforms: {
        uTime: { value: 0 },
    uSize: { value: 3.0 },
        uRadius: { value: radius },
        uLightPos: { value: this.light.position },
  // audio visualizer
  uAudioActive: { value: 0.0 },
  uAudioBass: { value: 0.0 },
  uAudioMid: { value: 0.0 },
  uAudioTreble: { value: 0.0 },
  // music pulses
  uPulse: { value: 0.0 },
  uBeatPulse: { value: 0.0 },
  // solar flare arrays (6 slots)
  uFlareDir: { value: Array.from({length: 6}, () => new window.THREE.Vector3(1,0,0)) },
  uFlareSpawn: { value: new Float32Array(6).fill(-1) },
  uFlareCone: { value: new Float32Array(6).fill(0.9) }, // ~25deg
  uFlarePower: { value: new Float32Array(6).fill(12) },
  uFlareDur: { value: new Float32Array(6).fill(0.9) },
  // pink edge spouts (8 slots)
  uSpoutDir: { value: Array.from({length: 8}, () => new window.THREE.Vector3(0,1,0)) },
  uSpoutSpawn: { value: new Float32Array(8).fill(-1) },
  uSpoutCone: { value: new Float32Array(8).fill(0.94) }, // ~20deg
  uSpoutPower: { value: new Float32Array(8).fill(0.25) }, // angular + lift scaling
  uSpoutDur: { value: new Float32Array(8).fill(1.35) },
  // tornado spin
  uTornadoStart: { value: -1.0 },
  uTornadoDur: { value: 1.2 },
  uTornadoAxis: { value: new window.THREE.Vector3(0,1,0) },
  uTornadoSpeed: { value: 40.0 },
  uTornadoInner: { value: 0.45 },
  // star formation event
  uStarStart: { value: -1.0 },
  uStarHold: { value: 12.0 },
  uStarExplode: { value: 2.2 },
  uStarPoints: { value: 5 },
  uStarRadius: { value: 28.0 },
  uStarInner: { value: 0.42 },
  uStarStrength: { value: 1.0 },
  uStarCenter: { value: new window.THREE.Vector3(0, 0, 0) },
  uStarSpin: { value: 0.0 },
  // cat formation event
  uCatStart: { value: -1.0 },
  uCatDur: { value: 5.0 },
  uCatCenter: { value: new window.THREE.Vector3(0, 0, 0) },
  uCatScale: { value: 22.0 },
  uCatStrength: { value: 1.0 },
  uCatPlane: { value: 1.2 },
  // blue-face event (emoji-like faces)
  uFaceStart: { value: -1.0 },
  uFaceDur: { value: 3.5 },
  uFaceStyle: { value: 0 }, // 0..11
  uFaceCenter: { value: new window.THREE.Vector3(0, -5, 0) },
  uFaceScale: { value: 22.0 }, // world units half-width of face area
  uFaceStrength: { value: 1.0 },
  // collapse near end of track
  uCollapsePhase: { value: 0.0 },
  uCollapseCenter: { value: new window.THREE.Vector3(0,0,0) },
        // pointer scatter
        uPointer: { value: new window.THREE.Vector3() },
        uPointerStrength: { value: 0 },
        uPointerRadius: { value: this.pointerRadius },
        // bullets
        uBulletStart: { value: Array.from({length: this.maxBullets}, () => new window.THREE.Vector3()) },
        uBulletDir: { value: Array.from({length: this.maxBullets}, () => new window.THREE.Vector3(0,0,-1)) },
        uBulletSpawn: { value: new Float32Array(this.maxBullets).fill(-1) },
        uBulletSpeed: { value: this.bulletSpeed },
        uBulletRadius: { value: this.bulletRadius },
  uBulletFade: { value: this.bulletFade },
  // hearts
  uHeartStart: { value: Array.from({length: this.maxHearts}, () => new window.THREE.Vector3()) },
  uHeartDir: { value: Array.from({length: this.maxHearts}, () => new window.THREE.Vector3(0,0,-1)) },
  uHeartSpawn: { value: new Float32Array(this.maxHearts).fill(-1) },
  uHeartSpeed: { value: this.heartSpeed },
  uHeartScale: { value: this.heartScale },
  uHeartFade: { value: this.heartFade },
  // dance silhouettes
  uDanceActive: { value: 0.0 },
  uDanceClock: { value: 0.0 },
  uDanceScale: { value: 22.0 },
  uDanceWidth: { value: 2.2 },
  uDanceOutline: { value: 1.25 },
  uDanceIntensity: { value: 1.15 },
  uDancePlane: { value: 1.2 },
  uDanceFill: { value: 0.9 },
  uDanceSizeBoost: { value: 1.8 }
    ,
  // drawing stroke uniforms
  uDrawPts: { value: Array.from({length: this.maxDraw}, () => new window.THREE.Vector3()) },
  uDrawCount: { value: 0 },
  uDrawRadius: { value: this.drawRadius },
  uDrawHold: { value: 0.0 },
  uDrawFadeStart: { value: 0.0 },
  uDrawFadeDur: { value: 1.2 },
  uDrawScatter: { value: this.drawScatter }
      }
    });

  this.points = new window.THREE.Points(geometry, material);
    this.scene.add(this.points);
  this.updatePointSize();
  console.log('Particles capacity:', capacity, 'visible:', this.count);
  }

  setParticleCount(count) {
  // Smooth grow: adjust drawRange without rebuilding buffers
  if (!this.points) { this.count = count; return; }
  const cap = this.points.geometry.getAttribute('position').count;
  const next = Math.max(1, Math.min(count, cap));
  this.count = next;
  this.points.geometry.setDrawRange(0, next);
  this.updatePointSize();
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    if (this.points) {
      const nowSec = performance.now() * 0.001;
      const m = this.points.material;
      m.uniforms.uTime.value = nowSec;
      m.uniforms.uDanceClock.value = nowSec - Math.floor(nowSec / 600.0) * 600.0; // 10-min loop basis
      // Audio analyser update
  if (this.audioStarted && this.analyser) {
        this.analyser.getByteFrequencyData(this.freqData);
        // compute simple bands
        const getBand = (low, high) => {
          const nyq = this.audioCtx.sampleRate * 0.5;
          const n = this.analyser.frequencyBinCount;
          const lowI = Math.max(0, Math.floor(low / nyq * n));
          const highI = Math.min(n-1, Math.ceil(high / nyq * n));
          let sum = 0, cnt = 0;
          for (let i = lowI; i <= highI; i++) { sum += this.freqData[i]; cnt++; }
          return cnt > 0 ? sum / (cnt * 255) : 0;
        };
        const bass = getBand(this.audioBands.bass[0], this.audioBands.bass[1]);
        const mid = getBand(this.audioBands.mid[0], this.audioBands.mid[1]);
        const treb = getBand(this.audioBands.treb[0], this.audioBands.treb[1]);
        // apply a visible boost to the bands
        m.uniforms.uAudioBass.value = Math.min(1.0, bass * 1.6);
        m.uniforms.uAudioMid.value = Math.min(1.0, mid * 1.4);
        m.uniforms.uAudioTreble.value = Math.min(1.0, treb * 1.2);
        m.uniforms.uAudioActive.value = 1.0;

        // compute a pulse value from bass energy and overall amplitude
        const overall = (bass*0.6 + mid*0.3 + treb*0.1);
        // exponential moving average for beat detection
        this._emaOverall = this._emaOverall == null ? overall : (this._emaOverall*0.85 + overall*0.15);
        const dev = Math.max(0, overall - this._emaOverall);
        // pulse: smooth sinusoid driven by bass plus deviation burst
        this._pulsePhase = (this._pulsePhase || 0) + (0.8 + bass*2.5) * (nowSec - (this._lastPulseTs||nowSec));
        this._lastPulseTs = nowSec;
        const slowPulse = Math.sin(this._pulsePhase) * (0.04 + bass*0.06);
        const burst = Math.min(0.25, dev * 0.8);
        const pulse = slowPulse + burst;
        m.uniforms.uPulse.value = pulse; // shader clamps range

        // beat detection: short spike when bass crosses a dynamic threshold
        const thr = (this._emaBassThr = this._emaBassThr==null ? bass : this._emaBassThr*0.9 + bass*0.1) * 1.25 + 0.04;
        const isBeat = bass > thr && overall > (this._emaOverall*1.05 + 0.02);
        const targetBeat = isBeat ? 1.0 : 0.0;
        this._beatLevel = this._beatLevel == null ? 0 : (this._beatLevel*0.85 + targetBeat*0.6);
        m.uniforms.uBeatPulse.value = this._beatLevel;

        // on rising edge of beat, spawn a random cylinder (bullet)
        const rising = isBeat && !this._prevBeat;
        this._prevBeat = isBeat;
        if (rising) {
          this.spawnRandomBullet();
          // Spawn a solar flare after halfway through the song, but stop
          // near the collapse window.
          const trackLen = Math.max(1, this.trackDuration || 1);
          const safeEnd = Math.max(0, trackLen - this.collapseDur);
          const tAudio2 = this.usingBuffer ? (this.audioCtx ? (this.audioCtx.currentTime - this.bufferStartAt) : 0) : (this.audio ? this.audio.currentTime : 0);
          const prog2 = safeEnd > 0 ? (tAudio2 / safeEnd) : 0;
          if (prog2 > 0.5 && prog2 < 0.98) {
            const strength = 8 + Math.random()*10; // world units outward at peak
            const halfAngle = (15 + Math.random()*22) * Math.PI/180; // 15-37 deg
            this.spawnFlare(strength, Math.cos(halfAngle), 0.7 + Math.random()*0.6);
          }
        }
        // track overall amplitude and auto-fallback if silent
        let sum = 0; for (let i = 0; i < this.freqData.length; i++) sum += this.freqData[i];
        const amp = (sum / (this.freqData.length * 255));
        if (this._audioLevelTextTick == null || nowSec - this._audioLevelTextTick > 0.25) {
          this._audioLevelText = ` A:${amp.toFixed(2)} B:${bass.toFixed(2)} M:${mid.toFixed(2)} T:${treb.toFixed(2)}`;
          this._audioLevelTextTick = nowSec;
        }
        if (!this.usingBuffer) {
          if (amp < 0.01) { this._silentCount = (this._silentCount || 0) + 1; } else { this._silentCount = 0; }
          if ((this._silentCount || 0) > 60 && !this._bufferTried) {
            this._bufferTried = true;
            try { if (this.audio) this.audio.pause(); } catch {}
            this.tryPlayViaBuffer();
          }
        }
        // Collapse phase near end of track
  if (!this.usingBuffer && this.audio && this.audio.duration) this.trackDuration = this.audio.duration;
  const tAudio = this.usingBuffer ? (this.audioCtx.currentTime - this.bufferStartAt) : (this.audio ? this.audio.currentTime : 0);
        const startCollapse = Math.max(0, this.trackDuration - this.collapseDur);
        let phase = 0;
        if (tAudio >= startCollapse) {
          phase = Math.min(1, (tAudio - startCollapse) / this.collapseDur);
        }
        m.uniforms.uCollapsePhase.value = phase;

        // After collapse completes, schedule final message once after ~4.5s
        if (phase >= 0.999) {
          if (!this._finalMsgScheduled && !this._finalMsgTimer) {
            this._finalMsgTimer = setTimeout(() => {
              try { if (window.startFinalMessage) window.startFinalMessage(); } catch {}
              this._finalMsgScheduled = true;
              this._finalMsgTimer = null;
            }, 4500);
          }
        } else {
          // If collapse isn't complete, ensure no premature scheduling
          if (this._finalMsgTimer) { clearTimeout(this._finalMsgTimer); this._finalMsgTimer = null; }
        }
      } else {
        m.uniforms.uAudioActive.value = 0.0;
  m.uniforms.uPulse.value = 0.0;
  m.uniforms.uBeatPulse.value = 0.0;
        m.uniforms.uCollapsePhase.value = 0.0;
      }

  // Tornado scheduler: no chance to start until after 4:00, then random 15–30s intervals, lasts 1–2s
      const tAudioNow = this.usingBuffer
        ? (this.audioCtx ? (this.audioCtx.currentTime - this.bufferStartAt) : 0)
        : (this.audio ? this.audio.currentTime : 0);
      const allowTornado = tAudioNow >= 240; // 4 minutes gate
      if (!allowTornado) {
        // Defer scheduling until after the gate opens to avoid immediate trigger
        this._nextTornadoAt = null;
      } else {
        if (!this._nextTornadoAt) {
          this._nextTornadoAt = performance.now() + (15000 + Math.random()*15000);
        } else if (performance.now() >= this._nextTornadoAt) {
          // start a spin
          const dur = 1000 + Math.random()*1000;
          m.uniforms.uTornadoDur.value = dur / 1000;
          m.uniforms.uTornadoStart.value = nowSec;
          // random slight tilt of axis
          const ax = new window.THREE.Vector3(0,1,0)
            .applyAxisAngle(new window.THREE.Vector3(1,0,0), (Math.random()-0.5)*0.4)
            .applyAxisAngle(new window.THREE.Vector3(0,0,1), (Math.random()-0.5)*0.4)
            .normalize();
          m.uniforms.uTornadoAxis.value.copy(ax);
          // speed tuned to be visually “super fast” but brief
          m.uniforms.uTornadoSpeed.value = 45 + Math.random()*20;
          // inner radius influence (normalized)
          m.uniforms.uTornadoInner.value = 0.35 + Math.random()*0.15;
          // schedule next
          this._nextTornadoAt = performance.now() + (15000 + Math.random()*15000);
        }
      }

      // Blue-face event scheduler: after 2:00, random checks with 25–35% chance, 3–4s duration
      if (this.points) {
        const mFaces = this.points.material;
        const startCollapse = Math.max(0, this.trackDuration - this.collapseDur);
        const beforeCollapse = tAudioNow < (startCollapse - 2.0);
        if (tAudioNow >= 120 && beforeCollapse) {
          if (!this._nextFaceCheckAt) {
            this._nextFaceCheckAt = performance.now() + (15000 + Math.random()*15000); // 15–30s
          } else if (performance.now() >= this._nextFaceCheckAt) {
            this._nextFaceCheckAt = performance.now() + (20000 + Math.random()*18000); // 20–38s
            const u = mFaces.uniforms;
            const active = (u.uFaceStart.value >= 0) && ((nowSec - u.uFaceStart.value) < u.uFaceDur.value);
            if (!active) {
              const chance = 0.25 + Math.random()*0.10; // 25–35%
              if (Math.random() < chance) {
                // trigger event
                u.uFaceStart.value = nowSec;
                u.uFaceDur.value = 3.0 + Math.random()*1.0; // 3–4s
                u.uFaceStyle.value = Math.floor(Math.random()*12); // 0..11
                const yOff = -4 + Math.random()*2.0; // just below center
                u.uFaceCenter.value.set(0, yOff, 0);
                u.uFaceScale.value = 18.0 + Math.random()*8.0;
                u.uFaceStrength.value = 1.0;
              }
            }
          }
        } else {
          // outside window, reset check timer to avoid a burst right at boundary
          this._nextFaceCheckAt = null;
        }
      }

      // One-time star formation: random once between 4:00 and 7:00
      if (!this._starDone) {
        const t = tAudioNow;
        if (!this._starScheduled && t >= 240 && t <= 420) {
          // choose a random trigger time within [240, 420]
          const target = 240 + Math.random() * (420 - 240);
          this._starAt = target;
          this._starScheduled = true;
        }
        if (this._starScheduled && !this._starStarted && t >= (this._starAt || 1e9)) {
          const u = this.points.material.uniforms;
          u.uStarStart.value = nowSec;
          u.uStarHold.value = 10.0 + Math.random()*5.0; // 10–15s
          u.uStarExplode.value = 2.0 + Math.random()*1.0; // 2–3s
          u.uStarPoints.value = 5; // classic star
          // size relative to sphere radius but slightly inside
          const R = this.sphereRadius || 40;
          u.uStarRadius.value = R * 0.62;
          u.uStarInner.value = 0.35 + Math.random()*0.2;
          u.uStarStrength.value = 1.0;
          u.uStarCenter.value.set(0, 0, 0);
          // Initialize spin state
          u.uStarSpin.value = 0.0;
          this._starSpinBurstAt = performance.now() + 300 + Math.random()*500; // first burst soon
          this._starSpinVel = 0.0; // radians per second
          this._starStarted = true;
          // mark done after total duration
          const totalMs = (u.uStarHold.value + u.uStarExplode.value) * 1000;
          setTimeout(() => { this._starDone = true; }, totalMs + 200);
        }
        // If we pass the window without triggering, mark done to prevent later fire
        if (t > 420 && !this._starStarted) this._starDone = true;
      }

      // One-time cat formation: trigger once between 2:00 and 3:00
      if (!this._catDone) {
        const t = tAudioNow;
        if (!this._catScheduled && t >= 120 && t <= 180) {
          // choose a random trigger within [120, 180]
          this._catAt = 120 + Math.random() * (180 - 120);
          this._catScheduled = true;
        }
        if (this._catScheduled && !this._catStarted && t >= (this._catAt || 1e9)) {
          const u = this.points.material.uniforms;
          // duration 6–10s for visibility
          u.uCatDur.value = 6.0 + Math.random()*4.0;
          u.uCatStart.value = nowSec;
          // scale relative to sphere radius
          const R = this.sphereRadius || 40;
          u.uCatScale.value = R * 0.65; // roughly fill area
          u.uCatCenter.value.set(0, 0, 0);
          u.uCatStrength.value = 1.0;
          u.uCatPlane.value = 1.2;
          this._catStarted = true;
          // mark done after duration
          setTimeout(() => { this._catDone = true; }, u.uCatDur.value * 1000 + 200);
        }
        // If we pass the window without triggering, mark done to prevent later fire
        if (t > 180 && !this._catStarted) this._catDone = true;
      }

      // Pink spout scheduler: after 3:00 gate, higher spawn rate than inner tornado.
      // Multiple concurrent spouts allowed; each lasts ~0.9–1.6s with modest power.
      if (this.points) {
        const u = this.points.material.uniforms;
        const tNow = tAudioNow;
        if (tNow >= 180) { // 3 minutes
          // initialize next check timer if needed
          if (!this._nextSpoutAt) this._nextSpoutAt = performance.now() + (2000 + Math.random()*2500); // 2–4.5s
          // run small bursts more often after 4:00
          const freqScale = tNow >= 240 ? 0.6 : 1.0;
          if (performance.now() >= this._nextSpoutAt) {
            // try spawning 1–3 spouts this tick
            const count = 1 + Math.floor(Math.random()*3);
            for (let k = 0; k < count; k++) {
              this.spawnPinkSpout();
            }
            this._nextSpoutAt = performance.now() + (1200 + Math.random()*2000) * freqScale;
          }
        } else {
          this._nextSpoutAt = null;
        }
      }

      // Auto-scale particle count over the track, accelerating after halfway and
      // reaching maxParticles shortly before collapse starts.
      if (this._autoGrowEnabled) {
        const now = performance.now();
        if (now - this._lastGrowCheck > 250) { // adjust every 250ms
          this._lastGrowCheck = now;
          // Determine song progress (0..1), avoiding the collapse tail
          const trackLen = Math.max(1, this.trackDuration || 1);
          const tAudio = this.usingBuffer ? (this.audioCtx ? (this.audioCtx.currentTime - this.bufferStartAt) : 0) : (this.audio ? this.audio.currentTime : 0);
          const safeEnd = Math.max(0, trackLen - this.collapseDur);
          const prog = Math.max(0, Math.min(1, safeEnd > 0 ? (tAudio / safeEnd) : 0));
          // Map progress to growth curve: slow start, then speeds up after halfway
          // Use an ease-in curve; after halfway, square it more aggressively
          const pre = Math.pow(Math.min(0.5, prog) / 0.5, 1.2) * 0.5; // 0..0.5 region
          const post = prog > 0.5 ? 0.5 + Math.pow((prog - 0.5) / 0.5, 2.0) * 0.5 : 0.0; // 0.5..1
          const growth = prog <= 0.5 ? pre : post; // 0..1
          const target = Math.min(this.maxParticles, Math.floor(2 + growth * (this.maxParticles - 2)));
          // Smaller increments early; larger later. We'll reveal over multiple frames for smoothness.
          let step = prog < 0.5 ? 30 : 600;
          // gently scale step by current FPS to avoid jank
          const fpsEstimate = 1000 / Math.max(1, this._emaDt || 16.7);
          if (fpsEstimate < 40) step = Math.max(25, Math.floor(step * 0.6));
          if (fpsEstimate < 25) step = Math.max(10, Math.floor(step * 0.5));
          if (this.count < target) {
            // micro-smooth: reveal a fraction of 'step' every frame via a small per-frame budget
            const perFrame = Math.max(1, Math.floor(step * 0.15));
            const next = Math.min(target, this.count + perFrame);
            this.setParticleCount(next);
            const pc = document.getElementById('particleCount');
            if (pc) pc.textContent = String(next);
          }
          // Stop growth once target reached near the end
          if (this.count >= this.maxParticles || prog >= 0.999) {
            this._autoGrowEnabled = false;
          }
        }
      }
      // decay pointer strength over time
  const pDt = performance.now() - this.pointerLastMove;
  const pointerStrength = Math.max(0, 1 - pDt / this.pointerDecayMs);
      m.uniforms.uPointerStrength.value = pointerStrength;

      // Star spin bursts: while star is active (during hold), apply quick random spins
      if (m.uniforms.uStarStart.value >= 0) {
        const ageS = nowSec - m.uniforms.uStarStart.value;
        const totalS = m.uniforms.uStarHold.value + m.uniforms.uStarExplode.value;
        const inHold = ageS >= 0 && ageS <= m.uniforms.uStarHold.value;
        if (inHold) {
          // schedule random bursts a few times per second
          if (!this._starSpinBurstAt) this._starSpinBurstAt = performance.now() + 250 + Math.random()*500;
          if (performance.now() >= this._starSpinBurstAt) {
            // new burst: high angular velocity for a short time
            const dir = Math.random() < 0.5 ? -1 : 1;
            const speed = (8 + Math.random()*22) * dir; // rad/s
            this._starSpinVel = speed;
            // burst duration 100–250 ms
            this._starSpinEndAt = performance.now() + (100 + Math.random()*150);
            // next burst time
            this._starSpinBurstAt = performance.now() + (160 + Math.random()*320);
          }
          // decay current burst when time elapsed
          if (this._starSpinEndAt && performance.now() > this._starSpinEndAt) {
            this._starSpinVel = 0.0;
            this._starSpinEndAt = null;
          }
          // integrate spin angle
          m.uniforms.uStarSpin.value += this._starSpinVel * (this._emaDt/1000);
        } else {
          // outside hold: stop spin and slowly reset angle so the explode phase isn’t spinning
          this._starSpinVel = 0.0;
          // gentle ease back towards 0
          m.uniforms.uStarSpin.value *= 0.92;
          if (ageS < 0 || ageS > totalS) {
            // fully reset state once event is over
            m.uniforms.uStarSpin.value = 0.0;
            this._starSpinBurstAt = null;
            this._starSpinEndAt = null;
          }
        }
      } else {
        // no star event active
        this._starSpinVel = 0.0;
        this._starSpinBurstAt = null;
        this._starSpinEndAt = null;
      }
      // GPU timer query begin
      const gl = this.renderer.getContext();
      if (this.gpuExt && !this._gpuActiveQuery) {
        try {
          if (this.gpuIsWebGL2) {
            this._gpuActiveQuery = gl.createQuery();
            gl.beginQuery(this.gpuExt.TIME_ELAPSED_EXT, this._gpuActiveQuery);
          } else {
            this._gpuActiveQuery = this.gpuExt.createQueryEXT();
            this.gpuExt.beginQueryEXT(this.gpuExt.TIME_ELAPSED_EXT, this._gpuActiveQuery);
          }
        } catch {}
      }

      // update bullet spawns uniform array (already stored); nothing per-frame needed besides time uniform
      this.points.rotation.y += 0.0006; // slowed by an additional ~20%

    this.renderer.render(this.scene, this.camera);

    // End GPU timer query and fetch previous result
    if (this._gpuActiveQuery && this.gpuExt) {
      try {
        const gl = this.renderer.getContext();
        if (this.gpuIsWebGL2) {
          gl.endQuery(this.gpuExt.TIME_ELAPSED_EXT);
          // read result next frame
          const q = this._gpuActiveQuery;
          this._gpuActiveQuery = null;
          const check = () => {
            const available = gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE);
            const disjoint = gl.getParameter(this.gpuExt.GPU_DISJOINT_EXT);
            if (available && !disjoint) {
              const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
              this._gpuLastMs = ns / 1e6;
            } else if (available) {
              this._gpuLastMs = null;
            } else {
              // try again soon
              requestAnimationFrame(check);
            }
          };
          requestAnimationFrame(check);
        } else {
          this.gpuExt.endQueryEXT(this.gpuExt.TIME_ELAPSED_EXT);
          const q = this._gpuActiveQuery;
          this._gpuActiveQuery = null;
          const check = () => {
            const available = this.gpuExt.getQueryObjectEXT(q, this.gpuExt.QUERY_RESULT_AVAILABLE_EXT);
            const disjoint = gl.getParameter(this.gpuExt.GPU_DISJOINT_EXT);
            if (available && !disjoint) {
              const ns = this.gpuExt.getQueryObjectEXT(q, this.gpuExt.QUERY_RESULT_EXT);
              this._gpuLastMs = ns / 1e6;
            } else if (available) {
              this._gpuLastMs = null;
            } else {
              requestAnimationFrame(check);
            }
          };
          requestAnimationFrame(check);
        }
      } catch {}
    }

    // FPS/CPU mem HUD update
  const now = performance.now();
  const frameDt = now - this._lastFrameTs; this._lastFrameTs = now;
  this._emaDt = this._emaDt * 0.9 + frameDt * 0.1;
    this._frames++;
    if (now - this._lastFpsTs > 500) {
      const fps = Math.round((this._frames * 1000) / (now - this._lastFpsTs));
      this._frames = 0; this._lastFpsTs = now;
      if (this.fpsEl) this.fpsEl.textContent = String(fps);
      if (this.gpuEl) this.gpuEl.textContent = this._gpuLastMs != null ? `${this._gpuLastMs.toFixed(2)} ms` : 'n/a';
      if (this.memEl) {
        let txt = '';
        if (performance && performance.memory) {
          const used = performance.memory.usedJSHeapSize / (1024*1024);
          const total = performance.memory.totalJSHeapSize / (1024*1024);
          txt = `${used.toFixed(0)} / ${total.toFixed(0)} MB`;
        }
        this.memEl.textContent = txt + this._audioLevelText;
      }
    }
    // Clear draw stroke after fade
    if (!this.isRightDown && this.drawCount > 0 && this.points) {
      const m2 = this.points.material;
      const start2 = m2.uniforms.uDrawFadeStart.value;
      const dur2 = m2.uniforms.uDrawFadeDur.value;
      const t2 = m2.uniforms.uTime.value;
      if (t2 - start2 > dur2 + 0.15) {
        this.drawCount = 0;
        m2.uniforms.uDrawCount.value = 0;
      }
    }
    if (this.leftDownSince > 0) {
        const held = performance.now() - this.leftDownSince;
        const shouldActivate = held >= 5000;
        if (shouldActivate !== this.danceActive) {
          this.danceActive = shouldActivate;
          m.uniforms.uDanceActive.value = shouldActivate ? 1.0 : 0.0;
      if (shouldActivate) this.wasDanceHold = true;
          // Switch blending for visible dark outlines when active
          const desired = shouldActivate ? window.THREE.NormalBlending : window.THREE.AdditiveBlending;
          if (m.blending !== desired) { m.blending = desired; m.needsUpdate = true; }
        }
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  async ensureAudio() {
    try {
      if (this.audioStarted) return;
      if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();
      // candidate paths to try (for buffer fetch and element fallback)
      if (!this.audioCandidates) this.audioCandidates = [
        'vTv.mp3','./vTv.mp3','/vTv.mp3',
        'src/vTv.mp3','./src/vTv.mp3','/src/vTv.mp3',
        'assets/vTv.mp3','./assets/vTv.mp3','/assets/vTv.mp3',
        'assets/audio/vTv.mp3','./assets/audio/vTv.mp3','/assets/audio/vTv.mp3'
      ];
      // Prefer reliable buffer playback first
      const okBufFirst = await this.tryPlayViaBuffer();
      if (okBufFirst) {
        if (this.audioBtn) this.audioBtn.style.display = 'none';
        return;
      }
  if (!this.audio) {
        this.audio = new Audio();
  this.audio.preload = 'auto';
  this.audio.playsInline = true;
  this.audio.muted = false;  // let element output audio
  this.audio.volume = 1.0;
        this._audioTriedFallback = false;
      }
  if (this._audioIdx == null) this._audioIdx = 0;
      this.audio.addEventListener('loadedmetadata', () => {
        if (isFinite(this.audio.duration) && this.audio.duration > 0) this.trackDuration = this.audio.duration;
        console.log('[audio] loadedmetadata duration', this.trackDuration);
      });
      this.audio.addEventListener('canplay', () => console.log('[audio] canplay'));
      this.audio.addEventListener('play', () => console.log('[audio] play'));
      this.audio.addEventListener('ended', () => {
        this.audioEnded = true;
        // reset collapse and visualizer flags
        if (this.points) {
          const u = this.points.material.uniforms;
          u.uCollapsePhase.value = 0.0;
          u.uAudioActive.value = 0.0;
        }
        console.log('[audio] ended');
      });
      if (!this._streamSrc && typeof this.audio.captureStream === 'function') {
        const stream = this.audio.captureStream();
        this.analyser = this.analyser || this.audioCtx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.freqData = this.freqData || new Uint8Array(this.analyser.frequencyBinCount);
        this._streamSrc = this.audioCtx.createMediaStreamSource(stream);
        this._streamSrc.connect(this.analyser);
      } else if (!this._mediaSrc) {
        // Fallback: tap via MediaElementSource (element still plays to speakers)
        this._mediaSrc = this.audioCtx.createMediaElementSource(this.audio);
        this.analyser = this.analyser || this.audioCtx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.freqData = this.freqData || new Uint8Array(this.analyser.frequencyBinCount);
        this._mediaSrc.connect(this.analyser);
      }
      // Only mark started when 'playing' actually fires
  const onPlaying = () => {
        this.audioStarted = true;
        if (this.audio) this.audio.removeEventListener('playing', onPlaying);
        if (this._audioPlayTimer) { clearTimeout(this._audioPlayTimer); this._audioPlayTimer = null; }
        if (this.audioBtn) this.audioBtn.style.display = 'none';
        console.log('[audio] playing');
      };
      this.audio.addEventListener('playing', onPlaying);

      const trySrc = (i) => {
        if (i >= this.audioCandidates.length) {
          throw new Error('Audio file not found at tried paths: ' + this.audioCandidates.join(', '));
        }
        this._audioIdx = i;
        this.audio.src = this.audioCandidates[i];
        try { this.audio.load(); } catch {}
        const p = this.audio.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      };

      const fetchResolveAndPlay = async () => {
        for (const path of this.audioCandidates) {
          try {
            const res = await fetch(path, { method: 'GET', cache: 'no-cache' });
            if (res.ok) {
              const blob = await res.blob();
              if (blob && blob.size > 0) {
                const url = URL.createObjectURL(blob);
                this.audio.src = url;
                try { this.audio.load(); } catch {}
                const p = this.audio.play();
                if (p && typeof p.catch === 'function') p.catch(() => {});
                return true;
              }
            }
          } catch {}
        }
        return false;
      };

  const onError = () => {
        // try next path
        trySrc(this._audioIdx + 1);
      };
      // attach once
      if (!this._audioErrorHooked) {
        this.audio.addEventListener('error', onError);
        this.audio.addEventListener('stalled', onError);
        this.audio.addEventListener('abort', onError);
        this._audioErrorHooked = true;
      }
      // Prefer fetch-based resolution to avoid silent element onerror quirks
  const resolved = await fetchResolveAndPlay();
      if (!resolved) {
        trySrc(this._audioIdx);
      }
      // if not started within a short window, prompt for manual file selection
      this._audioPlayTimer = setTimeout(async () => {
        if (!this.audioStarted) {
          console.log('[audio] element playback not started, trying buffer fallback');
          const ok = await this.tryPlayViaBuffer();
          if (!ok) {
            if (this.audioBtn) this.audioBtn.style.display = 'block';
            this.promptAudioFile();
          }
        }
      }, 1800);
    } catch (e) { console.warn('Audio init failed', e); }
  }

  installAudioGestureListeners() {
    const startAudio = () => {
      this.ensureAudio().catch(() => {
        // if first path failed, try fallback once
        if (this.audio && !this._audioTriedFallback) {
          this._audioTriedFallback = true;
          this.audio.src = 'src/vTv.mp3';
          this.ensureAudio().catch(() => {
            this.audioStarted = false;
            this.installAudioGestureListeners();
          });
        } else {
          this.audioStarted = false;
          this.installAudioGestureListeners();
        }
      });
    };
    this.canvas.addEventListener('pointerdown', startAudio, { once: true });
    this.canvas.addEventListener('click', startAudio, { once: true });
    window.addEventListener('keydown', startAudio, { once: true });
  }

  async tryPlayViaBuffer() {
    try {
      if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();
      if (!this.audioCandidates) return false;
      for (const path of this.audioCandidates) {
        try {
          const res = await fetch(path, { method: 'GET', cache: 'no-cache' });
          if (!res.ok) continue;
          const ab = await res.arrayBuffer();
          const buf = await this.audioCtx.decodeAudioData(ab.slice(0));
          if (!buf) continue;
          if (this.bufferSource) { try { this.bufferSource.stop(); } catch {} }
          this.bufferSource = this.audioCtx.createBufferSource();
          this.bufferSource.buffer = buf;
          if (!this.analyser) {
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 2048;
            this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
          }
          if (!this._gainOut) {
            this._gainOut = this.audioCtx.createGain();
            this._gainOut.gain.value = 1.0;
          }
          this.bufferSource.connect(this.analyser);
          this.analyser.connect(this._gainOut);
          this._gainOut.connect(this.audioCtx.destination);
          this.bufferSource.start(0);
          this.bufferStartAt = this.audioCtx.currentTime;
          this.bufferDuration = buf.duration;
          this.trackDuration = buf.duration;
          this.audioStarted = true;
          this.usingBuffer = true;
          this.bufferSource.onended = () => {
            this.audioEnded = true;
            if (this.points) {
              const u = this.points.material.uniforms;
              u.uCollapsePhase.value = 0.0;
              u.uAudioActive.value = 0.0;
            }
          };
          console.log('[audio] buffer playback started');
          return true;
        } catch {}
      }
      return false;
    } catch { return false; }
  }

  promptAudioFile() {
    if (this._audioPrompted) return;
    this._audioPrompted = true;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      if (!input.files || !input.files[0]) return;
      const file = input.files[0];
      if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();
      if (!this.audio) {
        this.audio = new Audio();
  this.audio.preload = 'auto';
  this.audio.playsInline = true;
  this.audio.muted = false;
  this.audio.volume = 1.0;
      }
      const url = URL.createObjectURL(file);
      this.audio.src = url;
      if (!this._streamSrc && typeof this.audio.captureStream === 'function') {
        const stream = this.audio.captureStream();
        this.analyser = this.analyser || this.audioCtx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.freqData = this.freqData || new Uint8Array(this.analyser.frequencyBinCount);
        this._streamSrc = this.audioCtx.createMediaStreamSource(stream);
        this._streamSrc.connect(this.analyser);
      } else if (!this._mediaSrc) {
        this._mediaSrc = this.audioCtx.createMediaElementSource(this.audio);
        this.analyser = this.analyser || this.audioCtx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.freqData = this.freqData || new Uint8Array(this.analyser.frequencyBinCount);
        this._mediaSrc.connect(this.analyser);
      }
      try { await this.audio.play(); this.audioStarted = true; } catch {}
      // set duration if known
      this.audio.addEventListener('loadedmetadata', () => {
        if (isFinite(this.audio.duration) && this.audio.duration > 0) this.trackDuration = this.audio.duration;
      }, { once: true });
      // cleanup input element
      setTimeout(() => { if (input.parentNode) input.parentNode.removeChild(input); }, 0);
    }, { once: true });
    // show a quick prompt via click
    input.click();
  }

  updatePointSize() {
    if (!this.points) return;
    const baseCount = 5000;
    const baseSize = 3.0;
    const minSize = 0.35;
  const size = Math.max(minSize, baseSize * Math.sqrt(baseCount / Math.max(1, this.count)));
  // ease size to avoid popping when count changes
  const u = this.points.material.uniforms.uSize;
  const prev = u.value || size;
  u.value = prev * 0.85 + size * 0.15;
  }

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  this.raycaster.setFromCamera(this.ndc, this.camera);
  const o = this.raycaster.ray.origin.clone();
  const d = this.raycaster.ray.direction.clone(); // normalized
    // intersect with sphere at origin of radius uRadius (40)
  const R = this.sphereRadius || 40;
    const b = o.dot(d);
    const c = o.lengthSq() - R * R;
    const disc = b * b - c;
    let hit;
    if (disc >= 0) {
      let t = -b - Math.sqrt(disc);
      if (t < 0) t = -b + Math.sqrt(disc);
      if (t > 0) hit = o.clone().add(d.clone().multiplyScalar(t));
    }
    // convert to local space of points
    if (this.points) {
      const localPoint = this.points.worldToLocal((hit ? hit.clone() : o.clone().add(d.clone().multiplyScalar(R))));
      this.pointerPos.copy(localPoint);
      const m = this.points.material;
      m.uniforms.uPointer.value.copy(localPoint);
    }
    this.pointerLastMove = performance.now();

    // Right-drag stroke recording on sphere surface
    if (this.isRightDown && this.points) {
      const R2 = this.sphereRadius || 40;
      const o2 = this.raycaster.ray.origin.clone();
      const d2 = this.raycaster.ray.direction.clone();
      const b2 = o2.dot(d2);
      const c2 = o2.lengthSq() - R2 * R2;
      const disc2 = b2*b2 - c2;
      if (disc2 >= 0) {
        let t2 = -b2 - Math.sqrt(disc2);
        if (t2 < 0) t2 = -b2 + Math.sqrt(disc2);
        if (t2 > 0) {
          const hitW = o2.add(d2.multiplyScalar(t2));
          const local = this.points.worldToLocal(hitW.clone());
          const m = this.points.material;
          const arr = m.uniforms.uDrawPts.value;
          if (this.drawCount === 0 || local.distanceTo(arr[Math.max(0, this.drawCount-1)]) > this.drawRadius * 0.5) {
            const idx = Math.min(this.drawCount, this.maxDraw - 1);
            arr[idx].copy(local);
            this.drawCount = Math.min(this.drawCount + 1, this.maxDraw);
            m.uniforms.uDrawCount.value = this.drawCount;
          }
        }
      }
    }
  }

  onClick(e) {
  if (this.wasDanceHold) { this.wasDanceHold = false; return; }
    // spawn a bullet from camera through clicked point
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const originW = this.raycaster.ray.origin.clone();
    const dirW = this.raycaster.ray.direction.clone().normalize();
    // convert to local space of points
    let origin = originW;
    let dir = dirW;
    if (this.points) {
      const inv = this.points.matrixWorld.clone().invert();
      origin = originW.clone().applyMatrix4(inv);
      dir = dirW.clone().transformDirection(inv).normalize();
    }
    // put into a free slot (oldest or first expired)
    const now = performance.now() * 0.001;
    let slot = 0;
    let bestScore = -Infinity; // prefer free (score large) else oldest age
    for (let i = 0; i < this.maxBullets; i++) {
      const spawn = this.bullets[i].spawn;
      const age = spawn < 0 ? 1e9 : now - spawn; // free gets huge score
      if (age > bestScore) { slot = i; bestScore = age; }
    }
    this.bullets[slot].start.copy(origin);
    this.bullets[slot].dir.copy(dir);
    this.bullets[slot].spawn = now;
    if (this.points) {
      const m = this.points.material;
      m.uniforms.uBulletStart.value[slot].copy(origin);
      m.uniforms.uBulletDir.value[slot].copy(dir);
      const arr = m.uniforms.uBulletSpawn.value;
      arr[slot] = now;
    }
  }

  onAuxClick(e) {
    if (e.button !== 1 && e.type !== 'auxclick') return;
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const originW = this.raycaster.ray.origin.clone();
    const dirW = this.raycaster.ray.direction.clone().normalize();
    // convert to local
    let origin = originW;
    let dir = dirW;
    if (this.points) {
      const inv = this.points.matrixWorld.clone().invert();
      origin = originW.clone().applyMatrix4(inv);
      dir = dirW.clone().transformDirection(inv).normalize();
    }
    // choose heart slot
    const now = performance.now() * 0.001;
    let slot = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < this.maxHearts; i++) {
      const spawn = this.hearts[i].spawn;
      const age = spawn < 0 ? 1e9 : now - spawn;
      if (age > bestScore) { slot = i; bestScore = age; }
    }
    this.hearts[slot].start.copy(origin);
    this.hearts[slot].dir.copy(dir);
    this.hearts[slot].spawn = now;
    if (this.points) {
      const m = this.points.material;
      m.uniforms.uHeartStart.value[slot].copy(origin);
      m.uniforms.uHeartDir.value[slot].copy(dir);
      const arr = m.uniforms.uHeartSpawn.value;
      arr[slot] = now;
    }
  }

  // Spawn a cylinder with random origin/direction through the sphere (local space)
  spawnRandomBullet() {
    if (!this.points) return;
    const now = performance.now() * 0.001;
    // choose random point on a sphere just outside current radius and random dir
    const R = (this.sphereRadius || 40) * 1.2;
    const randOnSphere = () => {
      const u = Math.random();
      const v = Math.random();
      const theta = 2*Math.PI*u;
      const phi = Math.acos(2*v - 1);
      return new window.THREE.Vector3(
        R*Math.sin(phi)*Math.cos(theta),
        R*Math.sin(phi)*Math.sin(theta),
        R*Math.cos(phi)
      );
    };
    const start = randOnSphere();
    // aim roughly toward center with some randomness
    const dir = start.clone().multiplyScalar(-1).add(new window.THREE.Vector3(
      (Math.random()-0.5)*R*0.2,
      (Math.random()-0.5)*R*0.2,
      (Math.random()-0.5)*R*0.2
    )).normalize();
    // slot selection (reuse oldest/expired)
    let slot = 0; let best = -Infinity;
    for (let i = 0; i < this.maxBullets; i++) {
      const spawn = this.bullets[i].spawn;
      const age = spawn < 0 ? 1e9 : now - spawn;
      if (age > best) { best = age; slot = i; }
    }
    // record
    this.bullets[slot].start.copy(start);
    this.bullets[slot].dir.copy(dir);
    this.bullets[slot].spawn = now;
    // uniforms
    const m = this.points.material;
    m.uniforms.uBulletStart.value[slot].copy(start);
    m.uniforms.uBulletDir.value[slot].copy(dir);
    m.uniforms.uBulletSpawn.value[slot] = now;
  }

  // Solar flare: choose a random outward direction and occupy a free slot
  spawnFlare(power, coneCos, dur) {
    if (!this.points) return;
    const now = performance.now() * 0.001;
    // Find a free or oldest slot
    const spawns = this.points.material.uniforms.uFlareSpawn.value;
    let slot = 0; let best = -Infinity;
    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i];
      const age = s < 0 ? 1e9 : now - s;
      if (age > best) { best = age; slot = i; }
    }
    // Random direction on unit sphere
    const u = Math.random();
    const v = Math.random();
    const theta = 2*Math.PI*u;
    const phi = Math.acos(2*v - 1);
    const dir = new window.THREE.Vector3(
      Math.sin(phi)*Math.cos(theta),
      Math.sin(phi)*Math.sin(theta),
      Math.cos(phi)
    ).normalize();
    const uniforms = this.points.material.uniforms;
    uniforms.uFlareDir.value[slot].copy(dir);
    uniforms.uFlareSpawn.value[slot] = now;
    uniforms.uFlareCone.value[slot] = coneCos;
    uniforms.uFlarePower.value[slot] = power;
    uniforms.uFlareDur.value[slot] = dur;
  }

  // Pink spouts: pick a random surface anchor and occupy a free (or oldest) spout slot
  spawnPinkSpout() {
    if (!this.points) return;
    const now = performance.now() * 0.001;
    const uniforms = this.points.material.uniforms;
    const spawns = uniforms.uSpoutSpawn.value;
    // choose slot: prefer free else oldest
    let slot = 0; let best = -Infinity;
    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i];
      const age = s < 0 ? 1e9 : now - s;
      if (age > best) { best = age; slot = i; }
    }
    // random surface direction
    const u = Math.random();
    const v = Math.random();
    const theta = 2*Math.PI*u;
    const phi = Math.acos(2*v - 1);
    const dir = new window.THREE.Vector3(
      Math.sin(phi)*Math.cos(theta),
      Math.sin(phi)*Math.sin(theta),
      Math.cos(phi)
    ).normalize();
    // parameters: tighter cone, modest power, short duration
    const coneCos = Math.cos((14 + Math.random()*10) * Math.PI/180); // 14–24 deg
    const power = 0.22 + Math.random()*0.18; // affects angular velocity/lift
    const dur = 0.9 + Math.random()*0.7; // 0.9–1.6s
    uniforms.uSpoutDir.value[slot].copy(dir);
    uniforms.uSpoutSpawn.value[slot] = now;
    uniforms.uSpoutCone.value[slot] = coneCos;
    uniforms.uSpoutPower.value[slot] = power;
    uniforms.uSpoutDur.value[slot] = dur;
  }
}
