window.setupControls = function(system) {
  let leftDown = false;
  let prevX = 0, prevY = 0;
  let theta = 0, phi = 0;

  // Derive initial spherical coords from current camera position
  const cam = system.camera;
  const len = Math.hypot(cam.position.x, cam.position.y, cam.position.z);
  let radius = len > 0 ? len : 60;
  const maxRadius = radius; // keep current default as max zoom-out
  const minRadius = 2;      // allow zooming essentially to the center

  const syncAnglesFromCamera = () => {
    const c = system.camera.position;
    const r = Math.hypot(c.x, c.y, c.z) || 1;
    theta = Math.atan2(c.x, c.z); // yaw around Y
    // elevation from equator; clamp to avoid gimbal lock
    phi = Math.max(-Math.PI/2, Math.min(Math.PI/2, Math.asin(c.y / r)));
  };

  const updateCamera = () => {
    // place camera on sphere of radius using angles
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

  // Mouse wheel zoom: wheel up -> zoom in, wheel down -> zoom out (to default only)
  // Use non-passive to allow preventDefault and avoid page scroll
  system.canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dy = e.deltaY || 0;
    if (dy === 0) return;
    // Scale radius multiplicatively for smoothness
    const factor = dy < 0 ? 0.9 : 1.1; // up: in, down: out
    radius *= factor;
    radius = Math.max(minRadius, Math.min(maxRadius, radius));
    updateCamera();
  }, { passive: false });
}
