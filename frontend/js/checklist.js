/* Service checklist: /checklist */
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const niceDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return d + ' ' + MONTH_NAMES[m - 1] + ' ' + y;
};
const todayIso = () => {
  const n = new Date();
  return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
};
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

function say(id, text, kind) {
  const el = $(id);
  el.textContent = text;
  el.className = 'notice show ' + (kind || 'bad');
}
function clear(id) { $(id).className = 'notice'; }

let editingId = null;

async function load() {
  let c;
  try {
    c = await api('GET', '/api/checklist');
    $('load-error').hidden = true;
  } catch (err) {
    $('load-error').textContent = err.message;
    $('load-error').hidden = false;
    return;
  }
  const { done, total } = c.progress;
  $('pill').textContent = done + ' of ' + total + ' done';
  $('bar').style.width = (total ? Math.round(done / total * 100) : 0) + '%';

  // dates
  $('start').value = c.start_date || '';
  const line = $('dates-line');
  if (c.start_date) {
    const left = daysBetween(todayIso(), c.end_date);
    const when = left > 0 ? left + ' days to go' : left === 0 ? 'ends today' : 'ended ' + (-left) + ' days ago';
    line.innerHTML = 'Started <b>' + esc(niceDate(c.start_date)) + '</b>. Service ends about <b>' + esc(niceDate(c.end_date)) + '</b> (' + when + ').';
  } else {
    line.textContent = 'Enter your start date to see when your service ends and to tick off each month\'s clearance.';
  }

  // monthly clearance
  $('months-wrap').hidden = !c.months.length;
  const nowKey = todayIso().slice(0, 7);
  $('months').innerHTML = c.months.map((m) => {
    const [y, mo] = m.month.split('-');
    return `<button type="button" class="month${m.done ? ' done' : ''}${m.month === nowKey ? ' now' : ''}" data-key="${esc(m.key)}" aria-pressed="${m.done}">${MONTH_NAMES[+mo - 1]}<small>${y}</small></button>`;
  }).join('');

  // stages
  $('stages').innerHTML = c.stages.map((s) => {
    const n = s.items.filter((i) => i.done).length;
    return `<section class="panel stage" aria-labelledby="s-${s.id}">
      <header><h2 id="s-${s.id}">${esc(s.title)}</h2><span class="count">${n} of ${s.items.length}</span></header>
      <div class="body"><ul>${s.items.map((i) => `
        <li><label class="step-row${i.done ? ' done' : ''}">
          <input type="checkbox" data-id="${esc(i.id)}"${i.done ? ' checked' : ''}>
          <span><b>${esc(i.title)}</b><span class="when">${esc(i.when)}</span><span class="note">${esc(i.note)}</span></span>
        </label></li>`).join('')}</ul></div>
    </section>`;
  }).join('');

  // my reminders
  const today = todayIso();
  $('custom-list').innerHTML = c.custom.length ? c.custom.map((r) => {
    if (r.id === editingId) {
      return `<li class="editing" data-eid="${r.id}">
        <div class="edit-box">
          <input class="input" data-f="title" maxlength="80" value="${esc(r.title)}" aria-label="Reminder">
          <input class="input" data-f="due" type="date" value="${esc(r.due || '')}" aria-label="Date">
          <div class="edit-acts"><button type="button" class="btn sm" data-save="${r.id}">Save</button><button type="button" class="btn sm ghost" data-cancel="1">Cancel</button></div>
          <div class="notice" id="e-notice" role="status"></div>
        </div></li>`;
    }
    const late = r.due && !r.done && r.due < today;
    const dueText = r.due ? (late ? 'Was due ' : 'Due ') + niceDate(r.due) : '';
    return `<li class="${r.done ? 'done' : ''}">
      <input type="checkbox" data-cid="${r.id}" aria-label="Done: ${esc(r.title)}"${r.done ? ' checked' : ''}>
      <span class="t">${esc(r.title)}${dueText ? `<span class="d${late ? ' late' : ''}">${esc(dueText)}</span>` : ''}</span>
      <span class="r-acts"><button type="button" class="btn sm ghost" data-edit="${r.id}">Edit</button><button type="button" class="btn sm danger" data-del="${r.id}" data-t="${esc(r.title)}">Delete</button></span></li>`;
  }).join('') : '<li class="empty" style="border:0;display:block;padding:0">Nothing yet. Add anything you must not forget.</li>';
}

async function run(fn) {
  try { await fn(); } catch (err) { $('load-error').textContent = err.message; $('load-error').hidden = false; return; }
  await load();
}

$('start-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clear('start-notice');
  try {
    await api('PUT', '/api/checklist/start', { start_date: $('start').value || null });
    await load();
    say('start-notice', $('start').value ? 'Date saved.' : 'Date cleared.', 'ok');
  } catch (err) { say('start-notice', err.message); }
});

$('months').addEventListener('click', (e) => {
  const b = e.target.closest('.month');
  if (!b) return;
  run(() => api('POST', '/api/checklist/tick', { item_id: b.dataset.key, done: b.getAttribute('aria-pressed') !== 'true' }));
});

$('stages').addEventListener('change', (e) => {
  const id = e.target.dataset.id;
  if (id) run(() => api('POST', '/api/checklist/tick', { item_id: id, done: e.target.checked }));
});

$('custom-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clear('c-notice');
  const title = $('c-title').value.trim();
  if (!title) return say('c-notice', 'Write what you need to remember.');
  try {
    await api('POST', '/api/checklist/custom', { title, due: $('c-due').value || null });
    $('c-title').value = '';
    $('c-due').value = '';
    await load();
  } catch (err) { say('c-notice', err.message); }
});

$('custom-list').addEventListener('change', (e) => {
  const cid = e.target.dataset.cid;
  if (cid) run(() => api('POST', '/api/checklist/custom/' + cid + '/tick', { done: e.target.checked }));
});
$('custom-list').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.del) {
    if (!confirm('Delete this reminder?\n\n' + (b.dataset.t || ''))) return;
    return run(() => api('DELETE', '/api/checklist/custom/' + b.dataset.del));
  }
  if (b.dataset.edit) { editingId = +b.dataset.edit; return load(); }
  if (b.dataset.cancel) { editingId = null; return load(); }
  if (b.dataset.save) {
    const box = b.closest('.edit-box');
    const title = box.querySelector('[data-f=title]').value.trim();
    if (!title) return say('e-notice', 'Write what you need to remember.');
    try {
      await api('PUT', '/api/checklist/custom/' + b.dataset.save, { title, due: box.querySelector('[data-f=due]').value || null });
      editingId = null;
      await load();
    } catch (err) { say('e-notice', err.message); }
  }
});

load();
