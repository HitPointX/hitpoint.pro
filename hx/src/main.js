window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.zIndex = '0';
  document.body.appendChild(canvas);
  let particleCount = 2;
  const particleCountDisplay = document.getElementById('particleCount');
  particleCountDisplay.textContent = particleCount;
  const system = new window.ParticleSystem(canvas, particleCount);
  // Intro overlay typewriter
  const overlay = document.getElementById('quoteOverlay');
  const textEl = document.getElementById('quoteText');
  const blackFade = document.getElementById('blackFade');
  const energy = document.getElementById('energyNudge');
  const energyWord = document.getElementById('energyWord');
  const smoke = document.getElementById('smokeCanvas');
  const quotes = [
    'energy always finds a way to pull us back together.'
  ];
  // Begin with overlay showing and black fade, then type two lines sequentially
  setTimeout(() => {
    overlay.classList.add('show');
    blackFade.classList.add('hide');
    // bring in energy nudge a moment later
    setTimeout(() => {
      if (energy) energy.classList.add('show');
      // Add a slowly orbiting particle around ENERGY
      if (energyWord) {
        const orb = document.createElement('div');
        orb.id = 'energyOrb';
        energyWord.appendChild(orb);
        let t0 = performance.now();
        const animate = (now) => {
          const dt = (now - t0) / 1000; t0 = now;
          const speed = 0.5; // revs per second ~0.5
          const phase = (now * 0.001 * speed * 2*Math.PI) % (2*Math.PI);
          // get word bounds relative to parent
          const w = energyWord.getBoundingClientRect();
          const p = energy.getBoundingClientRect();
          const cx = w.left - p.left + w.width/2;
          const cy = w.top - p.top + w.height/2;
          const rx = Math.max(18, Math.min(36, w.width * 0.35));
          const ry = Math.max(10, Math.min(22, w.height * 0.9));
          const x = cx + rx * Math.cos(phase) - 4; // 4 = orb radius
          // raise the whole ellipse a bit more (still not centered)
          // previously clamped at 6..16 with 0.5 multiplier; nudge up slightly
          const yOff = Math.max(8, Math.min(22, w.height * 0.6));
          const y = cy + ry * Math.sin(phase) - 4 - yOff;
          orb.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
          if (energy && energy.style.display !== 'none') requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
      }
    }, 700);
  }, 100);
  const cps = 16; // slower type: chars per second
  let q = 0, i = 0;
  let typedDone = false;
  const typeNext = () => {
    const current = quotes[q];
    if (i <= current.length) {
      textEl.textContent = current.slice(0, i);
      i++;
      setTimeout(typeNext, 1000 / cps);
    } else if (q + 1 < quotes.length) {
      q++;
      i = 0;
      // line break before next quote (kept for future, not used now)
      textEl.innerHTML = textEl.textContent + '<br />';
      setTimeout(typeNext, 400);
    } else if (!typedDone) {
      // Done typing the quote; keep it visible until the user interacts.
      typedDone = true;
    }
  };
  setTimeout(typeNext, 450);
  window.setupControls(system);
  // On first user interaction, sweep the quote and fade out the nudge
  const armSweep = () => {
    // prevent duplicate sweeps
    if (armSweep._did) return; armSweep._did = true;
    startQuoteSweep();
    if (energy) {
      energy.classList.remove('show');
      energy.classList.add('hide');
      setTimeout(() => { energy.style.display = 'none'; }, 3200);
    }
  };
  window.addEventListener('pointerdown', armSweep, { once: true });
  window.addEventListener('keydown', armSweep, { once: true });
  if (energy) energy.addEventListener('click', armSweep, { once: true });

  // Start a low-budget smoke/haze effect that fades out on user interaction
  if (smoke) {
    const ctx = smoke.getContext('2d');
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const fit = () => {
      smoke.width = Math.floor(window.innerWidth * DPR);
      smoke.height = Math.floor(window.innerHeight * DPR);
      smoke.style.width = '100vw';
      smoke.style.height = '100vh';
    };
    fit();
    window.addEventListener('resize', fit);
    // Pre-generate a few soft puffs
    const puffs = Array.from({length: 14}, () => ({
      x: Math.random(), y: Math.random(), r: 80 + Math.random()*180,
      a: 0.08 + Math.random()*0.12, t: Math.random()*10, v: 0.04 + Math.random()*0.08,
      dx: (Math.random()-0.5)*0.06, dy: (Math.random()-0.5)*0.06
    }));
    let fade = 1.0;
    const draw = (ts) => {
      const dt = 16 / 1000;
      ctx.clearRect(0,0,smoke.width, smoke.height);
      ctx.globalCompositeOperation = 'lighter';
      for (const p of puffs) {
        p.t += p.v * dt;
        p.x = (p.x + p.dx * dt + 1) % 1;
        p.y = (p.y + p.dy * dt + 1) % 1;
        const cx = p.x * smoke.width;
        const cy = p.y * smoke.height;
        const rad = p.r * DPR * (0.8 + 0.2*Math.sin(p.t*2.0));
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        const alpha = p.a * fade;
        grad.addColorStop(0, `rgba(180, 200, 255, ${alpha*0.35})`);
        grad.addColorStop(0.6, `rgba(120, 140, 200, ${alpha*0.18})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI*2); ctx.fill();
      }
      if (fade > 0) requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
    const fadeOutSmoke = () => {
      smoke.style.opacity = '0';
      setTimeout(() => { smoke.remove(); }, 2000);
    };
    window.addEventListener('pointerdown', fadeOutSmoke, { once: true });
    window.addEventListener('keydown', fadeOutSmoke, { once: true });
    if (energy) energy.addEventListener('click', fadeOutSmoke, { once: true });
  }
  window.addEventListener('keydown', (e) => {
    console.log('Key pressed:', e.key);
    if (e.key === '1') {
      particleCount = Math.min(particleCount * 2, 1_000_000_000);
      system.setParticleCount(particleCount);
      particleCountDisplay.textContent = particleCount;
      console.log('Increased particles:', particleCount);
    } else if (e.key === '2') {
      particleCount = Math.max(Math.floor(particleCount / 2), 2);
      system.setParticleCount(particleCount);
      particleCountDisplay.textContent = particleCount;
      console.log('Decreased particles:', particleCount);
    }
  });
});

// Render a right-to-left particle sweep that "steals" the quote text and fades it out
function startQuoteSweep() {
  const overlay = document.getElementById('quoteOverlay');
  const textEl = document.getElementById('quoteText');
  const caret = overlay.querySelector('.caret');
  if (caret) caret.style.display = 'none';
  const c = document.getElementById('quoteCanvas');
  const ctx = c.getContext('2d');
  // size canvas to device pixels
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const fit = () => {
    c.width = Math.floor(window.innerWidth * DPR);
    c.height = Math.floor(window.innerHeight * DPR);
    c.style.width = '100vw';
    c.style.height = '100vh';
  };
  fit();
  window.addEventListener('resize', fit);

  // Capture the TEXT element position in screen space (not the whole overlay)
  const textRectCSS = textEl.getBoundingClientRect();
  const centerX = (textRectCSS.left + textRectCSS.right) * 0.5 * DPR;
  const centerY = (textRectCSS.top + textRectCSS.bottom) * 0.5 * DPR;
  const width = Math.max(10, Math.min(textRectCSS.width * DPR, c.width * 0.9));
  const height = Math.max(10, textRectCSS.height * DPR);
  const left = centerX - width / 2;
  const top = centerY - height / 2;
  const lines = textEl.innerHTML.split(/<br\s*\/?>(?=)/i);

  // Build particles sampled along the text block area
  const particles = [];
  const cols = Math.floor(width / (6 * DPR));
  const rows = Math.max(10, Math.floor(height / (6 * DPR)));
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      particles.push({
        x: left + (x + Math.random()*0.8) * (width / cols),
        y: top + (y + Math.random()*0.8) * (height / rows),
        vx: - (30 + Math.random() * 70) * DPR, // sweep right->left
        vy: (Math.random() - 0.5) * 18 * DPR,
        life: 1.0,
        decay: 0.003 + Math.random() * 0.01
      });
    }
  }

  // Fade out the DOM text while particles take over
  overlay.style.transition = 'opacity 0.8s ease 0.4s';
  overlay.style.opacity = '0.35';

  let last = performance.now();
  // Pre-render a rounded particle sprite for soft edges
  const sprite = document.createElement('canvas');
  const baseR = 2.25 * DPR; // slightly larger, rounder look
  sprite.width = sprite.height = Math.ceil(baseR * 4);
  const sctx = sprite.getContext('2d');
  const sx = sprite.width / 2, sy = sprite.height / 2, sr = baseR * 1.8;
  const grad = sctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
  grad.addColorStop(0.0, 'rgba(255, 225, 245, 0.95)');
  grad.addColorStop(0.5, 'rgba(255, 210, 247, 0.55)');
  grad.addColorStop(1.0, 'rgba(255, 210, 247, 0.0)');
  sctx.fillStyle = grad;
  sctx.beginPath(); sctx.arc(sx, sy, sr, 0, Math.PI*2); sctx.fill();

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, c.width, c.height);
    // subtle glow trail
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 2 * DPR * dt; // gentle gravity
      p.life -= p.decay;
      if (p.life <= 0) p.life = 0;
      const alpha = p.life * 0.9;
      const r = baseR;
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, p.x - r*2, p.y - r*2, r*4, r*4);
    }
    ctx.globalAlpha = 1;
    // overall fade of canvas when most particles are dead
    const alive = particles.reduce((a,p)=>a+(p.life>0.05?1:0),0);
    if (alive > 30) {
      requestAnimationFrame(frame);
    } else {
      // end: hide overlay and canvas
      const overlayNode = document.getElementById('quoteOverlay');
      overlayNode.style.opacity = '0';
      setTimeout(() => {
        overlayNode.style.display = 'none';
        c.remove();
      }, 700);
    }
  }
  requestAnimationFrame(frame);
}

// Final message: typewriter "to be continued..." below center with distortion
window.startFinalMessage = function startFinalMessage() {
  let c = document.getElementById('quoteCanvas');
  if (!c) {
    c = document.createElement('canvas');
    c.id = 'quoteCanvas';
    document.body.appendChild(c);
  }
  const ctx = c.getContext('2d');
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  // Ensure canvas is sized
  c.width = Math.floor(window.innerWidth * DPR);
  c.height = Math.floor(window.innerHeight * DPR);
  c.style.width = '100vw';
  c.style.height = '100vh';
  // Position text below collapsed hole
  const centerX = c.width / 2;
  const centerY = c.height / 2;
  const text = 'to be continued...';
  const fontPx = Math.round(22 * DPR);
  ctx.font = `${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  // Typewriter state
  let i = 0;
  const startTs = performance.now();
  const cps = 18; // chars per second
  // Distortion field parameters
  const noise = (x, y, t) => {
    // simple layered sine noise; stable and cheap
    return (
      Math.sin(x*0.018 + t*1.6) * 0.55 +
      Math.sin(y*0.022 - t*1.1) * 0.45 +
      Math.sin((x+y)*0.012 + t*0.8) * 0.3
    );
  };
  const drawDistortedText = (msg, alpha, t) => {
    if (!msg) return;
    // Render text to offscreen, then slice rows with horizontal offsets for wavy distortion
    const pad = Math.ceil(16 * DPR);
    const tmp = document.createElement('canvas');
    const tctx = tmp.getContext('2d');
    const metrics = ctx.measureText(msg);
    const tw = Math.ceil(Math.max(metrics.width, 10));
    const th = Math.ceil(fontPx * 1.6);
    tmp.width = tw + pad*2;
    tmp.height = th + pad*2;
    tctx.clearRect(0,0,tmp.width,tmp.height);
    tctx.font = ctx.font;
    tctx.textAlign = 'left';
    tctx.textBaseline = 'top';
    // nice gradient fill for glow
    const grad = tctx.createLinearGradient(0, 0, 0, th);
    grad.addColorStop(0, `rgba(216,251,255, ${0.95*alpha})`);
    grad.addColorStop(1, `rgba(180,225,255, ${0.75*alpha})`);
    tctx.fillStyle = grad;
    tctx.shadowColor = `rgba(120, 200, 255, ${0.45*alpha})`;
    tctx.shadowBlur = 8 * DPR;
    tctx.fillText(msg, pad, pad);

    // Draw wave-distorted onto main canvas below center
    const baseX = centerX - (tmp.width/2);
    const baseY = centerY + Math.round(40 * DPR); // below the hole
    const slices = Math.max(24, Math.floor(tmp.height / (1.6 * DPR)));
    const waveAmp = 10 * DPR; // horizontal amplitude
    const waveFreq = 0.025;   // radians per px vertically
    const waveSpeed = 2.0;    // radians per second
    for (let s = 0; s < slices; s++) {
      const sy = Math.floor(s * (tmp.height / slices));
      const sh = Math.max(1, Math.floor(tmp.height / slices));
      // sinusoidal wave primarily controls distortion; noise adds subtle irregularity
      const wave = Math.sin(sy * waveFreq + t * waveSpeed) * waveAmp;
      const n = noise(sy, s*19, t) * 2 * DPR; // small randomization
      const wobbleScale = 1 + noise(s*7, sy, t*0.6) * 0.01; // subtle vertical scale wobble
      const dx = baseX + wave + n;
      const dy = baseY + Math.floor(s * (tmp.height / slices) * wobbleScale);
      ctx.globalAlpha = alpha;
      ctx.drawImage(tmp, 0, sy, tmp.width, sh, dx, dy, tmp.width, sh);
    }
    ctx.globalAlpha = 1;
  };

  let finishedAt = null;
  function frame(now) {
    const elapsed = now - startTs;
    i = Math.min(text.length, Math.floor((elapsed / 1000) * cps));
    // We want the message to render over black/empty; clear every frame
    ctx.clearRect(0,0,c.width,c.height);
    const shown = text.slice(0, i);
    // small fade-in as it types
    const alpha = Math.min(1, i / Math.max(1, text.length*0.5));
    drawDistortedText(shown, alpha, now*0.001);
    if (i < text.length) {
      requestAnimationFrame(frame);
      return;
    }
    if (finishedAt == null) finishedAt = now;
    if (now - finishedAt < 3000) {
      requestAnimationFrame(frame);
    }
  }
  requestAnimationFrame(frame);
};
