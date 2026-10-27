function createPollWidget(app) {
  const items = [
    { name: 'Alpha', votes: 3 },
    { name: 'Beta', votes: 5 },
    { name: '<b>Gamma</b>', votes: 1 },
  ];
  const root = document.createElement('div');
  root.className = 'widget';
  const title = document.createElement('h2');
  title.textContent = 'Live poll';
  const list = document.createElement('ul');
  list.className = 'list';
  const clock = document.createElement('p');
  clock.className = 'clock';
  clock.setAttribute('aria-live', 'polite');
  root.append(title, list, clock);
  app.append(root);

  function renderList() {
    list.replaceChildren(...items.map((item, i) => {
      const row = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = item.name;
      const votes = document.createElement('b');
      votes.textContent = String(item.votes);
      const vote = document.createElement('button');
      vote.type = 'button';
      vote.className = 'vote';
      vote.dataset.i = String(i);
      vote.textContent = '+1';
      vote.setAttribute('aria-label', 'Vote for ' + item.name);
      row.append(name, votes, vote);
      return row;
    }));
  }

  function onClick(event) {
    const vote = event.target.closest('.vote');
    if (!vote || !root.contains(vote)) return;
    items[Number(vote.dataset.i)].votes += 1;
    renderList();
  }

  document.addEventListener('click', onClick);
  const timer = setInterval(() => {
    clock.textContent = 'Updated ' + new Date().toLocaleTimeString();
  }, 1000);
  renderList();

  return {
    destroy() {
      clearInterval(timer);
      document.removeEventListener('click', onClick);
      root.remove();
    },
  };
}

window.pollWidget = createPollWidget(document.getElementById('app'));
