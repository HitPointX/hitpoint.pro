const GCH = (() => {
  // Bump to bust caches on GitHub Pages/CDNs when changing wasm/js.
  const GCH_ASSET_VERSION = '2026-01-25-4';
  const LCD_W = 160;
  const LCD_H = 160;
  const RGBA_LEN = LCD_W * LCD_H * 4;

  const readCookie = (name) => {
    try {
      const parts = document.cookie ? document.cookie.split(';') : [];
      for (const p of parts) {
        const [k, ...rest] = p.trim().split('=');
        if (k === name) return decodeURIComponent(rest.join('=') || '');
      }
    } catch {}
    return null;
  };

  const getUnlockKey = () => {
    try {
      if (typeof window.hpGetUnlockKey === 'function') return window.hpGetUnlockKey();
    } catch {}
    const v = readCookie('hp_menu_unlocked');
    if (!v || v === '0') return null;
    return v;
  };

  const storageKey = () => {
    const k = getUnlockKey();
    return `hp:gachitop:save:${k || 'anon'}`;
  };

  const fetchText = async (url) => {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`fetch failed ${res.status} ${url}`);
    return await res.text();
  };

  const state = {
    running: false,
    raf: 0,
    lastNowMs: 0,
    pressMask: 0,
    autosaveTimer: 0,
    autosaveWired: false,

    canvas: null,
    scaleSelect: null,
    gl: null,
    program: null,
    tex: null,
    vao: null,

    Module: null,
    api: null,
    rgbaPtr: 0,

    rulesJson: '',
    illnessJson: '',

    audio: {
      ready: false,
      ctx: null,
      master: null,
      musicGain: null,
      sfxGain: null,
      buffers: new Map(),
      musicSource: null,
      musicEnabled: false,
      inFlight: null,
    },
  };

  const SFX = {
    UiMove: 0,
    UiConfirm: 1,
    UiBack: 2,
    AttentionCall: 3,
    Feed: 4,
    Play: 5,
    Medicine: 6,
    IllnessSymptom: 7,
    IllnessWarning: 8,
    Death: 9,
  };

  const SFX_FILES = new Map([
    [SFX.UiMove, 'ui_move.wav'],
    [SFX.UiConfirm, 'ui_confirm.wav'],
    [SFX.UiBack, 'ui_back.wav'],
    [SFX.AttentionCall, 'attention_call.wav'],
    [SFX.Feed, 'feed.wav'],
    [SFX.Play, 'play.wav'],
    [SFX.Medicine, 'medicine.wav'],
    [SFX.IllnessSymptom, 'illness_symptom.wav'],
    [SFX.IllnessWarning, 'illness_warning.wav'],
    [SFX.Death, 'death.wav'],
  ]);

  const audioEnsure = async () => {
    if (state.audio.inFlight) return state.audio.inFlight;
    state.audio.inFlight = (async () => {
      if (state.audio.ready) return;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new Error('Web Audio not supported');
      const ctx = new Ctx();
      if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch {}
      }

      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);

      const sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.95;
      sfxGain.connect(master);

      const musicGain = ctx.createGain();
      musicGain.gain.value = 0.18;
      musicGain.connect(master);

      state.audio.ctx = ctx;
      state.audio.master = master;
      state.audio.sfxGain = sfxGain;
      state.audio.musicGain = musicGain;

      const loadBuffer = async (url) => {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`audio fetch failed ${res.status} ${url}`);
        const ab = await res.arrayBuffer();
        return await ctx.decodeAudioData(ab);
      };

      const base = new URL(`../../games/gachitop/assets/sfx/`, import.meta.url);
      const loads = [];
      for (const [id, fname] of SFX_FILES.entries()) {
        const url = new URL(`${fname}?v=${encodeURIComponent(GCH_ASSET_VERSION)}`, base);
        loads.push(loadBuffer(url.href).then(buf => state.audio.buffers.set(id, buf)).catch(() => {}));
      }

      const musicUrl = new URL(`../../games/gachitop/assets/music/tamagotop_loop.wav?v=${encodeURIComponent(GCH_ASSET_VERSION)}`, import.meta.url);
      loads.push(loadBuffer(musicUrl.href).then(buf => state.audio.buffers.set('music', buf)).catch(() => {}));

      await Promise.all(loads);
      state.audio.ready = true;
    })().finally(() => {
      state.audio.inFlight = null;
    });
    return state.audio.inFlight;
  };

  const audioPlaySfx = (id) => {
    try {
      if (!state.audio.ready || !state.audio.ctx) return;
      const buf = state.audio.buffers.get(id);
      if (!buf) return;
      const src = state.audio.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(state.audio.sfxGain);
      src.start();
    } catch {}
  };

  const audioSyncMusic = (enabled) => {
    if (!state.audio.ready || !state.audio.ctx) return;
    const want = !!enabled;
    if (want === state.audio.musicEnabled) return;
    state.audio.musicEnabled = want;

    try {
      if (state.audio.musicSource) {
        state.audio.musicSource.stop();
        state.audio.musicSource.disconnect();
      }
    } catch {}
    state.audio.musicSource = null;

    if (!want) return;
    const buf = state.audio.buffers.get('music');
    if (!buf) return;
    const src = state.audio.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(state.audio.musicGain);
    src.start();
    state.audio.musicSource = src;
  };

  const InputBits = {
    A: 1 << 0,
    B: 1 << 1,
    C: 1 << 2,
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const computeScale = () => {
    if (!state.canvas || !state.scaleSelect) return 1;
    const mode = state.scaleSelect.value;
    const stage = state.canvas.parentElement;
    const rect = stage ? stage.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
    const padW = 40;
    const padH = 140;
    const maxScale = Math.max(0.5, Math.min((rect.width - padW) / LCD_W, (rect.height - padH) / LCD_H));
    if (mode === 'fit') return maxScale;
    const fixed = parseFloat(mode);
    if (!Number.isFinite(fixed)) return maxScale;
    return Math.min(fixed, maxScale);
  };

  const applyCanvasSize = () => {
    if (!state.canvas) return;
    const scale = computeScale();
    const cssW = Math.max(1, Math.floor(LCD_W * scale));
    const cssH = Math.max(1, Math.floor(LCD_H * scale));
    state.canvas.style.width = `${cssW}px`;
    state.canvas.style.height = `${cssH}px`;

    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const pxW = Math.max(1, Math.floor(cssW * dpr));
    const pxH = Math.max(1, Math.floor(cssH * dpr));
    if (state.canvas.width !== pxW) state.canvas.width = pxW;
    if (state.canvas.height !== pxH) state.canvas.height = pxH;
  };

  const glCompile = (gl, type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(s) || 'shader compile failed';
      gl.deleteShader(s);
      throw new Error(err);
    }
    return s;
  };

  const glLink = (gl, vs, fs) => {
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const err = gl.getProgramInfoLog(p) || 'program link failed';
      gl.deleteProgram(p);
      throw new Error(err);
    }
    return p;
  };

  const initGL = () => {
    const canvas = state.canvas;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false });
    if (!gl) throw new Error('WebGL2 not available');
    state.gl = gl;

    const vsSrc = `#version 300 es
      precision highp float;
      layout(location=0) in vec2 aPos;
      layout(location=1) in vec2 aUV;
      out vec2 vUV;
      void main() {
        vUV = aUV;
        gl_Position = vec4(aPos, 0.0, 1.0);
      }
    `;
    const fsSrc = `#version 300 es
      precision highp float;
      in vec2 vUV;
      uniform sampler2D uTex;
      out vec4 outColor;
      void main() {
        outColor = texture(uTex, vUV);
      }
    `;

    const vs = glCompile(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = glCompile(gl, gl.FRAGMENT_SHADER, fsSrc);
    const program = glLink(gl, vs, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    state.program = program;

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);

    // Fullscreen quad (two triangles), interleaved pos+uv.
    // WebGL textures are addressed with (0,0) at bottom-left; our LCD buffer is top-left origin,
    // so we flip V here to avoid an upside-down image.
    const verts = new Float32Array([
      -1, -1, 0, 1,
       1, -1, 1, 1,
      -1,  1, 0, 0,
      -1,  1, 0, 0,
       1, -1, 1, 1,
       1,  1, 1, 0,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, LCD_W, LCD_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    state.vao = vao;
    state.tex = tex;
  };

  // Allocates a NUL-terminated UTF-8 string but passes the byte-length *excluding* the terminator.
  // Our wasm APIs take (ptr, len) and build std::string(ptr, ptr+len) so len must not include the NUL.
  const withCString = (Module, str, fn) => {
    const s = String(str ?? '');
    const byteLen = Module.lengthBytesUTF8(s);
    const bufLen = byteLen + 1;
    const ptr = Module._malloc(bufLen);
    Module.stringToUTF8(s, ptr, bufLen);
    try {
      return fn(ptr, byteLen);
    } finally {
      Module._free(ptr);
    }
  };

  const loadWasm = async () => {
    if (state.Module) return state.Module;

    const rulesUrl = new URL(`../../games/gachitop/config/game_rules.json?v=${encodeURIComponent(GCH_ASSET_VERSION)}`, import.meta.url);
    const illnessUrl = new URL(`../../games/gachitop/config/illness_db.json?v=${encodeURIComponent(GCH_ASSET_VERSION)}`, import.meta.url);
    state.rulesJson = await fetchText(rulesUrl);
    state.illnessJson = await fetchText(illnessUrl);

    const modUrl = new URL(`../../games/gachitop/gachitop.js?v=${encodeURIComponent(GCH_ASSET_VERSION)}`, import.meta.url);
    const { default: createModule } = await import(modUrl.href);

    const Module = await createModule({
      locateFile: (p) => new URL(`../../games/gachitop/${p}?v=${encodeURIComponent(GCH_ASSET_VERSION)}`, import.meta.url).href,
    });

    state.Module = Module;
    state.api = {
      init: Module.cwrap('gch_init', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']),
      step: Module.cwrap('gch_step', null, ['number', 'number', 'number', 'number']),
      pointerMove: Module.cwrap('gch_pointer_move', null, ['number', 'number']),
      pointerClick: Module.cwrap('gch_pointer_click', null, ['number', 'number', 'number']),
      popSfx: Module.cwrap('gch_pop_sfx', 'number', []),
      musicEnabled: Module.cwrap('gch_music_enabled', 'number', []),
      rgbaPtr: Module.cwrap('gch_rgba_ptr', 'number', []),
      savePtr: Module.cwrap('gch_save_json_ptr', 'number', []),
      saveLen: Module.cwrap('gch_save_json_len', 'number', []),
      reset: Module.cwrap('gch_reset', null, ['number', 'number']),
      loadSave: Module.cwrap('gch_load_save_json', 'number', ['number', 'number', 'number', 'number']),
    };

    return Module;
  };

  const initGameState = async () => {
    const Module = await loadWasm();
    if (!state.api) throw new Error('Gachitop WASM API not ready');

    const saveJson = (() => {
      try { return localStorage.getItem(storageKey()) || ''; } catch { return ''; }
    })();

    const nowMs = performance.now();
    const nowTicks = Math.floor(nowMs) >>> 0;
    const nowSec = Math.floor(Date.now() / 1000);

    const ok = withCString(Module, state.rulesJson, (rulesPtr, rulesLen) =>
      withCString(Module, state.illnessJson, (illPtr, illLen) =>
        withCString(Module, saveJson, (savePtr, saveLen) =>
          state.api.init(rulesPtr, rulesLen, illPtr, illLen, savePtr, saveLen, nowSec, nowTicks)
        )
      )
    );
    if (!ok) throw new Error('gch_init failed');

    state.rgbaPtr = state.api.rgbaPtr();
  };

  const renderFrame = (nowMs) => {
    if (!state.running) return;
    state.raf = requestAnimationFrame(renderFrame);

    const dtMs = state.lastNowMs ? (nowMs - state.lastNowMs) : 16.67;
    state.lastNowMs = nowMs;
    const dtSeconds = clamp(dtMs / 1000, 0, 0.2);

    const nowTicks = Math.floor(nowMs) >>> 0;
    const nowSec = Math.floor(Date.now() / 1000);

    const press = state.pressMask;
    state.pressMask = 0;

    try {
      state.api.step(dtSeconds, nowTicks, nowSec, press);
    } catch (e) {
      console.error('[gachitop] step failed', e);
      quit();
      return;
    }

    // Drain audio cues.
    try {
      if (state.audio.ready && state.api.popSfx) {
        for (let i = 0; i < 32; i++) {
          const id = state.api.popSfx();
          if (id == null || id < 0) break;
          audioPlaySfx(id);
        }
      }
      if (state.audio.ready && state.api.musicEnabled) {
        audioSyncMusic(state.api.musicEnabled() === 1);
      }
    } catch {}

    applyCanvasSize();

    const gl = state.gl;
    gl.viewport(0, 0, state.canvas.width, state.canvas.height);
    gl.useProgram(state.program);
    gl.bindVertexArray(state.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.tex);

    const bytes = state.Module.HEAPU8.subarray(state.rgbaPtr, state.rgbaPtr + RGBA_LEN);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, LCD_W, LCD_H, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  const queuePress = (btn) => {
    if (btn === 'a') state.pressMask |= InputBits.A;
    if (btn === 'b') state.pressMask |= InputBits.B;
    if (btn === 'c') state.pressMask |= InputBits.C;
  };

  const canvasToLcd = (clientX, clientY) => {
    if (!state.canvas) return null;
    const rect = state.canvas.getBoundingClientRect();
    const nx = (clientX - rect.left) / Math.max(1, rect.width);
    const ny = (clientY - rect.top) / Math.max(1, rect.height);
    if (nx < 0 || ny < 0 || nx > 1 || ny > 1) return null;
    const x = Math.max(0, Math.min(LCD_W - 1, Math.floor(nx * LCD_W)));
    const y = Math.max(0, Math.min(LCD_H - 1, Math.floor(ny * LCD_H)));
    return { x, y };
  };

  const save = () => {
    if (!state.running || !state.api) return;
    try {
      const ptr = state.api.savePtr();
      const len = state.api.saveLen();
      const json = state.Module.UTF8ToString(ptr, len);
      localStorage.setItem(storageKey(), json);
      console.log('[gachitop] saved', storageKey());
    } catch (e) {
      console.warn('[gachitop] save failed', e);
    }
  };

  const reset = () => {
    if (!state.running || !state.api) return;
    if (!confirm('Reset pet? This will overwrite your current save for this browser.')) return;
    try {
      const nowMs = performance.now();
      const nowTicks = Math.floor(nowMs) >>> 0;
      const nowSec = Math.floor(Date.now() / 1000);
      state.api.reset(nowSec, nowTicks);
      save();
    } catch (e) {
      console.warn('[gachitop] reset failed', e);
    }
  };

  const quit = () => {
    try { save(); } catch {}
    state.running = false;
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
    state.lastNowMs = 0;
    if (state.autosaveTimer) clearInterval(state.autosaveTimer);
    state.autosaveTimer = 0;
    try { document.body.classList.remove('hp-game-running'); } catch {}
    try {
      const dock = document.getElementById('gameDock');
      if (dock) dock.setAttribute('aria-hidden', 'true');
    } catch {}
  };

  const launch = async () => {
    if (state.running) return;
    if (!state.canvas) throw new Error('missing #gachitopCanvas');

    document.body.classList.add('hp-game-running');
    try {
      const dock = document.getElementById('gameDock');
      if (dock) dock.setAttribute('aria-hidden', 'false');
    } catch {}

    applyCanvasSize();

    if (!state.gl) initGL();
    try { await audioEnsure(); } catch {}
    await initGameState();

    state.running = true;
    state.lastNowMs = 0;
    state.raf = requestAnimationFrame(renderFrame);

    // Autosave: every minute + on close/hidden. Manual save stays available in FILE.
    if (state.autosaveTimer) clearInterval(state.autosaveTimer);
    state.autosaveTimer = setInterval(() => {
      try { save(); } catch {}
    }, 60_000);

    if (!state.autosaveWired) {
      state.autosaveWired = true;
      window.addEventListener('pagehide', () => { try { save(); } catch {} });
      window.addEventListener('beforeunload', () => { try { save(); } catch {} });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          try { save(); } catch {}
        }
      });
    }
  };

  const initDom = () => {
    state.canvas = document.getElementById('gachitopCanvas');
    state.scaleSelect = document.getElementById('gchScaleSelect');

    if (state.scaleSelect) {
      state.scaleSelect.addEventListener('change', () => applyCanvasSize());
    }

    window.addEventListener('resize', () => applyCanvasSize());

    // On-screen pad.
    const pad = document.getElementById('gachitopPad');
    if (pad) {
      pad.addEventListener('pointerdown', (e) => {
        const t = e.target;
        if (!(t instanceof HTMLElement)) return;
        const btn = t.getAttribute('data-gch-btn');
        if (!btn) return;
        queuePress(btn);
      });
    }

    if (state.canvas) {
      state.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      state.canvas.addEventListener('pointermove', (e) => {
        if (!state.running || !state.api) return;
        const p = canvasToLcd(e.clientX, e.clientY);
        if (!p) {
          state.api.pointerMove(-1, -1);
          return;
        }
        state.api.pointerMove(p.x, p.y);
      });
      state.canvas.addEventListener('pointerleave', () => {
        if (!state.running || !state.api) return;
        state.api.pointerMove(-1, -1);
      });
      state.canvas.addEventListener('pointerdown', (e) => {
        if (!state.running || !state.api) return;
        const p = canvasToLcd(e.clientX, e.clientY);
        if (!p) return;
        state.api.pointerClick(p.x, p.y, e.button ?? 0);
      });
    }

    // Keyboard.
    window.addEventListener('keydown', (e) => {
      if (!state.running) return;
      const k = (e.key || '').toLowerCase();
      if (k === 'a' || e.key === 'ArrowLeft') { queuePress('a'); e.preventDefault(); }
      if (k === 'b' || e.key === 'Enter' || e.key === ' ') { queuePress('b'); e.preventDefault(); }
      if (k === 'c' || e.key === 'Backspace') { queuePress('c'); e.preventDefault(); }
    }, { passive: false });

    // Menu actions.
    document.addEventListener('gachitop:launch', () => {
      launch().catch((e) => {
        console.error('[gachitop] launch failed', e);
        try {
          const hint = document.getElementById('gchHint');
          if (hint) hint.textContent = `Launch failed: ${String(e)} (check console)`;
        } catch {}
        quit();
      });
    });
    document.addEventListener('gachitop:save', () => save());
    document.addEventListener('gachitop:reset', () => reset());
    document.addEventListener('gachitop:quit', () => quit());
  };

  return { initDom };
})();

window.addEventListener('DOMContentLoaded', () => {
  try { GCH.initDom(); } catch (e) { console.warn('[gachitop] init failed', e); }
});
