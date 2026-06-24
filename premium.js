/* ═══════════════════════════════════════════════════════════
   FinTrack Pro — Premium Engine v2
   
   ACCESS MODEL:
   - User enters their email at login
   - GAS checks it against the Sheet (you manage)
   - Returns plan: 'free' or 'premium'
   - Plan is stored in localStorage for the session
   ═══════════════════════════════════════════════════════════ */

const PREMIUM_KEY = 'ft_premium';

// ── Replace this URL after deploying your GAS ──
const GAS_URL = 'https://script.google.com/macros/s/PLACEHOLDER/exec';

/* ══════════════════════════════════════
   STATE HELPERS
══════════════════════════════════════ */
function getActivePlan() {
  try {
    // Check localStorage first
    let p = JSON.parse(localStorage.getItem(PREMIUM_KEY) || 'null');
    // Fallback to sessionStorage (used during login transition)
    if (!p) p = JSON.parse(sessionStorage.getItem(PREMIUM_KEY) || 'null');
    if (!p || !p.plan) return null;
    // Check expiry for premium annual plans
    if (p.expiresAt && new Date(p.expiresAt) < new Date()) {
      localStorage.removeItem(PREMIUM_KEY);
      sessionStorage.removeItem(PREMIUM_KEY);
      return null;
    }
    // If found in sessionStorage, copy to localStorage for persistence
    if (!localStorage.getItem(PREMIUM_KEY) && sessionStorage.getItem(PREMIUM_KEY)) {
      localStorage.setItem(PREMIUM_KEY, sessionStorage.getItem(PREMIUM_KEY));
    }
    return p.plan;
  } catch(e) { return null; }
}

function isPremium() {
  return getActivePlan() === 'premium';
}

function isFree() {
  return getActivePlan() === 'free';
}

function hasAccess() {
  return getActivePlan() !== null;
}

function getPremiumInfo() {
  try { return JSON.parse(localStorage.getItem(PREMIUM_KEY) || 'null'); }
  catch(e) { return null; }
}

function savePlan(plan, email, expiresAt) {
  const info = {
    plan,
    email,
    activatedAt: new Date().toISOString(),
    expiresAt: expiresAt || null
  };
  localStorage.setItem(PREMIUM_KEY, JSON.stringify(info));
}

function clearPlan() {
  localStorage.removeItem(PREMIUM_KEY);
}

/* ══════════════════════════════════════
   ACCESS CHECK via GAS
   Called from login.html after user enters their email.
   Returns { access, plan, email, expiresAt } or { access:false, reason }
══════════════════════════════════════ */
async function checkAccessWithGAS(email) {
  // ── DEV MODE: GAS not yet deployed ──
  // While PLACEHOLDER is in the URL, allow ANY email through with 'free' plan.
  // This lets you test the full app before GAS is set up.
  // Replace PLACEHOLDER with your real GAS URL to enable real verification.
  if (GAS_URL.includes('PLACEHOLDER')) {
    await new Promise(r => setTimeout(r, 600)); // simulate network delay
    return { access: true, plan: 'free', expiresAt: null };
  }

  // ── PRODUCTION: verify against your Google Sheet ──
  try {
    const url = GAS_URL + '?action=checkAccess&email=' + encodeURIComponent(email.trim());
    const res  = await fetch(url);
    if (!res.ok) throw new Error('GAS error ' + res.status);
    return await res.json();
  } catch(err) {
    // Network error — fail open so the user isn't blocked by a connectivity issue
    console.warn('GAS unreachable, allowing access in fallback mode:', err);
    return { access: true, plan: 'free', expiresAt: null };
  }
}

/* ══════════════════════════════════════
   FEATURE FLAGS
══════════════════════════════════════ */
function canUse(feature) {
  const plan = getActivePlan();
  if (!plan) return false; // no access at all

  const FREE_FEATURES = [
    'dashboard','nuevo_registro','historial','analisis_basico',
    'emergencia','metas_basico','suscripciones_basico',
    'voz','atajos','csv_import','deudas_simple'
  ];

  if (FREE_FEATURES.includes(feature)) return true;
  return plan === 'premium'; // premium-only features
}

/* ══════════════════════════════════════
   UPGRADE MODAL
   Shown when a Free user tries to use a Premium feature.
══════════════════════════════════════ */
function injectUpgradeModal() {
  if (document.getElementById('ftUpgradeOverlay')) return;

  const lang = sessionStorage.getItem('ft_lang') || 'es';

  const T = lang === 'es' ? {
    title:'Función Premium',
    sub:'Esta función está incluida en FinTrack Pro Premium.',
    features:[
      '📷 Escanear recibos e inversiones con IA',
      '📧 Reporte financiero mensual por email',
      '📥 Exportar todos tus datos',
      '💡 Insights automáticos avanzados',
      '🔄 Suscripciones ilimitadas',
      '🎯 Metas ilimitadas',
      '🏠 Hogar compartido (control en pareja)',
      '📐 Amortización real de deudas con interés',
    ],
    buyBtn:'Obtener Premium en Etsy →',
    close:'Cerrar',
    alreadyPremium:'¿Ya tienes Premium? Contacta soporte para activarlo.',
  } : {
    title:'Premium Feature',
    sub:'This feature is included in FinTrack Pro Premium.',
    features:[
      '📷 Scan receipts and investments with AI',
      '📧 Monthly financial report by email',
      '📥 Export all your data',
      '💡 Advanced automatic insights',
      '🔄 Unlimited subscriptions',
      '🎯 Unlimited goals',
      '🏠 Shared household (couple finance control)',
      '📐 Real debt amortization with interest',
    ],
    buyBtn:'Get Premium on Etsy →',
    close:'Close',
    alreadyPremium:'Already have Premium? Contact support to activate it.',
  };

  const overlay = document.createElement('div');
  overlay.id = 'ftUpgradeOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:none;place-items:center;z-index:9999;backdrop-filter:blur(6px);';
  overlay.onclick = e => { if(e.target===overlay) hideUpgradeModal(); };

  overlay.innerHTML = `
  <div style="background:#fff;border-radius:24px;padding:28px;width:460px;max-width:calc(100vw-32px);max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.22);animation:ftPop .3s cubic-bezier(0.34,1.56,0.64,1)">
    <style>@keyframes ftPop{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}</style>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <div style="width:32px;height:32px;background:linear-gradient(135deg,#0F5132,#1A7A4A);border-radius:10px;display:grid;place-items:center;font-size:16px">💎</div>
          <div style="font-size:19px;font-weight:800;font-family:'Plus Jakarta Sans',sans-serif">${T.title}</div>
        </div>
        <div style="font-size:13px;color:#9395A5;font-family:'Plus Jakarta Sans',sans-serif">${T.sub}</div>
      </div>
      <div onclick="hideUpgradeModal()" style="color:#9395A5;cursor:pointer;font-size:22px;flex-shrink:0">✕</div>
    </div>

    <div style="background:#F7F8FC;border-radius:14px;padding:16px;margin-bottom:18px">
      ${T.features.map(f=>`
        <div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;color:#1A1D2E">
          <span style="color:#1A7A4A;font-weight:700">✓</span> ${f}
        </div>`).join('')}
    </div>

    <a href="https://www.etsy.com/shop/finanzone" target="_blank"
      style="display:block;text-align:center;background:linear-gradient(135deg,#0F5132,#1A7A4A);color:white;border-radius:14px;padding:14px;font-size:15px;font-weight:700;text-decoration:none;font-family:'Plus Jakarta Sans',sans-serif;margin-bottom:12px">
      🛒 ${T.buyBtn}
    </a>

    <div style="font-size:11px;color:#9395A5;text-align:center;font-family:'Plus Jakarta Sans',sans-serif;margin-bottom:14px">${T.alreadyPremium}</div>

    <button onclick="hideUpgradeModal()"
      style="width:100%;background:transparent;border:1.5px solid #E4E6F0;border-radius:10px;padding:10px;font-size:13px;font-weight:600;color:#9395A5;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif">
      ${T.close}
    </button>
  </div>`;

  document.body.appendChild(overlay);
}

function showUpgradeModal() {
  injectUpgradeModal();
  const overlay = document.getElementById('ftUpgradeOverlay');
  if (overlay) overlay.style.display = 'grid';
}

function hideUpgradeModal() {
  const overlay = document.getElementById('ftUpgradeOverlay');
  if (overlay) overlay.style.display = 'none';
}

/* ══════════════════════════════════════
   LOCK / BADGE HELPERS
══════════════════════════════════════ */
function premiumBadge() {
  return '<span style="display:inline-flex;align-items:center;gap:3px;background:linear-gradient(135deg,#0F5132,#1A7A4A);color:white;font-size:9px;font-weight:700;padding:2px 8px;border-radius:20px;margin-left:6px;vertical-align:middle">💎 Premium</span>';
}

/* ══════════════════════════════════════
   AUTO-INIT — protect every page
   Any page that imports premium.js is automatically
   protected: if there's no active plan, redirect to login.
══════════════════════════════════════ */
(function autoProtect() {
  // login.html and index.html handle their own flow
  const path = window.location.pathname;
  if (path.includes('login') || path.endsWith('/') || path.endsWith('index.html')) return;

  // Read plan synchronously — localStorage is synchronous so no race condition
  function readPlan() {
    try {
      // Check localStorage
      let raw = localStorage.getItem('ft_premium');
      // Fallback to sessionStorage
      if (!raw) raw = sessionStorage.getItem('ft_premium');
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (!p || !p.plan) return null;
      if (p.expiresAt && new Date(p.expiresAt) < new Date()) return null;
      return p.plan;
    } catch(e) { return null; }
  }

  // Also check if user just completed onboarding/login
  // ft_user_setup in localStorage means they've been through the flow
  function justLoggedIn() {
    return !!localStorage.getItem('ft_user_setup');
  }

  const plan = readPlan();

  if (!plan) {
    // No plan found — but give a short grace period for the
    // login redirect to finish writing to localStorage
    // before deciding to bounce them back.
    setTimeout(function() {
      const planRetry = readPlan();
      if (!planRetry) {
        // Still no plan after grace period — redirect to login
        window.location.replace('login.html');
      }
    }, 300);
  }
})();
