/* Corpers' board: /board */
let scope = 'lga';
let kind = '';
let kinds = {};
const open = new Set();            // posts whose replies are showing

function say(id, text, kindName) { const el = $(id); el.textContent = text; el.className = 'notice show ' + (kindName || 'bad'); }
function clear(id) { $(id).className = 'notice'; }

function whatsappHref(phone, title) {
  return waLink(phone, 'Hello, I saw your post on the NYSC Companion board: "' + title + '"');
}

function postHtml(p) {
  const isOpen = open.has(p.id);
  const where = scope === 'state' ? ' · ' + esc(p.lga) : '';
  const canClose = p.mine && (p.kind === 'sell' || p.kind === 'wanted');
  return `<article class="post${p.closed ? ' closed' : ''}" data-id="${p.id}">
    <div class="top"><span class="kind ${esc(p.kind)}">${esc(p.kind_label)}</span>${p.closed ? '<span class="done-tag">Done</span>' : ''}</div>
    <h3>${esc(p.title)}</h3>
    ${p.body ? `<p class="text">${esc(p.body)}</p>` : ''}
    <div class="meta">${esc(p.author)}${where} · ${esc(p.when)}</div>
    <div class="acts">
      <button class="btn sm ghost" type="button" data-replies="${p.id}" aria-expanded="${isOpen}">${p.replies ? 'Replies (' + p.replies + ')' : 'Reply'}</button>
      ${p.phone ? `<a class="btn sm" href="${esc(whatsappHref(p.phone, p.title))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
      ${canClose ? `<button class="btn sm ghost" type="button" data-close="${p.id}" data-to="${!p.closed}">${p.closed ? 'Reopen' : 'Mark as done'}</button>` : ''}
      ${p.mine ? `<button class="btn sm danger" type="button" data-del="${p.id}">Delete</button>`
               : `<button class="link-btn" type="button" data-report="${p.id}"${p.reported ? ' disabled' : ''}>${p.reported ? 'Reported' : 'Report'}</button>`}
    </div>
    <div class="replies" id="rep-${p.id}"${isOpen ? '' : ' hidden'}></div>
  </article>`;
}

async function load() {
  let data;
  try {
    data = await api('GET', '/api/board?scope=' + scope + (kind ? '&kind=' + kind : ''));
    $('load-error').hidden = true;
    $('no-ppa').hidden = true;
  } catch (err) {
    if (/Save your PPA/i.test(err.message)) { $('no-ppa').hidden = false; $('board').hidden = true; return; }
    $('load-error').textContent = err.message;
    $('load-error').hidden = false;
    return;
  }
  $('board').hidden = false;
  kinds = data.kinds;
  $('place-line').textContent = scope === 'state' ? 'Corps members in ' + data.place.state : 'Corps members in ' + data.place.lga + ', ' + data.place.state;
  if (!$('n-kind').options.length) {
    $('n-kind').innerHTML = Object.entries(kinds).map(([k, label]) => `<option value="${k}">${esc(label)}</option>`).join('');
  }
  $('kinds').innerHTML = [['', 'All'], ...Object.entries(kinds)].map(([k, label]) =>
    `<button type="button" data-kind="${k}" aria-pressed="${k === kind}">${esc(label)}</button>`).join('');
  $('posts').innerHTML = data.posts.length ? data.posts.map(postHtml).join('')
    : `<div class="empty">${kind ? 'No posts of this kind yet.' : 'Nothing here yet. Be the first to post.'}</div>`;
  for (const id of open) loadReplies(id);
}

async function loadReplies(id) {
  const box = $('rep-' + id);
  if (!box) { open.delete(id); return; }
  try {
    const { replies } = await api('GET', '/api/board/post/' + id);
    box.innerHTML = replies.map((r) => `<div class="reply"><div class="meta"><span class="who">${esc(r.author)}</span><span>${esc(r.when)}</span>
        ${r.mine ? `<button class="link-btn" type="button" data-rdel="${r.id}">Delete</button>`
                 : `<button class="link-btn" type="button" data-rreport="${r.id}"${r.reported ? ' disabled' : ''}>${r.reported ? 'Reported' : 'Report'}</button>`}</div>
        <p>${esc(r.body)}</p></div>`).join('') +
      `<form class="reply-form" data-rform="${id}"><input class="input" maxlength="300" placeholder="Write a reply" aria-label="Your reply"><button class="btn sm" type="submit">Send</button></form>
       <div class="notice" id="rn-${id}" role="status"></div>`;
  } catch (err) { box.innerHTML = '<div class="notice show bad">' + esc(err.message) + '</div>'; }
}

async function run(fn) {
  try { await fn(); } catch (err) { $('load-error').textContent = err.message; $('load-error').hidden = false; return; }
  await load();
}

$('scope').addEventListener('click', (e) => {
  const b = e.target.closest('[data-scope]');
  if (!b) return;
  scope = b.dataset.scope;
  document.querySelectorAll('#scope button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  load();
});
$('kinds').addEventListener('click', (e) => {
  const b = e.target.closest('[data-kind]');
  if (!b) return;
  kind = b.dataset.kind;
  load();
});

$('new-toggle').addEventListener('click', () => {
  const o = $('new-panel').classList.toggle('open');
  $('new-toggle').setAttribute('aria-expanded', String(o));
  if (o) $('n-title').focus();
});

$('post-form').addEventListener('submit', async (e) => {
  e.preventDefault(); clear('n-notice');
  const title = $('n-title').value.trim();
  if (!title) return say('n-notice', 'Give your post a short title.');
  try {
    await api('POST', '/api/board', { kind: $('n-kind').value, title, body: $('n-body').value, show_contact: $('n-contact').checked });
    $('n-title').value = ''; $('n-body').value = ''; $('n-contact').checked = false;
    if (kind && kind !== $('n-kind').value) kind = '';
    scope = 'lga';
    document.querySelectorAll('#scope button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.scope === 'lga')));
    $('new-panel').classList.remove('open');
    $('new-toggle').setAttribute('aria-expanded', 'false');
    await load();
    say('n-notice', 'Posted.', 'ok');
  } catch (err) { say('n-notice', err.message); }
});

$('posts').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.replies) {
    const id = +b.dataset.replies;
    if (open.has(id)) { open.delete(id); $('rep-' + id).hidden = true; b.setAttribute('aria-expanded', 'false'); }
    else { open.add(id); $('rep-' + id).hidden = false; b.setAttribute('aria-expanded', 'true'); loadReplies(id); }
  } else if (b.dataset.close) {
    run(() => api('POST', '/api/board/' + b.dataset.close + '/close', { closed: b.dataset.to === 'true' }));
  } else if (b.dataset.del) {
    if (confirm('Delete this post and its replies?')) { open.delete(+b.dataset.del); run(() => api('DELETE', '/api/board/' + b.dataset.del)); }
  } else if (b.dataset.report) {
    if (confirm('Report this post? Tell us only if it is a scam, rude or not for the board.')) run(() => api('POST', '/api/board/' + b.dataset.report + '/report'));
  } else if (b.dataset.rdel) {
    if (confirm('Delete your reply?')) run(() => api('DELETE', '/api/board/reply/' + b.dataset.rdel));
  } else if (b.dataset.rreport) {
    if (confirm('Report this reply?')) run(() => api('POST', '/api/board/reply/' + b.dataset.rreport + '/report'));
  }
});

$('posts').addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-rform]');
  if (!f) return;
  e.preventDefault();
  const id = f.dataset.rform, input = f.querySelector('input'), text = input.value.trim();
  if (!text) return say('rn-' + id, 'Write your reply.');
  try {
    await api('POST', '/api/board/' + id + '/reply', { body: text });
    await load();
  } catch (err) { say('rn-' + id, err.message); }
});

load();
