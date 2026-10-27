const images = ['assets/photo-1.svg', 'assets/photo-2.svg', 'assets/photo-3.svg'];
const order = images.map((_, i) => i).sort(() => Math.random() - 0.5);
let index = 0;
const img = document.querySelector('.gallery img');
const caption = document.querySelector('.caption');

function show() {
  const imageNumber = order[index] + 1;
  img.src = images[order[index]];
  img.alt = 'Photo ' + imageNumber + ' of the gallery';
  caption.textContent = 'Image ' + (index + 1) + ' of ' + images.length;
}

document.querySelector('.next').addEventListener('click', () => {
  index = (index + 1) % images.length;
  show();
});

show();
