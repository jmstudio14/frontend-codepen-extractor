const card = document.querySelector('.card');
card.querySelector('.follow').addEventListener('click', (event) => {
  event.currentTarget.textContent = 'Following';
});
card.querySelector('.close').addEventListener('click', () => {
  card.remove();
});
