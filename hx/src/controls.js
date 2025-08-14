window.setupControls = function(system) {
  let leftDown = false;
  let prevX = 0, prevY = 0;
  let theta = 0, phi = 0;

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
    const r = 100;
    system.camera.position.x = r * Math.sin(theta) * Math.cos(phi);
    system.camera.position.y = r * Math.sin(phi);
    system.camera.position.z = r * Math.cos(theta) * Math.cos(phi);
    system.camera.lookAt(0, 0, 0);
  });
}
