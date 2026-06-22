/* ═══════════════════════════════════════════════════════════
   FinTrack Pro — Premium Engine
   Single source of truth for Free vs. Premium features.
   Imported by every HTML file via <script src="premium.js">.
   ═══════════════════════════════════════════════════════════ */

const PREMIUM_KEY  = 'ft_premium';
const GAS_VERIFY_URL = 'https://script.google.com/macros/s/AKfycbwyEK8zX4gubyOZdDdxZtPgAGlB9CKxaIlVRTjK1VOyFS1N6XVH4gTypNr6xkeKaGWo/exec'; // replaced when GAS is deployed

/* ── STATE ── */
function isPremium() {
  try {
    const p = JSON.parse(localStorage.getItem(PREMIUM_KEY) || 'null');
    if (!p) return false;
    // Check expiry if set (lifetime = no expiry)
    if (p.expiresAt && new Date(p.expiresAt) < new Date()) {
      localStorage.removeItem(PREMIUM_KEY);
      return false;
    }
    return !!p.active;
  } catch(e) { return false; }
}

function getPremiumInfo() {
  try { return JSON.parse(localStorage.getItem(PREMIUM_KEY) || 'null'); }
  catch(e) { return null; }
}

function activatePremium(code) {
  const info = { active:true, code, activatedAt: new Date().toISOString(), plan:'lifetime' };
  localStorage.setItem(PREMIUM_KEY, JSON.stringify(info));
}

function deactivatePremium() {
  localStorage.removeItem(PREMIUM_KEY);
}

/* ── FEATURE FLAGS ──
   Each key maps to a feature. Returns true if the user
   is allowed to use it.
──────────────────────────────────────────────────────── */
const FEATURES = {
  // Always available (Free)
  dashboard:          ()=>true,
  nuevo_registro:     ()=>true,
  historial:          ()=>true,
  analisis_basico:    ()=>true,
  emergencia:         ()=>true,
  metas_basico:       ()=>true,   // up to 3 goals
  suscripciones_basico:()=>true,  // up to 3 subscriptions
  voz:                ()=>true,
  atajos:             ()=>true,
  csv_import:         ()=>true,
  deudas_simple:      ()=>true,

  // Premium only
  scanner_ia:         ()=>isPremium(),
  scanner_inversiones:()=>isPremium(),
  reporte_email:      ()=>isPremium(),
  exportar:           ()=>isPremium(),
  insights_completos: ()=>isPremium(),
  suscripciones_full: ()=>isPremium(),  // unlimited subscriptions
  metas_full:         ()=>isPremium(),  // unlimited goals
  hogar:              ()=>isPremium(),
  analisis_avanzado:  ()=>isPremium(),
  deudas_avanzado:    ()=>isPremium(),
  inversiones_scanner:()=>isPremium(),
};

function canUse(feature) {
  return FEATURES[feature] ? FEATURES[feature]() : true;
}

/* ── UPGRADE MODAL ──
   Injected once into the page. Any call to showUpgradeModal()
   shows it. The modal has an activation code field so the
   user can enter their Etsy code right there.
──────────────────────────────────────────────────────── */
function injectUpgradeModal() {
  if (document.getElementById('ftUpgradeOverlay')) return; // already injected

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
    activate:'¿Ya tienes Premium? Activa tu código',
    codePlaceholder:'Código de activación (ej. FTP-XXXX-XXXX)',
    activateBtn:'Activar Premium',
    buyBtn:'Obtener Premium en Etsy',
    cancel:'Cerrar',
    activating:'Verificando...',
    success:'✅ ¡Premium activado! Bienvenido.',
    errorInvalid:'⚠️ Código inválido o ya usado.',
    errorNetwork:'⚠️ Sin conexión. Intenta de nuevo.',
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
    activate:'Already have Premium? Enter your code',
    codePlaceholder:'Activation code (e.g. FTP-XXXX-XXXX)',
    activateBtn:'Activate Premium',
    buyBtn:'Get Premium on Etsy',
    cancel:'Close',
    activating:'Verifying...',
    success:'✅ Premium activated! Welcome.',
    errorInvalid:'⚠️ Invalid or already used code.',
    errorNetwork:'⚠️ No connection. Try again.',
  };

  const overlay = document.createElement('div');
  overlay.id = 'ftUpgradeOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:none;place-items:center;z-index:9999;backdrop-filter:blur(6px);';
  overlay.onclick = e => { if(e.target===overlay) hideUpgradeModal(); };

  overlay.innerHTML = `
  <div style="background:#fff;border-radius:24px;padding:28px;width:460px;max-width:calc(100vw - 32px);max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.22);animation:ftModalPop .3s cubic-bezier(0.34,1.56,0.64,1)">
    <style>@keyframes ftModalPop{from{opacity:0;transform:scale(.9) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}</style>

    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <div style="width:32px;height:32px;background:linear-gradient(135deg,#0F5132,#1A7A4A);border-radius:10px;display:grid;place-items:center;font-size:16px">💎</div>
          <div style="font-size:19px;font-weight:800;font-family:'Plus Jakarta Sans',sans-serif">${T.title}</div>
        </div>
        <div style="font-size:13px;color:#9395A5;font-family:'Plus Jakarta Sans',sans-serif">${T.sub}</div>
      </div>
      <div onclick="hideUpgradeModal()" style="color:#9395A5;cursor:pointer;font-size:22px;line-height:1;flex-shrink:0">✕</div>
    </div>

    <!-- Feature list -->
    <div style="background:#F7F8FC;border-radius:14px;padding:16px;margin-bottom:18px">
      ${T.features.map(f=>`
        <div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;color:#1A1D2E">
          <div style="color:#1A7A4A;font-weight:700;flex-shrink:0">✓</div>
          <span>${f}</span>
        </div>`).join('')}
    </div>

    <!-- Buy button -->
    <a href="https://www.etsy.com/shop/finanzone" target="_blank" id="ftBuyBtn" style="display:block;text-align:center;background:linear-gradient(135deg,#0F5132,#1A7A4A);color:white;border-radius:14px;padding:14px;font-size:15px;font-weight:700;text-decoration:none;font-family:'Plus Jakarta Sans',sans-serif;margin-bottom:16px">
      🛒 ${T.buyBtn}
    </a>

    <!-- Divider -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <div style="flex:1;height:1px;background:#E4E6F0"></div>
      <div style="font-size:12px;color:#9395A5;font-family:'Plus Jakarta Sans',sans-serif">${T.activate}</div>
      <div style="flex:1;height:1px;background:#E4E6F0"></div>
    </div>

    <!-- Code input -->
    <div style="display:flex;gap:8px">
      <input id="ftCodeInput" type="text" placeholder="${T.codePlaceholder}"
        style="flex:1;background:#F7F8FC;border:1.5px solid #E4E6F0;border-radius:10px;padding:11px 14px;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;outline:none;color:#1A1D2E"
        onkeydown="if(event.key==='Enter') verifyPremiumCode()">
      <button onclick="verifyPremiumCode()" id="ftActivateBtn"
        style="background:linear-gradient(135deg,#0F5132,#1A7A4A);color:white;border:none;border-radius:10px;padding:11px 18px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;white-space:nowrap">
        ${T.activateBtn}
      </button>
    </div>
    <div id="ftCodeMsg" style="font-size:12px;margin-top:8px;min-height:18px;font-family:'Plus Jakarta Sans',sans-serif"></div>

    <!-- Close -->
    <button onclick="hideUpgradeModal()"
      style="width:100%;margin-top:14px;background:transparent;border:1.5px solid #E4E6F0;border-radius:10px;padding:10px;font-size:13px;font-weight:600;color:#9395A5;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif">
      ${T.cancel}
    </button>
  </div>`;

  document.body.appendChild(overlay);

  // Store translations for verifyPremiumCode
  overlay._T = T;
}

function showUpgradeModal() {
  injectUpgradeModal();
  const overlay = document.getElementById('ftUpgradeOverlay');
  if (overlay) overlay.style.display = 'grid';
}

function hideUpgradeModal() {
  const overlay = document.getElementById('ftUpgradeOverlay');
  if (overlay) overlay.style.display = 'none';
  const input = document.getElementById('ftCodeInput');
  if (input) input.value = '';
  const msg = document.getElementById('ftCodeMsg');
  if (msg) { msg.textContent = ''; msg.style.color = ''; }
}

/* ── CODE VERIFICATION ──
   Sends the code to GAS for validation.
   GAS marks the code as used and returns {valid:true/false}.
   Falls back to a local list if GAS is unreachable (dev mode).
──────────────────────────────────────────────────────── */

// Fallback local codes for testing before GAS is deployed.
// Format: sha256-like prefix — replace with real hashed codes in production.
const LOCAL_TEST_CODES = ['FTP-TEST-2024','FTP-DEMO-0001','FTP-BETA-9999'];

async function verifyPremiumCode() {
  const input  = document.getElementById('ftCodeInput');
  const btn    = document.getElementById('ftActivateBtn');
  const msgEl  = document.getElementById('ftCodeMsg');
  const T      = document.getElementById('ftUpgradeOverlay')._T;

  if (!input || !input.value.trim()) return;

  const code = input.value.trim().toUpperCase();

  btn.disabled = true;
  btn.textContent = T.activating;
  msgEl.textContent = '';

  try {
    let valid = false;

    // Try GAS first (only if placeholder has been replaced with real URL)
    if (!GAS_VERIFY_URL.includes('PLACEHOLDER')) {
      const res = await fetch(GAS_VERIFY_URL + '?action=verifyCode&code=' + encodeURIComponent(code), {
        method: 'GET'
      });
      if (res.ok) {
        const data = await res.json();
        valid = data.valid === true;
      }
    } else {
      // Dev/demo: validate against local test codes
      valid = LOCAL_TEST_CODES.includes(code);
      // Simulate network delay
      await new Promise(r => setTimeout(r, 800));
    }

    if (valid) {
      activatePremium(code);
      msgEl.textContent = T.success;
      msgEl.style.color = '#1A7A4A';
      btn.disabled = false;
      btn.textContent = '✅ Activado';
      setTimeout(() => {
        hideUpgradeModal();
        // Reload page so premium features unlock immediately
        window.location.reload();
      }, 1500);
    } else {
      msgEl.textContent = T.errorInvalid;
      msgEl.style.color = '#E63946';
      btn.disabled = false;
      const lang = sessionStorage.getItem('ft_lang') || 'es';
      btn.textContent = lang === 'es' ? 'Activar Premium' : 'Activate Premium';
    }
  } catch(err) {
    msgEl.textContent = T.errorNetwork;
    msgEl.style.color = '#E63946';
    btn.disabled = false;
    const lang = sessionStorage.getItem('ft_lang') || 'es';
    btn.textContent = lang === 'es' ? 'Activar Premium' : 'Activate Premium';
  }
}

/* ── LOCK ICON HELPER ──
   Wraps any element or replaces any button with a locked version.
   Usage:
     lockElement(document.getElementById('scannerBtn'), 'scanner_ia');
──────────────────────────────────────────────────────── */
function lockElement(el, feature, onUnlocked) {
  if (!el) return;
  if (canUse(feature)) {
    if (onUnlocked) onUnlocked();
    return;
  }
  // Add lock badge overlay
  el.style.position = 'relative';
  el.style.opacity = '0.55';
  el.style.pointerEvents = 'none';
  el.style.cursor = 'not-allowed';

  const lock = document.createElement('div');
  lock.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:20px;pointer-events:all;cursor:pointer;z-index:10;';
  lock.textContent = '🔒';
  lock.onclick = e => { e.stopPropagation(); showUpgradeModal(); };
  el.appendChild(lock);
}

/* ── PREMIUM BADGE ──
   Shows a small "Premium" pill next to any element.
──────────────────────────────────────────────────────── */
function premiumBadge() {
  return '<span style="display:inline-flex;align-items:center;gap:3px;background:linear-gradient(135deg,#0F5132,#1A7A4A);color:white;font-size:9px;font-weight:700;padding:2px 8px;border-radius:20px;margin-left:6px;vertical-align:middle">💎 Premium</span>';
}

/* ── AUTO-INIT ──
   Adds the "💎 Premium" or "Free" indicator to any element
   with data-premium-indicator="true" found in the page.
──────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const premium = isPremium();

  // Update any sidebar badge showing plan
  document.querySelectorAll('[data-plan-indicator]').forEach(el => {
    el.textContent = premium ? '💎 Premium' : '🆓 Free';
    el.style.color = premium ? '#1A7A4A' : '#9395A5';
  });
});
