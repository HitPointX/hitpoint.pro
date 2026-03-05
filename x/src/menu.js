(() => {
  const USERNAME = 'HitPointX';
  const CACHE_KEY = 'hp_projects_cache_v2';
  const CACHE_TTL_MS = 60 * 60 * 1000;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const copyText = async (text) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return !!ok;
    } catch {}
    return false;
  };

  const getCachedProjects = () => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.items) || typeof parsed.at !== 'number') return null;
      if ((Date.now() - parsed.at) > CACHE_TTL_MS) return null;
      return parsed.items;
    } catch {
      return null;
    }
  };

  const setCachedProjects = (items) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), items }));
    } catch {}
  };

  const fetchAllPublicRepos = async (username) => {
    const all = [];
    for (let page = 1; page <= 6; page++) {
      const url = `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&page=${page}&sort=updated`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
      const chunk = await res.json();
      if (!Array.isArray(chunk) || chunk.length === 0) break;
      all.push(...chunk);
      if (chunk.length < 100) break;
    }
    return all;
  };

  const normalizeProjects = (repos) => {
    const pinned = new Set(['REGPS', 'MCVS', 'LiveMTRX', 'DoomMC3D']);
    const hidden = new Set(['hitpoint.pro']);
    const items = repos
      .filter(r => r && r.private === false)
      .filter(r => !r.archived)
      .filter(r => !hidden.has(String(r.name || '').toLowerCase()))
      .map(r => ({
        name: String(r.name || ''),
        url: String(r.html_url || ''),
        desc: r.description ? String(r.description) : '',
        updatedAt: r.pushed_at ? String(r.pushed_at) : (r.updated_at ? String(r.updated_at) : ''),
        stars: Number(r.stargazers_count || 0),
        forks: Number(r.forks_count || 0),
        language: r.language ? String(r.language) : '',
        fork: !!r.fork,
        pinned: pinned.has(String(r.name || ''))
      }))
      .filter(r => r.name && r.url);

    items.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return (tb - ta) || a.name.localeCompare(b.name);
    });

    return items;
  };

  const renderProjects = (container, items) => {
    container.innerHTML = '';
    if (!items || items.length === 0) {
      const n = document.createElement('div');
      n.className = 'hpNote';
      n.textContent = 'No public projects found.';
      container.appendChild(n);
      return;
    }

    for (const p of items) {
      const a = document.createElement('a');
      a.className = 'hpLinkRow';
      a.href = p.url;
      a.target = '_blank';
      a.rel = 'noopener';

      const main = document.createElement('div');
      main.className = 'hpMain';
      const t = document.createElement('div');
      t.className = 't';
      t.textContent = p.name + (p.fork ? ' (fork)' : '');
      const d = document.createElement('div');
      d.className = 'd';
      d.textContent = p.desc || (p.language ? p.language : '—');
      main.appendChild(t);
      main.appendChild(d);

      const meta = document.createElement('div');
      meta.className = 'hpMeta';
      if (p.language) {
        const b = document.createElement('span');
        b.className = 'hpBadge';
        b.textContent = p.language.toUpperCase();
        meta.appendChild(b);
      }
      if (p.stars > 0) {
        const b = document.createElement('span');
        b.className = 'hpBadge';
        b.textContent = `★ ${p.stars}`;
        meta.appendChild(b);
      }
      a.appendChild(main);
      a.appendChild(meta);
      container.appendChild(a);
    }
  };

  const SERVERS = [
    { name: 'Palworld', title: 'Termina Dark', addr: 'pal.hitpoint.pro:8211', status: 'ONLINE' },
    { name: 'Minecraft', title: 'MCVS', addr: 'mine.hitpoint.pro:25565', status: 'ONLINE' },
    { name: '7DTD', title: 'Termina Post-Apocalyptic Dark RPG', addr: '7dtd.hitpoint.pro', status: 'OFFLINE' }
  ];

  const renderServers = (container) => {
    container.innerHTML = '';
    for (const s of SERVERS) {
      const row = document.createElement('div');
      row.className = 'hpRow';

      const main = document.createElement('div');
      main.className = 'hpMain';
      const t = document.createElement('div');
      t.className = 't';
      t.textContent = `${s.name}: ${s.title}`;
      const d = document.createElement('div');
      d.className = 'd';
      d.textContent = `IP: ${s.addr}`;
      main.appendChild(t);
      main.appendChild(d);

      const meta = document.createElement('div');
      meta.className = 'hpMeta';
      const badge = document.createElement('span');
      badge.className = 'hpBadge ' + (s.status === 'ONLINE' ? 'on' : 'off');
      badge.textContent = s.status;

      const copyBtn = document.createElement('button');
      copyBtn.className = 'hpBtnMini';
      copyBtn.textContent = 'COPY';
      copyBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = await copyText(s.addr);
        copyBtn.textContent = ok ? 'COPIED' : 'FAILED';
        setTimeout(() => { copyBtn.textContent = 'COPY'; }, 900);
      });

      meta.appendChild(badge);
      meta.appendChild(copyBtn);

      row.appendChild(main);
      row.appendChild(meta);
      container.appendChild(row);
    }
  };

  // --- Theme (dark default) — applied immediately, before menu fully enters ---
  const THEME_KEY = 'hp_theme_v1';
  const getSavedTheme = () => { try { return localStorage.getItem(THEME_KEY); } catch { return null; } };
  const applyTheme = (dark) => {
    document.body.classList.toggle('hp-dark-mode', dark);
    document.body.classList.toggle('hp-light-mode', !dark);
    const btn = document.getElementById('themeToggleBtn');
    if (btn) {
      const label = dark ? 'SWITCH TO LIGHT MODE' : 'SWITCH TO DARK MODE';
      btn.setAttribute('data-tooltip', label);
      btn.setAttribute('aria-label', label);
    }
    try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch {}
  };
  // Default: dark unless user explicitly chose light
  applyTheme(getSavedTheme() !== 'light');

  const initMenu = () => {
    const menuUI = document.getElementById('menuUI');
    const bar = document.getElementById('menuBar');
    const root = document.getElementById('menuDropdownRoot');
    const buttons = Array.from(document.querySelectorAll('.hpMenuBtn[data-menu]'));
    const panels = Array.from(document.querySelectorAll('.hpDropdown[data-panel]'));
    const projectsList = document.getElementById('hpProjectsList');
    const serversList = document.getElementById('hpServersList');

    if (!menuUI || !bar || !root || buttons.length === 0) return;

    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        applyTheme(!document.body.classList.contains('hp-dark-mode'));
      });
    }

    const closeAll = () => {
      for (const b of buttons) b.setAttribute('aria-expanded', 'false');
      for (const p of panels) p.classList.remove('open');
    };

    const openMenu = (name) => {
      const btn = buttons.find(b => b.dataset.menu === name);
      const panel = panels.find(p => p.dataset.panel === name);
      if (!btn || !panel) return;

      const already = btn.getAttribute('aria-expanded') === 'true';
      closeAll();
      if (already) return;

      btn.setAttribute('aria-expanded', 'true');
      panel.classList.add('open');

      const br = btn.getBoundingClientRect();
      const pw = Math.max(320, panel.offsetWidth || 0);
      const left = clamp(br.left, 12, window.innerWidth - pw - 12);
      panel.style.left = `${Math.round(left)}px`;
    };

    bar.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const actionEl = t.closest('[data-action]');
      const action = actionEl ? actionEl.getAttribute('data-action') : null;
      if (action === 'end-transmission') {
        closeAll();
        document.dispatchEvent(new CustomEvent('menu:exit'));
        return;
      }
      if (action === 'live-launch') {
        closeAll();
        document.dispatchEvent(new CustomEvent('live:launch'));
        return;
      }
      const btn = t.closest('.hpMenuBtn[data-menu]');
      if (!btn) return;
      openMenu(btn.dataset.menu);
    });

    document.addEventListener('pointerdown', (e) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (bar.contains(t)) return;
      for (const p of panels) {
        if (p.classList.contains('open') && p.contains(t)) return;
      }
      closeAll();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAll();
    });

    root.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const action = t.getAttribute('data-action');
      if (action === 'refresh') document.dispatchEvent(new CustomEvent('menu:refresh'));
      if (action === 'quit') document.dispatchEvent(new CustomEvent('menu:exit'));
      if (action === 'gch-launch') document.dispatchEvent(new CustomEvent('gachitop:launch'));
      if (action === 'gch-save') document.dispatchEvent(new CustomEvent('gachitop:save'));
      if (action === 'gch-reset') document.dispatchEvent(new CustomEvent('gachitop:reset'));
      if (action === 'gch-quit') document.dispatchEvent(new CustomEvent('gachitop:quit'));
    });

    if (serversList) renderServers(serversList);

    const loadProjects = async () => {
      if (!projectsList) return;
      const cached = getCachedProjects();
      if (cached) renderProjects(projectsList, cached);

      try {
        const repos = await fetchAllPublicRepos(USERNAME);
        const items = normalizeProjects(repos);
        setCachedProjects(items);
        renderProjects(projectsList, items);
      } catch (err) {
        if (!cached) {
          projectsList.innerHTML = '';
          const n = document.createElement('div');
          n.className = 'hpNote';
          n.textContent = 'Could not load projects right now.';
          projectsList.appendChild(n);
        }
        console.warn('[menu] projects fetch failed', err);
      }
    };

    // --- Live stream ---
    const _sk = [68,122,78,83,89,98,104,113,169,178,131,139,57,55,112,75,85,133,99,150,108,164,118,176,135,145,52,105,72,76,84,89];
    const STREAM_M3U8  = `https://stream.hitpoint.pro/hls/${_sk.map((c,i)=>String.fromCharCode(c-((i*7+13)%97))).join('')}.m3u8`;
    const POLL_LIVE_MS = 35000;
    const POLL_OFF_MS  = 12000;

    const menuDot    = document.getElementById('liveMenuDot');
    const titleDot   = document.getElementById('streamTitleDot');
    const streamDim  = document.getElementById('streamDim');
    const streamDock = document.getElementById('streamDock');
    const streamFrame = document.getElementById('streamFrame');
    const streamClose = document.getElementById('streamCloseBtn');
    const streamLabel = document.getElementById('streamStatusLabel');
    let streamPollTimer = null;
    let streamLoaded = false;

    const setLiveDotState = (state) => {
      [menuDot, titleDot].forEach(d => {
        if (!d) return;
        d.classList.remove('hpLiveDot--live', 'hpLiveDot--offline', 'hpLiveDot--checking');
        d.classList.add(`hpLiveDot--${state}`);
      });
      if (streamLabel) {
        const isLive = state === 'live';
        streamLabel.textContent = isLive ? 'LIVE' : state === 'offline' ? 'OFFLINE' : 'CHECKING';
        streamLabel.style.color   = isLive ? '#2dff9a' : '';
        streamLabel.style.opacity = isLive ? '0.9' : '0.45';
      }
    };

    const openStream = () => {
      if (streamFrame && !streamLoaded) {
        streamFrame.src = '/live/';
        streamLoaded = true;
      }
      document.body.classList.add('hp-stream-open');
      if (streamDock) streamDock.setAttribute('aria-hidden', 'false');
    };

    const closeStream = () => {
      document.body.classList.remove('hp-stream-open');
      if (streamDock) streamDock.setAttribute('aria-hidden', 'true');
      if (streamFrame) { streamFrame.src = ''; streamLoaded = false; }
    };

    const pollStream = async () => {
      clearTimeout(streamPollTimer);
      try {
        const res = await fetch(`${STREAM_M3U8}?_=${Date.now()}`, {
          method: 'HEAD', cache: 'no-store',
          signal: AbortSignal.timeout(7000),
        });
        if (res.ok) {
          setLiveDotState('live');
          streamPollTimer = setTimeout(pollStream, POLL_LIVE_MS);
        } else {
          setLiveDotState('offline');
          streamPollTimer = setTimeout(pollStream, POLL_OFF_MS);
        }
      } catch {
        setLiveDotState('offline');
        streamPollTimer = setTimeout(pollStream, POLL_OFF_MS);
      }
    };

    if (streamClose) streamClose.addEventListener('click', closeStream);
    if (streamDim)   streamDim.addEventListener('click', (e) => { if (e.target === streamDim) closeStream(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeStream(); });
    document.addEventListener('live:launch', openStream);

    // --- LIVE button glitch effect ---
    const liveBtn  = document.getElementById('liveMenuBtn');
    const liveText = document.getElementById('liveMenuText');
    const GLITCH_CHARS = '!@#$%^*<>?|~`░▒▓▄▀■□0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let liveGlitchRaf = null;

    const startLiveGlitch = () => {
      if (!liveText || liveGlitchRaf) return;
      if (liveBtn) liveBtn.classList.add('glitching');
      let tick = 0;
      const run = () => {
        if (++tick % 2 === 0) {
          liveText.textContent = 'LIVE'.split('').map(c =>
            Math.random() < 0.38 ? GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)] : c
          ).join('');
        }
        liveGlitchRaf = requestAnimationFrame(run);
      };
      liveGlitchRaf = requestAnimationFrame(run);
    };
    const stopLiveGlitch = () => {
      if (liveGlitchRaf) { cancelAnimationFrame(liveGlitchRaf); liveGlitchRaf = null; }
      if (liveBtn) liveBtn.classList.remove('glitching');
      if (liveText) liveText.textContent = 'LIVE';
    };
    if (liveBtn) {
      liveBtn.addEventListener('mouseenter', startLiveGlitch);
      liveBtn.addEventListener('mouseleave', stopLiveGlitch);
    }

    // --- WHY? blood pixel drip effect ---
    const whyBtn = document.querySelector('.hpMenuBtn[data-menu="why"]');
    let whyCanvas = null, whyCtx = null, whyRaf = null;
    let whyDrops = [], whySpawning = false;
    const DRIP_BELOW = 220;

    const startWhyDrip = () => {
      if (!whyBtn) return;
      const rect = whyBtn.getBoundingClientRect();
      if (!whyCanvas) {
        whyCanvas = document.createElement('canvas');
        Object.assign(whyCanvas.style, {
          position: 'fixed', pointerEvents: 'none',
          zIndex: '2015', imageRendering: 'pixelated',
        });
        document.body.appendChild(whyCanvas);
        whyCtx = whyCanvas.getContext('2d');
      }
      whyCanvas.style.left = rect.left + 'px';
      whyCanvas.style.top  = rect.top  + 'px';
      const W = Math.ceil(rect.width);
      const H = Math.ceil(rect.height) + DRIP_BELOW;
      whyCanvas.width  = W; whyCanvas.height = H;
      whyCanvas.style.width  = W + 'px';
      whyCanvas.style.height = H + 'px';
      whySpawning = true;
      if (!whyRaf) whyLoop();
    };
    const stopWhyDrip = () => { whySpawning = false; };

    const whyLoop = () => {
      if (!whyCtx) return;
      const W = whyCanvas.width, H = whyCanvas.height;
      const btnH = H - DRIP_BELOW;
      whyCtx.clearRect(0, 0, W, H);

      if (whySpawning) {
        const n = Math.random() < 0.65 ? 2 : 3;
        for (let i = 0; i < n; i++) {
          whyDrops.push({
            x: 2 + Math.random() * (W - 4),
            y: Math.random() * btnH,          // anywhere within letter area
            vy: 0.3 + Math.random() * 1.4,
            vx: (Math.random() - 0.5) * 0.5,
            sz: 1 + Math.floor(Math.random() * 3),  // pixel size 1–3
            life: 1.0,
            decay: 0.0035 + Math.random() * 0.006,
            trail: [],
          });
        }
      }

      for (const d of whyDrops) {
        d.vy = Math.min(d.vy + 0.065, 6);
        d.x  = Math.max(0, Math.min(W - d.sz, d.x + d.vx));
        d.y += d.vy;
        d.life -= d.decay;
        d.trail.push({ x: Math.round(d.x), y: Math.round(d.y) });
        if (d.trail.length > 14) d.trail.shift();

        // trail — darkening pixels
        for (let i = 0; i < d.trail.length; i++) {
          const t = d.trail[i];
          const a = (i / d.trail.length) * d.life * 0.72;
          const sz = Math.max(1, Math.round(d.sz * (0.4 + 0.6 * i / d.trail.length)));
          whyCtx.fillStyle = `rgba(140,0,0,${a.toFixed(2)})`;
          whyCtx.fillRect(t.x, t.y, sz, sz);
        }
        // head drop — bright pixel blob
        const a = d.life * 0.95;
        whyCtx.fillStyle = `rgba(215,8,8,${a.toFixed(2)})`;
        whyCtx.fillRect(Math.round(d.x), Math.round(d.y), d.sz + 1, d.sz + 1);
        // specular highlight pixel
        whyCtx.fillStyle = `rgba(255,90,90,${(a * 0.55).toFixed(2)})`;
        whyCtx.fillRect(Math.round(d.x), Math.round(d.y), Math.max(1, d.sz - 1), Math.max(1, d.sz - 1));
      }

      whyDrops = whyDrops.filter(d => d.life > 0.03 && d.y < H + 4);

      if (whySpawning || whyDrops.length > 0) {
        whyRaf = requestAnimationFrame(whyLoop);
      } else {
        whyRaf = null;
        if (whyCtx) whyCtx.clearRect(0, 0, whyCanvas.width, whyCanvas.height);
      }
    };

    if (whyBtn) {
      whyBtn.addEventListener('mouseenter', startWhyDrip);
      whyBtn.addEventListener('mouseleave', stopWhyDrip);
    }

    document.addEventListener('menu:enter', () => {
      try { menuUI.setAttribute('aria-hidden', 'false'); } catch {}
      loadProjects();
      setLiveDotState('checking');
      pollStream();
    });
  };

  window.addEventListener('DOMContentLoaded', initMenu);
})();
