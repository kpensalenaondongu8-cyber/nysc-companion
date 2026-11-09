/* Makes the site installable and tells people when they are offline. Loaded by every page.
   - registers the service worker (/sw.js) that saves pages for offline use
   - "Install" bar on the home page (Android/Chrome button; iPhone/Safari shows how to add it)
   - a thin banner when the phone has no connection                                              */
(function () {
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode: fine */ } },
  };
  const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

  // ---------- service worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* not https: no offline mode */ }); });
  }

  // ---------- offline banner ----------
  const style = document.createElement('style');
  style.textContent = `
    .offline-bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 50; background: #3a2c00; color: #fff3c4; text-align: center;
      font: 600 13px/1.4 system-ui, sans-serif; padding: 9px 14px; display: none; }
    .offline-bar.show { display: block; }
    #install-slot:empty { display: none; }
    .install-bar { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; justify-content: space-between;
      background: var(--green-tint, #e8f2ec); border: 1px solid var(--green, #01652d); border-radius: 14px; padding: 12px 16px; font-size: 14px; }
    .install-bar b { display: block; font-size: 15px; }
    .install-bar span { color: var(--muted, #4b5b51); }
    .install-bar .acts { display: flex; gap: 8px; }
    @media (max-width: 600px) { .install-bar { padding: 10px 12px; font-size: 13px; border-radius: 12px; } .install-bar b { font-size: 14px; } }`;
  document.head.appendChild(style);

  const bar = document.createElement('div');
  bar.className = 'offline-bar';
  bar.setAttribute('role', 'status');
  bar.textContent = 'You are offline. Saved pages still open. Saving needs a connection.';
  const showBar = () => bar.classList.toggle('show', navigator.onLine === false);
  document.addEventListener('DOMContentLoaded', () => { document.body.appendChild(bar); showBar(); });
  window.addEventListener('online', showBar);
  window.addEventListener('offline', showBar);

  // ---------- install bar (home page only) ----------
  let deferred = null;
  const slot = () => document.getElementById('install-slot');

  function render(html) {
    const s = slot();
    if (!s || standalone() || store.get('nysc_install_dismissed') === '1') return;
    s.innerHTML = `<div class="install-bar">${html}</div>`;
    const no = s.querySelector('[data-no]');
    if (no) no.addEventListener('click', () => { store.set('nysc_install_dismissed', '1'); s.innerHTML = ''; });
    const yes = s.querySelector('[data-yes]');
    if (yes) yes.addEventListener('click', async () => {
      if (!deferred) return;
      deferred.prompt();
      try { await deferred.userChoice; } catch (e) { /* ignore */ }
      deferred = null;
      s.innerHTML = '';
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    document.addEventListener('DOMContentLoaded', showAndroid);
    if (document.readyState !== 'loading') showAndroid();
  });
  function showAndroid() {
    render(`<div><b>Add NYSC Companion to your phone</b><span>Opens like an app, and your saved pages work without data.</span></div>
      <div class="acts"><button class="btn sm" type="button" data-yes>Install</button><button class="btn ghost sm" type="button" data-no>Not now</button></div>`);
  }
  window.addEventListener('appinstalled', () => { const s = slot(); if (s) s.innerHTML = ''; });

  // iPhone and iPad: Safari has no install button, so show the two taps.
  document.addEventListener('DOMContentLoaded', () => {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    if (ios && safari) {
      render(`<div><b>Add NYSC Companion to your phone</b><span>Tap the Share button, then "Add to Home Screen".</span></div>
        <div class="acts"><button class="btn ghost sm" type="button" data-no>Got it</button></div>`);
    }
  });
})();
