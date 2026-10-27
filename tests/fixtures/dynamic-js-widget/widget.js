const items = [
  { name: 'Alpha', votes: 3 },
  { name: 'Beta', votes: 5 },
  { name: '<b>Gamma</b>', votes: 1 },
];
const app = document.getElementById('app');
app.innerHTML = '<div class="widget"><h2>Live poll</h2><ul class="list"></ul><p class="clock"></p></div>';
const list = app.querySelector('.list');

function renderList() {
  list.innerHTML = items
    .map((item, i) => '<li><span>' + item.name + '</span> <b>' + item.votes + '</b> <div class="vote" data-i="' + i + '">+1</div></li>')
    .join('');
}

document.addEventListener('click', (event) => {
  if (event.target.classList.contains('vote')) {
    items[event.target.dataset.i].votes += 1;
    renderList();
  }
});

setInterval(() => {
  app.querySelector('.clock').innerHTML = 'Updated ' + new Date().toLocaleTimeString();
}, 1000);

renderList();
