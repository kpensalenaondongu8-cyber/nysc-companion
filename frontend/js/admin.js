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

load();
