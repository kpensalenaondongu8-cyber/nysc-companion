/* Shared by every page: remembers who is logged in and talks to the backend. */

const Session = {
  // "Keep me signed in" -> localStorage (survives closing the browser).
  // Otherwise sessionStorage (cleared when the tab closes).
  save(token, user, remember) {
    this.clear();
    const store = remember ? localStorage : sessionStorage;
    store.setItem('nysc_token', token);
    store.setItem('nysc_user', JSON.stringify(user));
  },
  token() {
    return localStorage.getItem('nysc_token') || sessionStorage.getItem('nysc_token');
  },
  clear() {
    for (const store of [localStorage, sessionStorage]) {
      store.removeItem('nysc_token');
      store.removeItem('nysc_user');
    }
  },
};

// Send a request to the backend and return its JSON answer.
// On a problem it throws an Error whose message is safe to show the user.
async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (Session.token()) headers['Authorization'] = 'Bearer ' + Session.token();

  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new Error('Cannot reach the server. Is it still running?');
  }

  const data = await response.json().catch(() => ({}));

  if (response.status === 401 && !path.endsWith('/login')) {
    // Token missing or expired: back to the login page.
    Session.clear();
    window.location.href = '/login?expired=1';
    throw new Error(data.detail || 'Please log in.');
  }
  if (!response.ok) {
    // FastAPI sends detail as text, or as a list when its own checks fail.
    const detail = Array.isArray(data.detail) ? 'Please check the details you entered.' : data.detail;
    throw new Error(detail || 'Something went wrong. Please try again.');
  }
  return data;
}

// ---------- small helpers used by several pages ----------
const $ = (id) => document.getElementById(id);

// A Nigerian mobile number: 11 digits, starting 07x / 08x / 09x.
const phoneOk = (v) => /^0[789][01]\d{8}$/.test(v.replace(/[\s-]/g, ''));

// Mark a field red (true) or normal (false). Returns the value you passed in.
function setBad(fieldId, bad) {
  $(fieldId).classList.toggle('bad', bad);
  return bad;
}

// Show a message box. kind is 'ok', 'warn' or 'bad'. Pass '' to hide it.
function say(id, message, kind) {
  const box = $(id);
  box.textContent = message;
  box.className = message ? 'notice show ' + kind : 'notice';
}

// The "Show / Hide" buttons beside password boxes.
document.querySelectorAll('.toggle-pw').forEach((button) => {
  button.addEventListener('click', () => {
    const input = $(button.dataset.toggle);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.textContent = show ? 'Hide' : 'Show';
    button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
});

// 77000 -> "₦77,000"   2500.5 -> "₦2,500.5"
const naira = (n) => '₦' + Number(n).toLocaleString('en-NG', { maximumFractionDigits: 2 });

// Put user-typed text into HTML safely (so "<b>" shows as text, not as markup).
function esc(text) {
  const span = document.createElement('span');
  span.textContent = text;
  return span.innerHTML;
}

const NG_STATES = ['Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'];
const HOUSE_TYPES = ['Room', 'Room and parlour', 'Self-contain', 'Mini flat', '2-bedroom flat', '3-bedroom flat', 'Duplex', 'Shared apartment'];

// Fill a <select> with options. Pass a first label (like "Choose state") to add an empty choice.
function fillSelect(id, values, firstLabel) {
  $(id).innerHTML = (firstLabel ? `<option value="">${esc(firstLabel)}</option>` : '') +
    values.map((v) => `<option>${esc(v)}</option>`).join('');
}

// "08030000000" -> "https://wa.me/2348030000000"
const whatsapp = (phone) => 'https://wa.me/234' + phone.replace(/\D/g, '').replace(/^0/, '');
