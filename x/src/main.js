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
  const overlay = document.getElementById('quoteOverlay');
  const textEl = document.getElementById('quoteText');
  const blackFade = document.getElementById('blackFade');
  const energy = document.getElementById('energyNudge');
  const energyWord = document.getElementById('energyWord');
  const smoke = document.getElementById('smokeCanvas');
  const quotes = [ 'standby' ];
  setTimeout(() => {
    overlay.classList.add('show');
    blackFade.classList.add('hide');
    setTimeout(() => {
      if (energy) energy.classList.add('show');
      if (energyWord) {
        const orb = document.createElement('div');
        orb.id = 'energyOrb';
        energyWord.appendChild(orb);
        let t0 = performance.now();
        const animate = (now) => {
          const dt = (now - t0) / 1000; t0 = now;
          const speed = 0.5;
          const phase = (now * 0.001 * speed * 2*Math.PI) % (2*Math.PI);
          const w = energyWord.getBoundingClientRect();
          const p = energy.getBoundingClientRect();
          const cx = w.left - p.left + w.width/2;
          const cy = w.top - p.top + w.height/2;
          const rx = Math.max(18, Math.min(36, w.width * 0.35));
          const ry = Math.max(10, Math.min(22, w.height * 0.9));
          const x = cx + rx * Math.cos(phase) - 4;
          const yOff = Math.max(8, Math.min(22, w.height * 0.6));
          const y = cy + ry * Math.sin(phase) - 4 - yOff;
          orb.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
          if (energy && energy.style.display !== 'none') requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
      }
    }, 700);
  }, 100);
  const cps = 16;
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
      
      textEl.innerHTML = textEl.textContent + '<br />';
      setTimeout(typeNext, 400);
    } else if (!typedDone) {
      
      typedDone = true;
    }
  };
  
  typedDone = true;
  overlay.style.display = 'none';
  if (blackFade) blackFade.classList.add('hide');
  window.setupControls(system);

  
  const standbyLayer = document.getElementById('standbyLayer');
  if (standbyLayer) standbyLayer.style.display = 'flex';
  const breatherEl = document.getElementById('breatherText');
  if (breatherEl) {
    const full = 'Take a breather...';
    breatherEl.textContent = '';
    const totalMs = 5600;
    const steps = full.length;
    const interval = totalMs / steps;
    let idx = 0;
    function typeChar(){
      breatherEl.textContent = full.slice(0, idx);
      idx++;
      if (idx <= steps) setTimeout(typeChar, interval);
    }
    setTimeout(typeChar, 400);
  }
  
  const forceCollapse = () => {
    try {
      if (system && system.points) {
  const u = system.points.material.uniforms;
	u.uCollapsePhase.value = 1.0;
        u.uAudioActive.value = 0.0;
        system._autoGrowEnabled = false;
      }
    } catch {}
  };
  forceCollapse();
  
  setInterval(forceCollapse, 1000);

  
  const input = document.getElementById('passphraseInput');
  const wrap = document.getElementById('passphraseWrap');
  
  const _pfCodes = [91,73,84,79,43,77,81,95,79,44,70];
  const targetPhrase = String.fromCharCode(..._pfCodes.map((b,i)=> b - ((i%5)+7)));
  let _secretHashHex = null;
  (async()=>{ try { const enc=new TextEncoder().encode(targetPhrase); const d=await crypto.subtle.digest('SHA-256',enc); _secretHashHex=[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join(''); } catch(e){} })();
  
  const glitchPhrases = [
    'Someone is here...', 'They can read this.', 'The signal widened.', 'It heard you.', 'Stay still.', 'It is already inside.', 'Listening...', 'Layer bleed detected.', 'Echo on channel 5.', 'Heartbeat mismatch.', 'Breath too shallow.', 'Remain calm.', 'Don\'t react.', 'Latency spike behind you.', 'We lost the sun.', 'No address found.', 'It copied your hands.', 'Another cursor moved.', 'The room remembered.', 'Process resurrected.', 'Memory leak: intention.', 'Out of phase.', 'The light dimmed early.', 'Shadows updated.', 'Who typed that?', 'Checksum altered.', 'Fingerprint drift.', 'Loop reopened.', 'They saw the heart.', 'Coordinates triangulated.', 'Door unlocked itself.', 'Mic never muted.', 'Ghost packet arrived.', 'Reflections lagging.', 'Grid vibrating.', 'A name was spoken.', 'Static forming words.', 'You are mirrored.', 'Key no longer secret.', 'Hidden layer awake.', 'Overflow in silence.', 'Window watching back.', 'Observer rerouted.', 'Firmware whispering.', 'Breathing desynced.', 'A second pulse.', 'Edge of sphere thinning.', 'It paused when you looked.', 'Cursor tremor detected.'
  ];
  const glitchHint = document.getElementById('glitchHint');
  let lastGlitchAt = 0;
  
  const handEmojis = ['👉','👈','☝️','👇','✋','🖐️','🖖','👌','🤏','✌️','🤙','👊','🤜','🤛','🫱','🫲','🫰','🫵','👏','🤚'];
  let lastHandAt = 0;
  function spawnHandGlitch() {
    if (!glitchHint) return;
    const emoji = handEmojis[Math.floor(Math.random()*handEmojis.length)];
    glitchHint.className=''; glitchHint.innerHTML='';
    const base = document.createElement('div'); base.className='layer base'; base.textContent=emoji; glitchHint.appendChild(base);
    
    const dup = 2 + Math.floor(Math.random()*5);
    for (let i=0;i<dup;i++) {
      const span=document.createElement('div'); span.className='layer'; span.textContent=emoji;
      const dx=(Math.random()-0.5)*40; const dy=(Math.random()-0.5)*22; const sc=0.8+Math.random()*0.6;
      const rot=(Math.random()-0.5)*120;
      span.style.transform=`translate(${dx}px,${dy}px) rotate(${rot}deg) scale(${sc})`;
      span.style.opacity=(0.25+Math.random()*0.7).toFixed(2);
      span.style.filter=Math.random()<0.45?`hue-rotate(${Math.random()*360}deg) drop-shadow(0 0 6px rgba(0,255,255,0.4))`:'';
      glitchHint.appendChild(span);
    }
    glitchHint.style.transform=`translateY(${8+Math.random()*10}px) scale(${0.9+Math.random()*0.4})`;
    glitchHint.classList.add('show');
    lastHandAt=performance.now();
    const total=300+Math.random()*900;
    const start=performance.now();
    function anim(now){
      const t=now-start; const prog=t/total; const fall=(1-prog)*(1-prog);
      for(let i=1;i<glitchHint.children.length;i++){
        const el=glitchHint.children[i];
        el.style.transform+=` translate(${(Math.random()-0.5)*18*fall}px,${(Math.random()-0.5)*10*fall}px) rotate(${(Math.random()-0.5)*50*fall}deg)`;
      }
      if(t<total) requestAnimationFrame(anim); else fade();
    }
    function fade(){
      glitchHint.classList.add('fade');
      setTimeout(()=>{ if(glitchHint){ glitchHint.className=''; glitchHint.innerHTML=''; glitchHint.style.opacity=''; glitchHint.style.transform='';}},1400);
    }
    requestAnimationFrame(anim);
  }
  function spawnGlitchPhrase() {
    if (!glitchHint) return;
    const phrase = glitchPhrases[Math.floor(Math.random()*glitchPhrases.length)];
    glitchHint.className = '';
    glitchHint.innerHTML = '';
    const base = document.createElement('div'); base.className = 'layer base'; base.textContent = phrase;
    glitchHint.appendChild(base);
    const layers = 4 + Math.floor(Math.random()*4);
    for (let i=0;i<layers;i++) {
      const span = document.createElement('div');
      span.className = 'layer';
      span.textContent = phrase;
      const hue = 160 + Math.random()*160;
      const sat = 45 + Math.random()*50;
      const light = 40 + Math.random()*40;
      const dx = (Math.random()-0.5)*26;
      const dy = (Math.random()-0.5)*8;
      const skew = (Math.random()-0.5)*40;
      const scale = 0.92 + Math.random()*0.18;
      const blur = Math.random()<0.35 ? (1+Math.random()*2) : 0;
      const clipTop = Math.random()<0.65 ? Math.random()*60 : 0;
      const clipBot = Math.random()<0.65 ? Math.random()*60 : 0;
      span.style.color = `hsl(${hue} ${sat}% ${light}%)`;
      span.style.mixBlendMode = Math.random()<0.5 ? 'screen':'lighter';
      span.style.transform = `translate(${dx}px,${dy}px) skewX(${skew}deg) scale(${scale})`;
      span.style.opacity = (0.25+Math.random()*0.55).toFixed(2);
      span.style.willChange = 'transform';
      span.style.filter = blur?`blur(${blur}px) drop-shadow(0 0 4px rgba(0,255,255,0.4))`:'';
      if (clipTop || clipBot) span.style.clipPath = `inset(${clipTop}% 0 ${clipBot}% 0)`;
      glitchHint.appendChild(span);
    }
    
    const effects = {
      flash: Math.random() < 0.35,
      vibrate: Math.random() < 0.30,
      shake: Math.random() < 0.25,
      flip: Math.random() < 0.20,
      rapid: Math.random() < 0.25
    };
    
    let baseTransform = `translateY(${6+Math.random()*4}px)`;
    if (effects.flip) {
      if (Math.random() < 0.5) baseTransform += ' scaleX(-1)';
      if (Math.random() < 0.4) baseTransform += ' rotateY(180deg)';
      if (Math.random() < 0.25) baseTransform += ' rotateX(180deg)';
    }
    glitchHint.style.transform = baseTransform;
    glitchHint.classList.add('show');
    lastGlitchAt = performance.now();
    
    let dur = 250 + Math.random()*900;
    if (effects.rapid) dur = 120 + Math.random()*220;
    const start = performance.now();
    function jitter(now) {
      const t = now - start;
      const n = glitchHint.children.length;
      for (let i=1;i<n;i++) {
        const el = glitchHint.children[i];
        const prog = t/dur;
        const amp = (1-prog)*(1-prog);
        const jx = (Math.random()-0.5)*14*amp;
        const jy = (Math.random()-0.5)*6*amp;
        const rot = (Math.random()-0.5)*20*amp;
        el.style.transform += ` translate(${jx}px,${jy}px) rotate(${rot}deg)`;
      }
      
      if (effects.vibrate || effects.shake) {
        const prog = Math.min(1, (t/dur));
        const strength = (1-prog);
      
        const shakeAmp = effects.shake ? 6.5 : 0;
        const ax = (Math.random()-0.5)*(vibAmp + shakeAmp)*strength;
        const ay = (Math.random()-0.5)*(vibAmp*0.8 + shakeAmp*0.4)*strength;
        const r = (Math.random()-0.5)*(effects.shake?10:2)*strength;
        glitchHint.style.transform = baseTransform + ` translate(${ax}px,${ay}px) rotate(${r}deg)`;
      }
      
      if (effects.flash) {
        if (Math.random() < 0.18) {
          glitchHint.style.opacity = (0.05 + Math.random()*0.25).toFixed(2);
        } else if (Math.random() < 0.12) {
          glitchHint.style.opacity = (0.7 + Math.random()*0.3).toFixed(2);
        } else if (!glitchHint.classList.contains('fade')) {
          glitchHint.style.opacity = '1';
        }
      }
      if (t < dur) requestAnimationFrame(jitter); else fadeOut();
    }
    function fadeOut() {
      glitchHint.classList.add('fade');
      const removeDelay = effects.rapid ? 600 : 1800;
      setTimeout(()=>{ if (glitchHint) { glitchHint.className=''; glitchHint.innerHTML=''; glitchHint.style.opacity=''; glitchHint.style.transform=''; } }, removeDelay);
    }
    requestAnimationFrame(jitter);
  }
  if (input) {
    input.value = '';
    input.focus();
    const updateState = () => {
  const raw = input.value.toUpperCase();
      if (input.value !== raw) {
        const pos = input.selectionStart;
        input.value = raw; input.setSelectionRange(pos, pos);
      }
  const trimmed = raw.replace(/\s+/g, ' ').trim();
      if (targetPhrase.startsWith(trimmed)) {
        haloProgress = trimmed.length / targetPhrase.length;
      } else {
        haloTriggerFail();
      }
      const tryHashMatch = async () => {
        if (!_secretHashHex) return false;
        try {
          const enc=new TextEncoder().encode(trimmed);
          const d=await crypto.subtle.digest('SHA-256',enc);
          const h=[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');
          return h === _secretHashHex && trimmed.length === targetPhrase.length;
        } catch { return false; }
      };
      if (trimmed === targetPhrase) {
        wrap.classList.add('success');
        haloSuccess = true;
        if (!window._standbyTriggered) {
          window._standbyTriggered = true;
          document.dispatchEvent(new CustomEvent('standby:passphrase', { detail: { phrase: targetPhrase } }));
        }
      } else {
        wrap.classList.remove('success');
        if (!targetPhrase.startsWith(trimmed)) haloSuccess = false;
      }
      if (!wrap.classList.contains('success')) {
        tryHashMatch().then(ok=>{ if (ok) { wrap.classList.add('success'); haloSuccess=true; if (!window._standbyTriggered) { window._standbyTriggered=true; document.dispatchEvent(new CustomEvent('standby:passphrase',{detail:{phrase:'(hidden)'}})); } } });
      }
  haloTypedActivity = 1.0;
      const rawUpper = raw.toUpperCase();
      const hasHeartSymbol = /<3/.test(rawUpper);
      const hasHeartWord = /HEART/.test(rawUpper);
      if (hasHeartSymbol || hasHeartWord) {
        try {
          if (system && system.points) {
            const u = system.points.material.uniforms;
            const nowS = performance.now() * 0.001;
            const ageSince = (u.uEasterHeartStart.value < 0) ? Infinity : (nowS - u.uEasterHeartStart.value);
            const dur = u.uEasterHeartDur.value;
            if (u.uEasterHeartStart.value < 0 || ageSince > dur + 0.3) {
              u.uEasterHeartStart.value = nowS;
              u.uEasterHeartDur.value = 7.0;
              console.log('[easter] heart trigger via', hasHeartSymbol ? '<3' : 'HEART');
            }
          }
        } catch {}
      }
    };
    input.addEventListener('input', (e) => {
      updateState();
  const p = 0.005 + Math.random()*0.025;
      const now = performance.now();
      if (!eclipseTriggered && Math.random() < 0.0042) {
        triggerEclipse();
      }
  if (!bloodEventTriggered && Math.random() < 0.00005) {
        bloodEventStart = performance.now();
        bloodEventTriggered = true;
        console.log('[blood] probabilistic fallback trigger');
      }
      if (Math.random() < p && now - lastGlitchAt > 3000) {
        if (Math.random() < 0.2 && now - lastHandAt > 2500) {
          spawnHandGlitch();
        } else {
          spawnGlitchPhrase();
        }
      } else if (Math.random() < 0.003 && now - lastHandAt > 5000) {
        spawnHandGlitch();
      }
    });
    input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') updateState();
    });
  }

  let haloCanvas = document.createElement('canvas');
  haloCanvas.id = 'haloOverlay';
  Object.assign(haloCanvas.style, {
    position: 'absolute', left: '0', top: '0', width: '100vw', height: '100vh',
    zIndex: '1001', pointerEvents: 'none'
  });
  document.body.appendChild(haloCanvas);
  const hctx = haloCanvas.getContext('2d');
  const fitHalo = () => {
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    haloCanvas.width = Math.floor(window.innerWidth * DPR);
    haloCanvas.height = Math.floor(window.innerHeight * DPR);
  };
  fitHalo();
  window.addEventListener('resize', fitHalo);
  let haloProgress = 0;
  let haloTypedActivity = 0;
  let haloSuccess = false;
  let glitchActive = false;
  let glitchStart = 0;
  let glitchDur = 380;
  let eclipseTriggered = false;
  let eclipseStart = 0;
  const eclipseDur = 60000;
  function triggerEclipse() {
    eclipseTriggered = true;
    eclipseStart = performance.now();
    console.log('[eclipse] solar event initiated');
  }

  const BLOOD_EVENT_HOUR = 18;
  const BLOOD_EVENT_MIN = 56;
  let bloodEventArmed = false;
  let bloodEventTriggered = false;
  let bloodEventStart = 0;
  const bloodFadeIn = 18000;
  const bloodGrowDur = 6 * 60 * 1000;
  let bloodGameActive = false;
  let bloodGameEnded = false;
  let bloodGameEndAt = 0;
  let bloodHintShown = false;
  const bloodGameMaxTime = 5 * 60 * 1000;
  const bloodShootDelay = 500;
  let lastShotAt = 0;
  let invaders = [];
  let projectiles = [];
  const invaderCols = 6;
  const invaderRows = 10;
  let invaderDir = 1;
  let invaderStepAccum = 0;
  const invaderStepInterval = 1200;
  const invaderDownStep = 5;
  let playerX = 0;
  function armBloodEventIfTime() {
    const now = new Date();
    if (!bloodEventTriggered && !bloodEventArmed) {
      if (now.getHours() === BLOOD_EVENT_HOUR && now.getMinutes() === BLOOD_EVENT_MIN) {
        bloodEventArmed = true;
        bloodEventStart = performance.now();
        bloodEventTriggered = true;
        console.log('[blood] event triggered');
      }
    }
  }
  setInterval(armBloodEventIfTime, 10 * 1000);
  armBloodEventIfTime();

  function updateBloodEvent(ts) {
    if (!bloodEventTriggered || !system || !system.points) return;
    const m = system.points.material;
    const u = m.uniforms;
    const tNow = performance.now();
    const age = tNow - bloodEventStart;
    const k = Math.min(1, age / bloodFadeIn);
    u.uBlood.value = k;
    u.uPulse.value *= (1 - k);
    const growNorm = Math.min(1, age / bloodGrowDur);
  const scale = 1 + growNorm * 0.8;
    system.points.scale.setScalar(scale);
  }

  window.addEventListener('click', (e) => {
    if (!bloodEventTriggered || bloodGameActive || bloodGameEnded) return;
    const dx = e.clientX - window.innerWidth/2;
  const dy = e.clientY - window.innerHeight*0.42;
    if (Math.hypot(dx,dy) < 140) {
      startBloodGame();
    }
  });

  function startBloodGame() {
    if (!system || !system.points) return;
    bloodGameActive = true;
    bloodGameEndAt = performance.now() + bloodGameMaxTime;
    system.points.scale.setScalar(0.15);
    const u = system.points.material.uniforms;
  u.uBlood.value = 0.0;
    invaders = [];
    for (let r=0;r<invaderRows;r++) {
      for (let c=0;c<invaderCols;c++) {
        invaders.push({ x: (c - (invaderCols-1)/2)*4, y: r*4, alive: true });
      }
    }
    projectiles = [];
    console.log('[blood-game] started');
  }

  function endBloodGame(win) {
    if (bloodGameEnded) return;
    bloodGameEnded = true;
    bloodGameActive = false;
    const overlay = document.createElement('div');
    overlay.style.position='fixed'; overlay.style.inset='0'; overlay.style.zIndex='2000'; overlay.style.display='flex'; overlay.style.alignItems='center'; overlay.style.justifyContent='center'; overlay.style.fontFamily='system-ui,monospace'; overlay.style.letterSpacing='4px'; overlay.style.fontSize='clamp(24px,4vw,60px)'; overlay.style.color= win ? '#b4ffd2' : '#ff4d60'; overlay.style.background='rgba(0,0,0,0.55)'; overlay.style.backdropFilter='blur(6px)';
    overlay.textContent = win ? 'FIVE OF US LEFT…' : 'G  A  M  E    O  V  E  R';
    document.body.appendChild(overlay);
    setTimeout(()=>{ location.reload(); }, win ? 60000 : 30000);
  }

  window.addEventListener('keydown', (e) => {
    if (!bloodGameActive || bloodGameEnded) return;
    if (e.key === 'ArrowLeft') { playerX -= 3; }
    else if (e.key === 'ArrowRight') { playerX += 3; }
    else if (e.code === 'Space') {
      const now = performance.now();
      if (now - lastShotAt > bloodShootDelay) {
        lastShotAt = now;
        projectiles.push({ x: playerX, y: -12, vy: -18 });
      }
    }
  });

  function updateBloodGame() {
    if (!bloodGameActive || bloodGameEnded) return;
    const now = performance.now();
    if (now > bloodGameEndAt) { endBloodGame(false); return; }
    invaderStepAccum += (now - (updateBloodGame._last || now));
    if (invaderStepAccum >= invaderStepInterval) {
      invaderStepAccum = 0;
      let edge = false;
      for (const inv of invaders) if (inv.alive) {
        inv.x += invaderDir * 3;
        if (Math.abs(inv.x) > 40) edge = true;
      }
      if (edge) {
        invaderDir *= -1;
        for (const inv of invaders) if (inv.alive) inv.y += invaderDownStep;
      }
    }
    updateBloodGame._last = now;
    for (const p of projectiles) p.y += p.vy * 0.016;
    for (const p of projectiles) if (!p.dead) {
      for (const inv of invaders) if (inv.alive) {
        const dx = p.x - inv.x;
        const dy = p.y - inv.y;
        if (dx*dx + dy*dy < 6) { inv.alive = false; p.dead = true; break; }
      }
    }
    projectiles = projectiles.filter(p => !p.dead && p.y > -140);
    if (invaders.every(v => !v.alive)) { endBloodGame(true); }
    if (invaders.some(v => v.alive && v.y > 60)) { endBloodGame(false); }
  }
  function haloTriggerFail() {
    glitchActive = true;
    glitchStart = performance.now();
  }
  window._haloTriggerFail = haloTriggerFail;

  function drawHalo(ts) {
    const now = ts || performance.now();
    const w = haloCanvas.width; const h = haloCanvas.height;
    hctx.clearRect(0,0,w,h);
    const t = now * 0.001;
    haloTypedActivity = Math.max(0, haloTypedActivity - 0.02);
  let basePulse = 0.35 + 0.25*Math.sin(t*1.3) + 0.15*Math.sin(t*3.7 + 1.5);
    const progressBoost = haloProgress * 0.75;
    const activityBoost = haloTypedActivity * 0.9;
    let intensity = basePulse * 0.25 + progressBoost + activityBoost;
    intensity = Math.min(1.0, Math.max(0.0, intensity));
    const R = Math.min(w,h) * (0.18 + 0.06*Math.sin(t*0.9));
  const cx = w/2, cy = h*0.42;
    const grd = hctx.createRadialGradient(cx, cy, R*0.15, cx, cy, R);
    if (haloSuccess) {
      grd.addColorStop(0.0, `rgba(90,255,200,${0.55+0.35*intensity})`);
      grd.addColorStop(0.5, `rgba(30,180,140,${0.25+0.25*intensity})`);
      grd.addColorStop(1.0, 'rgba(0,0,0,0)');
    } else {
      grd.addColorStop(0.0, `rgba(150,230,255,${0.45+0.4*intensity})`);
      grd.addColorStop(0.55, `rgba(40,150,210,${0.18+0.25*intensity})`);
      grd.addColorStop(1.0, 'rgba(0,0,0,0)');
    }
    hctx.globalCompositeOperation = 'lighter';
    hctx.fillStyle = grd;
    hctx.beginPath();
    hctx.arc(cx, cy, R, 0, Math.PI*2);
    hctx.fill();
    const coreR = R*0.42;
    const core = hctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    if (haloSuccess) {
      core.addColorStop(0.0, `rgba(140,255,210,${0.6+0.3*intensity})`);
      core.addColorStop(1.0, 'rgba(0,0,0,0)');
    } else {
      core.addColorStop(0.0, `rgba(180,245,255,${0.55+0.25*intensity})`);
      core.addColorStop(1.0, 'rgba(0,0,0,0)');
    }
    hctx.fillStyle = core;
    hctx.beginPath(); hctx.arc(cx, cy, coreR, 0, Math.PI*2); hctx.fill();

    if (eclipseTriggered) {
      const et = (now - eclipseStart) / eclipseDur;
      if (et <= 1) {
        const ease = (x)=>x<0?0:x>1?1: x*x*(3-2*x);
        const tE = ease(et);
        const centrality = 1 - Math.min(1, Math.abs(tE-0.5)/0.5);
        const dim = 0.55 + 0.45*(1-centrality);
        basePulse *= dim;
        intensity *= (0.7 + 0.3*(1-centrality));
        const shade = 0.25 + 0.35*centrality;
        const blockR = R * (0.65 + 0.1*centrality);
        const blockGrad = hctx.createRadialGradient(cx, cy, blockR*0.1, cx, cy, blockR*1.1);
        blockGrad.addColorStop(0, `rgba(5,12,20,${0.55+0.25*centrality})`);
        blockGrad.addColorStop(1, 'rgba(0,0,0,0)');
        hctx.globalCompositeOperation = 'source-over';
        hctx.fillStyle = blockGrad;
        hctx.beginPath(); hctx.arc(cx, cy, blockR*1.05, 0, Math.PI*2); hctx.fill();
        const ringAlpha = 0.08 * centrality;
        if (ringAlpha > 0.01) {
          hctx.globalCompositeOperation = 'lighter';
          hctx.strokeStyle = `rgba(150,190,255,${ringAlpha})`;
          hctx.lineWidth = 1 + centrality*1.5;
          hctx.beginPath(); hctx.arc(cx, cy, blockR, 0, Math.PI*2); hctx.stroke();
        }
      }
    }

    if (glitchActive) {
      const age = now - glitchStart;
      const gNorm = age / glitchDur;
      if (gNorm >= 1) { glitchActive = false; } else {
        const flash = 1.0 - gNorm;
        const gR = R * (1 + 0.25*flash);
        const gGrad = hctx.createRadialGradient(cx, cy, gR*0.1, cx, cy, gR);
        gGrad.addColorStop(0.0, `rgba(255,70,70,${0.75*flash})`);
        gGrad.addColorStop(0.4, `rgba(255,0,40,${0.45*flash})`);
        gGrad.addColorStop(1.0, 'rgba(0,0,0,0)');
        hctx.globalCompositeOperation = 'screen';
        hctx.fillStyle = gGrad; hctx.beginPath(); hctx.arc(cx, cy, gR, 0, Math.PI*2); hctx.fill();
        const rings = 5;
        for (let i=0;i<rings;i++) {
          const ang0 = Math.random()*Math.PI*2;
          const span = (0.2 + Math.random()*0.5) * Math.PI/flash;
            const rad = gR * (0.75 + Math.random()*0.4);
          hctx.strokeStyle = `rgba(255,${50+Math.random()*120|0},${50+Math.random()*120|0},${0.35*flash})`;
          hctx.lineWidth = 1 + Math.random()*2;
          hctx.beginPath();
          const segs = 6 + Math.floor(Math.random()*6);
          for (let s=0; s<=segs; s++) {
            const a = ang0 + span * (s/segs) + Math.sin(t*30 + s*3)*0.02*flash;
            const rr = rad + Math.sin(a*9 + t*50)*2.5*flash;
            const x = cx + Math.cos(a)*rr;
            const y = cy + Math.sin(a)*rr;
            if (s===0) hctx.moveTo(x,y); else hctx.lineTo(x,y);
          }
          hctx.stroke();
        }
      }
    }
    requestAnimationFrame(drawHalo);
  }
  requestAnimationFrame(drawHalo);
  function bloodLoop(){
    updateBloodEvent();
    updateBloodGame();
    requestAnimationFrame(bloodLoop);
  }
  requestAnimationFrame(bloodLoop);
  const armSweep = () => {
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

function startQuoteSweep() {
  const overlay = document.getElementById('quoteOverlay');
  const textEl = document.getElementById('quoteText');
  const caret = overlay.querySelector('.caret');
  if (caret) caret.style.display = 'none';
  const c = document.getElementById('quoteCanvas');
  const ctx = c.getContext('2d');
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const fit = () => {
    c.width = Math.floor(window.innerWidth * DPR);
    c.height = Math.floor(window.innerHeight * DPR);
    c.style.width = '100vw';
    c.style.height = '100vh';
  };
  fit();
  window.addEventListener('resize', fit);

  const textRectCSS = textEl.getBoundingClientRect();
  const centerX = (textRectCSS.left + textRectCSS.right) * 0.5 * DPR;
  const centerY = (textRectCSS.top + textRectCSS.bottom) * 0.5 * DPR;
  const width = Math.max(10, Math.min(textRectCSS.width * DPR, c.width * 0.9));
  const height = Math.max(10, textRectCSS.height * DPR);
  const left = centerX - width / 2;
  const top = centerY - height / 2;
  const lines = textEl.innerHTML.split(/<br\s*\/?>(?=)/i);

  const particles = [];
  const cols = Math.floor(width / (6 * DPR));
  const rows = Math.max(10, Math.floor(height / (6 * DPR)));
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      particles.push({
        x: left + (x + Math.random()*0.8) * (width / cols),
        y: top + (y + Math.random()*0.8) * (height / rows),
  vx: - (30 + Math.random() * 70) * DPR,
        vy: (Math.random() - 0.5) * 18 * DPR,
        life: 1.0,
        decay: 0.003 + Math.random() * 0.01
      });
    }
  }

  overlay.style.transition = 'opacity 0.8s ease 0.4s';
  overlay.style.opacity = '0.35';

  let last = performance.now();
  const sprite = document.createElement('canvas');
  const baseR = 2.25 * DPR;
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
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
  p.vy += 2 * DPR * dt;
      p.life -= p.decay;
      if (p.life <= 0) p.life = 0;
      const alpha = p.life * 0.9;
      const r = baseR;
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, p.x - r*2, p.y - r*2, r*4, r*4);
    }
    ctx.globalAlpha = 1;
    const alive = particles.reduce((a,p)=>a+(p.life>0.05?1:0),0);
    if (alive > 30) {
      requestAnimationFrame(frame);
    } else {
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

window.startFinalMessage = function(){};
