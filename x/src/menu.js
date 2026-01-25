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

  const initMenu = () => {
    const menuUI = document.getElementById('menuUI');
    const bar = document.getElementById('menuBar');
    const root = document.getElementById('menuDropdownRoot');
    const buttons = Array.from(document.querySelectorAll('.hpMenuBtn[data-menu]'));
    const panels = Array.from(document.querySelectorAll('.hpDropdown[data-panel]'));
    const projectsList = document.getElementById('hpProjectsList');
    const serversList = document.getElementById('hpServersList');

    if (!menuUI || !bar || !root || buttons.length === 0) return;

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

    document.addEventListener('menu:enter', () => {
      try { menuUI.setAttribute('aria-hidden', 'false'); } catch {}
      loadProjects();
    });
  };

  window.addEventListener('DOMContentLoaded', initMenu);
})();
