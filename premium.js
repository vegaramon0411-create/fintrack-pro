/* ═══════════════════════════════════════════════════════════
   FinTrack Pro — Premium Engine
   Access verified via Google Apps Script + Google Sheets
   ═══════════════════════════════════════════════════════════ */

const PREMIUM_KEY = 'ft_premium';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbwITyU4qld-IOEVKyLU9XHI46T8g_LjJaNp3nlQgler8-nMeIlztMmG_lZMVMm9cBkP/exec';

/* ── STATE ── */
function getActivePlan() {
  try {
    const raw = localStorage.getItem(PREMIUM_KEY);
    if (!raw) return 'free';
    const p = JSON.parse(raw);
    if (!p || !p.plan) return 'free';
    if (p.expiresAt && new Date(p.expiresAt) < new Date()) return 'free';
    // Normalizado a minúsculas: el Sheet puede tener "PREMIUM", "Premium" o "premium"
    // y no debe importar — esto fue justo la causa del bug del 25 de agosto.
    return String(p.plan).trim().toLowerCase();
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
  const url = GAS_URL + '?action=checkAccess&email=' + encodeURIComponent(email.trim());

  // Reintenta una vez — la red del celular a veces falla la primera llamada
  // y no hay por qué tratar eso como "ya no eres premium".
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('GAS error ' + res.status);
      const data = await res.json();
      return data;
    } catch(err) {
      console.warn(`GAS intento ${attempt+1} falló:`, err);
      if (attempt === 0) await new Promise(r => setTimeout(r, 800));
    }
  }

  // Los 2 intentos fallaron de verdad (Sheet inalcanzable, sin internet, etc.).
  // Antes esto bajaba a "free" en silencio, causando que a veces sí y a veces no
  // se reconociera premium — dependía solo de si esa llamada específica jaló.
  // Ahora: si ya había un premium guardado y vigente, se mantiene mientras se
  // puede verificar de nuevo, en vez de quitarlo por un simple hipo de red.
  try {
    const cached = JSON.parse(localStorage.getItem(PREMIUM_KEY) || '{}');
    const cachedPlan = cached.plan ? String(cached.plan).trim().toLowerCase() : '';
    const notExpired = !cached.expiresAt || new Date(cached.expiresAt) > new Date();
    if (cachedPlan === 'premium' && notExpired) {
      console.warn('GAS inalcanzable — se mantiene el premium local hasta poder reverificar.');
      return { access: true, plan: cached.plan, expiresAt: cached.expiresAt || null };
    }
  } catch(e) {}

  return { access: true, plan: 'free', expiresAt: null };
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

/* ══════════════════════════════════════════
   MODAL DE AYUDA — bilingüe, con búsqueda por palabra clave.
   Vive en premium.js porque TODAS las páginas ya lo cargan —
   así no hay que duplicar este bloque en cada archivo.
══════════════════════════════════════════ */
const FT_HELP_FAQ = [
  { es:['ahorro libre','emergencia','diferencia','cuando retirar'], en:['free savings','emergency','difference','when withdraw'],
    q:{es:'¿Cuál es la diferencia entre Ahorro libre y Fondo de emergencia?', en:'What\u2019s the difference between Free Savings and the Emergency Fund?'},
    a:{es:'Ahorro libre se usa sin restricciones, para lo que quieras. El Fondo de emergencia está pensado solo para emergencias reales (perder el trabajo, un gasto médico grande) — sí puedes retirar de ahí cuando lo necesites de verdad, pero no está pensado para gastos normales del mes.', en:'Free Savings can be used for anything, no restrictions. The Emergency Fund is meant only for real emergencies (losing your job, a big medical expense) — you can withdraw when you truly need it, but it\u2019s not meant to cover regular monthly spending.'} },
  { es:['cheque','reparte','hogar','personal','porcentaje','60','40'], en:['paycheck','split','household','personal','percentage'],
    q:{es:'¿Cómo se reparte mi cheque entre hogar y personal?', en:'How does my paycheck get split between household and personal?'},
    a:{es:'Configuras el % en Perfil → Frecuencia de pago (ejemplo: 60% al hogar, 40% personal). Cada vez que registras un cheque, la app calcula automáticamente cuánto es de cada lado con ese porcentaje.', en:'You set the % in Profile → Pay Frequency (example: 60% household, 40% personal). Every time you log a paycheck, the app automatically calculates each side using that percentage.'} },
  { es:['pagate primero','ahorro automático','se aparta solo'], en:['pay yourself first','automatic savings'],
    q:{es:'¿Qué es "Págate primero"?', en:'What is "Pay Yourself First"?'},
    a:{es:'Cuando registras un cheque, un % de tu parte personal se aparta automáticamente a Ahorro libre al momento — antes de que puedas gastarlo, no al final del mes. Configuras ese % en Perfil.', en:'When you log a paycheck, a % of your personal share is automatically moved into Free Savings right away — before you can spend it, not at the end of the month. You set that % in Profile.'} },
  { es:['recurrente','recurrentes','pago automático','se repite','cada semana','cada mes'], en:['recurring','automatic payment','repeats','every week','every month'],
    q:{es:'¿Qué son los recurrentes y dónde los veo?', en:'What are recurring payments and where do I see them?'},
    a:{es:'Son pagos que se repiten solos (abonos a deuda, ahorro, inversión) sin que tengas que registrarlos a mano cada vez. Todos juntos, sin importar el tipo, están en Más → Recurrentes — ahí ves cuándo fue el último y cuándo sigue.', en:'These are payments that repeat on their own (debt payments, savings, investments) without you registering them manually each time. All of them together, regardless of type, live in More → Recurring — you can see when the last one happened and when the next one is due.'} },
  { es:['pareja','hogar','sincroniza','compartir','conectar','esposa','esposo'], en:['partner','household','sync','share','connect','spouse'],
    q:{es:'¿Cómo conecto mi cuenta con la de mi pareja?', en:'How do I connect my account with my partner\u2019s?'},
    a:{es:'En Hogar → Cambiar modo, generas un código y se lo compartes a tu pareja para que lo ingrese. Una vez conectados, las deudas y metas compartidas se sincronizan solas — tu ahorro y gasto personal siguen siendo privados.', en:'In Household → Change mode, you generate a code and share it with your partner so they can enter it. Once connected, shared debts and goals sync automatically — your personal savings and spending stay private.'} },
  { es:['metodo','50 30 20','presupuesto','cambiar metodo'], en:['method','50 30 20','budget','change method'],
    q:{es:'¿Puedo cambiar el método de presupuesto (50/30/20)?', en:'Can I change the budget method (50/30/20)?'},
    a:{es:'Sí, en Perfil puedes elegir entre distintas reglas de presupuesto. Se te pregunta también la primera vez que usas la app.', en:'Yes, in Profile you can choose between different budgeting rules. You\u2019re also asked the first time you use the app.'} },
  { es:['importar','ia','inteligencia artificial','creditos','escanear recibo','csv'], en:['import','ai','credits','scan receipt','csv'],
    q:{es:'¿Cómo funcionan los créditos de análisis con IA?', en:'How do AI analysis credits work?'},
    a:{es:'Con Premium tienes 10 análisis con IA al mes (para leer CSV, PDF o fotos de recibos en cualquier formato) — se resetean cada mes. Si se te acaban, puedes comprar más o usar la importación manual por formato de banco, que no gasta créditos.', en:'With Premium you get 10 AI analyses per month (to read CSV, PDF, or receipt photos in any format) — they reset monthly. If you run out, you can buy more or use manual import by bank format, which doesn\u2019t use credits.'} },
  { es:['deuda','abono','tarjeta','prestamo','registrar deuda'], en:['debt','payment','credit card','loan','register debt'],
    q:{es:'¿Cómo agrego una deuda y le registro un abono?', en:'How do I add a debt and log a payment?'},
    a:{es:'En Deudas, toca "+ Nueva deuda" para agregarla. Para pagar, entra a la deuda y toca "Registrar abono" — puedes marcarlo como recurrente si se repite siempre el mismo día.', en:'In Debts, tap "+ New debt" to add one. To pay, open the debt and tap "Register payment" — you can mark it as recurring if it always happens on the same day.'} },
  { es:['respaldo','backup','exportar','restaurar','perdi mis datos'], en:['backup','export','restore','lost my data'],
    q:{es:'¿Cómo hago un respaldo de mis datos?', en:'How do I back up my data?'},
    a:{es:'En Historial → Herramientas (ícono 🛠️) → Descargar respaldo. Guarda ese archivo — si algo pasa, lo restauras desde el mismo lugar con "Restaurar respaldo".', en:'In History → Tools (🛠️ icon) → Download backup. Keep that file — if something happens, restore it from the same place with "Restore backup".'} },
  { es:['idioma','cambiar idioma','ingles','español'], en:['language','change language','english','spanish'],
    q:{es:'¿Dónde cambio el idioma de la app?', en:'Where do I change the app\u2019s language?'},
    a:{es:'En Configuración, o directo desde el menú "⋯" de cualquier pantalla.', en:'In Settings, or directly from the "⋯" menu on any screen.'} },
  { es:['notificacion','campana','recordatorio','aviso'], en:['notification','bell','reminder','alert'],
    q:{es:'¿Para qué sirve la campana de notificaciones?', en:'What is the notification bell for?'},
    a:{es:'Te avisa cuando un pago está por vencer o ya venció. Se limpia sola cuando lo pagas ese mes.', en:'It alerts you when a payment is coming due or already overdue. It clears itself once you pay it that month.'} },
];

function injectHelpModal(){
  if(document.getElementById('ftHelpOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'ftHelpOverlay';
  overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:900;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto;';
  overlay.innerHTML = `
    <div style="background:white;border-radius:18px;padding:20px;max-width:420px;width:100%;margin-top:40px;max-height:85vh;display:flex;flex-direction:column">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-shrink:0">
        <div style="font-size:16px;font-weight:800">❓ <span id="ftHelpTitle">Ayuda</span></div>
        <div onclick="hideHelpModal()" style="cursor:pointer;font-size:20px;color:#8A9490">✕</div>
      </div>
      <input id="ftHelpSearch" type="text" oninput="filterHelpFAQ(this.value)" placeholder="Buscar tu problema…"
        style="width:100%;padding:11px 14px;border:1.5px solid #E4E6F0;border-radius:12px;font-size:14px;font-family:inherit;margin-bottom:14px;box-sizing:border-box;outline:none;flex-shrink:0">
      <div id="ftHelpList" style="overflow-y:auto;flex:1"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if(e.target===overlay) hideHelpModal(); });
}

function _ftHelpLang(){
  try{ return (typeof lang!=='undefined' && lang) || localStorage.getItem('ft_lang') || 'es'; }catch(e){ return 'es'; }
}

function renderHelpFAQ(query){
  const l = _ftHelpLang();
  const es = l==='es';
  document.getElementById('ftHelpTitle').textContent = es?'Ayuda':'Help';
  document.getElementById('ftHelpSearch').placeholder = es?'Busca tu problema…':'Search your issue…';
  const q = (query||'').toLowerCase().trim();
  const list = FT_HELP_FAQ.filter(item=>{
    if(!q) return true;
    const kws = (es?item.es:item.en).concat(item.q[l].toLowerCase());
    return kws.some(k=>k.toLowerCase().includes(q)) || item.q[l].toLowerCase().includes(q) || item.a[l].toLowerCase().includes(q);
  });
  const el = document.getElementById('ftHelpList');
  if(!list.length){
    el.innerHTML = `<div style="text-align:center;padding:30px 10px;color:#8A9490;font-size:13px">${es?'Sin resultados — intenta con otra palabra':'No results — try a different word'}</div>`;
    return;
  }
  el.innerHTML = list.map((item,i)=>`
    <details style="border-bottom:1px solid #ECEAE4;padding:10px 2px" ${query&&i===0?'open':''}>
      <summary style="cursor:pointer;font-size:13.5px;font-weight:700;color:#141B17">${item.q[l]}</summary>
      <div style="font-size:12.5px;color:#4A4E69;margin-top:8px;line-height:1.5">${item.a[l]}</div>
    </details>`).join('');
}

function filterHelpFAQ(query){ renderHelpFAQ(query); }

function showHelpModal(){
  injectHelpModal();
  renderHelpFAQ('');
  document.getElementById('ftHelpSearch').value = '';
  document.getElementById('ftHelpOverlay').style.display = 'flex';
}

function hideHelpModal(){
  const overlay = document.getElementById('ftHelpOverlay');
  if(overlay) overlay.style.display = 'none';
}
