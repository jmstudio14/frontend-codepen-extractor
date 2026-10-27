function createOrbitDemo(canvas, button) {
  const context = canvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let running = !reducedMotion.matches;
  let angle = 0;
  let frame = 0;

  function render() {
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.beginPath();
    context.arc(canvas.width / 2 + Math.cos(angle) * 110, canvas.height / 2 + Math.sin(angle) * 70, 16, 0, Math.PI * 2);
    context.fillStyle = '#8b5cf6';
    context.fill();
    if (running) angle += 0.025;
    frame = requestAnimationFrame(render);
  }

  function onResize() {
    canvas.width = Math.min(canvas.parentElement.clientWidth, 720);
  }

  function onToggle() {
    running = !running;
    button.textContent = running ? 'Pause motion' : 'Resume motion';
  }

  window.addEventListener('resize', onResize);
  button.addEventListener('click', onToggle);
  button.textContent = running ? 'Pause motion' : 'Resume motion';
  onResize();
  render();

  return function destroy() {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', onResize);
    button.removeEventListener('click', onToggle);
  };
}

window.orbitDemo = { destroy: createOrbitDemo(document.querySelector('#orbit-canvas'), document.querySelector('#toggle-motion')) };
