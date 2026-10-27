const canvas = document.querySelector('#orbit-canvas');
const context = canvas.getContext('2d');
const button = document.querySelector('#toggle-motion');
let running = true;
let angle = 0;

function render() {
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.beginPath();
  context.arc(360 + Math.cos(angle) * 110, 180 + Math.sin(angle) * 70, 16, 0, Math.PI * 2);
  context.fillStyle = '#8b5cf6';
  context.fill();
  if (running) angle += 0.025;
  requestAnimationFrame(render); // BUG: frame identifier is not stored/cancelled.
}

window.addEventListener('resize', () => {
  canvas.width = Math.min(window.innerWidth - 32, 720);
}); // BUG: listener is never removed.

button.addEventListener('click', () => {
  running = !running;
  button.innerHTML = running ? 'Pause motion' : 'Resume motion'; // Prefer textContent for dynamic text.
});

render();
