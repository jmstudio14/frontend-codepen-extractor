const images = [
  'https://picsum.photos/id/10/300/200',
  'https://picsum.photos/id/20/300/200',
  'https://picsum.photos/id/30/300/200',
];
const order = _.shuffle([0, 1, 2]);
let index = 0;
const img = document.querySelector('.gallery img');
const caption = document.querySelector('.caption');

function show() {
  img.src = images[order[index]];
  caption.innerHTML = _.capitalize('image ' + (index + 1) + ' of ' + images.length);
}

document.querySelector('.next').addEventListener('click', () => {
  index = (index + 1) % images.length;
  show();
});

show();
