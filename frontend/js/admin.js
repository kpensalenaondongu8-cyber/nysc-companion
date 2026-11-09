/* The admin's Approvals page: /admin
   Agents fill in their details. You call them, then approve or reject.
   Until approved, an agent cannot post houses and corps members cannot see them. */

let status = 'pending';

function agentCard(a) {
  const buttons = {
    pending: `<button class="btn sm" type="button" data-approve="${a.id}">✔ Approve</button>
              <button class="btn danger sm" type="button" data-reject="${a.id}">Reject</button>`,
    approved: `<button class="btn danger sm" type="button" data-reject="${a.id}">Revoke approval</button>`,
    rejected: `<button class="btn sm" type="button" data-approve="${a.id}">Approve anyway</button>`,
  }[a.verification_status];

  return `<article class="card admin-card">
    <div class="head"><h3>${esc(a.name)}</h3><span class="pill">${a.house_count} ${a.house_count === 1 ? 'house' : 'houses'}</span></div>
    <div class="meta">${esc(a.agency)} · ${esc(a.lga)}, ${esc(a.state)}</div>
    <dl>
      <dt>Phone</dt><dd><b class="num">${esc(a.phone)}</b>
        · <a class="link" href="tel:${esc(a.phone)}">Call</a>
        · <a class="link" href="${waLink(a.phone, 'Hello ' + a.name + ', this is the NYSC Companion admin. I am verifying your agent account.')}" target="_blank" rel="noopener">WhatsApp</a></dd>
      <dt>Email</dt><dd>${esc(a.email)}</dd>
      <dt>Office address</dt><dd>${esc(a.office_address)}</dd>
      <dt>About their work</dt><dd>${esc(a.verification_note)}</dd>
      ${a.towns ? `<dt>Covers</dt><dd>${esc(a.towns)}</dd>` : ''}
      <dt>Registered</dt><dd>${when(a.created_at)}</dd>
      ${a.verification_status === 'rejected' && a.reject_reason ? `<dt>Reason given</dt><dd>${esc(a.reject_reason)}</dd>` : ''}
      ${a.reviewed_at ? `<dt>Last decision</dt><dd>${when(a.reviewed_at)}</dd>` : ''}
    </dl>
    <div class="actions">${buttons}</div>
  </article>`;
}

async function load() {
  try {
    const data = await api('GET', '/api/admin/agents?status=' + status);
    for (const s of ['pending', 'approved', 'rejected']) $('n-' + s).textContent = data.counts[s];
    const empty = {
      pending: 'No agents are waiting for approval.',
      approved: 'No approved agents yet.',
      rejected: 'No rejected agents.',
    }[status];
    $('results').innerHTML = data.agents.length ? data.agents.map(agentCard).join('') : `<div class="card empty">${empty}</div>`;
  } catch (err) {
    $('load-error').textContent = err.message;
    $('load-error').hidden = false;
  }
}

$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-status]');
  if (!b) return;
  status = b.dataset.status;
  document.querySelectorAll('#tabs button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  load();
});

$('results').addEventListener('click', async (e) => {
  const approve = e.target.closest('[data-approve]');
  const reject = e.target.closest('[data-reject]');
  try {
    if (approve) {
      if (!confirm('Approve this agent? Corps members will be able to see them and their houses.')) return;
      await api('POST', `/api/admin/agents/${approve.dataset.approve}/approve`);
    } else if (reject) {
      const reason = prompt('Why are you rejecting this agent? The agent will see this message.');
      if (!reason || reason.trim().length < 3) return;
      await api('POST', `/api/admin/agents/${reject.dataset.reject}/reject`, { reason: reason.trim() });
    } else {
      return;
    }
    load();
  } catch (err) {
    alert(err.message);
  }
});

// ---------- hidden noticeboard posts ----------
async function loadReported() {
  try {
    const data = await api('GET', '/api/board/admin/reported');
    $('reported').innerHTML = data.items.length ? data.items.map((i) => `<article class="card admin-card">
      <div class="head"><h3>${esc(i.title)}</h3><span class="pill">${i.reports} ${i.reports === 1 ? 'report' : 'reports'}</span></div>
      <div class="meta">${esc(i.author)}${i.place ? ' · ' + esc(i.place) : ''} · ${esc(i.when)}</div>
      <p style="margin:8px 0;overflow-wrap:anywhere">${esc(i.body)}</p>
      <div class="actions"><button class="btn sm" type="button" data-restore="${i.type}:${i.id}">Bring back</button>
        <button class="btn danger sm" type="button" data-remove="${i.type}:${i.id}">Delete</button></div></article>`).join('')
      : '<div class="card empty">Nothing is hidden.</div>';
  } catch (err) { /* the approvals part still works */ }
}
$('reported').addEventListener('click', async (e) => {
  const r = e.target.closest('[data-restore]');
  const d = e.target.closest('[data-remove]');
  try {
    if (r) {
      const [type, id] = r.dataset.restore.split(':');
      await api('POST', `/api/board/admin/${type}/${id}/restore`);
    } else if (d) {
      if (!confirm('Delete this for good?')) return;
      const [type, id] = d.dataset.remove.split(':');
      await api('DELETE', type === 'post' ? '/api/board/' + id : '/api/board/reply/' + id);
    } else return;
    loadReported();
  } catch (err) { alert(err.message); }
});

$('reset-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('reset-result').hidden = true;
  if (!phoneOk($('reset-phone').value)) { say('reset-notice', 'Enter an 11-digit Nigerian number, like 08030000000.', 'bad'); return; }
  say('reset-notice', '', '');
  try {
    const r = await api('POST', '/api/admin/reset-code', { number: $('reset-phone').value });
    const msg = 'Hello ' + r.name + ', your NYSC Companion reset code is ' + r.code + '. Go to the Forgot password page, enter it with your phone number and a new password. It works once, for ' + r.minutes + ' minutes.';
    $('reset-result').hidden = false;
    $('reset-result').innerHTML = `<p style="margin:0">Code for <b>${esc(r.name)}</b> (${esc(r.role === 'agent' ? 'house agent' : 'corps member')}), valid ${r.minutes} minutes. It will not be shown again.</p>
      <p style="font-size:30px;font-weight:700;letter-spacing:.08em;margin:6px 0" class="num" id="reset-code">${esc(r.code)}</p>
      <a class="link" href="${waLink(r.number, msg)}" target="_blank" rel="noopener">Send on WhatsApp</a>`;
  } catch (err) {
    say('reset-notice', err.message, 'bad');
  }
});

load();
loadReported();
