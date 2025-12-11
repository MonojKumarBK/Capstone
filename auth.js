/* static/js/auth.js
   Central auth helpers for Mentallify:
   - signInWithGoogle() opens popup -> backend /auth/google -> backend /auth/google/callback posts message
   - signOut() clears session storage and optionally notifies server
   - initAuthUI() writes header actions (profile / login) to #header-actions
   - getAuthToken() returns stored token
*/

/* ---------- Config ---------- */
const AUTH_CONFIG = {
  authEndpoint: '/auth/google',       // backend endpoint that returns auth_url
  logoutEndpoint: '/auth/logout',     // optional server-side logout (stateless JWTs)
  afterSignInRedirect: '/index.html', // where to go after sign-in
  loginPageRedirect: '/login.html',   // where front page login button should go
  headerSelector: '#header-actions'
};

/* ---------- Storage helpers ---------- */
function saveSession(payload) {
  if (!payload) return;
  if (payload.token) sessionStorage.setItem('mentallify_token', payload.token);
  if (payload.name !== undefined) sessionStorage.setItem('mentallify_username', payload.name || '');
  if (payload.email !== undefined) sessionStorage.setItem('mentallify_email', payload.email || '');
  if (payload.picture !== undefined) sessionStorage.setItem('mentallify_picture', payload.picture || '');
}

function clearSession() {
  sessionStorage.removeItem('mentallify_token');
  sessionStorage.removeItem('mentallify_username');
  sessionStorage.removeItem('mentallify_email');
  sessionStorage.removeItem('mentallify_picture');
}

function getAuthToken() {
  return sessionStorage.getItem('mentallify_token') || '';
}

function getProfile() {
  return {
    name: sessionStorage.getItem('mentallify_username') || '',
    email: sessionStorage.getItem('mentallify_email') || '',
    picture: sessionStorage.getItem('mentallify_picture') || ''
  };
}

/* ---------- Google sign-in flow (popup + postMessage) ---------- */
async function signInWithGoogle({ redirectUri } = {}) {
  // Fetch auth url from backend (optionally pass redirect_uri param)
  try {
    const url = AUTH_CONFIG.authEndpoint + (redirectUri ? ('?redirect_uri=' + encodeURIComponent(redirectUri)) : '');
    const res = await fetch(url);
    if (!res.ok) {
      console.error('Failed to get auth url', await res.text().catch(()=>null));
      alert('Could not start Google sign-in. Check server logs.');
      return false;
    }
    const data = await res.json();
    const authUrl = data.auth_url || data.url || data.authorization_url;
    if (!authUrl) {
      console.error('Invalid /auth/google response', data);
      alert('Auth URL not returned by server.');
      return false;
    }

    // Open popup
    const popup = window.open(authUrl, 'mentallify_google_oauth', 'width=520,height=650');
    if (!popup) {
      alert('Popup blocked. Allow popups and try again.');
      return false;
    }

    // Listen for single postMessage with token
    return await new Promise((resolve) => {
      let resolved = false;

      function cleanup() {
        window.removeEventListener('message', onMessage);
        if (watchInterval) clearInterval(watchInterval);
      }

      function onMessage(e) {
        try {
          const payload = e.data || {};
          if (payload && payload.token) {
            saveSession(payload);
            cleanup();
            resolved = true;
            // close popup if still open
            try { popup.close(); } catch (e) {}
            // redirect to main app page
            window.location.href = AUTH_CONFIG.afterSignInRedirect;
            resolve(true);
          }
        } catch (err) {
          console.error('auth postMessage handler error', err);
        }
      }

      // fallback: detect popup closed without message
      const watchInterval = setInterval(() => {
        if (!popup || popup.closed) {
          if (!resolved) {
            cleanup();
            resolve(false);
          }
        }
      }, 400);

      window.addEventListener('message', onMessage, false);
    });
  } catch (err) {
    console.error('signInWithGoogle error', err);
    alert('Google sign-in failed. See console.');
    return false;
  }
}

/* ---------- Demo sign-in helper (optional) ---------- */
function demoSignIn(username) {
  if (!username) return false;
  const payload = {
    token: 'demo-token-' + Date.now(),
    name: username,
    email: '',
    picture: ''
  };
  saveSession(payload);
  // redirect to app main
  window.location.href = AUTH_CONFIG.afterSignInRedirect;
  return true;
}

/* ---------- Sign out ---------- */
async function signOut() {
  // Clear client-side session
  clearSession();
  // optionally tell server (no-op for stateless JWTs)
  try {
    await fetch(AUTH_CONFIG.logoutEndpoint, { method: 'POST' }).catch(()=>{});
  } catch(e){}
  // go back to login or front page
  window.location.href = AUTH_CONFIG.loginPageRedirect;
}

/* ---------- Header UI injection ---------- */
function buildProfileHtml(profile) {
  const name = profile.name || '';
  const img = profile.picture || '';
  const initials = (name.split(' ').map(s => s[0]).join('').slice(0,2) || 'M').toUpperCase();
  if (img) {
    return `
      <div class="header-username" style="display:flex;align-items:center;gap:8px;">
        <img src="${img}" alt="avatar" style="width:36px;height:36px;border-radius:50%;object-fit:cover;box-shadow:0 8px 20px rgba(0,0,0,0.6)">
        <span style="font-weight:700;color:var(--white-soft)">${escapeHtml(name)}</span>
        <button class="btn ghost logout-btn" style="margin-left:10px;padding:8px 10px;">Logout</button>
      </div>
    `;
  } else {
    return `
      <div class="header-username" style="display:flex;align-items:center;gap:8px;">
        <div class="header-avatar" style="width:36px;height:36px;border-radius:50%">${escapeHtml(initials)}</div>
        <span style="font-weight:700;color:var(--white-soft)">${escapeHtml(name)}</span>
        <button class="btn ghost logout-btn" style="margin-left:10px;padding:8px 10px;">Logout</button>
      </div>
    `;
  }
}

function buildLoginButtonHtml() {
  return `<a href="${AUTH_CONFIG.loginPageRedirect}" class="btn">Login</a>`;
}

function escapeHtml(s) {
  return String(s||'').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#039;"}[m]));
}

/**
 * initAuthUI(options)
 * - options.afterSignInRedirect: override default for redirects
 * - automatically draws header actions into AUTH_CONFIG.headerSelector
 * - attaches logout handler
 */
function initAuthUI(options = {}) {
  if (options.afterSignInRedirect) AUTH_CONFIG.afterSignInRedirect = options.afterSignInRedirect;
  if (options.loginPageRedirect) AUTH_CONFIG.loginPageRedirect = options.loginPageRedirect;

  const container = document.querySelector(AUTH_CONFIG.headerSelector);
  if (!container) return;

  // Clear container
  container.innerHTML = '';

  const token = getAuthToken();
  if (token) {
    // show profile
    const profile = getProfile();
    container.innerHTML = buildProfileHtml(profile);
    // attach logout handler
    const logoutBtn = container.querySelector('.logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', signOut);
  } else {
    // show login link (front page will link to login.html)
    container.innerHTML = buildLoginButtonHtml();
  }
}

/* ---------- Expose to window for inline forms/pages ---------- */
window.MentallifyAuth = {
  signInWithGoogle,
  demoSignIn,
  signOut,
  getAuthToken,
  getProfile,
  initAuthUI
};

/* ---------- Auto-init on DOMReady (if header exists) ---------- */
document.addEventListener('DOMContentLoaded', () => {
  try { initAuthUI(); } catch(e){/* ignore */ }
});
