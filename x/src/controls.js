window.setupControls = function(system) {
  let leftDown = false;
  let prevX = 0, prevY = 0;
  let theta = 0, phi = 0;

  const cam = system.camera;
  const len = Math.hypot(cam.position.x, cam.position.y, cam.position.z);
  let radius = len > 0 ? len : 60;
  const maxRadius = radius;
  const minRadius = 2;

  const syncAnglesFromCamera = () => {
    const c = system.camera.position;
    const r = Math.hypot(c.x, c.y, c.z) || 1;
    theta = Math.atan2(c.x, c.z);
    phi = Math.max(-Math.PI/2, Math.min(Math.PI/2, Math.asin(c.y / r)));
  };

  const updateCamera = () => {
    const x = radius * Math.sin(theta) * Math.cos(phi);
    const y = radius * Math.sin(phi);
    const z = radius * Math.cos(theta) * Math.cos(phi);
    system.camera.position.set(x, y, z);
    system.camera.lookAt(0, 0, 0);
  };

  syncAnglesFromCamera();

  system.canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      leftDown = true;
      prevX = e.clientX;
      prevY = e.clientY;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) leftDown = false;
  });
  window.addEventListener('mousemove', (e) => {
    if (!leftDown) return;
    theta += (e.clientX - prevX) * 0.01;
    phi += (e.clientY - prevY) * 0.01;
    phi = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, phi));
    prevX = e.clientX;
    prevY = e.clientY;
    updateCamera();
  });

  system.canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dy = e.deltaY || 0;
    if (dy === 0) return;
    const factor = dy < 0 ? 0.9 : 1.1;
    radius *= factor;
    radius = Math.max(minRadius, Math.min(maxRadius, radius));
    updateCamera();
  }, { passive: false });
}
