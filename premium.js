/* ═══════════════════════════════════════════════════════════
   FinTrack Pro — Premium Engine
   Access verified via Google Apps Script + Google Sheets
   ═══════════════════════════════════════════════════════════ */

const PREMIUM_KEY = 'ft_premium';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzLRil-YqDzyYOEjYqo63Dk4AJwm8f2MtDiA808Morur06fhkd0IHyAPYAZUBfbszF-/exec';

/* ── STATE ── */
function getActivePlan() {
  try {
    const raw = localStorage.getItem(PREMIUM_KEY);
    if (!raw) return 'free';
    const p = JSON.parse(raw);
    if (!p || !p.plan) return 'free';
    if (p.expiresAt && new Date(p.expiresAt) < new Date()) return 'free';
    return p.plan;
  } catch(e) { return 'free'; }
}

function isPremium() { return getActivePlan() === 'premium'; }
function isFree()    { return getActivePlan() === 'free'; }
function hasAccess() { return true; } // access controlled by login + GAS

function getPremiumInfo() {
  try { return JSON.parse(localStorage.getItem(PREMIUM_KEY) || 'null'); }
  catch(e) { return null; }
}

function savePlan(plan, email, expiresAt) {
  const info = { plan, email, activatedAt: new Date().toISOString(), expiresAt: expiresAt || null };
  localStorage.setItem(PREMIUM_KEY, JSON.stringify(info));
}

function clearPlan() { localStorage.removeItem(PREMIUM_KEY); }

/* ── FEATURE FLAGS ── */
function canUse(feature) {
  const FREE_FEATURES = [
    'dashboard','nuevo_registro','historial','analisis_basico',
    'emergencia','metas_basico','suscripciones_basico',
    'voz','atajos','csv_import','deudas_simple'
  ];
  if (FREE_FEATURES.includes(feature)) return true;
  return isPremium();
}

/* ── GAS ACCESS CHECK ── */
async function checkAccessWithGAS(email) {
  try {
    const url = GAS_URL + '?action=checkAccess&email=' + encodeURIComponent(email.trim());
    const res = await fetch(url);
    if (!res.ok) throw new Error('GAS error ' + res.status);
    const data = await res.json();
    return data;
  } catch(err) {
    console.warn('GAS unreachable, allowing free access:', err);
    // If GAS is unreachable, allow free access so users aren't blocked
    return { access: true, plan: 'free', expiresAt: null };
  }
}

/* ── UPGRADE MODAL ── */
function injectUpgradeModal() {
  if (document.getElementById('ftUpgradeOverlay')) return;
  const lang = sessionStorage.getItem('ft_lang') || localStorage.getItem('ft_lang') || 'es';
  const T = lang === 'es' ? {
    title:'Función Premium',
    sub:'Esta función está incluida en FinTrack Pro Premium.',
    features:[
      '📷 Escanear recibos e inversiones con IA',
      '📧 Reporte financiero mensual',
      '📥 Exportar todos tus datos',
      '💡 Insights automáticos avanzados',
      '🔄 Suscripciones ilimitadas',
      '🎯 Metas ilimitadas',
      '🏠 Hogar compartido',
      '📐 Amortización real de deudas',
    ],
    buyBtn:'Obtener Premium en Etsy →',
    close:'Cerrar',
  } : {
    title:'Premium Feature',
    sub:'This feature is included in FinTrack Pro Premium.',
    features:[
      '📷 Scan receipts and investments with AI',
      '📧 Monthly financial report',
      '📥 Export all your data',
      '💡 Advanced automatic insights',
      '🔄 Unlimited subscriptions',
      '🎯 Unlimited goals',
      '🏠 Shared household',
      '📐 Real debt amortization',
    ],
    buyBtn:'Get Premium on Etsy →',
    close:'Close',
  };

  const overlay = document.createElement('div');
  overlay.id = 'ftUpgradeOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:none;place-items:center;z-index:9999;backdrop-filter:blur(6px);';
  overlay.onclick = e => { if(e.target===overlay) hideUpgradeModal(); };
  overlay.innerHTML = `
  <div style="background:#fff;border-radius:24px;padding:28px;width:460px;max-width:calc(100vw - 32px);max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.22);">
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
      ${T.features.map(f=>`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;color:#1A1D2E"><span style="color:#1A7A4A;font-weight:700">✓</span> ${f}</div>`).join('')}
    </div>
    <a href="https://www.etsy.com/shop/finanzone" target="_blank"
      style="display:block;text-align:center;background:linear-gradient(135deg,#0F5132,#1A7A4A);color:white;border-radius:14px;padding:14px;font-size:15px;font-weight:700;text-decoration:none;font-family:'Plus Jakarta Sans',sans-serif;margin-bottom:12px">
      🛒 ${T.buyBtn}
    </a>
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

function premiumBadge() {
  return '<span style="display:inline-flex;align-items:center;gap:3px;background:linear-gradient(135deg,#0F5132,#1A7A4A);color:white;font-size:9px;font-weight:700;padding:2px 8px;border-radius:20px;margin-left:6px;vertical-align:middle">💎 Premium</span>';
}

function protectPage() { return true; }
