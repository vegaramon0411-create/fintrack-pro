/* ═══════════════════════════════════════════════════════════════════════════
   FinTrack Pro — RUNTIME COMPARTIDO
   Cargado por las 18 pantallas vía <script src="premium.js">.
   Contiene: sistema de diseño (.ft-*), capa de datos, formato LatAm,
   automatizaciones (cheques / recurrentes / suscripciones), premium + créditos,
   Google Apps Script, componentes de UI y el chrome (header + menú inferior).

   API pública: window.FT.*
   Compatibilidad: al final se exponen los nombres globales viejos (SHIM).
   ═══════════════════════════════════════════════════════════════════════════ */
(function (window, document) {
'use strict';

// Bug real de QA (B1, causa raíz encontrada 2026-09-26): esta app navega
// entre pantallas con recarga completa (cada .html es su propia página, no
// es una sola app de una página) -- si el usuario usa el botón "atrás" del
// navegador para "volver" a una pantalla, el navegador puede restaurarla
// desde bfcache (una versión CONGELADA de justo antes de salir de ahí) sin
// volver a ejecutar nada de este archivo -- ni FT.boot(), ni el render de
// esa pantalla. Eso significa que se ve el número de ANTES del depósito
// (ej. Ahorro libre mostrando $550 después de depositar $50 en otra
// pantalla), aunque el dato ya se haya guardado bien en localStorage -- no
// es que el depósito se perdiera, es que la pantalla nunca se volvió a
// leer. `pageshow` con `event.persisted:true` es la señal exacta de que el
// navegador restauró la página desde esa caché en vez de cargarla de
// verdad -- forzamos una recarga real para que siempre se lea el dato
// fresco, en cualquier pantalla de toda la app.
window.addEventListener('pageshow', function (e) { if (e.persisted) location.reload(); });

var FT = window.FT || {};
window.FT = FT;

/* ─────────────────────────────────────────────────────────────────────────
   1 · CONSTANTES
   ───────────────────────────────────────────────────────────────────────── */
var GAS_URL = 'https://script.google.com/macros/s/AKfycbwITyU4qld-IOEVKyLU9XHI46T8g_LjJaNp3nlQgler8-nMeIlztMmG_lZMVMm9cBkP/exec';
FT.GAS_URL = GAS_URL;

var K = {
  user:'ft_user', setup:'ft_user_setup', lang:'ft_lang',
  data:'ft_data', cheques:'ft_cheques',
  emergHist:'ft_emerg_hist', emergHistLegacy:'ft_emergency_history',
  savings:'ft_available_savings', savingsHist:'ft_savings_hist', savingsFunds:'ft_savings_funds',
  investments:'ft_investments', hogarInv:'ft_hogar_inv',
  debts:'ft_debts', goals:'ft_goals', subs:'ft_subs', servicios:'ft_servicios',
  subsHist:'ft_subs_history', serviciosHist:'ft_servicios_history',
  recurring:'ft_recurring', recurringInvLegacy:'ft_inv_recurrentes',
  checking:'ft_checking_balance', partnerChecking:'ft_partner_checking',
  hogar:'ft_hogar', hogarFondos:'ft_hogar_fondos',
  premium:'ft_premium', aiCredits:'ft_ai_credits', usedCodes:'ft_used_codes',
  distPcts:'ft_dist_pcts', dashTab:'ft_dash_tab',
  onbSaldos:'ft_onboarding_saldos_done', openAbonar:'ft_open_abonar',
  shortcuts:'ft_shortcuts', googleUser:'ft_google_user',
  investSuggest:'ft_invest_suggest', importAnswers:'ft_import_answers',
  navStack:'ft_nav_stack', profileB:'ft_profile_B', chatHist:'ft_chat_hist',
  emergAccountId:'ft_emerg_account_id'
};
FT.K = K;

var MAX_AI_PREMIUM = 10;

// Pasteles de categoría (§4.1) — ciclan en este orden
var PASTELS = ['peach','pink','coral','sky','mint'];

// Mapa emoji/etiqueta → pastel para el ícono de fila y las barras
var CAT_PASTEL = {
  '🛒':'peach','🍔':'pink','⛽':'coral','💊':'coral','📱':'sky','📶':'sky',
  '🏠':'mint','🎬':'pink','👕':'peach','✈️':'sky','🔧':'coral','💳':'coral',
  '💰':'mint','🛡️':'sky','📈':'mint','🎯':'pink'
};

/* ─────────────────────────────────────────────────────────────────────────
   2 · FORMATO — LatAm: millar con punto, decimal con coma
   ───────────────────────────────────────────────────────────────────────── */
/* 19-oct-2026, a petición de Ramón: el formato por defecto es el de EE.UU.
   ($1,200.00) y se puede cambiar en Perfil (user.numFormat: 'us' | 'latam',
   user.currencySymbol). Antes estaba fijo en LatAm ($1.200,00). */
FT.numFormat = function () { var f; try { f = (FT.user() || {}).numFormat; } catch (e) {} return f === 'latam' ? 'latam' : 'us'; };
var _CUR_SYM = { USD: '$', MXN: '$', CAD: '$', COP: '$', ARS: '$', CLP: '$', EUR: '€', GBP: '£', JPY: '¥', PEN: 'S/', BRL: 'R$', GTQ: 'Q', CRC: '₡', CHF: 'CHF' };
FT.currencySymbol = function () { var u = {}; try { u = FT.user() || {}; } catch (e) {} return u.currencySymbol ? String(u.currencySymbol) : (_CUR_SYM[u.currency] || '$'); };
function _seps() { return FT.numFormat() === 'latam' ? { group: '.', dec: ',' } : { group: ',', dec: '.' }; }
function groupInt(s) { return String(s).replace(/\B(?=(\d{3})+(?!\d))/g, _seps().group); }

/**
 * FT.money(n, opts)
 *  opts.cents   → 2 decimales (montos de transacción). Por defecto 0.
 *  opts.compact → abrevia con k / M (solo barras). "1.240" → "1,2k"
 *  opts.sign    → antepone + / − explícito
 *  opts.noSymbol→ sin "$"
 */
FT.money = function (n, opts) {
  opts = opts || {};
  n = Number(n) || 0;
  var neg = n < 0, abs = Math.abs(n), sym = opts.noSymbol ? '' : FT.currencySymbol();
  var pfx = opts.sign ? (neg ? '−' : '+') : (neg ? '−' : '');
  var sp = _seps();

  if (opts.compact && abs >= 1000) {
    var big = abs >= 1e6, div = big ? 1e6 : 1e3, unit = big ? 'M' : 'k';
    var v = abs / div;
    var str = v >= 100 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '').replace('.', sp.dec);
    return pfx + sym + str + unit;
  }
  var dec = opts.cents ? 2 : 0;
  var parts = abs.toFixed(dec).split('.');
  return pfx + sym + groupInt(parts[0]) + (dec ? sp.dec + parts[1] : '');
};

/** Interpreta un monto escrito a mano en CUALQUIER convención de separador
 *  (punto de millar + coma decimal estilo LatAm, o coma de millar + punto
 *  decimal estilo EEUU) sin depender del idioma de la app -- detecta por
 *  la forma del número (17-sep-2026, construida originalmente para
 *  deudas.html's numMoney tras el bug real de "toco Guardar y no pasa
 *  nada" en montos grandes; promovida aquí el 15-oct-2026 para que
 *  cualquier pantalla con un campo de dinero en texto libre la use, en
 *  vez de reinventar un parseo frágil que solo asume un formato). */
FT.numMoney = function (v) {
  v = String(v == null ? '' : v).trim();
  if (!v) return 0;
  v = v.replace(/[^\d.,-]/g, '');
  var hasComma = v.indexOf(',') > -1, hasDot = v.indexOf('.') > -1;
  if (hasComma && hasDot) {
    if (v.lastIndexOf(',') > v.lastIndexOf('.')) v = v.replace(/\./g, '').replace(',', '.');
    else v = v.replace(/,/g, '');
  } else if (hasComma || hasDot) {
    var sep = hasComma ? ',' : '.';
    var parts = v.split(sep);
    var looksGrouped = parts.length > 1 && parts.slice(1).every(function (p) { return p.length === 3; }) && parts[0].replace('-', '').length <= 3;
    // Un solo punto con 3 dígitos: en formato EE.UU. es un decimal (1.200 = 1.2), no un millar.
    if (looksGrouped && parts.length === 2 && ((sep === '.' && FT.numFormat() === 'us') || (sep === ',' && FT.numFormat() === 'latam'))) looksGrouped = false;
    v = looksGrouped ? parts.join('') : parts.join('.');
  }
  var n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

/** Partes del monto para render custom (hero con "$" chico al final). */
FT.moneyParts = function (n, opts) {
  opts = opts || {};
  n = Number(n) || 0;
  var neg = n < 0, dec = opts.cents ? 2 : 0;
  var parts = Math.abs(n).toFixed(dec).split('.');
  return { neg: neg, sign: neg ? '−' : '+', int: groupInt(parts[0]), dec: parts[1] || '', sym: FT.currencySymbol(), decSep: _seps().dec };
};

/** FT.date(x, fmt) — fmt: 'DD/MM/AA' (def) | 'DD/MM/AAAA' | 'D MMM' | 'ISO' */
FT.date = function (x, fmt) {
  var d = x instanceof Date ? x : new Date(String(x).indexOf('T') > -1 ? x : x + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  var dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0');
  var yy = d.getFullYear();
  if (fmt === 'ISO') return yy + '-' + mm + '-' + dd;
  if (fmt === 'DD/MM/AAAA') return dd + '/' + mm + '/' + yy;
  if (fmt === 'D MMM') {
    var M = (FT.lang === 'es'
      ? ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
      : ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']);
    return d.getDate() + ' ' + M[d.getMonth()];
  }
  return dd + '/' + mm + '/' + String(yy).slice(-2);
};

FT.todayISO = function () { return FT.date(new Date(), 'ISO'); };

/* ─────────────────────────────────────────────────────────────────────────
   3 · CAPA DE DATOS — único punto que toca localStorage
   ───────────────────────────────────────────────────────────────────────── */
FT.get = function (key, fallback) {
  try { var v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
  catch (e) { return fallback; }
};
FT.set = function (key, val) {
  try { localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val)); } catch (e) {}
};
FT.getRaw = function (key, fallback) { try { var v = localStorage.getItem(key); return v == null ? (fallback || '') : v; } catch (e) { return fallback || ''; } };
FT.setRaw = function (key, val) { try { localStorage.setItem(key, val); } catch (e) {} };
// FT.saveUser espeja ft_user también en sessionStorage (para sobrevivir un
// localStorage bloqueado) y FT.boot() lo vuelve a copiar ahí en cada arranque
// -- si FT.del solo tocara localStorage, "Borrar todo" podía dejar ese espejo
// vivo y FT.loadUser() lo recuperaría de sessionStorage en la misma pestaña.
FT.del = function (key) { try { localStorage.removeItem(key); } catch (e) {} try { sessionStorage.removeItem(key); } catch (e) {} };

/* ── ft_data ── */
FT.data = function () {
  var d = FT.get(K.data, null);
  if (!d || typeof d !== 'object') d = {};
  if (!Array.isArray(d.transactions)) d.transactions = [];
  if (typeof d.emergency !== 'number') d.emergency = parseFloat(d.emergency) || 0;
  if (!Array.isArray(d.subscriptions)) d.subscriptions = [];
  return d;
};
FT.saveData = function (d) { FT.set(K.data, d); FT._changed(); };
FT.txs = function () { return FT.data().transactions; };
/** Pendiente (20-oct-2026, aprobado vía simulación): un gasto o ingreso creado
 *  o cambiado a una fecha FUTURA no mueve ninguna cuenta ni cuenta en el
 *  presupuesto hasta ese día (t.pendiente). Al llegar la fecha, FT.applyPendingTxs
 *  lo aplica solo. Solo cuenta como pendiente mientras su fecha sea posterior a hoy. */
FT.isPending = function (t) { return !!t && t.pendiente === true && String(t.date || '') > FT.todayISO(); };
FT.txsCounted = function () { return FT.txs().filter(function (t) { return !FT.isPending(t); }); };

/* ── ft_user ── */
FT.user = function () { return FT._user || FT.loadUser() || {}; };
FT.loadUser = function () {
  var s = null;
  try { s = localStorage.getItem(K.user); } catch (e) {}
  if (s) {
    try { var p = JSON.parse(s); if (!p || !p.income || p.income <= 0) { var ss = sessionStorage.getItem(K.user); if (ss) { var pss = JSON.parse(ss); if (pss && pss.income > 0) s = ss; } } } catch (e) {}
  } else { try { s = sessionStorage.getItem(K.user); } catch (e) {} }
  if (!s) return null;
  try {
    var u = JSON.parse(s);
    try { localStorage.setItem(K.user, s); sessionStorage.setItem(K.user, s); } catch (e) {}
    FT._user = u;
    return u;
  } catch (e) { return null; }
};
FT.saveUser = function (u) {
  var s = JSON.stringify(u);
  try { localStorage.setItem(K.user, s); sessionStorage.setItem(K.user, s); } catch (e) {}
  FT._user = u;
};
FT.userName = function () { var u = FT._user || FT.loadUser() || {}; return u.name || ''; };

/* ── ft_hogar ── */
FT.hogar = function () { return FT.get(K.hogar, {}) || {}; };
FT.saveHogar = function (h) { FT.set(K.hogar, h); FT._changed(); };
FT.hogarConnected = function () { var h = FT.hogar(); return h.connected === true && !h.manuallyLeft; };
/** Perfil cacheado de la pareja (income/needs/wants/savings + su `data`) —
 *  preferido por email-key; cae a la ranura genérica `ft_profile_B` si hace falta. */
FT.partnerProfile = function () {
  var h = FT.hogar();
  if (!h.partnerEmail) return null;
  var byKey = FT.get('profile_' + h.partnerEmail.replace(/[^a-z0-9]/gi, '_'), null);
  var bySlot = FT.get(K.profileB, null);
  if (byKey && (byKey.income || 0) > 0) return byKey;
  if (bySlot && (bySlot.income || 0) > 0) return bySlot;
  return byKey || bySlot;
};
/** % del cheque que es personal (§ contrato) */
FT.personalPct = function () {
  if (!FT.hogarConnected()) return 100;
  var h = FT.hogar();
  return 100 - (parseFloat(h.payPctHogar) || 50) - (parseFloat(h.saveHogarPct) || 10);
};

/* ── deudas ── */
FT.debts = function () { return FT.get(K.debts, []) || []; };
FT.saveDebts = function (d) { FT.set(K.debts, d); FT._changed(); };

/* ── recurrentes ── */
FT.recurring = function () { return FT.get(K.recurring, []) || []; };
FT.saveRecurring = function (r) { FT.set(K.recurring, r); FT._changed(); };

/* ── Gestión de recurrentes (hub unificado + pantallas de dominio) ── */
FT.recurList = function (filterFn) {
  var l = FT.recurring().filter(function (r) { return r.active !== false; });
  return filterFn ? l.filter(filterFn) : l;
};
FT.recurGet = function (id) { return FT.recurring().find(function (r) { return String(r.id) === String(id); }); };
FT.recurUpdate = function (id, patch) {
  var l = FT.recurring();
  var r = l.find(function (x) { return String(x.id) === String(id); });
  if (!r) return;
  if (patch.amount != null) r.amount = parseFloat(patch.amount) || r.amount;
  if (patch.nextDate) r.nextDate = patch.nextDate;
  if (patch.freq) r.freq = patch.freq;
  if (patch.autopay != null) r.autopay = !!patch.autopay;
  FT.set(K.recurring, l);
};
FT.recurPause = function (id, paused) {
  var l = FT.recurring();
  var r = l.find(function (x) { return String(x.id) === String(id); });
  if (!r) return;
  r.paused = !!paused;
  // Al reanudar, si la próxima fecha ya pasó, avánzala hasta la siguiente futura
  // (no queremos un "catch-up" de todos los periodos pausados).
  if (!r.paused && r.nextDate) {
    var today = FT.todayISO(), guard = 0;
    while (r.nextDate < today && guard < 120) { r.nextDate = _advanceRecDate(r.freq, r.nextDate); guard++; }
  }
  FT.set(K.recurring, l);
};
FT.recurDelete = function (id) {
  FT.set(K.recurring, FT.recurring().filter(function (r) { return String(r.id) !== String(id); }));
};
/** Nombre legible + subtítulo de un recurrente, según su tipo. */
FT.recurLabel = function (r) {
  var es = FT.lang === 'es';
  var name = r.desc || '';
  if (!name) {
    if (r.kind === 'debt') name = es ? 'Abono a deuda' : 'Debt payment';
    else if (r.kind === 'meta') name = es ? 'Aporte a meta' : 'Goal contribution';
    else if (r.kind === 'ahorro') name = r.dest === 'emergencia' ? (es ? 'Aporte a Emergencia' : 'To Emergency') : (es ? 'Aporte a Ahorro libre' : 'To Free savings');
    else if (r.kind === 'inversion') name = es ? 'Inversión recurrente' : 'Recurring investment';
    else if (r.kind === 'metapersonal') { var _g = FT.goals().find(function (x) { return String(x.id) === String(r.goalId); }); name = (_g && _g.name) || (es ? 'Aporte a meta' : 'Goal contribution'); }
  }
  var freq = { weekly: es ? 'cada semana' : 'weekly', biweekly: es ? 'cada quincena' : 'biweekly', monthly: es ? 'cada mes' : 'monthly' }[r.freq] || FT.customFreqLabel(r.freq) || r.freq;
  var sub = freq + ' · ' + (es ? 'próximo ' : 'next ') + FT.date(r.nextDate) + (r.paused ? (es ? ' · pausado' : ' · paused') : '');
  return { name: name, sub: sub };
};

/** Última vez que se aplicó un recurrente — para mostrar "último" en el hub. */
function _recurLastApplied(kind, r) {
  try {
    if (kind === 'debt') {
      var d = FT.debts().find(function (x) { return String(x.id) === String(r.debtId); });
      var ab = (d && d.abonos || []).filter(function (a) { return a.recId === r.id; });
      return ab.length ? ab.reduce(function (mx, a) { return a.fecha > mx ? a.fecha : mx; }, '') : null;
    }
    if (kind === 'ahorro') {
      var hist = r.dest === 'emergencia' ? FT.emergencyHist() : FT.savingsHist();
      var m = hist.filter(function (h) { return h.recId === r.id; });
      return m.length ? m.reduce(function (mx, h) { return (h.date || h.fecha) > mx ? (h.date || h.fecha) : mx; }, '') : null;
    }
    if (kind === 'inversion') {
      var invs = FT.investments('').concat(FT.investments('hogar'));
      var mi = invs.filter(function (i) { return i.recId === r.id; });
      return mi.length ? mi.reduce(function (mx, i) { return i.fecha > mx ? i.fecha : mx; }, '') : null;
    }
    if (kind === 'meta') {
      var f = FT.hogarFondos();
      var mh = r.metaTipo === 'emerg' ? (f.emerg.hist || []) : ((r.metaId != null ? f.metas.find(function (x) { return x.id === r.metaId; }) : f.metas[r.metaIdx]) || {}).hist || [];
      var mm = mh.filter(function (h) { return h.recId === r.id; });
      return mm.length ? mm.reduce(function (mx, h) { return h.fecha > mx ? h.fecha : mx; }, '') : null;
    }
    if (kind === 'metapersonal') {
      var g = FT.goals().find(function (x) { return String(x.id) === String(r.goalId); });
      var gh = (g && g.hist || []).filter(function (h) { return h.recId === r.id; });
      return gh.length ? gh.reduce(function (mx, h) { return h.fecha > mx ? h.fecha : mx; }, '') : null;
    }
    if (kind === 'transferencia') {
      var xt = FT.txs().filter(function (t) { return t.type === 'transferencia' && t.recId === r.id; });
      return xt.length ? xt.reduce(function (mx, t) { return t.date > mx ? t.date : mx; }, '') : null;
    }
  } catch (e) {}
  return null;
}

/** Hub unificado (recurrentes.html): junta ft_recurring (deuda/ahorro/emergencia/
 *  inversión/meta de hogar/meta personal) + ft_subs + ft_servicios en una sola
 *  lista, cada `uid` codifica su tienda real ("recurring:id"/"subs:id"/"servicios:id")
 *  para que las acciones de abajo sepan a dónde escribir. */
FT.recurAllList = function () {
  var es = FT.lang === 'es';
  var items = [], debts = FT.debts(), goals = FT.goals();
  FT.recurring().filter(function (r) { return r.active !== false; }).forEach(function (r) {
    var name, icon, pk, typeLabel;
    if (r.kind === 'debt') {
      var d = debts.find(function (x) { return String(x.id) === String(r.debtId); });
      name = d ? d.name : (es ? 'Deuda' : 'Debt'); icon = '💳'; pk = 'debt'; typeLabel = es ? 'Abono a deuda' : 'Debt payment';
    } else if (r.kind === 'ahorro') {
      var toE = r.dest === 'emergencia';
      typeLabel = r.desc || (toE ? (es ? 'Aporte a Emergencia' : 'To Emergency') : (es ? 'Aporte a Ahorro libre' : 'To Free savings'));
      name = typeLabel; icon = toE ? '🛡️' : '💵'; pk = toE ? 'emerg' : 'ahorro';
    } else if (r.kind === 'inversion') {
      name = r.desc || (es ? 'Inversión' : 'Investment'); icon = '📈'; pk = 'inversion'; typeLabel = es ? 'Inversión recurrente' : 'Recurring investment';
    } else if (r.kind === 'meta') {
      name = r.desc || (es ? 'Aporte a meta del hogar' : 'Household goal deposit'); icon = '🏠'; pk = 'hogar'; typeLabel = es ? 'Aporte a meta del hogar' : 'Household goal deposit';
    } else if (r.kind === 'metapersonal') {
      var g = goals.find(function (x) { return String(x.id) === String(r.goalId); });
      name = (g && g.name) || (es ? 'Meta' : 'Goal'); icon = (g && g.icon) || '🎯'; pk = 'metapersonal'; typeLabel = es ? 'Aporte a meta personal' : 'Personal goal deposit';
    } else if (r.kind === 'transferencia') {
      // Revisión independiente (hallazgo F-1): sin esta rama, una
      // transferencia recurrente corría para siempre sin aparecer en
      // ningún lado -- invisible, imposible de pausar/editar/eliminar
      // desde la app.
      name = r.desc || (FT._xferLabel(r.from) + ' → ' + FT._xferLabel(r.to)); icon = '🔁'; pk = 'transferencia'; typeLabel = es ? 'Transferencia recurrente' : 'Recurring transfer';
    } else return;
    items.push({
      uid: 'recurring:' + r.id, kind: r.kind, pk: pk, name: name, icon: icon, typeLabel: typeLabel,
      amount: parseFloat(r.amount) || 0, freq: r.freq, nextDate: r.nextDate, paused: !!r.paused, autopay: !!r.autopay,
      page: { debt: 'deudas.html', ahorro: (r.dest === 'emergencia' ? 'emergencia.html' : 'ahorro.html'), inversion: 'inversiones.html', meta: 'hogar.html', metapersonal: 'metas.html', transferencia: 'midinero.html' }[r.kind],
      lastApplied: _recurLastApplied(r.kind, r)
    });
  });
  FT.subs().forEach(function (s) {
    items.push({ uid: 'subs:' + s.id, kind: 'sub', pk: 'sub', name: s.name, icon: '🔄', typeLabel: es ? 'Suscripción' : 'Subscription',
      amount: parseFloat(s.amount) || 0, freq: s.freq, nextDate: s.date, paused: !!s.paused, autopay: !!s.autopay, page: 'suscripciones.html', lastApplied: null });
  });
  FT.servicios().forEach(function (s) {
    items.push({ uid: 'servicios:' + s.id, kind: 'serv', pk: 'serv', name: s.name, icon: '🏠', typeLabel: es ? 'Servicio de casa' : 'Utility bill',
      amount: parseFloat(s.amount) || 0, freq: s.freq, nextDate: s.date, paused: !!s.paused, autopay: !!s.autopay, page: 'servicios.html', lastApplied: null });
  });
  return items.sort(function (a, b) { return String(a.nextDate || '').localeCompare(String(b.nextDate || '')); });
};
function _recurAllSplit(uid) { var i = String(uid).indexOf(':'); return { store: uid.slice(0, i), id: uid.slice(i + 1) }; }
FT.recurAllPause = function (uid, paused) {
  var p = _recurAllSplit(uid);
  if (p.store === 'recurring') { FT.recurPause(p.id, paused); return; }
  var key = p.store === 'subs' ? K.subs : K.servicios;
  var l = FT.get(key, []) || [];
  var s = l.find(function (x) { return String(x.id) === p.id; });
  if (s) { s.paused = !!paused; FT.set(key, l); FT._changed(); }
};
FT.recurAllUpdate = function (uid, patch) {
  var p = _recurAllSplit(uid);
  if (p.store === 'recurring') { FT.recurUpdate(p.id, patch); return; }
  var key = p.store === 'subs' ? K.subs : K.servicios;
  var l = FT.get(key, []) || [];
  var s = l.find(function (x) { return String(x.id) === p.id; });
  if (!s) return;
  if (patch.amount != null) s.amount = parseFloat(patch.amount) || s.amount;
  if (patch.freq) s.freq = patch.freq;
  if (patch.nextDate) s.date = patch.nextDate;
  if (patch.autopay != null) s.autopay = !!patch.autopay;
  FT.set(key, l); FT._changed();
};
FT.recurAllDelete = function (uid) {
  var p = _recurAllSplit(uid);
  if (p.store === 'recurring') {
    FT.recurDelete(p.id);
    // Si era el aporte automático de una meta personal, la meta queda como "sin recurrente".
    var goals = FT.goals(), touched = false;
    goals.forEach(function (g) { if (g.recId === p.id) { g.recId = null; g.recurring = false; touched = true; } });
    if (touched) FT.saveGoals(goals);
    return;
  }
  var key = p.store === 'subs' ? K.subs : K.servicios;
  FT.set(key, (FT.get(key, []) || []).filter(function (x) { return String(x.id) !== p.id; }));
  FT._changed();
};

/* ── Ahorro libre: lista de fondos con nombre (2026-09-23) ──────────────────
   Antes era un solo monto plano (K.savings) + un solo historial (K.savingsHist).
   Ramón pidió poder tener varios "vaults" con nombre propio (ej. Renta,
   Vacaciones, Casa) para saber de qué es cada cosa, en vez de un solo bote
   sin categorías -- mismo patrón que ya usa FT.hogarFondos (lista de metas
   con historial propio), solo que sin el meta/sync de hogar y con `meta`
   opcional (un fondo puede no tener meta, solo ser una categoría).
   Migración: la primera vez que se lee FT.savingsFunds() y no existe la
   clave nueva, el saldo/historial planos de siempre se vuelven un único
   fondo "General" -- no se pierde nada. Después de esa migración K.savings/
   K.savingsHist quedan congelados (nadie los vuelve a escribir); la fuente
   real es K.savingsFunds.
   Los accessors viejos (FT.savingsBalance/savingsHist/addSavings/
   reverseSavings) se vuelven fachadas sobre la lista de fondos -- así las
   ~20 pantallas/funciones que ya los usaban (dashboard, hogar, onboarding,
   cobertura de gasto, "págate primero", recurrentes de ahorro...) siguen
   funcionando sin tocarlas: un depósito sin `fundId` cae en el fondo
   "General" por default, y el saldo/historial totales se siguen viendo
   igual que antes, ahora sumados/concatenados entre todos los fondos. */
FT.savingsFunds = function () {
  var f = FT.get(K.savingsFunds, null);
  if (Array.isArray(f) && f.length) return f;
  var legacyHist = (FT.get(K.savingsHist, []) || []).slice();
  var general = { id: 'fund_general', name: FT.lang === 'es' ? 'General' : 'General', emoji: '💵', meta: 0, rule: null, hist: legacyHist };
  general.actual = Math.max(0, legacyHist.reduce(function (a, h) { var m = parseFloat(h.monto) || 0; return a + (h.tipo === 'retiro' ? -m : m); }, 0));
  var list = [general];
  FT.set(K.savingsFunds, list);
  return list;
};
FT.saveSavingsFunds = function (list) { FT.set(K.savingsFunds, list); FT._changed(); };
/** Fondo destino cuando nadie especifica uno (todo el código viejo que
 *  llama FT.addSavings sin fundId) -- siempre "General" si existe, si no el
 *  primero de la lista. */
// Acepta una lista ya cargada (opcional) para no volver a leer localStorage
// -- FT.get() siempre deserializa un array/objetos NUEVOS en cada llamada
// (sin caché), así que llamar FT.savingsFunds() una 2da vez aqui devolvia
// una copia INDEPENDIENTE de la que ya tenia quien llama (ej. FT.addSavings).
// Mutar esa copia y guardar la original nunca persistia nada -- causa raiz
// real de B1 (depósito al fondo default silenciosamente no se guardaba).
FT.defaultSavingsFund = function (list) {
  list = list || FT.savingsFunds();
  return list.find(function (f) { return f.id === 'fund_general'; }) || list[0];
};
FT.savingsBalance = function () { return FT.savingsFunds().reduce(function (a, f) { return a + (parseFloat(f.actual) || 0); }, 0); };
/** Historial combinado de todos los fondos (para el total que ya usaban
 *  dashboard/hogar/etc.) -- cada fila trae fundId/fundName de más, aditivo,
 *  no rompe a quien solo lee los campos de siempre. */
FT.savingsHist = function () {
  var out = [];
  FT.savingsFunds().forEach(function (f) { (f.hist || []).forEach(function (h) { out.push(Object.assign({}, h, { fundId: f.id, fundName: f.name })); }); });
  return out;
};
FT.addSavings = function (entry) {
  var funds = FT.savingsFunds();
  var f = (entry.fundId && funds.find(function (x) { return x.id === entry.fundId; })) || FT.defaultSavingsFund(funds);
  var amt = parseFloat(entry.amount) || 0;
  var tipo = entry.tipo || 'deposito';
  // Cuentas como base (Fase 3): si este fondo esta vinculado a una cuenta
  // (f.accountId), es un "apartado" que vive DENTRO de esa cuenta -- un
  // depósito/retiro de fondo es entonces una transferencia neutral: el
  // "libre" de la cuenta (account.amount) baja/sube exactamente lo que el
  // fondo sube/baja. Esto corre pase lo que pase con `entry.monthTx` (si
  // además cuenta como ahorro del mes es una decisión totalmente aparte,
  // ver openMove en FT.balanceScreen) -- por eso se guarda en la propia fila
  // de historial (acctMoved), no solo en una transacción de ft_data que
  // podria no existir (el camino "ya lo tenía" no crea ninguna).
  var acctId = entry._noAcctMove ? null : (f.accountId || null);
  if (acctId) FT[tipo === 'retiro' ? 'creditChecking' : 'deductChecking'](acctId, amt, entry.date);
  f.hist = f.hist || [];
  f.hist.push({ id: 'tx_' + entry.id, tipo: tipo, monto: amt, fecha: entry.date, nota: entry.note || '', cat: entry.cat || '', recId: entry.recId || null, cobId: entry.cobId || null, cobFor: entry.cobFor || null, monthTx: entry.monthTx || null, acctMoved: acctId });
  f.actual = Math.max(0, f.hist.reduce(function (a, h) { var m = parseFloat(h.monto) || 0; return a + (h.tipo === 'retiro' ? -m : m); }, 0));
  FT.saveSavingsFunds(funds);
};
FT.reverseSavings = function (txId) {
  var funds = FT.savingsFunds();
  for (var i = 0; i < funds.length; i++) {
    var f = funds[i], hist = f.hist || [];
    var j = hist.findIndex(function (h) { return h.id === 'tx_' + txId || h.id === txId; });
    if (j >= 0) {
      var row = hist[j];
      // Reversa tambien el lado de la cuenta vinculada, si este movimiento
      // llegó a moverla (ver comentario en FT.addSavings).
      if (row.acctMoved) FT[row.tipo === 'retiro' ? 'deductChecking' : 'creditChecking'](row.acctMoved, parseFloat(row.monto) || 0);
      hist.splice(j, 1);
      f.hist = hist;
      f.actual = Math.max(0, hist.reduce(function (a, h) { var m = parseFloat(h.monto) || 0; return a + (h.tipo === 'retiro' ? -m : m); }, 0));
      FT.saveSavingsFunds(funds);
      return;
    }
  }
};

/* ── Fondo de emergencia (saldo en ft_data.emergency; historial en 2 claves) ── */
FT.emergencyBalance = function () { return FT.data().emergency || 0; };
/** Cuenta a la que Emergencia está vinculada como apartado (Fase 3), o null
 *  si sigue siendo un pozo independiente (comportamiento de siempre). */
FT.emergencyAccountId = function () { return FT.get(K.emergAccountId, null); };
FT.setEmergencyAccountId = function (accountId) { FT.set(K.emergAccountId, accountId || null); FT._changed(); };
/** Historial de emergencia — funde ft_emerg_hist + ft_emergency_history (legado), dedup por id. */
FT.emergencyHist = function () {
  var a = FT.get(K.emergHist, []) || [];
  var b = (FT.get(K.emergHistLegacy, []) || []).map(function (h) {
    return { id: h.id, amount: h.amount, note: h.note, date: h.date, tipo: h.tipo || (h.type === 'retiro' ? 'retiro' : 'deposito') };
  });
  var seen = {}, out = [];
  // Revisión independiente (03-oct-2026): la llave de dedup no normalizaba
  // el prefijo "tx_" -- ft_emerg_hist guarda "777002" y la proyección
  // legada de ft_emergency_history guarda "tx_777002" para EL MISMO
  // movimiento, así que nunca se reconocían como duplicados: la pantalla
  // de Emergencia mostraba cada movimiento DOS veces. La copia legada
  // además pierde cat/monthTx/cobId (la proyección de abajo solo copia
  // id/amount/note/date/tipo) -- si alguien tocaba esa fila "de más" para
  // un retiro que en realidad pagó una deuda, se colaba del chequeo nuevo
  // de openDetail (cat==='💳 Deudas') y revertía solo el fondo, dejando la
  // deuda pagada "de la nada". a.concat(b) prioriza la fila rica
  // (ft_emerg_hist) sobre la legada para la misma llave.
  a.concat(b).forEach(function (h) { var id = h.id != null ? String(h.id).replace(/^tx_/, '') : (h.date + '|' + h.amount); if (!seen[id]) { seen[id] = 1; out.push(h); } });
  return out;
};
FT.addEmergency = function (entry) {
  var d = FT.data();
  var amt = parseFloat(entry.amount) || 0;
  var tipo = entry.tipo || 'deposito';
  // Mismo criterio que FT.addSavings: si Emergencia está vinculada a una
  // cuenta, un depósito/retiro es una transferencia neutral dentro de ella.
  var acctId = entry._noAcctMove ? null : FT.emergencyAccountId();
  if (acctId) FT[tipo === 'retiro' ? 'creditChecking' : 'deductChecking'](acctId, amt, entry.date);
  d.emergency = Math.max(0, (d.emergency || 0) + (tipo === 'retiro' ? -amt : amt));
  FT.set(K.data, d);
  // `cat` agregado (antes faltaba aquí, FT.addSavings ya lo tenía) para que
  // openDetail (FT.balanceScreen) pueda distinguir un retiro que en
  // realidad pagó una deuda (ver ahí abajo, QA 03-oct-2026) -- sin esto,
  // borrar ese movimiento desde Emergencia solo revertía el fondo y
  // dejaba la deuda y la transacción vinculada intactas.
  var row = { id: entry.id != null ? String(entry.id) : ('e_' + Date.now()), amount: amt, note: entry.note || '', date: entry.date || FT.todayISO(), tipo: tipo, cat: entry.cat || '', recId: entry.recId || null, cobId: entry.cobId || null, cobFor: entry.cobFor || null, monthTx: entry.monthTx || null, acctMoved: acctId };
  var h1 = FT.get(K.emergHist, []) || []; h1.push(row); FT.set(K.emergHist, h1);
  var h2 = FT.get(K.emergHistLegacy, []) || []; h2.push({ id: 'tx_' + row.id, amount: amt, date: row.date, type: tipo, note: row.note }); FT.set(K.emergHistLegacy, h2);
  FT._changed();
};
FT.reverseEmergency = function (id) {
  var target = String(id).replace(/^tx_/, '');
  var d = FT.data();
  var h1 = FT.get(K.emergHist, []) || [];
  var row = h1.find(function (r) { return String(r.id) === target || String(r.id) === 'tx_' + target; });
  if (row) {
    var amt = parseFloat(row.amount) || 0;
    if (row.acctMoved) FT[row.tipo === 'retiro' ? 'deductChecking' : 'creditChecking'](row.acctMoved, amt);
    d.emergency = Math.max(0, (d.emergency || 0) + (row.tipo === 'retiro' ? amt : -amt));
    FT.set(K.data, d);
  }
  FT.set(K.emergHist, h1.filter(function (r) { return String(r.id) !== target && String(r.id) !== 'tx_' + target; }));
  var h2 = FT.get(K.emergHistLegacy, []) || [];
  FT.set(K.emergHistLegacy, h2.filter(function (r) { return String(r.id) !== 'tx_' + target && String(r.id) !== target; }));
  FT._changed();
};

/* ── Amortización (deudas) ── */
FT.calcAmort = function (balance, payment, aprPct, termMonths) {
  var apr = parseFloat(aprPct) || 0, r = (apr / 100) / 12;
  if (apr === 0 || r === 0) {
    var months0 = payment > 0 ? Math.ceil(balance / payment) : (termMonths || 999);
    return { months: months0, totalInterest: 0, totalPaid: balance, payoffPossible: true, schedule: [] };
  }
  if (termMonths && payment === 0) payment = balance * r / (1 - Math.pow(1 + r, -termMonths));
  if (payment <= balance * r) return { months: 999, totalInterest: 999999, totalPaid: 999999, payoffPossible: false, schedule: [] };
  var bal = balance, totalInterest = 0, months = 0, schedule = [];
  while (bal > 0.01 && months < 600) {
    var interest = bal * r, principal = Math.min(payment - interest, bal);
    bal -= principal; totalInterest += interest; months++;
    // Tabla completa mes a mes (hasta 600) -- antes se guardaba solo una
    // muestra (24 primeros + cada 12) y no había forma de ver el resto.
    // El costo es el mismo bucle de todas formas; guardar cada fila no le
    // cuesta nada extra y deja que la pantalla decida cuánto mostrar.
    schedule.push({ month: months, principal: +principal.toFixed(2), interest: +interest.toFixed(2), balance: +Math.max(0, bal).toFixed(2) });
  }
  return { months: months, totalInterest: +totalInterest.toFixed(2), totalPaid: +(balance + totalInterest).toFixed(2), payoffPossible: true, schedule: schedule, monthlyPayment: +payment.toFixed(2) };
};
FT.calcRequiredPayment = function (balance, aprPct, termMonths) {
  var r = (aprPct / 100) / 12;
  if (!r || !termMonths) return 0;
  return balance * r / (1 - Math.pow(1 + r, -termMonths));
};

/* ── Cuentas de cheques (array de cuentas nombradas; migra objeto único) ── */
FT.checking = function () {
  var raw = FT.get(K.checking, []);
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return [{ id: 'chk_legacy', name: 'Cuenta', amount: parseFloat(raw.amount || raw) || 0, hogar: !!raw.hogar, updatedAt: FT.todayISO() }];
  return [];
};
FT.saveChecking = function (list) { FT.set(K.checking, list); FT._changed(); };
/** Descuenta `amount` del saldo de una cuenta de cheques (por id) -- para que
 *  un gasto/abono pagado con una cuenta conjunta se refleje solo ahí, sin
 *  que alguien tenga que ir a actualizar el saldo a mano. No-op si el id no
 *  existe (cuenta borrada mientras tanto). */
FT.deductChecking = function (accountId, amount, dateISO) {
  if (!accountId) return;
  var accts = FT.checking();
  var idx = accts.findIndex(function (a) { return String(a.id) === String(accountId); });
  if (idx < 0) return;
  accts[idx].amount = Math.round(((parseFloat(accts[idx].amount) || 0) - (parseFloat(amount) || 0)) * 100) / 100;
  if (dateISO) accts[idx].updatedAt = dateISO;
  FT.saveChecking(accts);
};
/** Sobregiro estilo SoFi: revisa si `amount` cabe en el "libre" de la cuenta
 *  (nunca en lo apartado -- los fondos vinculados NUNCA se tocan solos)
 *  ANTES de comprometerse a un gasto. La UI debe llamar esto y, si
 *  `ok:false`, pedir confirmación explícita antes de llamar a
 *  FT.deductChecking/FT.addEntry -- este helper solo informa, nunca bloquea
 *  ni descuenta nada por sí mismo. */
FT.checkOverdraft = function (accountId, amount) {
  var acct = FT.checking().find(function (a) { return String(a.id) === String(accountId); });
  if (!acct) return { ok: true, libre: 0, shortfall: 0 };
  var libre = FT.accountFree(acct), amt = parseFloat(amount) || 0;
  return { ok: amt <= libre + 0.005, libre: libre, shortfall: Math.max(0, +(amt - libre).toFixed(2)) };
};
/** Qué hay detrás de un faltante (15-oct-2026, aprobado vía simulación): además
 *  de lo libre, cuánto está apartado en fondos vinculados a esta cuenta y se
 *  puede pasar al disponible con un traspaso. Solo informa, no mueve nada. */
FT.accountCoverage = function (accountId, amount) {
  var acct = FT.checking().find(function (a) { return String(a.id) === String(accountId); });
  if (!acct) return { ok: true, libre: 0, shortfall: 0, funds: [], fundsTotal: 0, emerg: 0 };
  var libre = FT.accountFree(acct), amt = parseFloat(amount) || 0;
  var shortfall = Math.max(0, +(amt - libre).toFixed(2));
  var funds = FT.savingsFunds().filter(function (f) { return f.accountId === acct.id && (parseFloat(f.actual) || 0) > 0.004; })
    .map(function (f) { return { id: f.id, name: f.emoji + ' ' + f.name, actual: parseFloat(f.actual) || 0 }; })
    .sort(function (a, b) { return b.actual - a.actual; });
  var fundsTotal = funds.reduce(function (s, f) { return s + f.actual; }, 0);
  var emerg = FT.emergencyAccountId() === acct.id ? FT.emergencyBalance() : 0;
  return { ok: shortfall <= 0.005, libre: libre, shortfall: shortfall, funds: funds, fundsTotal: fundsTotal, emerg: emerg };
};
/** Traspaso: pasa `amount` de los fondos de Ahorro libre vinculados a la cuenta
 *  (el más grande primero) a su disponible. Con o.useEmergency también toma lo
 *  que falte de Emergencia. Cada retiro es el mismo FT.addSavings/addEmergency
 *  de siempre -- como el fondo está vinculado, sube el disponible de la cuenta
 *  exactamente lo que baja el fondo (el total de la cuenta no cambia). */
FT.coverFromFunds = function (accountId, amount, o) {
  o = o || {};
  var es = FT.lang === 'es';
  var left = +(parseFloat(amount) || 0).toFixed(2), moved = 0, i = 0, base = Date.now(), date = FT.todayISO();
  var cov = FT.accountCoverage(accountId, 0);
  var note = es ? 'Traspaso al disponible de la cuenta' : 'Transfer to the account\'s available balance';
  cov.funds.forEach(function (f) {
    if (left <= 0.004) return;
    var take = Math.min(left, f.actual);
    FT.addSavings({ id: base + (i++), amount: take, date: date, tipo: 'retiro', fundId: f.id, note: note });
    left = +(left - take).toFixed(2); moved += take;
  });
  if (left > 0.004 && o.useEmergency && cov.emerg > 0.004) {
    var takeE = Math.min(left, cov.emerg);
    FT.addEmergency({ id: base + (i++), amount: takeE, date: date, tipo: 'retiro', note: note });
    left = +(left - takeE).toFixed(2); moved += takeE;
  }
  return { moved: +moved.toFixed(2), left: left };
};
/** Inverso de FT.deductChecking -- para revertir al borrar o editar un movimiento. */
FT.creditChecking = function (accountId, amount) {
  if (!accountId) return;
  var accts = FT.checking();
  var idx = accts.findIndex(function (a) { return String(a.id) === String(accountId); });
  if (idx < 0) return;
  accts[idx].amount = Math.round(((parseFloat(accts[idx].amount) || 0) + (parseFloat(amount) || 0)) * 100) / 100;
  FT.saveChecking(accts);
};

/** Cuentas como base + fondos vinculados (Fase 3, 2026-09-26) ─────────────
 *  Un fondo de Ahorro libre o Emergencia puede vincularse a UNA cuenta como
 *  "apartado" (vault, modelo SoFi): el dinero del fondo ya está DENTRO de
 *  esa cuenta, no es dinero aparte. account.amount es, literal, "lo libre"
 *  -- vincular ABSORBE el saldo del fondo hacia el libre (se lo resta a
 *  account.amount, ver _openVincularFondo/setLink) para que el TOTAL
 *  mostrado (libre+apartado, FT.accountTotal) NO cambie con el link;
 *  desvincular lo libera de vuelta (se lo suma). Depositar/retirar de un
 *  fondo ya vinculado también mueve account.amount de verdad
 *  (FT.addSavings/FT.addEmergency, arriba), porque es una transferencia
 *  real dentro de la misma cuenta.
 *  "No duplica el total": el TOTAL de la cuenta (libre+apartado) es
 *  idéntico antes y después de vincular/desvincular -- el dinero solo
 *  cambia de "libre" a "apartado" (o viceversa) dentro de la MISMA cuenta,
 *  nunca aparece ni desaparece. */
FT.accountEarmarked = function (accountId) {
  if (!accountId) return 0;
  var out = 0;
  FT.savingsFunds().forEach(function (f) { if (f.accountId === accountId) out += parseFloat(f.actual) || 0; });
  if (FT.emergencyAccountId() === accountId) out += FT.emergencyBalance();
  var hf = FT.hogarFondos();
  if (hf.emerg && hf.emerg.accountId === accountId) out += parseFloat(hf.emerg.actual) || 0;
  (hf.metas || []).forEach(function (m) { if (m.accountId === accountId) out += parseFloat(m.actual) || 0; });
  FT.goals().forEach(function (g) { if (g.accountId === accountId) out += parseFloat(g.saved) || 0; }); // metas personales (apartados)
  return out;
};
/** "Libre en la cuenta" -- lo que NO está apartado en ningún fondo vinculado.
 *  Es, literalmente, el campo account.amount tal cual se guarda hoy. */
FT.accountFree = function (account) { return parseFloat(account && account.amount) || 0; };
/** Total mostrado para una cuenta = libre + todo lo apartado en fondos
 *  vinculados a ella. Ver nota de "no duplica el total" arriba. */
FT.accountTotal = function (account) { return FT.accountFree(account) + FT.accountEarmarked(account && account.id); };
/** Lista de {kind, id, name, actual} de todo lo que YA está vinculado a
 *  `accountId` -- para pintar el desglose "apartados" de una cuenta. */
FT.accountVaults = function (accountId) {
  var out = [];
  FT.savingsFunds().forEach(function (f) { if (f.accountId === accountId) out.push({ kind: 'fund', id: f.id, name: f.emoji + ' ' + f.name, actual: parseFloat(f.actual) || 0 }); });
  if (FT.emergencyAccountId() === accountId) out.push({ kind: 'emerg', id: null, name: '🛡️ ' + (FT.lang === 'es' ? 'Emergencia' : 'Emergency'), actual: FT.emergencyBalance() });
  var hf = FT.hogarFondos();
  if (hf.emerg && hf.emerg.accountId === accountId) out.push({ kind: 'hogaremerg', id: null, name: '🛡️ ' + (FT.lang === 'es' ? 'Emergencia del hogar' : 'Household emergency'), actual: parseFloat(hf.emerg.actual) || 0 });
  (hf.metas || []).forEach(function (m) { if (m.accountId === accountId) out.push({ kind: 'hogarmeta', id: m.id, name: '🎯 ' + m.nombre, actual: parseFloat(m.actual) || 0 }); });
  FT.goals().forEach(function (g) { if (g.accountId === accountId) out.push({ kind: 'goal', id: g.id, name: (g.icon || '🎯') + ' ' + g.name, actual: parseFloat(g.saved) || 0 }); });
  return out;
};

/** Pantalla de gestión de cuentas de cheques -- compartida entre Hogar
 *  (isHogar:true, cuentas conjuntas, con regla de reparto del aporte hogar)
 *  y Dashboard (isHogar:false, cuentas PERSONALES). Antes esto vivía
 *  duplicado tal cual dentro de hogar.html; Ramón pidió poder elegir "de
 *  qué cuenta sale" también en sus recurrentes personales (inversión,
 *  deuda, ahorro, metas) -- eso significa que FT.checking() ya no puede
 *  ser solo cuentas conjuntas, así que se generalizó aquí en vez de
 *  duplicar la pantalla completa otra vez. Las cuentas personales no
 *  tienen "regla" (esa solo tiene sentido para el reparto automático del
 *  aporte hogar, FT.suggestCheckingAllocation) -- son solo un saldo que
 *  tú ajustas a mano y que puedes elegir como origen al crear un
 *  recurrente en cualquier pantalla. */
/** Movimientos de una cuenta de cheques (los más recientes primero): gastos/ingresos/aportes ligados por
 *  checkingAccountId, ajustes y transferencias. Un movimiento pendiente sale marcado y aún no suma. */
FT.accountMovements = function (acctId, limit) {
  var out = [];
  FT.txs().forEach(function (t) {
    var a = parseFloat(t.amount) || 0;
    if (String(t.checkingAccountId) === String(acctId) && t.type !== 'transferencia') out.push({ date: t.date, desc: t.desc || t.cat || '', amount: t.acctCredited ? a : -a, by: t.createdBy, pending: !!t.acctPending, id: t.id });
    else if (t.type === 'transferencia' && t.fromRef && t.fromRef.type === 'account' && String(t.fromRef.id) === String(acctId)) out.push({ date: t.date, desc: (FT.lang === 'es' ? 'Transferencia → ' : 'Transfer → ') + (t.toLabel || ''), amount: -a, by: t.createdBy, id: t.id });
    else if (t.type === 'transferencia' && t.toRef && t.toRef.type === 'account' && String(t.toRef.id) === String(acctId)) out.push({ date: t.date, desc: (FT.lang === 'es' ? 'Transferencia ← ' : 'Transfer ← ') + (t.fromLabel || ''), amount: a, by: t.createdBy, id: t.id });
  });
  // Apartados dentro de la cuenta: abonos a metas y vincular/desvincular (no son transacciones, pero mueven el disponible).
  var es2 = FT.lang === 'es';
  FT.goals().forEach(function (g) {
    (g.hist || []).forEach(function (h) { if (String(h.acctId) === String(acctId)) out.push({ date: h.fecha, desc: (g.icon || '🎯') + ' ' + g.name + (es2 ? ' · apartado' : ' · set aside'), amount: -(parseFloat(h.monto) || 0), id: 0 }); });
    (g.vaultLog || []).forEach(function (v) { if (String(v.acctId) === String(acctId)) out.push({ date: v.date, desc: (g.icon || '🎯') + ' ' + g.name + (v.amount < 0 ? (es2 ? ' · apartado (ya ahorrado)' : ' · set aside (already saved)') : (es2 ? ' · liberado' : ' · released')), amount: v.amount, id: 0 }); });
  });
  var hfm = FT.hogarFondos();
  (hfm.metas || []).concat([hfm.emerg || {}]).forEach(function (m) { (m.vaultLog || []).forEach(function (v) { if (String(v.acctId) === String(acctId)) out.push({ date: v.date, desc: '🛡️ ' + (m.nombre || (es2 ? 'Emergencia del hogar' : 'Household emergency')) + (v.amount < 0 ? (es2 ? ' · apartado (ya ahorrado)' : ' · set aside (already saved)') : (es2 ? ' · liberado' : ' · released')), amount: v.amount, id: 0 }); }); });
  out.sort(function (x, y) { return String(y.date).localeCompare(String(x.date)) || (parseInt(y.id, 10) || 0) - (parseInt(x.id, 10) || 0); });
  return out.slice(0, limit || 8);
};
FT.checkingAccountsScreen = function (isHogar) {
  var L = FT.lang === 'es';
  // 19-oct-2026, a petición de Ramón: "al modificar cuentas tiene que ser muy
  // sencillo, sin confusiones" -- antes cada cuenta traía 4 íconos sueltos
  // (✏️ ⭐ 🔗 🗑) sin decir qué hacían. Ahora cada cuenta es una tarjeta con
  // "Editar ›" visible, y al tocarla se abre un menú con cada acción rotulada y
  // explicada (cuadrar saldo, renombrar, vincular fondo, regla, eliminar).
  var _open = {}; // cuentas con los movimientos desplegados (solo mientras esta hoja esté abierta)
  function movRows(list, who) {
    if (!list.length) return '<div style="font-size:11.5px;color:var(--text3);padding:6px 0">' + (L ? 'Sin movimientos todavía.' : 'No activity yet.') + '</div>';
    return list.map(function (m) {
      return '<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;font-size:12.5px;border-bottom:1px dashed var(--hair)"><span style="min-width:0">' + FT.date(m.date) + ' · ' + _escH(m.desc) + (m.by && m.by !== FT.userName() ? ' · <b>' + _escH(m.by) + '</b>' : '') + (m.pending ? ' · ⏳' : '') + '</span>' +
        '<b style="white-space:nowrap;color:' + (m.amount >= 0 ? 'var(--g-main)' : 'var(--ink)') + '">' + (m.amount >= 0 ? '+' : '−') + FT.money(Math.abs(m.amount), { cents: true }) + '</b></div>';
    }).join('');
  }
  function bannerHtml() {
    if (!isHogar) return '';
    var out = '', pn = FT.hogar().partnerName || (L ? 'tu pareja' : 'your partner');
    FT.hogarUnassigned().forEach(function (u) {
      out += '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--amber-bg,#FFF3DF);border-radius:12px;margin-bottom:8px"><div style="flex:1;font-size:12.5px"><b>' + FT.money(u.monto, { cents: true }) + '</b> ' + (L ? 'sin asignar de tu cheque del ' : 'unassigned from your paycheck of ') + FT.date(u.fecha) + '</div><button type="button" class="tap" data-asg-mine="' + String(u.id).replace(/[^\w\-]/g, '') + '" style="padding:7px 12px;border-radius:9px;border:none;background:var(--g-main);color:#fff;font-weight:800;font-size:12px;cursor:pointer;font-family:inherit">' + (L ? 'Asignar' : 'Assign') + '</button></div>';
    });
    FT.partnerUnassigned().forEach(function (u) {
      out += '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--amber-bg,#FFF3DF);border-radius:12px;margin-bottom:8px"><div style="flex:1;font-size:12.5px"><b>' + FT.money(u.monto, { cents: true }) + '</b> ' + (L ? 'sin asignar del cheque de ' + _escH(pn) + ' del ' : 'unassigned from ' + _escH(pn) + "'s paycheck of ") + FT.date(u.fecha) + '</div><button type="button" class="tap" data-asg-partner="' + String(u.id).replace(/[^\w\-]/g, '') + '" style="padding:7px 12px;border-radius:9px;border:none;background:var(--g-main);color:#fff;font-weight:800;font-size:12px;cursor:pointer;font-family:inherit">' + (L ? 'Asignar' : 'Assign') + '</button></div>';
    });
    return out;
  }
  function partnerHtml() {
    if (!isHogar) return '';
    var pa = FT.partnerJointAccounts();
    if (!pa.length) return '';
    var pn = FT.hogar().partnerName || (L ? 'tu pareja' : 'your partner');
    var pp = FT.partnerProfile(), ptx = (pp && pp.data && pp.data.transactions) || [];
    return '<div style="font-size:11px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin:12px 2px 6px">' + (L ? 'Cuentas de ' + _escH(pn) + ' · solo lectura' : _escH(pn) + "'s accounts · read only") + '</div>' +
      '<button type="button" class="tap" data-rule-partner="1" style="width:100%;padding:9px;margin-bottom:8px;border-radius:11px;border:1.5px solid var(--hair);background:#fff;color:var(--text2);font-weight:800;font-size:12px;cursor:pointer;font-family:inherit">⚙️ ' + (L ? 'Cambiar el reparto de sus cheques' : 'Change how their paychecks split') + '</button>' +
      pa.map(function (c) {
        var mv = ptx.filter(function (t) { return String(t.checkingAccountId) === String(c.id); }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 6)
          .map(function (t) { return { date: t.date, desc: t.desc, amount: t.acctCredited ? parseFloat(t.amount) || 0 : -(parseFloat(t.amount) || 0), by: t.createdBy }; });
        var op = !!_open['p' + c.id];
        return '<div style="border:1px solid var(--hair);border-radius:14px;margin-bottom:8px;overflow:hidden">' +
          '<button type="button" class="tap" data-mv="' + _escH('p' + c.id) + '" aria-expanded="' + op + '" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 12px;background:var(--sunk);border:none;font-family:inherit;color:inherit;text-align:left;cursor:pointer"><div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:800">' + _escH(c.name || (L ? 'Cuenta' : 'Account')) + '</div><div style="font-size:15px;font-weight:900">' + FT.money(FT.accountTotal(c), { cents: true }) + '</div></div><span style="font-size:11px;color:var(--text3)">' + (op ? '▴' : '▾') + ' ' + (L ? 'Movimientos' : 'Activity') + '</span></button>' +
          (op ? '<div style="padding:4px 12px 8px">' + movRows(mv) + '</div>' : '') + '</div>';
      }).join('');
  }
  function rowsHtml() {
    var mine = FT.checking().filter(function (c) { return !!c.hogar === !!isHogar; });
    var head = bannerHtml();
    if (!mine.length) return head + '<div style="font-size:12px;color:var(--text3);padding:6px 0 10px">' + (isHogar ? (L ? 'Aún no tienes ninguna cuenta marcada como conjunta.' : "You don't have any account marked as joint yet.") : (L ? 'Aún no tienes ninguna cuenta personal registrada.' : "You don't have any personal account yet.")) + '</div>' + partnerHtml();
    var defId = FT.user().defaultAccountId;
    return head + mine.map(function (c) {
      var ruleLbl = isHogar ? (c.rule ? (c.rule.type === 'remainder' ? (L ? 'Lo que sobre' : "What's left") : c.rule.type === 'pct' ? (Number(c.rule.value) || 0) + '%' : FT.money(Number(c.rule.value) || 0)) : (c.autoDeposit ? (L ? '100% (config. anterior)' : '100% (old setting)') : null)) : null;
      // Cuentas como base (Fase 1/3): con fondos vinculados se muestra Total → Apartado → Disponible (espejo del modelo SoFi).
      var vaults = FT.accountVaults(c.id);
      var libre = FT.accountFree(c), apartado = FT.accountEarmarked(c.id), total = libre + apartado;
      var ico = c.kind === 'cash' ? '💵' : c.kind === 'other' ? '➕' : '🏦';
      var chips = [];
      if (!isHogar && c.id === defId) chips.push('⭐ ' + (L ? 'Predeterminada' : 'Default'));
      if (vaults.length) chips.push('🔗 ' + vaults.length + ' ' + (L ? 'apartado(s)' : 'vault(s)'));
      if (ruleLbl) chips.push('⚙️ ' + (L ? 'Regla: ' : 'Rule: ') + ruleLbl);
      var op = !!_open[c.id];
      return '<div style="border:1px solid var(--hair);border-radius:14px;margin-bottom:8px;overflow:hidden">' +
        '<div style="display:flex;align-items:stretch;background:var(--sunk)">' +
          '<button type="button" class="tap" data-mv="' + _escH(c.id) + '" aria-expanded="' + op + '" title="' + (L ? 'Ver los movimientos de esta cuenta' : 'See this account\'s activity') + '" style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;padding:11px 12px;background:none;border:none;font-family:inherit;color:inherit;text-align:left;cursor:pointer">' +
            '<div style="width:38px;height:38px;border-radius:12px;background:#fff;display:grid;place-items:center;font-size:18px;flex-shrink:0">' + ico + '</div>' +
            '<div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _escH(c.name || (L ? 'Cuenta' : 'Account')) + '</div>' +
            '<div style="font-size:15px;font-weight:900;margin-top:1px">' + FT.money(vaults.length ? total : (c.amount || 0), { cents: true }) + '</div>' +
            (vaults.length ? '<div style="font-size:10px;color:var(--text3)">' + (L ? 'Disponible ' : 'Available ') + FT.money(libre, { cents: true }) + ' · ' + (L ? 'Apartado ' : 'Set aside ') + FT.money(apartado, { cents: true }) + '</div>' : '') +
            (chips.length ? '<div style="font-size:10px;color:var(--g-dark);font-weight:700;margin-top:3px">' + chips.join(' · ') + '</div>' : '') + '</div>' +
            '<span style="font-size:11px;color:var(--text3);white-space:nowrap">' + (op ? '▴' : '▾') + ' ' + (L ? 'Movimientos' : 'Activity') + '</span></button>' +
          '<button type="button" class="tap" data-acct-menu="' + c.id + '" title="' + (L ? 'Editar esta cuenta' : 'Edit this account') + '" style="padding:0 14px;background:none;border:none;border-left:1px solid var(--hair);font-size:12px;font-weight:800;color:var(--blue);cursor:pointer;font-family:inherit">' + (L ? 'Editar' : 'Edit') + ' ›</button></div>' +
        (op ? '<div style="padding:4px 12px 8px">' + movRows(FT.accountMovements(c.id, 8)) + '<div class="tap" data-hist="' + c.id + '" style="font-size:12px;font-weight:800;color:var(--g-main);padding:8px 0 2px;cursor:pointer">' + (L ? 'Ver todos en Historial ›' : 'See all in History ›') + '</div></div>' : '') + '</div>';
    }).join('') + partnerHtml();
  }

  FT.sheet({
    title: isHogar ? '🏦 ' + (L ? 'Cuentas de cheques conjuntas' : 'Joint checking accounts') : '🏦 ' + (L ? 'Mis cuentas' : 'My accounts'),
    html: '<div id="acctRows">' + rowsHtml() + '</div>' +
      '<p style="font-size:10.5px;color:var(--text3);margin-top:6px">' + (isHogar
        ? (L ? 'Toca una cuenta para editarla. Cada cuenta con regla recibe su parte (monto fijo o %) de tu aporte de hogar cada vez que registras un cheque nuevo -- puedes poner regla en varias cuentas a la vez. Lo que ninguna regla cubra no se deposita en ninguna cuenta, pero sigue contando en tu presupuesto de hogar.' : "Tap an account to edit it. Each account with a rule gets its share (fixed $ or %) of your household contribution every time you log a new paycheck -- you can set a rule on more than one account. Whatever no rule covers isn't deposited to any account, but still counts toward your household budget.")
        : (L ? 'Toca una cuenta para editarla. Puedes elegir cualquiera como origen al crear un recurrente (inversión, deuda, ahorro, meta), para que se descuente de aquí cuando se aplique.' : 'Tap an account to edit it. You can pick any of them as the source when creating a recurring item (investment, debt, savings, goal), so it gets deducted from here when it applies.')) + '</p>',
    actions: [
      { label: '＋ ' + (L ? 'Agregar cuenta' : 'Add account'), onClick: function () { _openCuentaForm(isHogar); } }
    ],
    onOpen: function (body) {
      function wire() {
        body.querySelectorAll('[data-mv]').forEach(function (b) { b.onclick = function () { var k = b.getAttribute('data-mv'); _open[k] = !_open[k]; var box = body.querySelector('#acctRows'); if (box) { box.innerHTML = rowsHtml(); wire(); } }; });
        body.querySelectorAll('[data-rule-partner]').forEach(function (b) { b.onclick = function () { FT.openReglaPareja(); }; });
        body.querySelectorAll('[data-hist]').forEach(function (b) { b.onclick = function () { FT.go('historial.html?acct=' + encodeURIComponent(b.getAttribute('data-hist'))); }; });
        body.querySelectorAll('[data-asg-mine]').forEach(function (b) { b.onclick = function () { var u = FT.cheques().find(function (x) { return String(x.id).replace(/[^\w\-]/g, '') === b.getAttribute('data-asg-mine'); }); if (u && (parseFloat(u.hogarSinAsignar) || 0) > 0.5) FT.openAsignar({ target: 'mine', chequeId: u.id, monto: u.hogarSinAsignar, fecha: u.fecha, total: u.hogarAmt }); }; });
        body.querySelectorAll('[data-asg-partner]').forEach(function (b) { b.onclick = function () { var u = FT.partnerUnassigned().find(function (x) { return String(x.id).replace(/[^\w\-]/g, '') === b.getAttribute('data-asg-partner'); }); if (u) FT.openAsignar({ target: 'partner', chequeId: u.id, monto: u.monto, fecha: u.fecha, total: u.total, partnerName: FT.hogar().partnerName }); }; });
        body.querySelectorAll('[data-acct-menu]').forEach(function (b) {
          b.onclick = function () {
            var acct = FT.checking().find(function (a) { return String(a.id) === b.getAttribute('data-acct-menu'); });
            if (acct) _openAccountMenu(acct, isHogar);
          };
        });
      }
      wire();
      // La lista se refresca sola cuando algo cambia (cuadrar saldo, renombrar, eliminar...).
      function refresh() {
        if (!document.body.contains(body)) { document.removeEventListener('ft:datachanged', refresh); return; }
        var box = body.querySelector('#acctRows');
        if (box) { box.innerHTML = rowsHtml(); wire(); }
      }
      document.addEventListener('ft:datachanged', refresh);
    }
  });
};
function _escH(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

/** Menú de una cuenta: cada acción con su nombre y una línea que explica qué hace. */
function _openAccountMenu(acct, isHogar) {
  var L = FT.lang === 'es';
  var defId = FT.user().defaultAccountId;
  var total = FT.accountEarmarked(acct.id) ? FT.accountTotal(acct) : (parseFloat(acct.amount) || 0);
  function act(ico, title, sub, key, danger) {
    return '<div class="tap" data-act="' + key + '" style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:12px;background:var(--sunk);margin-bottom:8px;cursor:pointer">' +
      '<div style="font-size:18px;width:26px;text-align:center">' + ico + '</div>' +
      '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:800;' + (danger ? 'color:var(--red)' : '') + '">' + title + '</div><div style="font-size:11px;color:var(--text3)">' + sub + '</div></div>' +
      '<div style="color:var(--text3)">›</div></div>';
  }
  var html = '<div style="text-align:center;margin-bottom:14px"><div class="ft-num" style="font-size:26px">' + FT.money(total, { cents: true }) + '</div></div>' +
    act('✏️', L ? 'Cuadrar saldo con mi banco' : 'Match my bank balance', L ? 'Escribe lo que dice tu banco y la app se ajusta' : 'Type what your bank shows and the app adjusts', 'bal') +
    act('🏷️', L ? 'Cambiar nombre' : 'Rename', L ? 'Ponle el nombre que reconozcas' : 'Give it a name you recognize', 'name') +
    (isHogar
      ? act('⚙️', L ? 'Regla de depósito' : 'Deposit rule', L ? 'Cuánto de tu aporte de hogar llega aquí cada cheque' : 'How much of your household share lands here each paycheck', 'rule')
      : act('🔗', L ? 'Vincular un fondo' : 'Link a fund', L ? 'Aparta una parte de esta cuenta para un fondo de ahorro' : 'Set part of this account aside for a savings fund', 'vault') +
        act(acct.id === defId ? '☆' : '⭐', acct.id === defId ? (L ? 'Quitar como predeterminada' : 'Remove as default') : (L ? 'Usar como predeterminada' : 'Use as default'), L ? 'La que se propone al registrar un gasto' : 'The one suggested when you log an expense', 'def')) +
    act('🗑️', L ? 'Eliminar cuenta' : 'Delete account', L ? 'Solo se puede si está en $0 y sin fondos vinculados' : 'Only possible at $0 with no linked funds', 'del', true);
  FT.sheet({
    title: _escH(acct.name || (L ? 'Cuenta' : 'Account')),
    html: html,
    onOpen: function (body) {
      body.querySelectorAll('[data-act]').forEach(function (b) {
        b.onclick = function () {
          var k = b.getAttribute('data-act');
          FT.closeTop();
          if (k === 'bal') _openAjusteSaldoCuenta(acct);
          else if (k === 'name') _openRenombrarCuenta(acct);
          else if (k === 'rule') _openReglaCuenta(acct);
          else if (k === 'vault') _openVincularFondo(acct, isHogar);
          else if (k === 'def') {
            var u = FT.user();
            u.defaultAccountId = (u.defaultAccountId === acct.id) ? null : acct.id;
            FT.saveUser(u);
            FT.toast(u.defaultAccountId ? (L ? '⭐ Cuenta predeterminada' : '⭐ Default account') : (L ? 'Ya no es la predeterminada' : 'No longer default'));
            FT._changed();
          } else if (k === 'del') _deleteCuenta(acct);
        };
      });
    }
  });
}
function _openRenombrarCuenta(acct) {
  var L = FT.lang === 'es';
  FT.modal({
    title: L ? 'Cambiar nombre' : 'Rename account',
    html: '<div class="ft-field"><label>' + (L ? 'Nombre' : 'Name') + '</label><input id="rnName" value="' + _escH(acct.name || '') + '"></div>',
    saveLabel: L ? 'Guardar' : 'Save',
    onSave: function (body) {
      var name = (body.querySelector('#rnName').value || '').trim();
      if (!name) { FT.toast(L ? 'Ingresa un nombre' : 'Enter a name'); return true; }
      var accts = FT.checking();
      var a = accts.find(function (x) { return String(x.id) === String(acct.id); });
      if (a) { a.name = name; FT.saveChecking(accts); FT.toast(L ? '✅ Nombre actualizado' : '✅ Name updated'); }
    }
  });
}
function _deleteCuenta(acct) {
  var L = FT.lang === 'es', id = String(acct.id);
  // Ningún saldo se pierde en silencio: con fondos vinculados (apartados) hay
  // que desvincularlos primero, y solo se elimina una cuenta en $0.
  if (FT.accountVaults(id).length) {
    FT.toast(L ? 'Esta cuenta tiene fondos vinculados — desvincúlalos primero (Vincular un fondo)' : 'This account has linked funds — unlink them first (Link a fund)');
    return;
  }
  if (Math.abs(parseFloat(acct.amount) || 0) >= 0.005) {
    FT.toast(L ? 'Esta cuenta tiene saldo — cuádrala a $0 antes de eliminarla' : 'This account has a balance — set it to $0 before deleting it');
    return;
  }
  FT.confirm(L ? '¿Eliminar «' + acct.name + '»?' : 'Delete "' + acct.name + '"?').then(function (ok) {
    if (!ok) return;
    var fresh = FT.checking().find(function (a) { return String(a.id) === id; });
    if (!fresh || Math.abs(parseFloat(fresh.amount) || 0) >= 0.005 || FT.accountVaults(id).length) { FT.toast(L ? 'Esta cuenta ya no está en $0 o sin vínculos' : 'This account is no longer at $0 or unlinked'); return; }
    FT.saveChecking(FT.checking().filter(function (a) { return String(a.id) !== id; }));
    var uD = FT.user(); if (uD.defaultAccountId && String(uD.defaultAccountId) === id) { uD.defaultAccountId = null; FT.saveUser(uD); }
    FT.toast(L ? 'Eliminada' : 'Deleted');
  });
}
function _openCuentaForm(isHogar) {
  var L = FT.lang === 'es';
  FT.modal({
    title: isHogar ? (L ? 'Nueva cuenta conjunta' : 'New joint account') : (L ? 'Nueva cuenta personal' : 'New personal account'),
    html: '<div class="ft-field"><label>' + (L ? 'Tipo' : 'Type') + '</label><select id="ctKind"><option value="checking">🏦 ' + (L ? 'Cuenta de cheques' : 'Checking account') + '</option><option value="cash">💵 ' + (L ? 'Efectivo' : 'Cash') + '</option><option value="other">➕ ' + (L ? 'Otra cuenta' : 'Other account') + '</option></select></div>' +
      '<div class="ft-field"><label>' + (L ? 'Nombre' : 'Name') + '</label><input id="ctName" placeholder="' + (isHogar ? (L ? 'Ej. Cuenta conjunta' : 'E.g. Joint account') : (L ? 'Ej. Mi checking' : 'E.g. My checking')) + '"></div>' +
      '<div class="ft-field"><label>' + (L ? 'Saldo actual' : 'Current balance') + '</label><input id="ctAmt" inputmode="decimal" placeholder="$0"></div>' +
      '<p style="font-size:10.5px;color:var(--text3)">' + (L ? '¿Tarjeta de crédito o préstamo? Eso es una deuda: agrégala en Deudas.' : 'Credit card or loan? That is a debt: add it in Debts.') + '</p>',
    saveLabel: L ? 'Agregar' : 'Add',
    onSave: function (body) {
      var name = (body.querySelector('#ctName').value || '').trim();
      var kind = body.querySelector('#ctKind').value;
      if (!name) { FT.toast(L ? 'Ingresa un nombre' : 'Enter a name'); return true; }
      var amt = FT.numMoney(body.querySelector('#ctAmt').value) || 0;
      var accts = FT.checking();
      accts.push({ id: 'chk_' + Date.now(), name: name, amount: amt, hogar: !!isHogar, kind: kind, updatedAt: FT.todayISO() });
      FT.saveChecking(accts);
      FT.toast(L ? '✅ Cuenta agregada' : '✅ Account added');
      FT.closeTop();
    }
  });
}
/** Regla de reparto (monto fijo o %) para una cuenta de cheques conjunta --
 *  mismo patrón que las reglas de fondos de Ahorro libre. Solo aplica a
 *  cuentas de hogar (FT.suggestCheckingAllocation solo mira hogar:true) --
 *  las personales no tienen regla, ver comentario de FT.checkingAccountsScreen. */
function _openReglaCuenta(acct) {
  var L = FT.lang === 'es';
  var chosenRule = (acct.rule && acct.rule.type) || (acct.autoDeposit ? 'pct' : 'none');
  var chosenVal = acct.rule ? acct.rule.value : (acct.autoDeposit ? 100 : '');
  FT.modal({
    title: (L ? 'Regla para ' : 'Rule for ') + acct.name,
    html:
      '<div class="ft-field"><label>' + (L ? 'Tipo de regla' : 'Rule type') + '</label>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px" id="crSeg">' +
          ['none:' + (L ? 'Ninguna' : 'None'), 'fixed:' + (L ? 'Monto fijo' : 'Fixed $'), 'pct:' + (L ? '% del aporte' : '% of share'), 'remainder:' + (L ? 'Lo que sobre' : "What's left")].map(function (o) { var v = o.split(':')[0], on = v === chosenRule; return '<button type="button" data-r="' + v + '" style="padding:8px 4px;border-radius:9px;border:1.5px solid ' + (on ? 'var(--g-main)' : 'var(--hair)') + ';background:' + (on ? 'var(--g-light)' : 'var(--sunk)') + ';font-family:inherit;font-size:10px;font-weight:800;color:' + (on ? 'var(--g-dark)' : 'var(--text2)') + ';cursor:pointer">' + o.split(':')[1] + '</button>'; }).join('') + '</div>' +
        '<input id="crVal" inputmode="decimal" style="margin-top:8px;display:' + (chosenRule === 'none' || chosenRule === 'remainder' ? 'none' : 'block') + '" placeholder="' + (chosenRule === 'pct' ? (L ? '% de tu aporte hogar' : '% of your household share') : '$') + '" value="' + (chosenVal || '') + '">' +
        '<p id="crRemainderNote" style="font-size:10.5px;color:var(--text3);margin-top:6px;display:' + (chosenRule === 'remainder' ? 'block' : 'none') + '">' + (L ? 'Se lleva lo que quede de tu aporte de hogar después de aplicar las demás reglas fijas/% -- si hay más de una cuenta con esta regla, se reparte en partes iguales.' : "Gets whatever's left of your household share after the other fixed/% rules -- if more than one account has this rule, it's split evenly.") + '</p>' +
      '</div>' +
      '<div style="background:var(--sky-bg);color:#2A4CC0;border-radius:10px;padding:9px 11px;font-size:11px;font-weight:600">' + (L ? 'Se aplica solo, sin preguntar cada vez -- es una regla que tú configuras de antemano, no un reparto que haya que confirmar cada cheque.' : "Applies automatically, no need to confirm each time -- it's a rule you set in advance, not something to confirm every paycheck.") + '</div>',
    saveLabel: L ? 'Guardar regla' : 'Save rule',
    onOpen: function (body) {
      var valInput = body.querySelector('#crVal');
      var remainderNote = body.querySelector('#crRemainderNote');
      body.querySelectorAll('#crSeg button').forEach(function (b) {
        b.onclick = function () {
          chosenRule = b.getAttribute('data-r');
          body.querySelectorAll('#crSeg button').forEach(function (x) { var on = x === b; x.style.borderColor = on ? 'var(--g-main)' : 'var(--hair)'; x.style.background = on ? 'var(--g-light)' : 'var(--sunk)'; x.style.color = on ? 'var(--g-dark)' : 'var(--text2)'; });
          valInput.style.display = (chosenRule === 'none' || chosenRule === 'remainder') ? 'none' : 'block';
          valInput.placeholder = chosenRule === 'pct' ? (L ? '% de tu aporte hogar' : '% of your household share') : '$';
          if (remainderNote) remainderNote.style.display = chosenRule === 'remainder' ? 'block' : 'none';
        };
      });
    },
    onSave: function (body) {
      var val = FT.numMoney(body.querySelector('#crVal').value) || 0;
      var accts = FT.checking();
      var a = accts.find(function (x) { return String(x.id) === String(acct.id); });
      if (!a) return;
      a.rule = chosenRule === 'remainder' ? { type: 'remainder' } : (chosenRule !== 'none' && val > 0) ? { type: chosenRule, value: val } : null;
      a.autoDeposit = false; // ya no se usa el toggle viejo -- todo pasa por `rule` de aquí en adelante
      FT.saveChecking(accts);
      FT.toast(L ? '✅ Regla guardada' : '✅ Rule saved');
      FT.closeTop();
    }
  });
}
/** Resumen de reparto. 12-oct-2026, a petición de Ramón: "busco la parte
 *  de repartos... no encuentro" -- la regla de cada fondo de Ahorro libre
 *  vive dentro de "Editar fondo" en esa pantalla, y la regla de cada
 *  cuenta conjunta vive dentro de "Cuentas" en Hogar -- dos pantallas sin
 *  ningún lugar que las junte. Esta hoja solo LISTA y enlaza, no reinventa
 *  la edición: una cuenta conjunta abre _openReglaCuenta aquí mismo
 *  (apilada); un fondo navega a Ahorro libre ya con "Editar fondo"
 *  abierto solo (openFundForm vive dentro del closure de esa pantalla, no
 *  se puede abrir desde aquí directamente). */
FT.openRepartoResumen = function () {
  var L = FT.lang === 'es';
  function ruleLbl(rule) { return rule ? (rule.type === 'remainder' ? (L ? 'Lo que sobre' : "What's left") : rule.type === 'pct' ? rule.value + '%' : FT.money(rule.value)) : null; }
  function rowHtmlR(attr, id, name, rule) {
    var lbl = ruleLbl(rule);
    return '<div class="tap" data-' + attr + '="' + id + '" style="display:flex;align-items:center;gap:8px;padding:9px;background:var(--sunk);border-radius:10px;margin-bottom:6px;cursor:pointer">' +
      '<div style="flex:1;min-width:0;font-size:12.5px;font-weight:700">' + name + '</div>' +
      '<div style="font-size:10.5px;font-weight:800;color:' + (lbl ? 'var(--g-dark)' : 'var(--text3)') + '">' + (lbl ? lbl : (L ? 'Sin regla ›' : 'No rule ›')) + '</div>' +
    '</div>';
  }
  var funds = FT.savingsFunds();
  var fundRows = funds.map(function (f) { return rowHtmlR('goto-fund', f.id, f.emoji + ' ' + f.name, f.rule); }).join('');
  var hogarConn = FT.hogarConnected();
  var jointAccts = hogarConn ? FT.checking().filter(function (c) { return !!c.hogar; }) : [];
  var acctRows = jointAccts.map(function (c) { return rowHtmlR('edit-acct', c.id, '🏦 ' + (c.name || (L ? 'Cuenta' : 'Account')), c.rule); }).join('');
  FT.sheet({
    title: '💰 ' + (L ? 'Cómo se reparte tu cheque' : 'How your paycheck gets split'),
    html:
      '<div style="background:var(--sky-bg);color:#2A4CC0;border-radius:10px;padding:9px 11px;font-size:11px;font-weight:600;margin-bottom:12px">' + (L ? 'Toca cualquiera para ponerle o cambiarle su regla (monto fijo o %). Lo que no tenga regla no se reparte solo -- tú lo decides cada vez que llega un cheque.' : "Tap any one to set or change its rule (fixed $ or %). Anything without a rule doesn't split on its own -- you decide each time a paycheck comes in.") + '</div>' +
      (funds.length ? '<div style="font-size:10.5px;font-weight:800;color:var(--text3);text-transform:uppercase;margin-bottom:6px">' + (L ? 'Fondos de Ahorro libre' : 'Free savings funds') + '</div>' + fundRows : '') +
      (hogarConn ? '<div style="font-size:10.5px;font-weight:800;color:var(--text3);text-transform:uppercase;margin:' + (funds.length ? '14px' : '0') + ' 0 6px">' + (L ? 'Cuentas conjuntas de hogar' : 'Joint household accounts') + '</div>' + (acctRows || '<div style="font-size:11.5px;color:var(--text3)">' + (L ? 'Aún no tienes ninguna cuenta conjunta.' : "You don't have a joint account yet.") + '</div>') : '') +
      (!funds.length && !hogarConn ? '<div style="font-size:11.5px;color:var(--text3)">' + (L ? 'Todavía no tienes fondos ni cuentas conjuntas configuradas.' : "You don't have funds or joint accounts set up yet.") + '</div>' : ''),
    onOpen: function (body) {
      body.querySelectorAll('[data-goto-fund]').forEach(function (b) {
        b.onclick = function () {
          FT.setRaw('ft_open_fund', b.getAttribute('data-goto-fund'));
          FT.setRaw('ft_open_fund_edit', '1');
          FT.closeTop();
          FT.go('ahorro.html');
        };
      });
      body.querySelectorAll('[data-edit-acct]').forEach(function (b) {
        b.onclick = function () {
          var id = b.getAttribute('data-edit-acct');
          var acct = FT.checking().find(function (a) { return String(a.id) === id; });
          if (acct) _openReglaCuenta(acct);
        };
      });
    }
  });
};
/** Corrige a mano el saldo de una cuenta -- para cuando el depósito
 *  automático no aplicó (ej. cheques registrados antes de configurar la
 *  regla, o antes de que este feature existiera) y quieres que el número
 *  aquí refleje tu banco real sin tener que borrar/rehacer nada. Reemplaza
 *  el saldo directo (no suma/resta), para no tener que hacer cuentas --
 *  solo escribes lo que de verdad dice tu banco. */
function _openAjusteSaldoCuenta(acct) {
  var L = FT.lang === 'es';
  // Revisión independiente (hallazgo G-1): si la cuenta tiene fondos
  // vinculados, la fila de la lista muestra el TOTAL (libre + apartado) --
  // pedirle al usuario "escribe lo que dice tu banco" pero guardarlo como
  // si fuera solo el libre duplicaba el apartado (ej. banco real $1,550,
  // se escribía 1550 como "amount", y la pantalla volvía a sumarle los
  // $550 del fondo encima → $2,100). Ahora, con vínculos, este campo edita
  // el mismo TOTAL que la fila muestra, y por dentro se guarda solo el
  // libre (total − apartado) -- sin vínculos, el comportamiento es
  // idéntico al de siempre (edita el libre directo).
  var apartado = FT.accountEarmarked(acct.id);
  var shown = Math.round((apartado ? FT.accountTotal(acct) : (parseFloat(acct.amount) || 0)) * 100) / 100;
  FT.modal({
    title: (L ? 'Cuadrar con mi banco · ' : 'Match my bank · ') + acct.name,
    // 15-oct-2026 (aprobado vía simulación): esta pantalla ya existía como
    // "Ajustar saldo" pero nadie la encontraba -- ahora se llama como lo que
    // hace, el motivo viene prellenado (un clic menos) y muestra en vivo
    // cuánto quedaría de disponible antes de guardar.
    onOpen: function (body) {
      var inp = body.querySelector('#abSaldo'), prev = body.querySelector('#abPrev');
      if (!inp || !prev) return;
      function upd() {
        var v = FT.numMoney(inp.value);
        if (!/\d/.test(inp.value)) { prev.textContent = ''; return; }
        var ap = FT.accountEarmarked(acct.id), nl = +(v - ap).toFixed(2);
        prev.style.color = nl < -0.005 ? 'var(--red)' : 'var(--g-main)';
        prev.textContent = nl < -0.005
          ? (L ? 'Tus fondos suman más que ese saldo (' + FT.money(ap, { cents: true }) + '). Revisa el saldo del fondo.' : 'Your funds add up to more than that balance (' + FT.money(ap, { cents: true }) + '). Check the fund balance.')
          : (L ? 'El disponible quedaría en ' : 'Available would be ') + FT.money(nl, { cents: true });
      }
      inp.addEventListener('input', upd); upd();
    },
    html: '<div class="ft-field"><label>' + (L ? '¿Qué dice tu banco?' : 'What does your bank show?') + '</label><input id="abSaldo" inputmode="decimal" value="' + shown + '"></div>' +
      (apartado ? '<p id="abPrev" style="font-size:12px;font-weight:800;margin:-4px 0 8px"></p>' : '') +
      (apartado ? '<p style="font-size:10.5px;color:var(--text3)">' + (L ? 'Escribe el TOTAL que dice tu banco (incluye lo apartado en fondos vinculados, ' + FT.money(apartado, { cents: true }) + '). La app descuenta lo apartado solo -- no lo sumes tú.' : 'Type the TOTAL your bank shows (includes what\'s set aside in linked funds, ' + FT.money(apartado, { cents: true }) + '). The app subtracts the set-aside amount on its own -- don\'t subtract it yourself.') + '</p>' : '') +
      // Fase 4 (QA Jett): "modificable solo vía transferencia o ajuste
      // manual CON MOTIVO (todo en historial)" -- este ajuste antes
      // reemplazaba el número en silencio, sin dejar rastro ni pedir el
      // motivo. Ahora, si el número realmente cambia, se pide un motivo y
      // queda una transacción reversible en Historial (mismo patrón que
      // cualquier otro movimiento de cuenta).
      '<div class="ft-field"><label>' + (L ? 'Motivo del ajuste' : 'Reason for the adjustment') + '</label><input id="abMotivo" value="' + (L ? 'Cuadre con mi banco' : 'Matched to my bank') + '" placeholder="' + (L ? 'Ej. Cheque no registrado, corrección…' : 'E.g. Unlogged paycheck, correction…') + '"></div>' +
      '<p style="font-size:10.5px;color:var(--text3)">' + (L ? 'Escribe lo que de verdad dice tu banco -- esto reemplaza el número, no lo suma. Útil si un depósito automático no aplicó (ej. un cheque que registraste antes de poner la regla).' : "Type what your bank actually shows -- this replaces the number, it doesn't add to it. Useful if an auto-deposit didn't apply (e.g. a paycheck logged before you set the rule).") + '</p>',
    saveLabel: L ? 'Guardar saldo' : 'Save balance',
    onSave: function (body) {
      var rawS = body.querySelector('#abSaldo').value, val = FT.numMoney(rawS);
      if (!/\d/.test(rawS) || val < 0) { FT.toast(L ? 'Ingresa un saldo válido' : 'Enter a valid balance'); return true; }
      var motivo = (body.querySelector('#abMotivo').value || '').trim();
      var freshApartado = FT.accountEarmarked(acct.id); // fresco, no el capturado al abrir
      var newLibre = +(val - freshApartado).toFixed(2);
      if (newLibre < -0.005) { FT.toast(L ? 'Ese total es menor a lo apartado en fondos vinculados (' + FT.money(freshApartado, { cents: true }) + ') -- no puede ser' : "That total is less than what's set aside in linked funds (" + FT.money(freshApartado, { cents: true }) + ") -- that can't be right"); return true; }
      var accts = FT.checking();
      var a = accts.find(function (x) { return String(x.id) === String(acct.id); });
      if (!a) return;
      var oldLibre = parseFloat(a.amount) || 0;
      var clampedNewLibre = Math.max(0, newLibre);
      var delta = +(clampedNewLibre - oldLibre).toFixed(2);
      if (Math.abs(delta) >= 0.005 && !motivo) { FT.toast(L ? 'Escribe un motivo para el ajuste' : 'Enter a reason for the adjustment'); return true; }
      a.amount = clampedNewLibre;
      a.updatedAt = FT.todayISO();
      FT.saveChecking(accts);
      // Deja rastro reversible en Historial -- mismo flag `acctCredited`
      // que ya usan ingreso/recordCheque, así FT.deleteTx/_editTxDetail lo
      // revierten en la dirección correcta sin necesitar una rama nueva.
      if (Math.abs(delta) >= 0.005) {
        var d = FT.data();
        d.transactions.push({ id: Date.now(), type: 'ajuste', desc: motivo, amount: Math.abs(delta), date: FT.todayISO(), checkingAccountId: acct.id, acctCredited: delta > 0, createdBy: FT.userName() });
        FT.saveData(d);
      }
      FT.toast(L ? '✅ Saldo actualizado' : '✅ Balance updated');
      FT.closeTop();
    }
  });
}

/** Migración guiada (Fase 3): vincula/desvincula un fondo de Ahorro libre,
 *  Emergencia, o (en cuentas de hogar) una meta/emergencia de Hogar, como
 *  apartado de `acct`. Vincular ABSORBE el saldo del fondo hacia el libre
 *  de la cuenta (resta de account.amount lo mismo que el fondo aporta a
 *  accountEarmarked) para que el TOTAL mostrado (libre+apartado) no cambie
 *  -- desvincular lo libera de vuelta (suma). Un fondo ya vinculado a OTRA
 *  cuenta no aparece aquí (primero hay que desvincularlo desde esa cuenta). */
function _openVincularFondo(acct, isHogar) {
  var L = FT.lang === 'es';
  // Revisión independiente (hallazgo G-1): antes, vincular solo escribía
  // accountId sin tocar ningún número -- eso hacía que el TOTAL MOSTRADO de
  // la cuenta subiera de golpe por el monto del fondo (ej. cuenta $1,000 +
  // fondo $550 vinculado = pantalla dice $1,550, tu banco sigue diciendo
  // $1,000), justo lo contrario de "no duplica el total". Corregido: vincular
  // ahora SÍ mueve el "libre" de la cuenta -- lo absorbe (resta, porque ese
  // dinero pasa de "suelto" a "apartado" dentro de la MISMA cuenta) --
  // desvincular lo libera de vuelta (suma). Con esto el TOTAL mostrado
  // (libre+apartado) nunca cambia al vincular/desvincular, que es lo que la
  // regla de negocio realmente pide.
  function currentActual(kind, id) {
    if (kind === 'fund') { var f = FT.savingsFunds().find(function (x) { return x.id === id; }); return f ? parseFloat(f.actual) || 0 : 0; }
    if (kind === 'emerg') return FT.emergencyBalance();
    var hf = FT.hogarFondos();
    if (kind === 'hogaremerg') return parseFloat(hf.emerg && hf.emerg.actual) || 0;
    if (kind === 'hogarmeta') { var m = (hf.metas || []).find(function (x) { return x.id === id; }); return m ? parseFloat(m.actual) || 0 : 0; }
    if (kind === 'goal') { var gg = FT.goals().find(function (x) { return String(x.id) === String(id); }); return gg ? parseFloat(gg.saved) || 0 : 0; }
    return 0;
  }
  function setLink(kind, id, accountIdOrNull) {
    if (kind === 'goal') { FT.linkGoal(id, accountIdOrNull); return; } // meta personal: mismo movimiento libre <-> apartado
    var linking = !!accountIdOrNull;
    var actual = currentActual(kind, id); // saldo fresco, no el capturado al abrir la pantalla
    if (actual) FT[linking ? 'deductChecking' : 'creditChecking'](acct.id, actual);
    if (kind === 'fund') {
      var funds = FT.savingsFunds();
      var f = funds.find(function (x) { return x.id === id; });
      if (f) { f.accountId = accountIdOrNull; FT.saveSavingsFunds(funds); }
    } else if (kind === 'emerg') {
      FT.setEmergencyAccountId(accountIdOrNull);
    } else if (kind === 'hogaremerg') {
      var hf2 = FT.hogarFondos(); hf2.emerg.accountId = accountIdOrNull; FT.saveHogarFondos(hf2);
    } else if (kind === 'hogarmeta') {
      var hf3 = FT.hogarFondos();
      var m = hf3.metas.find(function (x) { return x.id === id; });
      if (m) { m.accountId = accountIdOrNull; FT.saveHogarFondos(hf3); }
    }
  }
  function rowHtml(v, isLinked) {
    return '<div style="display:flex;align-items:center;gap:8px;padding:9px;background:var(--sunk);border-radius:10px;margin-bottom:6px">' +
      '<div style="flex:1;min-width:0;font-size:12px;font-weight:700">' + v.name + '<div style="font-size:10px;color:var(--text3);font-weight:600">' + FT.money(v.actual, { cents: true }) + '</div></div>' +
      '<button type="button" data-link="' + v.kind + '|' + (v.id || '') + '" data-mode="' + (isLinked ? 'off' : 'on') + '" style="padding:6px 10px;border-radius:8px;border:1.5px solid ' + (isLinked ? 'var(--red)' : 'var(--g-main)') + ';background:' + (isLinked ? 'var(--red-dim)' : 'var(--g-light)') + ';color:' + (isLinked ? 'var(--red)' : 'var(--g-dark)') + ';font-family:inherit;font-size:10.5px;font-weight:800;cursor:pointer">' + (isLinked ? (L ? 'Desvincular' : 'Unlink') : (L ? 'Vincular' : 'Link')) + '</button>' +
    '</div>';
  }
  // QA (27-sep): al presionar "Vincular"/"Desvincular" la fila debe
  // cambiar de sección AL INSTANTE, sin tener que cerrar y reabrir el
  // diálogo. Antes esta función literal cerraba el sheet entero
  // (FT.closeTop(), animación de 200ms) y abría uno nuevo -- por un
  // instante había dos overlays encimados (uno saliendo, uno entrando),
  // que se sentía como "no se actualiza hasta reabrir". Ahora arma el
  // HTML en una función interna reutilizable y, tras vincular/desvincular,
  // actualiza el body del MISMO sheet ya abierto en vez de cerrarlo --
  // misma lógica de montos, cero cambio en eso.
  function buildHtml() {
    var linked = FT.accountVaults(acct.id);
    var options = [];
    if (!isHogar) {
      FT.savingsFunds().forEach(function (f) {
        if (!f.accountId) options.push({ kind: 'fund', id: f.id, name: f.emoji + ' ' + f.name, actual: parseFloat(f.actual) || 0 });
      });
      if (!FT.emergencyAccountId()) options.push({ kind: 'emerg', id: null, name: '🛡️ ' + (L ? 'Emergencia' : 'Emergency'), actual: FT.emergencyBalance() });
      FT.goals().forEach(function (g) { if (!g.accountId) options.push({ kind: 'goal', id: g.id, name: (g.icon || '🎯') + ' ' + g.name, actual: parseFloat(g.saved) || 0 }); });
    } else {
      var hf = FT.hogarFondos();
      if (hf.emerg && !hf.emerg.accountId) options.push({ kind: 'hogaremerg', id: null, name: '🛡️ ' + (L ? 'Emergencia del hogar' : 'Household emergency'), actual: parseFloat(hf.emerg.actual) || 0 });
      (hf.metas || []).forEach(function (m) { if (!m.accountId) options.push({ kind: 'hogarmeta', id: m.id, name: '🎯 ' + m.nombre, actual: parseFloat(m.actual) || 0 }); });
    }
    return '<div style="background:var(--sky-bg);color:#2A4CC0;border-radius:10px;padding:9px 11px;font-size:11px;font-weight:600;margin-bottom:10px">' +
        (L ? 'Vincular no cambia tu TOTAL: el saldo libre de la cuenta baja lo mismo que sube el apartado (el dinero del fondo pasa a considerarse parte de esta cuenta).' : "Linking doesn't change your TOTAL: the account's free balance goes down by exactly what the set-aside goes up (the fund's money is now considered part of this account).") + '</div>' +
      // 15-oct-2026, a petición de Ramón: "Vincular" ya explicaba qué pasa
      // con el saldo, pero "Desvincular" (el botón justo abajo de esta
      // nota, en cada fila "Ya vinculado") no decía nada -- mismo
      // movimiento, sentido contrario, mismo derecho a una explicación.
      (linked.length ? '<div style="background:var(--sunk);color:var(--text2);border-radius:10px;padding:9px 11px;font-size:10.5px;font-weight:600;margin-bottom:10px">' +
        (L ? 'Desvincular hace lo opuesto: ese dinero deja de estar "apartado" y vuelve a contar como libre dentro de esta misma cuenta -- tampoco cambia tu TOTAL.' : "Unlinking does the opposite: that money stops being \"set aside\" and goes back to counting as free within this same account -- it doesn't change your TOTAL either.") + '</div>' : '') +
      (linked.length ? '<div style="font-size:10.5px;font-weight:800;color:var(--text3);text-transform:uppercase;margin-bottom:6px">' + (L ? 'Ya vinculados' : 'Already linked') + '</div>' + linked.map(function (v) { return rowHtml(v, true); }).join('') : '') +
      (options.length ? '<div style="font-size:10.5px;font-weight:800;color:var(--text3);text-transform:uppercase;margin:10px 0 6px">' + (L ? 'Disponibles para vincular' : 'Available to link') + '</div>' + options.map(function (v) { return rowHtml(v, false); }).join('') : '<div style="font-size:11.5px;color:var(--text3)">' + (L ? 'No hay más fondos sin vincular.' : 'No more unlinked funds.') + '</div>');
  }
  function wire(body) {
    body.querySelectorAll('[data-link]').forEach(function (b) {
      b.onclick = function () {
        var parts = b.getAttribute('data-link').split('|'), kind = parts[0], id = parts[1] || null;
        var on = b.getAttribute('data-mode') === 'on';
        // Vincular ABSORBE el saldo del fondo hacia el libre de la cuenta
        // (ver setLink) -- si la cuenta no tiene registrado suficiente
        // saldo propio para absorberlo sin quedar en negativo, eso es
        // señal de que el saldo de la cuenta está desactualizado (no un
        // sobregiro real, nadie gastó nada) -- se bloquea y se guía a
        // corregirlo primero con "Ajustar saldo", en vez de dejarlo
        // negativo en silencio.
        if (on) {
          var freshAcct = FT.checking().find(function (a) { return a.id === acct.id; });
          var actual = currentActual(kind, id);
          if (freshAcct && actual > (parseFloat(freshAcct.amount) || 0) + 0.005) {
            // 12-oct-2026 (Ramón: "esta parte también es confusa"): el toast
            // de antes solo DECÍA "ajusta su saldo primero (✏️)" sin llevar
            // a ningún lado -- el usuario tenía que cerrar este sheet,
            // encontrar la cuenta en Mis cuentas, ajustarla, y volver a
            // entrar a Vincular desde cero. Ahora ofrece abrir el mismo
            // ajuste de saldo (_openAjusteSaldoCuenta) apilado encima, y al
            // guardar refresca este sheet en su lugar (sigue abierto
            // debajo) para que el fondo ya se pueda vincular sin volver a
            // navegar.
            FT.confirm(L
              ? 'La cuenta no tiene registrado suficiente saldo para absorber este fondo sin quedar en negativo. ¿Ajustar su saldo ahora?'
              : "The account doesn't have enough recorded balance to absorb this fund without going negative. Adjust its balance now?"
            ).then(function (ok) {
              if (!ok) return;
              _openAjusteSaldoCuenta(freshAcct);
              var reRender = function () { body.innerHTML = buildHtml(); wire(body); document.removeEventListener('ft:datachanged', reRender); };
              document.addEventListener('ft:datachanged', reRender);
            });
            return;
          }
        }
        setLink(kind, id, on ? acct.id : null);
        FT.toast(on ? (L ? '✅ Vinculado' : '✅ Linked') : (L ? 'Desvinculado' : 'Unlinked'));
        body.innerHTML = buildHtml();
        wire(body);
      };
    });
  }
  FT.sheet({
    title: '🔗 ' + (L ? 'Vincular a ' : 'Link to ') + acct.name,
    html: buildHtml(),
    onOpen: wire
  });
}

/* ── Inversiones ── */
FT.investments = function (scope) { return FT.get(scope === 'hogar' ? K.hogarInv : K.investments, []) || []; };
FT.saveInvestments = function (list, scope) { FT.set(scope === 'hogar' ? K.hogarInv : K.investments, list); FT._changed(); };
FT.investmentValue = function (i) {
  var shares = parseFloat(i.shares) || 1, avg = parseFloat(i.avgPrice) || 0, cur = parseFloat(i.curPrice) || avg, amt = parseFloat(i.amount) || 0;
  return (avg > 0 || cur > 0) ? shares * cur : amt;
};

/* ── Otros ── */
FT.cheques = function () { return FT.get(K.cheques, []) || []; };
FT.goals = function () { return FT.get(K.goals, []) || []; };
FT.saveGoals = function (g) { FT.set(K.goals, g); FT._changed(); };
/** Abono a una meta personal (manual o automático) — guarda en `hist` para poder
 *  deduplicar recurrentes y mostrar "último aporte" en el hub de Recurrentes. */
FT.addGoalDeposit = function (goalId, amount, opts) {
  opts = opts || {};
  var goals = FT.goals();
  var g = goals.find(function (x) { return String(x.id) === String(goalId); });
  if (!g) return;
  var amt = parseFloat(amount) || 0;
  g.saved = (parseFloat(g.saved) || 0) + amt;
  g.hist = g.hist || [];
  g.hist.push({ id: 'gd_' + (opts.id != null ? opts.id : Date.now()), monto: amt, fecha: opts.date || FT.todayISO(), recId: opts.recId || null, auto: !!opts.auto, acctId: opts.acctId || null });
  FT.saveGoals(goals);
};
/** Activa/actualiza el aporte automático mensual de una meta personal. */
/** Meta personal como "apartado" dentro de una cuenta (modelo de tu banco: el dinero llega a la cuenta y de ahí
 *  se reparte a apartados; lo que sobra queda disponible). Vincular/desvincular mueve el LIBRE de la cuenta por
 *  el ahorrado de la meta, así el TOTAL de la cuenta nunca cambia. acctId null = desvincular. */
FT.linkGoal = function (goalId, acctId) {
  var goals = FT.goals();
  var g = goals.find(function (x) { return String(x.id) === String(goalId); });
  if (!g) return false;
  var cur = parseFloat(g.saved) || 0, today = FT.todayISO(), log = [];
  if (acctId && String(g.accountId) === String(acctId)) return true;
  if (g.accountId && cur) { FT.creditChecking(g.accountId, cur); log.push({ date: today, acctId: g.accountId, amount: cur, note: 'release' }); }   // deja la cuenta anterior
  if (acctId && cur) { FT.deductChecking(acctId, cur); log.push({ date: today, acctId: acctId, amount: -cur, note: 'absorb' }); }                   // la nueva absorbe lo ya ahorrado
  var goals2 = FT.goals();
  var g2 = goals2.find(function (x) { return String(x.id) === String(goalId); });
  g2.accountId = acctId || null;
  if (log.length) g2.vaultLog = (g2.vaultLog || []).concat(log).slice(-40); // para que Movimientos de la cuenta explique estos cambios
  FT.saveGoals(goals2);
  return true;
};
/** Cuánto del DISPONIBLE de `acctId` hace falta, además del monto, para abonar a esta meta: si todavía no está
 *  vinculada a esa cuenta, la cuenta absorbe primero todo lo ya ahorrado. */
FT.goalAbsorbNeed = function (goalId, acctId) {
  var g = FT.goals().find(function (x) { return String(x.id) === String(goalId); });
  if (!g || !acctId) return 0;
  var linkedOk = g.accountId && FT.checking().some(function (a) { return String(a.id) === String(g.accountId); });
  return (linkedOk && String(g.accountId) === String(acctId)) ? 0 : (parseFloat(g.saved) || 0);
};
/** Depósito a una meta personal. Con cuenta: el dinero sale de su DISPONIBLE y pasa al apartado de la meta
 *  (la meta queda vinculada a esa cuenta). Sin cuenta (solo si la meta no está vinculada): como antes, solo suma. */
FT.goalDeposit = function (goalId, amount, o) {
  o = o || {};
  var g = FT.goals().find(function (x) { return String(x.id) === String(goalId); });
  var amt = +(parseFloat(amount) || 0).toFixed(2);
  if (!g || amt <= 0) return false;
  // Una meta vinculada a una cuenta que ya no existe (respaldo/sync) se trata como NO vinculada.
  if (g.accountId && !FT.checking().some(function (a) { return String(a.id) === String(g.accountId); })) {
    var gs = FT.goals(); gs.find(function (x) { return String(x.id) === String(goalId); }).accountId = null; FT.saveGoals(gs); g.accountId = null;
  }
  var acctId = g.accountId || o.accountId || null; // una meta ya vinculada siempre sale de SU cuenta
  var date = o.date || FT.todayISO();
  if (acctId) {
    if (String(g.accountId) !== String(acctId)) FT.linkGoal(goalId, acctId);
    FT.deductChecking(acctId, amt, date);
  }
  FT.addGoalDeposit(goalId, amt, { date: date, recId: o.recId, auto: !!o.auto, id: o.id, acctId: acctId });
  return true;
};
FT.setGoalRecurring = function (goalId, amount, freq, accountId) {
  var goals = FT.goals();
  var g = goals.find(function (x) { return String(x.id) === String(goalId); });
  if (!g) return;
  var rec = FT.recurring();
  if (g.recId) {
    var r = rec.find(function (x) { return String(x.id) === String(g.recId); });
    if (r) { r.amount = parseFloat(amount) || r.amount; r.freq = freq || r.freq; r.active = true; if (accountId !== undefined) r.accountId = accountId || null; }
    else { g.recId = null; }
  }
  if (!g.recId) {
    var id = 'rec_' + Date.now();
    rec.push({ id: id, kind: 'metapersonal', goalId: g.id, amount: parseFloat(amount) || 0, freq: freq || 'monthly', nextDate: FT.todayISO(), active: true, paused: false, createdBy: FT.userName(), accountId: accountId || null });
    g.recId = id;
  }
  g.recurring = true;
  FT.set(K.recurring, rec);
  FT.saveGoals(goals);
};
/** Cancela el aporte automático de una meta (la meta en sí no se borra). */
FT.clearGoalRecurring = function (goalId) {
  var goals = FT.goals();
  var g = goals.find(function (x) { return String(x.id) === String(goalId); });
  if (!g) return;
  if (g.recId) FT.recurDelete(g.recId);
  g.recId = null; g.recurring = false;
  FT.saveGoals(goals);
};
FT.subs = function () { return FT.get(K.subs, []) || []; };
FT.saveSubs = function (s) { FT.set(K.subs, s); FT._changed(); };
FT.servicios = function () { return FT.get(K.servicios, []) || []; };
FT.saveServicios = function (s) { FT.set(K.servicios, s); FT._changed(); };
FT.hogarFondos = function () {
  var f = FT.get(K.hogarFondos, null);
  if (!f || typeof f !== 'object') f = {};
  // Migra el formato viejo (una sola meta bajo `ahorro`) al array `metas[]` actual.
  if (f.ahorro && !f.metas) {
    f.metas = f.ahorro.meta > 0 ? [{ id: 'm_legacy', nombre: f.ahorro.nombre || 'Meta 1', meta: f.ahorro.meta, actual: f.ahorro.actual || 0, fecha: '', hist: f.ahorro.hist || [] }] : [];
    delete f.ahorro;
  }
  if (!f.emerg) f.emerg = { meta: 0, actual: 0, fecha: '', hist: [] };
  if (!Array.isArray(f.metas)) f.metas = [];
  return f;
};
FT.saveHogarFondos = function (f) { FT.set(K.hogarFondos, f); FT._changed(); };
FT.distPcts = function () { return FT.get(K.distPcts, null) || { ahorro: 50, emergencia: 25, inversion: 25 }; };

/* Evento global cuando cambian los datos — cada pantalla lo escucha para re-render */
FT._changed = function () { try { document.dispatchEvent(new CustomEvent('ft:datachanged')); } catch (e) {} };

/* ── RESPALDO COMPLETO (exportar / restaurar) ── único mecanismo de backup de
   toda la app — historial.html y config.html comparten este, para no tener dos
   formatos de respaldo incompatibles entre sí (el viejo de config.html le
   faltaba la mitad de las claves y no validaba nada antes de sobreescribir). */
var RESPALDO_KEYS = [K.data, K.debts, K.hogarFondos, K.investments, K.hogarInv, K.subs, K.servicios, K.recurring, K.savings, K.savingsHist, K.savingsFunds, K.checking, K.goals, K.cheques, K.emergHist, K.emergHistLegacy, K.emergAccountId];
FT.exportBackup = function () {
  var backup = { _meta: { app: 'FinTrack Pro', version: 1, exportedAt: new Date().toISOString(), user: FT.userName() || '' }, data: {} };
  RESPALDO_KEYS.forEach(function (k) { var v = FT.getRaw(k, null); if (v != null && v !== '') backup.data[k] = v; });
  var blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'fintrack-respaldo-' + FT.todayISO() + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
/** Lee y valida un archivo de respaldo sin aplicarlo todavía — el caller decide
 *  cuándo confirmar con el usuario antes de llamar a FT.applyBackup(). */
FT.readBackupFile = function (file) {
  return new Promise(function (resolve, reject) {
    if (!file) { reject(new Error('no_file')); return; }
    var reader = new FileReader();
    reader.onload = function (e) {
      var raw;
      try { raw = JSON.parse(e.target.result); } catch (err) { reject(new Error('invalid_json')); return; }
      if (raw && raw.data && raw._meta && raw._meta.app === 'FinTrack Pro') { resolve(raw); return; }
      // Formato viejo de config.html (antes de unificar en uno solo): objeto plano
      // {user, transactions, debts, investments, goals, subs, emergHist} sin _meta.
      if (raw && (raw.transactions || raw.debts || raw.investments || raw.goals || raw.subs)) {
        var legacy = { _meta: { app: 'FinTrack Pro', version: 0, exportedAt: '', user: (raw.user && raw.user.name) || '' }, data: {} };
        if (raw.transactions) legacy.data[K.data] = JSON.stringify(raw.transactions);
        if (raw.debts) legacy.data[K.debts] = JSON.stringify(raw.debts);
        if (raw.investments) legacy.data[K.investments] = JSON.stringify(raw.investments);
        if (raw.goals) legacy.data[K.goals] = JSON.stringify(raw.goals);
        if (raw.subs) legacy.data[K.subs] = JSON.stringify(raw.subs);
        if (raw.emergHist) legacy.data[K.emergHist] = JSON.stringify(raw.emergHist);
        resolve(legacy); return;
      }
      reject(new Error('invalid_backup'));
    };
    reader.onerror = function () { reject(new Error('read_error')); };
    reader.readAsText(file);
  });
};
FT.applyBackup = function (backup) {
  Object.keys(backup.data).forEach(function (k) { FT.setRaw(k, backup.data[k]); });
};
/** Borra todos los datos financieros (no la cuenta/sesión ni preferencias de
 *  idioma) — todo lo que cubre el respaldo, más hogar/premium/créditos. */
/** "Borrar todo" — recorre TODAS las claves conocidas en `K` (no una lista a
 *  mano) precisamente porque una lista a mano ya se quedó corta dos veces:
 *  primero con ft_hogar (el hogar se reconectaba solo, ver abajo) y luego con
 *  ft_user/ft_cheques — al no borrarse, `FT.getMissingPaydays()` seguía
 *  viendo `payAuto` activo y, como "no hay cheques registrados", su regla de
 *  arranque en frío rellenaba solita los últimos 60 días de cheques + ahorro
 *  automático en la SIGUIENTE carga de cualquier pantalla (ft:ready →
 *  FT.runAutomations()) — el dato fantasma que Ramón siguió viendo incluso
 *  habiendo limpiado Safari por completo, porque no era un problema de
 *  caché del navegador: la propia app lo estaba regenerando de la nada.
 *  Único sobreviviente a propósito: K.lang (preferencia de idioma del
 *  dispositivo, no un dato financiero). K.hogar se trata aparte abajo. */
FT.clearAllData = function () {
  // CAUSA RAÍZ #6, la más profunda de todas: hasta ahora "Borrar todo" solo
  // limpiaba ESTE dispositivo -- pero FT.pushProfileToGAS() (que corre solo
  // en cada cambio) ya había subido deudas/metas/fondos a Sheets, keyed por
  // tu correo, en algún momento ANTES de este borrado. Ese snapshot en el
  // servidor nunca se tocaba. Resultado real que reportó Ramón: los DOS
  // lados de la pareja borran TODO localmente, arrancan de cero... y en
  // cuanto vuelven a formar un hogar, sus deudas y metas viejas resucitan
  // solas desde Sheets, sin que nadie las haya vuelto a teclear -- porque
  // ninguno de los dos wipes locales le avisó jamás al backend.
  // Aquí se sube un perfil vacío (mismo formato que pushProfileToGAS, para
  // que el otro lado lo lea igual) ANTES de borrar el correo localmente --
  // `keepalive` para que el request sobreviva aunque la página navegue a
  // login.html un instante después.
  try {
    var uEmail = (FT.user() || {}).email;
    if (uEmail) {
      var emptyProfile = { transactions: [], emergency: 0, subscriptions: [], sharedDebts: [], hogarInv: [], fondos: { emerg: { meta: 0, fecha: '', hist: [] }, metas: [] }, personalSpentThisMonth: 0, sharedRecurring: [], servicios: [], checking: [] };
      var emptyParams = new URLSearchParams({ action: 'saveProfile', email: uEmail, name: '', income: 0, needs: 0, wants: 0, savings: 0, dataJson: JSON.stringify(emptyProfile) });
      fetch(FT.GAS_URL + '?' + emptyParams.toString(), { keepalive: true }).catch(function () {});
    }
  } catch (e) {}

  var skip = { lang: 1, hogar: 1 };
  Object.keys(K).forEach(function (k) { if (!skip[k]) FT.del(K[k]); });
  // Cachés del perfil de la pareja, una por cada email con el que se haya
  // conectado alguna vez — "Borrar todo" no debe dejar NINGÚN rastro.
  try {
    var toRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf('profile_') === 0) toRemove.push(k);
    }
    toRemove.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
  } catch (e) {}
  // CAUSA RAÍZ del "dato fantasma" (ej. abono viejo a una deuda compartida que
  // reaparece al visitar Hogar): el backend en GAS/Sheets sigue recordando la
  // conexión de hogar aunque aquí se borre todo — Hogar pregunta a GAS "¿sigo
  // conectado?" en cada visita SIN importar el estado local, y si GAS dice que
  // sí, reconecta solo y vuelve a traer el perfil (viejo) de la pareja. Marcar
  // manuallyLeft:true aquí evita ese auto-reconecte silencioso; para volver a
  // compartir hogar después de "Borrar todo" hay que invitar/aceptar de nuevo,
  // lo cual sí trae datos frescos en vez de la instantánea vieja cacheada.
  FT.set(K.hogar, { connected: false, pendingInvite: false, manuallyLeft: true });
};

/* ─────────────────────────────────────────────────────────────────────────
   4 · BORRADO CON EFECTO CRUZADO
   ───────────────────────────────────────────────────────────────────────── */
FT.deleteTx = function (id) {
  var d = FT.data();
  var t = d.transactions.find(function (x) { return String(x.id) === String(id); });
  if (!t) return false;

  // Cobertura de gasto: al borrar el gasto, deshacer también el ingreso de
  // cobertura y devolver el dinero al pozo (ahorro / emergencia).
  if (t.cobId) FT._unwindCobertura(t.cobId);

  // Aporte de una asignación del hogar (chequeId): devolver su monto a 'sin asignar' y quitar su entrada, para que no se pierda de la vista.
  if (t.chequeId && t.acctCredited) {
    try {
      var cqA = FT.cheques(), rwA = cqA.find(function (c) { return String(c.id) === String(t.chequeId); });
      if (rwA) {
        var nA = (rwA.asignaciones || []).length;
        var backA = 0;   // se devuelve lo que la asignación movió de verdad, no el monto actual del aporte (puede haberse editado)
        rwA.asignaciones = (rwA.asignaciones || []).filter(function (a) { if (String(a.txId) !== String(t.id)) return true; backA += parseFloat(a.amount) || 0; return false; });
        if (rwA.asignaciones.length !== nA) { rwA.hogarSinAsignar = +((parseFloat(rwA.hogarSinAsignar) || 0) + backA).toFixed(2); FT.set(K.cheques, cqA); }
      }
    } catch (e) {}
  }

  // Si esta transacción había movido una cuenta al crearse, hay que
  // revertirla en la dirección correcta: un gasto/suscripción DESCONTÓ (hay
  // que devolverle el saldo, creditar), pero algo que ACREDITÓ (un ingreso,
  // o un aporte de FT.recordCheque -- ambos marcados `acctCredited:true`
  // sin importar su `type`) hay que devolvérselo, descontar. Revisión
  // independiente: discriminar por `t.type === 'ingreso'` se quedaba corto
  // con el aporte hogar de recordCheque, que acredita pero es type:'ahorro'
  // -- se quedaba revertido al revés (creditaba de nuevo en vez de
  // descontar), inflando esa cuenta al borrar/editar ese aporte.
  // (Un movimiento pendiente todavía no movió la cuenta: no hay nada que revertir.)
  if (t.checkingAccountId && !t.acctPending) {
    if (t.acctCredited) FT.deductChecking(t.checkingAccountId, t.amount);
    else FT.creditChecking(t.checkingAccountId, t.amount);
  }
  // Abono a deuda pagado desde un fondo de Ahorro libre o Emergencia en vez
  // de una cuenta (QA 03-oct-2026) -- mismo patrón genérico que
  // checkingAccountId arriba, reutilizando FT.reverseSavings/
  // reverseEmergency (ya revisadas, mismo mecanismo que usa cualquier otro
  // retiro de fondo). Independiente de la rama "💳 Deudas" de abajo: esa
  // restaura el saldo de la DEUDA, esto restaura el saldo del FONDO -- los
  // dos tienen que pasar juntos al borrar el abono.
  if (t.fundSource) {
    if (t.fundSource.type === 'fund') FT.reverseSavings(t.id);
    else if (t.fundSource.type === 'emerg') FT.reverseEmergency(t.id);
  }

  // Fuente vinculada
  if (t.type === 'ahorro' && (t.dest === 'libre' || t.cat === '💰 Ahorro')) {
    FT.reverseSavings(t.id);
  } else if (t.type === 'ahorro' && (t.dest === 'emergencia' || t.cat === '🛡️ Emergencia')) {
    // Antes era "|| t.cat" (sin exigir type:'ahorro' emparejado con
    // emergencia de verdad) -- cualquier transacción de ahorro que no
    // fuera dest:'libre' caía aquí, incluidos los aportes de hogar
    // (type:'ahorro', cat:'🏠 Hogar', sin dest) que nunca tuvieron nada
    // que ver con el fondo de emergencia. Inofensivo hasta ahora (
    // reverseEmergency no encontraba nada y no hacía nada), pero ya no
    // corre en falso para esos casos.
    FT.reverseEmergency(t.id);
  } else if (t.type === 'transferencia' && t.fromRef && t.toRef) {
    // Revierte los dos lados exactos de la transferencia (regla #4: toda
    // transferencia es reversible). No se busca/borra la fila de historial
    // original del fondo -- se aplica el movimiento inverso, que deja el
    // saldo correcto igual (misma idea que una reversa contable).
    // Revisión independiente: esto asumía que el destino SIEMPRE tiene el
    // monto completo todavía disponible -- si el destino es un fondo/
    // Emergencia y ya se retiró parte de ese dinero por OTRO lado desde
    // entonces, quitarle el monto completo lo clampa en 0 solas (Math.max
    // en addSavings/addEmergency) mientras el origen igual se acredita
    // completo -- fabricando la diferencia de la nada. Una cuenta SÍ puede
    // sobregirarse (ya es el modelo establecido), así que solo se topa la
    // reversa cuando el destino es fondo/Emergencia -- se recupera lo que
    // de verdad sigue ahí, nunca más.
    // Revisión independiente (ronda 3): si cualquiera de los dos extremos
    // ya no existe (cuenta/fondo borrado), reclaim=0 -- si no, un destino
    // borrado dejaba acreditar el origen completo sin ningún descuento
    // real del otro lado (fabricaba dinero igual que el caso ya cubierto).
    var reclaim = (!FT._xferExists(t.fromRef) || !FT._xferExists(t.toRef)) ? 0
      : (t.toRef.type === 'account' ? t.amount : Math.min(t.amount, FT._xferBalance(t.toRef)));
    if (reclaim > 0) {
      FT._xferMove(t.fromRef, reclaim, t.date, 'xfrev_' + t.id + '_f');
      FT._xferMove(t.toRef, -reclaim, t.date, 'xfrev_' + t.id + '_t');
    }
  } else if (t.type === 'inversion' || t.fromInvPage) {
    // Si la posición (o la transacción que la originó) tenía un aporte recurrente
    // ligado, hay que apagarlo también — si no, el motor automático la vuelve a
    // crear sola en la próxima fecha, y se queda huérfana en Recurrentes.
    var recIdsToClean = t.recId ? [t.recId] : [];
    ['', 'hogar'].forEach(function (sc) {
      var list = FT.investments(sc);
      var removed = list.filter(function (i) { return i.id === 'inv_' + t.id || i.id === 'tx_' + t.id || String(i.txId) === String(t.id); });
      removed.forEach(function (i) { if (i.recId) recIdsToClean.push(i.recId); });
      var f = list.filter(function (i) { return i.id !== 'inv_' + t.id && i.id !== 'tx_' + t.id && String(i.txId) !== String(t.id); });
      if (f.length !== list.length) FT.saveInvestments(f, sc);
    });
    recIdsToClean.filter(function (v, i, arr) { return arr.indexOf(v) === i; }).forEach(FT.recurDelete);
  } else if (t.incomeKind === 'cheque') {
    // Borrar el ingreso de un cheque también debe quitar su fila ligada en
    // ft_cheques -- si no, queda huérfana sumando hogarAmt para siempre en
    // calcHogar().fondoAportado (revisión independiente, 15-oct-2026; antes
    // ningún caso de borrado -- ni el de Hogar, ni este genérico -- tenía
    // esta limpieza, porque chequeRow.id nunca fue igual al id de la
    // transacción y nada más las ligaba).
    var rowDel = FT.cheques().find(function (c) { return String(c.txId) === String(t.id); });
    if (rowDel && (rowDel.asignaciones || []).length) FT.unassignHogar(rowDel.id); // sus cuentas dejan de tener ese dinero (no quedan acreditadas huérfanas)
    var cheques2 = FT.cheques().filter(function (c) { return String(c.txId) !== String(t.id); });
    FT.set(K.cheques, cheques2);
  } else if (t.cat === '💳 Deudas') {
    var debts = FT.debts(), touched = false;
    debts.forEach(function (deb) {
      if (!deb.abonos) return;
      var keep = deb.abonos.filter(function (a) { return String(a.txId) !== String(t.id); });
      if (keep.length !== deb.abonos.length) {
        var removed = deb.abonos.find(function (a) { return String(a.txId) === String(t.id); });
        // Igual que en deudas.html/deleteAbono: se le devuelve al saldo lo
        // que de verdad se le restó (capitalPagado), no el pago completo --
        // si no, borrar un abono con intereses desde Historial infla el
        // saldo de más.
        if (removed) deb.balance = (parseFloat(deb.balance) || 0) + (removed.capitalPagado != null ? removed.capitalPagado : (parseFloat(removed.monto) || 0));
        deb.abonos = keep; touched = true;
      }
    });
    if (touched) FT.saveDebts(debts);
  }

  // Bug real preexistente, encontrado por revisión independiente al agregar
  // la reversa de transferencias: `d` se capturó al PRINCIPIO de esta
  // función, pero varios de los efectos cruzados de arriba (_unwindCobertura,
  // FT.reverseEmergency, y ahora FT._xferMove cuando un lado es Emergencia)
  // hacen su PROPIA lectura+escritura fresca de ft_data por su cuenta
  // (FT.data() nunca cachea, cada llamada es un JSON.parse nuevo). Guardar
  // aquí abajo la copia vieja de `d` sobrescribía esos cambios frescos --
  // ej. borrar un depósito de emergencia SÍ corregía ft_emerg_hist pero el
  // campo d.emergency volvía a su valor de ANTES de la reversa, y borrar un
  // gasto con cobertura resucitaba el ingreso de cobertura que
  // _unwindCobertura ya había quitado. Se vuelve a leer ft_data FRESCO justo
  // antes de quitar la transacción y guardar, para no pisar ninguno de esos
  // efectos ya aplicados.
  var d2 = FT.data();
  d2.transactions = d2.transactions.filter(function (x) { return String(x.id) !== String(id); });
  FT.saveData(d2);
  return true;
};

/* ── Cobertura de gasto (opción C) ──────────────────────────────────────────
   Cuando un gasto personal excede el disponible del mes, el faltante se cubre
   de Ahorro libre o Emergencia. Se crean 3 registros ligados por `cobId`:
     · el gasto            (ft_data, con cobId)
     · un ingreso          (ft_data, incomeKind:'cobertura', con cobId) — equilibra el mes
     · un movimiento       (ft_savings_hist | ft_emerg_hist, tipo:'retiro', con cobId)
─────────────────────────────────────────────────────────────────────────── */
/** Quita el ingreso de cobertura y devuelve el dinero al pozo. NO toca el gasto. */
FT._unwindCobertura = function (cobId) {
  var d = FT.data();
  d.transactions = d.transactions.filter(function (x) { return !(x.cobId === cobId && x.incomeKind === 'cobertura'); });
  FT.set(K.data, d);
  var sh = FT.savingsHist();
  var srow = sh.find(function (r) { return r.cobId === cobId; });
  if (srow) FT.reverseSavings(String(srow.id).replace(/^tx_/, ''));
  var eh = FT.get(K.emergHist, []) || [];
  var erow = eh.find(function (r) { return r.cobId === cobId; });
  if (erow) FT.reverseEmergency(erow.id);
};
/** "Deshacer cobertura" desde la pantalla del pozo: revierte el movimiento y el
    ingreso, pero deja el gasto (que vuelve a contar contra tu disponible). */
FT.undoCobertura = function (cobId) {
  FT._unwindCobertura(cobId);
  var d = FT.data();
  d.transactions.forEach(function (x) { if (x.cobId === cobId) { delete x.cobId; } });
  FT.saveData(d);
};

/** Disponible personal del mes en curso (solo cheques ya recibidos × % personal). */
FT.personalAvailable = function () {
  var mk = new Date().toISOString().slice(0, 7);
  var txs = FT.txsCounted();
  var inc = txs.filter(function (t) { return t.type === 'ingreso' && String(t.date || '').slice(0, 7) === mk; });
  // 19-oct-2026: regla única de ingresos (misma en Hogar, Dashboard, Análisis
  // e Historial) -- SOLO 'cheque' se reparte con el hogar; todo lo demás
  // (extra, cobertura, dividendos importados) es 100% tuyo; 'venta' (venta de
  // inversión) no es dinero nuevo y no cuenta para el presupuesto.
  var cheque = inc.filter(function (t) { return t.incomeKind === 'cheque'; }).reduce(function (s, t) { return s + (parseFloat(t.amount) || 0); }, 0);
  var extra = inc.filter(function (t) { return t.incomeKind !== 'cheque' && t.incomeKind !== 'venta'; }).reduce(function (s, t) { return s + (parseFloat(t.amount) || 0); }, 0);
  // 15-oct-2026, a petición EXPLÍCITA de Ramón (confirmado vía pregunta
  // directa -- revierte el criterio de "cuenta como factor" de QA
  // 29-sep-2026 citado abajo): separación TOTAL por etiqueta. Cualquier
  // transacción marcada hogar:true (gasto, ahorro, inversión) nunca
  // cuenta hacia tu disponible personal, sin importar con qué cuenta se
  // pagó -- mismo criterio exacto que totals() usa en dashboard.html, los
  // dos leen la misma regla para no volver a desincronizarse.
  var mtxAll = txs.filter(function (t) { return String(t.date || '').slice(0, 7) === mk; });
  var mtxPersonal = mtxAll.filter(function (t) { return t.hogar !== true; });
  var sumP = function (types) { return mtxPersonal.filter(function (t) { return types.indexOf(t.type) > -1; }).reduce(function (s, t) { return s + (parseFloat(t.amount) || 0); }, 0); };
  // 15-oct-2026 (2), a petición de Ramón: el ahorro apartado a un fondo
  // sigue siendo tuyo mientras no lo retires ni lo uses -- no se resta de
  // "disponible" (mismo criterio que totals().t.spent en dashboard.html,
  // los dos tienen que seguir de acuerdo). La inversión sí sigue restando
  // ("no está en mi cuenta").
  return cheque * FT.personalPct() / 100 + extra - sumP(['gasto', 'suscripcion', 'hipoteca']) - sumP(['inversion']);
};

/* ─────────────────────────────────────────────────────────────────────────
   5 · AUTOMATIZACIONES — corren al cargar cualquier pantalla
   ───────────────────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────────────
   5a · HOGAR — DINERO SIN ASIGNAR (20-oct-2026, aprobado vía simulación)
   Cuando entra dinero al hogar (la parte del hogar de un cheque) y ninguna regla
   lo reparte entre las cuentas conjuntas, queda "sin asignar". Cualquiera de los
   dos puede asignarlo con una plantilla (reglas / una cuenta / partes iguales /
   a mano) y, si quiere, dejar ese reparto como la regla de esa persona para sus
   próximos cheques. Lo del otro viaja como una "edición" dentro del perfil que ya
   se sincroniza (hogarEdits) y su teléfono la aplica al abrir; la respuesta vuelve
   en hogarAck. Todo es SOLO del hogar -- nada personal viaja. Cada cambio queda con
   quién, cuándo, y se puede deshacer.
   ───────────────────────────────────────────────────────────────────────── */
var _lastUid = 0;
function _uidMono() { var n = Date.now(); if (n <= _lastUid) n = _lastUid + 1; _lastUid = n; return n; }
/* Una regla que viene de fuera (la pareja) solo puede ser de estos tipos y con un valor finito. */
function _cleanRule(r) {
  if (!r || typeof r !== 'object') return null;
  if (r.type === 'remainder') return { type: 'remainder' };
  var v = Number(r.value);
  if ((r.type === 'fixed' || r.type === 'pct') && isFinite(v) && v >= 0 && v <= 1e9) return { type: r.type, value: v };
  return null;
}
FT.allocateByRules = function (pool, items) { return _allocateByRules(pool, items); };
FT.partnerJointAccounts = function () {
  var raw = FT.get(K.partnerChecking, []);
  raw = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  return raw.filter(function (c) { return c && c.hogar; });
};
FT.hogarJointAccounts = function () { return FT.checking().filter(function (c) { return c.hogar; }); };
/** Mis cheques (mes actual y anterior) con parte del hogar sin asignar a ninguna cuenta. */
FT.hogarUnassigned = function () {
  var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  var since = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
  return FT.cheques().filter(function (c) { return c.tipo === 'nuevo' && (parseFloat(c.hogarSinAsignar) || 0) > 0.5 && String(c.fecha || '') >= since; })
    .map(function (c) { return { id: c.id, txId: c.txId, fecha: c.fecha, monto: +(parseFloat(c.hogarSinAsignar) || 0).toFixed(2), total: +(parseFloat(c.hogarAmt) || 0).toFixed(2) }; })
    .sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); }).slice(0, 5);
};
/** Lo mismo, pero de mi pareja (viaja en su perfil como sinAsignar). */
FT.partnerUnassigned = function () {
  var pp = FT.partnerProfile(), l = pp && pp.data && pp.data.sinAsignar;
  return Array.isArray(l) ? l.filter(function (x) { return x && (parseFloat(x.monto) || 0) > 0.5; }) : [];
};
/** Reglas de cuenta (rule) en bloque: list = [{acctId, rule|null}]. */
FT.setAccountRules = function (list) {
  var accts = FT.checking();
  (list || []).forEach(function (it) {
    var a = accts.find(function (x) { return String(x.id) === String(it.acctId); });
    if (a && a.hogar === true) { a.rule = _cleanRule(it.rule); a.autoDeposit = false; } // solo cuentas del HOGAR (nunca una personal)
  });
  FT.saveChecking(accts);
};
/** Convierte una plantilla en reglas de cuenta para los PRÓXIMOS cheques.
 *  allocs: [{acctId, amount}] (para 'manual'); accts: ids de todas las cuentas del hogar. */
FT.rulesFromTemplate = function (tpl, accts, allocs, total, chosenId) {
  if (tpl === 'reglas') return null;
  var out = [];
  if (tpl === 'una') { accts.forEach(function (id) { out.push({ acctId: id, rule: String(id) === String(chosenId) ? { type: 'remainder' } : null }); }); return out; }
  if (tpl === 'iguales') { accts.forEach(function (id) { out.push({ acctId: id, rule: { type: 'remainder' } }); }); return out; }
  var withAmt = (allocs || []).filter(function (a) { return a.amount > 0.004; });
  var lastId = withAmt.length ? withAmt[withAmt.length - 1].acctId : null;
  accts.forEach(function (id) {
    var a = withAmt.find(function (x) { return String(x.acctId) === String(id); });
    if (!a) { out.push({ acctId: id, rule: null }); return; }
    out.push({ acctId: id, rule: String(id) === String(lastId) ? { type: 'remainder' } : { type: 'pct', value: +(a.amount / (total || 1) * 100).toFixed(1) } });
  });
  return out;
};
/** Asigna `allocations` ([{acctId, amount}]) de la parte del hogar sin asignar de un cheque MÍO. */
FT.assignHogar = function (chequeId, allocations, o) {
  o = o || {};
  var es = FT.lang === 'es';
  var cheques = FT.cheques();
  var row = cheques.find(function (c) { return String(c.id) === String(chequeId); });
  if (!row) return { ok: false, reason: 'nocheque' };
  var allocs = (allocations || []).map(function (a) { return { acctId: a.acctId, amount: +(parseFloat(a.amount) || 0).toFixed(2) }; }).filter(function (a) { return a.amount > 0.004; });
  if (!allocs.length) return { ok: false, reason: 'empty' };
  var sum = allocs.reduce(function (s, a) { return s + a.amount; }, 0), left = parseFloat(row.hogarSinAsignar) || 0;
  if (sum > left + 0.011) return { ok: false, reason: 'exceeds', left: left };
  var accts = FT.checking();
  for (var k = 0; k < allocs.length; k++) { var ac0 = accts.find(function (x) { return String(x.id) === String(allocs[k].acctId); }); if (!ac0 || ac0.hogar !== true) return { ok: false, reason: ac0 ? 'notjoint' : 'noacct' }; }
  var by = String(o.by || FT.userName()).slice(0, 40), at = new Date().toISOString(), today = FT.todayISO(), made = [];
  allocs.forEach(function (a) {
    FT.creditChecking(a.acctId, a.amount);
    var acct = FT.checking().find(function (x) { return String(x.id) === String(a.acctId); });
    var txId = _uidMono();
    var d = FT.data();
    d.transactions.push({ id: txId, type: 'ahorro', desc: (es ? 'Aporte hogar — ' : 'Household contribution — ') + (acct ? acct.name : '?') + (row.fecha ? ' (' + (es ? 'cheque ' : 'paycheck ') + FT.date(row.fecha) + ')' : ''), amount: a.amount, date: today, cat: '🏠 Hogar', hogar: true, createdBy: by, auto: true, checkingAccountId: a.acctId, acctCredited: true, chequeId: row.id, editId: o.editId || undefined });
    FT.set(K.data, d);
    made.push({ txId: txId, acctId: a.acctId, acctName: acct ? acct.name : '', amount: a.amount, by: by, at: at, editId: o.editId || null });
  });
  var cheques2 = FT.cheques();
  var row2 = cheques2.find(function (c) { return String(c.id) === String(chequeId); });
  row2.hogarSinAsignar = Math.max(0, +(left - sum).toFixed(2));
  if (row2.hogarSinAsignar < 0.005) row2.hogarSinAsignar = 0;
  row2.asignaciones = (row2.asignaciones || []).concat(made);
  FT.set(K.cheques, cheques2);
  if (o.rules && o.rules.length) FT.setAccountRules(o.rules);
  FT._changed();
  return { ok: true, made: made, left: row2.hogarSinAsignar };
};
/** Deshace las asignaciones de un cheque MÍO (todas, o solo las de `onlyEditId`) y devuelve ese monto a "sin asignar". */
FT.unassignHogar = function (chequeId, onlyEditId) {
  var cheques = FT.cheques();
  var row = cheques.find(function (c) { return String(c.id) === String(chequeId); });
  if (!row) return { ok: false, reason: 'nocheque' };
  var rm = [], keep = [];
  (row.asignaciones || []).forEach(function (a) { if (!onlyEditId || a.editId === onlyEditId) rm.push(a); else keep.push(a); });
  if (!rm.length) return { ok: false, reason: 'none' };
  var back = 0;
  rm.forEach(function (a) {
    back += parseFloat(a.amount) || 0;
    // FT.deleteTx revierte la cuenta y devuelve el monto a 'sin asignar' (y quita la entrada). Si el movimiento ya no existía, se ajusta a mano.
    if (!FT.deleteTx(a.txId)) {
      var cq = FT.cheques(), rr = cq.find(function (c) { return String(c.id) === String(chequeId); });
      if (rr) { rr.asignaciones = (rr.asignaciones || []).filter(function (x) { return String(x.txId) !== String(a.txId); }); rr.hogarSinAsignar = +((parseFloat(rr.hogarSinAsignar) || 0) + (parseFloat(a.amount) || 0)).toFixed(2); FT.set(K.cheques, cq); }
    }
  });
  FT._changed();
  return { ok: true, back: +back.toFixed(2) };
};
FT.unassignByEdit = function (editId) {
  var row = FT.cheques().find(function (c) { return (c.asignaciones || []).some(function (a) { return a.editId === editId; }); });
  return row ? FT.unassignHogar(row.id, editId) : { ok: false, reason: 'none' };
};

/* ── Ediciones entre los dos (viajan en el perfil sincronizado) ── */
FT.hogarEditsOut = function () { return FT.get('ft_hogar_edits_out', []) || []; };
FT.hogarAckOut = function () { return FT.get('ft_hogar_ack_out', []) || []; };
FT.queueHogarEdit = function (edit) {
  var l = FT.hogarEditsOut(); l.push(edit);
  FT.set('ft_hogar_edits_out', l.slice(-30));
  FT._changed();
  try { FT.pushProfileToGAS(); } catch (e) {}
};
/** Aplica UNA edición que mi pareja mandó sobre mis cuentas/cheques. Devuelve {status, reason, notice}. */
FT._applyIncomingEdit = function (e) {
  try {
    e = Object.assign({}, e, { by: String(e.by == null ? '' : e.by).slice(0, 40) }); // el nombre viaja como texto corto
    if (e.op === 'undo') {
      if (typeof e.undoes !== 'string' || !e.undoes) return { status: 'failed', reason: 'op' };
      var r0 = FT.unassignByEdit(e.undoes);
      return { status: r0.ok ? 'ok' : 'failed', reason: r0.ok ? '' : 'none', notice: r0.ok ? { kind: 'undo', by: e.by, editId: e.undoes } : null };
    }
    if (e.op === 'rule') {
      if (!Array.isArray(e.rules)) return { status: 'failed', reason: 'op' };
      FT.setAccountRules(e.rules.map(function (x) { return { acctId: x.acctId, rule: x.rule }; }));
      return { status: 'ok', notice: { kind: 'rule', by: e.by, editId: e.id } };
    }
    if (e.op === 'assign') {
      if (e.rules != null && !Array.isArray(e.rules)) return { status: 'failed', reason: 'op' };
      if (e.allocations != null && !Array.isArray(e.allocations)) return { status: 'failed', reason: 'op' };
      var res = FT.assignHogar(e.chequeId, (e.allocations || []).map(function (a) { return { acctId: a.acctId, amount: a.amount }; }), { by: e.by, editId: e.id, rules: e.rules || null });
      if (!res.ok) return { status: 'failed', reason: res.reason };
      return { status: 'ok', notice: { kind: 'assign', by: e.by, editId: e.id, chequeId: e.chequeId, fecha: e.fecha, allocs: res.made.map(function (m) { return { name: m.acctName, amount: m.amount }; }), rule: !!(e.rules && e.rules.length) } };
    }
    return { status: 'failed', reason: 'op' };
  } catch (err) { return { status: 'failed', reason: 'error' }; }
};
FT.processIncomingEdits = function (list) {
  if (!Array.isArray(list) || !list.length) return 0;
  var applied = FT.get('ft_hogar_edits_applied', []) || [], ack = FT.hogarAckOut(), notices = FT.get('ft_hogar_notices', []) || [], known = {}, n = 0;
  applied.forEach(function (a) { known[a.id] = 1; });
  list.forEach(function (e) {
    if (!e || !e.id || known[e.id]) return;
    var at = new Date().toISOString(), mark = { id: e.id, status: 'applying', at: at };
    applied.push(mark); known[e.id] = 1; FT.set('ft_hogar_edits_applied', applied.slice(-80)); // se anota ANTES de mover dinero: si algo falla no se reaplica
    var res = FT._applyIncomingEdit(e);
    var rec = { id: e.id, status: res.status, reason: res.reason || '', at: at };
    mark.status = res.status; ack.push(rec); n++;
    if (res.notice) notices.push(Object.assign({ id: 'n_' + e.id, at: at, seen: false }, res.notice));
  });
  if (n) {
    FT.set('ft_hogar_edits_applied', applied.slice(-80));
    FT.set('ft_hogar_ack_out', ack.slice(-80));
    FT.set('ft_hogar_notices', notices.slice(-30));
    FT._changed();
  }
  return n;
};
FT.hogarNotices = function () { return (FT.get('ft_hogar_notices', []) || []).filter(function (n) { return !n.seen; }); };
FT.markNoticeSeen = function (id) {
  var l = FT.get('ft_hogar_notices', []) || [];
  l.forEach(function (n) { if (n.id === id) n.seen = true; });
  FT.set('ft_hogar_notices', l); FT._changed();
};
/** Deshacer, desde quien recibió el cambio, una asignación hecha por mi pareja. */
FT.undoNotice = function (id) {
  var l = FT.get('ft_hogar_notices', []) || [], nt = l.find(function (n) { return n.id === id; });
  if (!nt) return false;
  var r = FT.unassignByEdit(nt.editId);
  nt.seen = true; FT.set('ft_hogar_notices', l);
  var ack = FT.hogarAckOut(); ack.push({ id: nt.editId, status: r.ok ? 'undone' : 'failed', reason: r.ok ? '' : (r.reason || ''), at: new Date().toISOString() });
  FT.set('ft_hogar_ack_out', ack.slice(-80));
  FT._changed();
  return r.ok;
};
/** Mis ediciones enviadas con el estado que reporta mi pareja (pendiente/aplicada/fallida/deshecha). */
FT.sentHogarEdits = function () {
  var pp = FT.partnerProfile(), ack = (pp && pp.data && pp.data.hogarAck) || [], cutoff = Date.now() - 7 * 86400000;
  return FT.hogarEditsOut().filter(function (e) { return e.op !== 'undo' && new Date(e.at).getTime() > cutoff; }).slice(-5).reverse().map(function (e) {
    var a = ack.filter(function (x) { return x.id === e.id; }).pop();
    return Object.assign({}, e, { status: a ? a.status : 'sent', reason: a ? a.reason : '' });
  });
};
/** Deshacer, desde quien lo mandó, un cambio que mi pareja ya aplicó (o que está por aplicar). */
FT.undoSentEdit = function (editId) {
  FT.queueHogarEdit({ id: 'he_' + Date.now(), op: 'undo', undoes: editId, by: FT.userName(), at: new Date().toISOString() });
  var l = FT.hogarEditsOut().map(function (e) { if (e.id === editId) e.undone = true; return e; });
  FT.set('ft_hogar_edits_out', l);
};

/** Cambiar la regla de reparto de mi pareja para sus próximos cheques (se manda como edición; ella lo ve y puede deshacerlo). */
FT.openReglaPareja = function () {
  var L = FT.lang === 'es', pa = FT.partnerJointAccounts(), pn = FT.hogar().partnerName || (L ? 'tu pareja' : 'your partner');
  if (!pa.length) { FT.toast(L ? 'Tu pareja aún no tiene cuentas conjuntas visibles' : 'Your partner has no visible joint accounts yet'); return; }
  var st = { tpl: pa.length > 1 ? 'iguales' : 'una', one: pa[0].id, pct: {} };
  pa.forEach(function (a, i) { st.pct[a.id] = i === pa.length - 1 ? +(100 - Math.floor(100 / pa.length) * (pa.length - 1)).toFixed(1) : Math.floor(100 / pa.length); });
  function btn(k, t, s) { return '<button type="button" class="tap" data-t="' + k + '" style="display:flex;flex-direction:column;gap:2px;text-align:left;width:100%;padding:10px 12px;margin-bottom:8px;border-radius:12px;border:1.5px solid ' + (st.tpl === k ? 'var(--g-main)' : 'var(--hair)') + ';background:' + (st.tpl === k ? 'var(--g-light)' : 'var(--sunk)') + ';font-family:inherit;color:var(--ink);cursor:pointer"><b style="font-size:13px">' + t + '</b><span style="font-size:11.5px;color:var(--text3)">' + s + '</span></button>'; }
  var ov = FT.sheet({ title: '⚙️ ' + (L ? 'Reparto de los cheques de ' : 'Split for ') + _escH(pn), html: '<div id="rpBody"></div>', onOpen: function (body) { paint(body.querySelector('#rpBody')); } });
  function paint(box) {
    var h = '<p style="font-size:12.5px;color:var(--text2);margin:0 0 10px">' + (L ? 'Así se repartirán sus próximos cheques entre sus cuentas del hogar, sin que tenga que hacer nada. Verá un aviso y puede cambiarlo.' : 'This is how their next paychecks will split across their household accounts, with nothing for them to do. They will see a notice and can change it.') + '</p>' +
      btn('una', L ? 'Todo a una cuenta' : 'All to one account', L ? 'Tú eliges cuál' : 'You pick which') +
      (pa.length > 1 ? btn('iguales', L ? 'Partes iguales' : 'Equal parts', L ? 'El mismo monto a cada cuenta' : 'The same to each account') + btn('manual', L ? 'Por porcentaje' : 'By percentage', L ? 'Tú decides el % de cada una' : 'You set each %') : '');
    if (st.tpl === 'una') h += '<div class="ft-field"><label>' + (L ? '¿A cuál cuenta?' : 'Which account?') + '</label><select id="rpOne">' + pa.map(function (a) { return '<option value="' + _escH(a.id) + '"' + (String(a.id) === String(st.one) ? ' selected' : '') + '>' + _escH(a.name) + '</option>'; }).join('') + '</select></div>';
    if (st.tpl === 'manual') h += pa.map(function (a, i) { return '<div class="ft-field"><label>' + _escH(a.name) + (i === pa.length - 1 ? (L ? ' (lo que sobre)' : ' (the rest)') : ' %') + '</label><input data-p="' + _escH(a.id) + '" inputmode="decimal" value="' + (st.pct[a.id] || '') + '"' + (i === pa.length - 1 ? ' disabled' : '') + '></div>'; }).join('');
    h += '<button type="button" class="ft-btn ft-btn-primary tap" data-ok="1">' + (L ? 'Guardar reparto' : 'Save split') + '</button>';
    box.innerHTML = h;
    box.querySelectorAll('[data-t]').forEach(function (b) { b.onclick = function () { st.tpl = b.getAttribute('data-t'); paint(box); }; });
    var one = box.querySelector('#rpOne'); if (one) one.onchange = function () { st.one = one.value; };
    box.querySelectorAll('[data-p]').forEach(function (inp) { inp.oninput = function () { st.pct[inp.getAttribute('data-p')] = FT.numMoney(inp.value); }; });
    box.querySelector('[data-ok]').onclick = function () {
      var ids = pa.map(function (a) { return a.id; }), allocs = ids.map(function (id, i) { return { acctId: id, amount: i === ids.length - 1 ? Math.max(0, +(100 - ids.slice(0, -1).reduce(function (s, x) { return s + (st.pct[x] || 0); }, 0)).toFixed(1)) : (st.pct[id] || 0) }; });
      var rules = FT.rulesFromTemplate(st.tpl, ids, allocs, 100, st.one);
      FT.queueHogarEdit({ id: 'he_' + Date.now(), op: 'rule', rules: rules, by: FT.userName(), at: new Date().toISOString() });
      FT.toast(L ? '📨 Enviado. ' + pn + ' lo verá al abrir la app' : '📨 Sent. ' + pn + ' will see it when they open the app', { icon: '🏠' });
      FT.closeTop();
    };
  }
  return ov;
};
/** Hoja "Asignar": opts = { target:'mine'|'partner', chequeId, monto, fecha, partnerName }. */
FT.openAsignar = function (opts) {
  opts = opts || {};
  var L = FT.lang === 'es', mine = opts.target !== 'partner';
  var accts = (mine ? FT.hogarJointAccounts() : FT.partnerJointAccounts()).map(function (c) { return { id: c.id, name: c.name || (L ? 'Cuenta' : 'Account'), rule: c.rule || (c.autoDeposit ? { type: 'pct', value: 100 } : null) }; });
  var who = mine ? (L ? 'tu' : 'your') : _escH(opts.partnerName || (L ? 'tu pareja' : 'your partner'));
  var total = +(parseFloat(opts.monto) || 0).toFixed(2);
  if (!accts.length) {
    FT.sheet({ title: '💵 ' + (L ? 'Asignar ' : 'Assign ') + FT.money(total, { cents: true }),
      html: '<p style="font-size:13px;color:var(--text2);margin:2px 0 8px">' + (mine ? (L ? 'Aún no tienes ninguna cuenta conjunta. Agrega una para poder repartir este dinero.' : "You don't have a joint account yet. Add one to split this money.") : (L ? 'Tu pareja aún no tiene cuentas conjuntas que se puedan ver. Cuando las agregue, podrás asignarle este dinero.' : "Your partner has no visible joint accounts yet. Once they add some, you can assign this money.")) + '</p>',
      actions: mine ? [{ label: '＋ ' + (L ? 'Agregar cuenta conjunta' : 'Add joint account'), primary: true, onClick: function () { _openCuentaForm(true); } }] : [] });
    return;
  }
  var items = accts.map(function (a) { return { id: a.id, rule: a.rule }; });
  var hasRules = items.some(function (it) { return !!it.rule; });
  var byRules = FT.allocateByRules(total, items);
  // Si lo que se reparte es solo un RESTO (parte del cheque ya estaba asignada), no se ofrece dejarlo como regla: borraría las reglas que ya funcionan.
  var partial = !!(opts.total && total < (parseFloat(opts.total) || 0) - 0.5);
  var st = { step: 1, tpl: hasRules ? 'reglas' : (accts.length > 1 ? 'iguales' : 'una'), one: accts[0].id, manual: {}, saveRule: !partial };
  accts.forEach(function (a) { st.manual[a.id] = byRules[a.id] || 0; });
  if (!hasRules) { var eq = +(total / accts.length).toFixed(2); accts.forEach(function (a, i) { st.manual[a.id] = i === accts.length - 1 ? +(total - eq * (accts.length - 1)).toFixed(2) : eq; }); }
  function allocs() {
    var out = [];
    if (st.tpl === 'reglas') accts.forEach(function (a) { if (byRules[a.id] > 0) out.push({ acctId: a.id, amount: byRules[a.id] }); });
    else if (st.tpl === 'una') out.push({ acctId: st.one, amount: total });
    else if (st.tpl === 'iguales') { var e = +(total / accts.length).toFixed(2); accts.forEach(function (a, i) { out.push({ acctId: a.id, amount: i === accts.length - 1 ? +(total - e * (accts.length - 1)).toFixed(2) : e }); }); }
    else accts.forEach(function (a) { var v = parseFloat(st.manual[a.id]) || 0; if (v > 0) out.push({ acctId: a.id, amount: v }); });
    return out;
  }
  function sumOf(l) { return +l.reduce(function (s, a) { return s + a.amount; }, 0).toFixed(2); }
  function nameOf(id) { var a = accts.find(function (x) { return String(x.id) === String(id); }); return a ? a.name : '?'; }
  var ov = FT.sheet({ title: '💵 ' + (L ? 'Asignar ' : 'Assign ') + FT.money(total, { cents: true }), html: '<div id="asgBody"></div>', onOpen: function (body) { paint(body.querySelector('#asgBody')); } });
  function tplBtn(k, t, s, dis) {
    return '<button type="button" class="tap" data-tpl="' + k + '"' + (dis ? ' disabled' : '') + ' style="display:flex;flex-direction:column;gap:2px;text-align:left;width:100%;padding:10px 12px;margin-bottom:8px;border-radius:12px;border:1.5px solid ' + (st.tpl === k ? 'var(--g-main)' : 'var(--hair)') + ';background:' + (st.tpl === k ? 'var(--g-light)' : 'var(--sunk)') + ';color:var(--ink);font-family:inherit;cursor:pointer;' + (dis ? 'opacity:.5;' : '') + '"><b style="font-size:13px">' + t + '</b><span style="font-size:11.5px;color:var(--text3)">' + s + '</span></button>';
  }
  function paint(box) {
    var h = '';
    if (st.step === 1) {
      var rl = accts.filter(function (a) { return byRules[a.id] > 0; }).map(function (a) { return _escH(a.name) + ' ' + FT.money(byRules[a.id], { cents: true }); }).join(' · ');
      h = '<p style="font-size:12.5px;color:var(--text2);margin:0 0 10px">' + (L ? 'Elige cómo repartir este dinero entre las cuentas del hogar.' : 'Pick how to split this money across the household accounts.') + '</p>' +
        tplBtn('reglas', L ? 'Como indican las reglas' : 'As the rules say', hasRules ? (rl || (L ? 'Ninguna regla alcanza este monto' : 'No rule covers this amount')) : (L ? 'Aún no hay reglas en las cuentas' : 'No account has a rule yet'), !hasRules) +
        tplBtn('una', L ? 'Todo a una cuenta' : 'All to one account', L ? 'Tú eliges cuál' : 'You pick which') +
        (accts.length > 1 ? tplBtn('iguales', L ? 'Partes iguales' : 'Equal parts', FT.money(total / accts.length, { cents: true }) + (L ? ' a cada una' : ' each')) : '') +
        (accts.length > 1 ? tplBtn('manual', L ? 'Yo decido cuánto a cada una' : 'I decide how much each', L ? 'Escribes los montos' : 'You type the amounts') : '') +
        '<button type="button" class="ft-btn ft-btn-primary tap" data-go="2">' + (L ? 'Continuar' : 'Continue') + '</button>';
    } else {
      var al = allocs(), sum = sumOf(al), diff = +(total - sum).toFixed(2), over = diff < -0.011;
      var detail = '';
      if (st.tpl === 'una') detail = '<div class="ft-field"><label>' + (L ? '¿A cuál cuenta?' : 'Which account?') + '</label><select id="asgOne">' + accts.map(function (a) { return '<option value="' + _escH(a.id) + '"' + (String(a.id) === String(st.one) ? ' selected' : '') + '>' + _escH(a.name) + '</option>'; }).join('') + '</select></div>';
      if (st.tpl === 'manual') detail = accts.map(function (a) { return '<div class="ft-field"><label>' + _escH(a.name) + '</label><input data-man="' + _escH(a.id) + '" inputmode="decimal" value="' + (st.manual[a.id] || '') + '"></div>'; }).join('');
      h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b style="font-size:13px">' + (L ? 'Revisa el reparto' : 'Review the split') + '</b><button type="button" class="tap" data-go="1" style="background:none;border:none;color:var(--blue);font-weight:800;font-size:12px;cursor:pointer">← ' + (L ? 'Atrás' : 'Back') + '</button></div>' +
        detail +
        '<div style="background:var(--sunk);border-radius:12px;padding:10px 12px;margin:8px 0">' + (al.length ? al.map(function (a) { return '<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0"><span>' + _escH(nameOf(a.acctId)) + '</span><b>+' + FT.money(a.amount, { cents: true }) + '</b></div>'; }).join('') : '<span style="font-size:12px;color:var(--text3)">' + (L ? 'Nada que asignar con esta plantilla.' : 'Nothing to assign with this template.') + '</span>') + '</div>' +
        '<div id="asgChk" style="font-size:12px;font-weight:700;margin-bottom:8px;color:' + (over ? 'var(--red)' : (diff === 0 ? 'var(--g-dark)' : '#8a5a00')) + '">' + (over ? (L ? 'Te pasaste por ' : 'Over by ') + FT.money(-diff, { cents: true }) : (diff === 0 ? '✓ ' + (L ? 'Asignado ' : 'Assigned ') + FT.money(sum, { cents: true }) + (L ? ' de ' : ' of ') + FT.money(total, { cents: true }) : (L ? 'Quedarán ' : 'Left over: ') + FT.money(diff, { cents: true }) + (L ? ' sin asignar' : ' unassigned'))) + '</div>' +
        '<div style="font-size:12px;font-weight:800;margin:4px 0">' + (L ? '¿Para cuáles cheques?' : 'For which paychecks?') + '</div>' +
        '<button type="button" class="tap" data-sr="0" style="display:flex;flex-direction:column;gap:2px;text-align:left;width:100%;padding:9px 12px;margin-bottom:6px;border-radius:12px;border:1.5px solid ' + (!st.saveRule ? 'var(--g-main)' : 'var(--hair)') + ';background:' + (!st.saveRule ? 'var(--g-light)' : 'var(--sunk)') + ';font-family:inherit;color:var(--ink);cursor:pointer"><b style="font-size:12.5px">' + (L ? 'Solo este cheque' : 'Only this paycheck') + '</b><span style="font-size:11px;color:var(--text3)">' + (L ? 'Los próximos los asignas a mano' : 'You assign the next ones by hand') + '</span></button>' +
        (st.tpl === 'reglas' || partial ? '' : '<button type="button" class="tap" data-sr="1" style="display:flex;flex-direction:column;gap:2px;text-align:left;width:100%;padding:9px 12px;margin-bottom:8px;border-radius:12px;border:1.5px solid ' + (st.saveRule ? 'var(--g-main)' : 'var(--hair)') + ';background:' + (st.saveRule ? 'var(--g-light)' : 'var(--sunk)') + ';font-family:inherit;color:var(--ink);cursor:pointer"><b style="font-size:12.5px">' + (L ? 'Este y los próximos ' + (mine ? 'míos' : 'de ' + who) : 'This and the next ones') + '</b><span style="font-size:11px;color:var(--text3)">' + (mine ? (L ? 'Queda como mi regla de reparto: mis cheques se reparten solos' : 'Becomes my split rule: my paychecks split on their own') : (L ? 'Queda como la regla de reparto de ' + who + ': sus cheques se reparten solos, sin que tenga que hacer nada' : 'Becomes ' + who + "'s split rule: their paychecks split on their own")) + '</span></button>') +
        '<button type="button" class="ft-btn ft-btn-primary tap" data-ok="1"' + ((!al.length || over) ? ' disabled style="opacity:.5"' : '') + '>' + (L ? 'Asignar ' : 'Assign ') + FT.money(sum, { cents: true }) + '</button>';
    }
    box.innerHTML = h;
    box.querySelectorAll('[data-tpl]').forEach(function (b) { b.onclick = function () { if (b.disabled) return; st.tpl = b.getAttribute('data-tpl'); paint(box); }; });
    box.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { st.step = parseInt(b.getAttribute('data-go'), 10); paint(box); }; });
    box.querySelectorAll('[data-sr]').forEach(function (b) { b.onclick = function () { st.saveRule = b.getAttribute('data-sr') === '1'; paint(box); }; });
    var one = box.querySelector('#asgOne'); if (one) one.onchange = function () { st.one = one.value; paint(box); };
    box.querySelectorAll('[data-man]').forEach(function (inp) {
      inp.oninput = function () {
        st.manual[inp.getAttribute('data-man')] = FT.numMoney(inp.value);
        var al2 = allocs(), s2 = sumOf(al2), d2 = +(total - s2).toFixed(2), chk = box.querySelector('#asgChk'), ok = box.querySelector('[data-ok]');
        if (chk) { chk.textContent = d2 < -0.011 ? (L ? 'Te pasaste por ' : 'Over by ') + FT.money(-d2, { cents: true }) : (d2 === 0 ? '✓ ' + (L ? 'Asignado ' : 'Assigned ') + FT.money(s2, { cents: true }) + (L ? ' de ' : ' of ') + FT.money(total, { cents: true }) : (L ? 'Quedarán ' : 'Left over: ') + FT.money(d2, { cents: true }) + (L ? ' sin asignar' : ' unassigned')); chk.style.color = d2 < -0.011 ? 'var(--red)' : (d2 === 0 ? 'var(--g-dark)' : '#8a5a00'); }
        if (ok) { ok.disabled = !al2.length || d2 < -0.011; ok.style.opacity = ok.disabled ? '.5' : ''; ok.textContent = (L ? 'Asignar ' : 'Assign ') + FT.money(s2, { cents: true }); }
      };
    });
    var okb = box.querySelector('[data-ok]');
    if (okb) okb.onclick = function () {
      var al3 = allocs(); if (!al3.length) return;
      var rules = (st.saveRule && st.tpl !== 'reglas') ? FT.rulesFromTemplate(st.tpl, accts.map(function (a) { return a.id; }), al3, total, st.one) : null;
      if (mine) {
        var res = FT.assignHogar(opts.chequeId, al3, { rules: rules });
        if (!res.ok) { var why = { exceeds: L ? 'ya se asignó parte de este dinero' : 'part of this money was already assigned', noacct: L ? 'esa cuenta ya no existe' : 'that account no longer exists', notjoint: L ? 'esa cuenta no es del hogar' : 'that account is not a household one', nocheque: L ? 'ese cheque ya no existe' : 'that paycheck no longer exists', empty: L ? 'no hay nada que asignar' : 'nothing to assign' }[res.reason] || res.reason; FT.toast(L ? '⚠️ No se pudo asignar: ' + why : '⚠️ Could not assign: ' + why); return; }
        FT.toast(L ? '✅ Asignado ' + FT.money(sumOf(al3), { cents: true }) : '✅ Assigned ' + FT.money(sumOf(al3), { cents: true }), { icon: '🏠' });
      } else {
        FT.queueHogarEdit({ id: 'he_' + Date.now(), op: 'assign', chequeId: opts.chequeId, fecha: opts.fecha || '', allocations: al3.map(function (a) { return { acctId: a.acctId, acctName: nameOf(a.acctId), amount: a.amount }; }), rules: rules, by: FT.userName(), at: new Date().toISOString() });
        FT.toast(L ? '📨 Enviado. ' + who.charAt(0).toUpperCase() + who.slice(1) + ' lo verá al abrir la app' : '📨 Sent. They will see it when they open the app', { icon: '🏠' });
      }
      FT.closeTop();
    };
  }
  return ov;
};

FT.recordCheque = function (o) {
  var monto = parseFloat(o.monto); if (!monto || monto <= 0) return null;
  var h = FT.hogar();
  var totHogar = (parseFloat(h.payPctHogar) || 50) + (parseFloat(h.saveHogarPct) || 10);
  var hogarAmt = monto * totHogar / 100, personalAmt = monto - hogarAmt;
  var fecha = o.fecha || FT.todayISO();
  var dObj = new Date(fecha + 'T00:00:00');
  var mes = dObj.getFullYear() + '-' + String(dObj.getMonth() + 1).padStart(2, '0');
  var tipo = o.tipo || 'nuevo';
  var es = FT.lang === 'es';
  // Un solo generador de ids para TODAS las transacciones que esta llamada
  // pueda crear (ingreso, ahorro automático, aporte(s) a cuentas de hogar)
  // -- varias venían de Date.now() por separado, con riesgo real de
  // coincidir en el mismo milisegundo y duplicar un id dentro de
  // ft_data.transactions (mismo patrón ya corregido hoy en
  // FT.applyDueRecurring).
  var idSeq = 0, idBase = Date.now();
  function nextId() { return idBase + (idSeq++); }

  var cheques = FT.cheques();
  // `repartido:false` marca este cheque como candidato al reparto manual a
  // fondos con nombre de Ahorro libre (FT.pendingReparto) -- explícito, no
  // `!c.repartido`, para que los cheques viejos (sin este campo, de antes
  // de que existiera el reparto) NUNCA cuenten como pendientes y no le
  // resucite a nadie un "sin repartir" gigante de meses acumulados.
  // "Ya lo tenía" no genera ingreso nuevo (ver abajo), así que no hay nada
  // que repartir -- se marca repartido:true directo.
  var chequeRow = { id: Date.now() + Math.floor(Math.random() * 1000), monto: monto, hogarAmt: hogarAmt, personalAmt: personalAmt, fecha: fecha, mes: mes, tipo: tipo, repartido: tipo !== 'nuevo', autoSaved: 0 };
  cheques.push(chequeRow);

  var autoSaved = 0;
  if (tipo === 'nuevo') {
    var d = FT.data();
    // txId liga esta fila de ft_cheques con la transacción de ingreso que
    // acaba de crear -- antes nada las ligaba, así que borrar el depósito
    // (desde Hogar o desde el buscador de duplicados en Historial) dejaba
    // esta fila huérfana sumando para siempre en fondoAportado (revisión
    // independiente, 15-oct-2026). chequeRow.id NUNCA fue ese id -- se
    // genera con su propio Date.now()+random por separado.
    var incomeTxId = nextId();
    chequeRow.txId = incomeTxId;
    d.transactions.push({ id: incomeTxId, type: 'ingreso', desc: es ? 'Cheque recibido' : 'Paycheck received', amount: monto, date: fecha, cat: '💰 Ingreso', incomeKind: 'cheque', createdBy: FT.userName() });
    FT.set(K.data, d);

    var u = FT._user || FT.loadUser() || {};
    var savPct = u.savingsPct != null ? u.savingsPct : 20;
    autoSaved = Math.round(personalAmt * savPct / 100);
    if (autoSaved > 0) {
      var savId = nextId();
      // _noAcctMove (15-oct-2026, aprobado vía simulación): el cheque personal
      // nunca se suma a ninguna cuenta, así que depositarlo a un fondo
      // vinculado NO debe restarle al disponible de la cuenta -- antes cada
      // cheque dejaba el disponible más negativo aunque el dinero real sí
      // entró al fondo. El dinero llega directo a la bóveda: sube el
      // apartado (y el total de la cuenta), el disponible no se toca.
      FT.addSavings({ id: savId, amount: autoSaved, date: fecha, note: es ? 'Págate primero (automático del cheque)' : 'Pay yourself first (automatic from paycheck)', _noAcctMove: true });
      var d2 = FT.data();
      d2.transactions.push({ id: savId, type: 'ahorro', desc: es ? 'Ahorro automático del cheque' : 'Automatic paycheck savings', amount: autoSaved, date: fecha, cat: '💰 Ahorro', dest: 'libre', createdBy: FT.userName() });
      FT.set(K.data, d2);
    }
    chequeRow.autoSaved = autoSaved;
    // Reparto a fondos de Ahorro libre AHORA automático (15-oct-2026, a
    // petición de Ramón: "se debe de dejar de manera autónoma" -- revierte
    // la decisión original de Etapa 2, "el reparto nunca es silencioso").
    // Mismo criterio que YA usaba el lado de hogar unas líneas abajo desde
    // Etapa 3: una regla (monto fijo o %) que tú configuraste de antemano
    // en un fondo no necesita que la confirmes cada vez que llega un
    // cheque -- ya decidiste. Lo que ningún fondo cubre con su regla se
    // queda simplemente disponible (mismo resultado que elegir "Dejar todo
    // disponible" en el reparto manual de antes), visible en
    // chequeRow.fondoSinAsignar para un aviso aparte, igual que
    // hogarSinAsignar ya hace para el lado de hogar.
    var remainingForFunds = +(personalAmt - autoSaved).toFixed(2);
    if (remainingForFunds > 0.005) {
      var fundAlloc = FT.suggestFundAllocation(remainingForFunds);
      var fundsAll = FT.savingsFunds();
      var fundAllocated = 0;
      Object.keys(fundAlloc).forEach(function (fundId) {
        var amt = fundAlloc[fundId];
        if (amt <= 0) return;
        var f = fundsAll.find(function (x) { return x.id === fundId; });
        var repId = nextId();
        FT.addSavings({ id: repId, amount: amt, date: fecha, tipo: 'deposito', note: (es ? 'Reparto de cheque — ' : 'Paycheck allocation — ') + (f ? f.name : ''), monthTx: true, fundId: fundId, _noAcctMove: true });
        var dF = FT.data();
        dF.transactions.push({ id: repId, type: 'ahorro', desc: (es ? 'Reparto de cheque — ' : 'Paycheck allocation — ') + (f ? f.name : ''), amount: amt, date: fecha, cat: '💵 Ahorro', dest: 'libre', createdBy: FT.userName() });
        FT.set(K.data, dF);
        fundAllocated += amt;
      });
      chequeRow.fondoSinAsignar = +(remainingForFunds - fundAllocated).toFixed(2);
    }
    chequeRow.repartido = true;

    // Etapa 3 (+ extensión 2026-09-25): si configuraste una regla (monto fijo
    // o %) en una o más cuentas de cheques conjuntas (hogar.html → Cuentas),
    // tu parte de hogar de este cheque se reparte ahí de verdad -- antes
    // "Cuentas" solo mostraba el % ya presupuestado, nunca dinero real.
    // Ramón necesitaba poder mandar un monto FIJO (ej. $275/semana a "Casa +
    // Servicio") a una cuenta y no necesariamente el 100% a una sola -- ahora
    // se puede repartir entre varias, reglas fijas primero y luego %, con el
    // mismo motor que ya usan los fondos de Ahorro libre. Lo que ninguna
    // regla cubra se queda sin depositar a ninguna cuenta (sigue contando
    // igual dentro de tu presupuesto de hogar, solo no se refleja en un
    // saldo de cuenta en particular). No pide confirmación cada vez porque
    // esto son reglas que TÚ configuraste de antemano, igual que un banco de
    // verdad mueve tus "vaults" solo una vez que los armaste.
    if (hogarAmt > 0) {
      var chkAlloc = FT.suggestCheckingAllocation(hogarAmt);
      var acctKeys = Object.keys(chkAlloc).filter(function (k) { return chkAlloc[k] > 0; });
      if (acctKeys.length) {
        // Antes esto solo movía el saldo de la cuenta (FT.creditChecking)
        // sin dejar ningún rastro en Historial -- era el único lugar de
        // toda la app donde un saldo cambiaba sin ninguna transacción
        // ligada (bug real de QA: no se podía saber de dónde salió ese
        // dinero). Ahora cada cuenta que recibe su parte también genera su
        // propia transacción, igual que ya hacen las metas/recurrentes de
        // hogar -- mismo cat/hogar:true, así que cuenta como "aportado" en
        // el resumen de Hogar, no como sobrante sin asignar.
        var allAccts = FT.checking();
        var dH = FT.data();
        acctKeys.forEach(function (acctId) {
          var amt = chkAlloc[acctId];
          FT.creditChecking(acctId, amt);
          var acct = allAccts.find(function (a) { return String(a.id) === String(acctId); });
          // acctCredited:true -- esta transacción ACREDITÓ la cuenta (no la
          // descontó) aunque su `type` sea 'ahorro', no 'ingreso' -- ver el
          // mismo flag en FT.addEntry. Sin esto, borrar/editar este aporte
          // se revertía en la dirección de un gasto (creditChecking de
          // nuevo) en vez de deshacer el crédito original (deductChecking).
          var txIdA = nextId();
          dH.transactions.push({ id: txIdA, type: 'ahorro', desc: (es ? 'Aporte hogar — ' : 'Household contribution — ') + (acct ? acct.name : '?'), amount: amt, date: fecha, cat: '🏠 Hogar', hogar: true, createdBy: FT.userName(), auto: true, checkingAccountId: acctId, acctCredited: true, chequeId: chequeRow.id });
          chequeRow.asignaciones = (chequeRow.asignaciones || []).concat([{ txId: txIdA, acctId: acctId, acctName: acct ? acct.name : '', amount: amt, by: FT.userName(), at: new Date().toISOString(), auto: true }]);
        });
        FT.set(K.data, dH);
      }
      // Lo que ninguna regla cubrió -- visible ahora en el cheque guardado,
      // en vez de solo existir implícito dentro de hogarAmt sin que se
      // pueda ver en ningún lado cuánto fue.
      var allocatedHogar = acctKeys.reduce(function (a, k) { return a + chkAlloc[k]; }, 0);
      chequeRow.hogarSinAsignar = +(hogarAmt - allocatedHogar).toFixed(2);
    }
  }
  FT.set(K.cheques, cheques);
  FT._changed();
  return { chequeId: chequeRow.id, fecha: fecha, monto: monto, hogarAmt: hogarAmt, personalAmt: personalAmt, autoSaved: autoSaved, hogarSinAsignar: chequeRow.hogarSinAsignar || 0, fondoSinAsignar: chequeRow.fondoSinAsignar || 0 };
};

/* ── Reparto de cheque a fondos de Ahorro libre (2026-09-23, etapa 2) ──────
   No es un reparto automático/silencioso -- Ramón fue explícito: "el
   usuario tiene que aceptar esto". Cada cheque "nuevo" deja registrado
   cuánto de su parte personal (ya descontado lo que se fue solo a "págate
   primero") sigue sin asignar a ningún fondo con nombre; el dashboard
   muestra un recuadro con ese total y, al tocarlo, un modal deja aceptar
   la sugerencia de las reglas guardadas por fondo, ajustarla, o simplemente
   dejarlo todo disponible -- nunca mueve un centavo sin que el usuario lo
   confirme. */
FT.pendingReparto = function () {
  return FT.pendingRepartoCheques().reduce(function (a, c) { return a + Math.max(0, (parseFloat(c.personalAmt) || 0) - (parseFloat(c.autoSaved) || 0)); }, 0);
};
FT.pendingRepartoCheques = function () {
  return FT.cheques().filter(function (c) { return c.tipo === 'nuevo' && c.repartido === false; });
};
/** Aplica el reparto que el usuario confirmó -- allocations: [{fundId, fundName, amount}].
 *  Cada asignación es un depósito normal a ese fondo que además cuenta como
 *  ahorro de este mes (mismo mecanismo que un depósito manual "de mi
 *  disponible del mes"), así que reduce el disponible para gastar como
 *  corresponde. Se puede llamar con [] (arreglo vacío) para "dejar todo
 *  disponible por ahora" -- de cualquier forma, marca los cheques pendientes
 *  como repartidos: es una decisión válida y consciente, no un pendiente a
 *  medias que deba seguir apareciendo. */
FT.applyReparto = function (allocations) {
  var es = FT.lang === 'es';
  var base = Date.now();
  (allocations || []).forEach(function (al, i) {
    var amt = parseFloat(al.amount) || 0;
    if (amt <= 0) return;
    // +i (no +Math.random()) para que dos asignaciones del mismo reparto
    // NUNCA choquen de id entre sí -- con random() cabía la posibilidad de
    // que dos fondos sacaran el mismo id en el mismo milisegundo, y borrar
    // esa transacción después revertía solo uno de los dos fondos, dejando
    // el otro con saldo fantasma sin transacción que lo explique.
    var id = base + i;
    FT.addSavings({ id: id, amount: amt, date: FT.todayISO(), tipo: 'deposito', note: (es ? 'Reparto de cheque' : 'Paycheck allocation') + (al.fundName ? ' — ' + al.fundName : ''), monthTx: true, fundId: al.fundId, _noAcctMove: true });
    var d = FT.data();
    d.transactions.push({ id: id, type: 'ahorro', desc: (es ? 'Reparto de cheque — ' : 'Paycheck allocation — ') + (al.fundName || ''), amount: amt, date: FT.todayISO(), cat: '💵 Ahorro', dest: 'libre', createdBy: FT.userName() });
    FT.set(K.data, d);
  });
  FT.markRepartoDone();
};
FT.markRepartoDone = function () {
  var cheques = FT.cheques();
  cheques.forEach(function (c) { if (c.tipo === 'nuevo' && c.repartido === false) c.repartido = true; });
  FT.set(K.cheques, cheques);
  FT._changed();
};

FT.getMissingPaydays = function () {
  var u = FT._user || FT.loadUser() || {};
  if (!u.payAuto) return [];
  var freq = u.payFreq || 'weekly', payDay = u.payDay || 'thursday';
  var days = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  var cheques = FT.cheques();
  var recorded = {}; cheques.forEach(function (c) { recorded[c.fecha] = 1; });
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var start;
  if (cheques.length) {
    var lastMs = Math.max.apply(null, cheques.map(function (c) { return new Date(c.fecha + 'T00:00:00').getTime(); }));
    start = new Date(lastMs); start.setDate(start.getDate() + 1);
  } else {
    // Sin ningún cheque registrado (cuenta nueva, o recién se activó "Registro
    // automático", o se acaba de usar "Borrar todo"): antes esto rellenaba
    // ciegamente los últimos 60 días como si el usuario llevara 2 meses
    // usando la app — inventaba cheques + ahorro automático de fechas en las
    // que la cuenta ni existía. Ahora el arranque en frío nunca cruza hacia
    // atrás de `u.createdAt` (la cuenta es de HOY si se acaba de registrar).
    start = new Date(today); start.setDate(start.getDate() - 60);
    var created = u.createdAt ? new Date(u.createdAt) : null;
    if (created && !isNaN(created) && created > start) { start = created; start.setHours(0, 0, 0, 0); }
  }
  var missing = [], cursor = new Date(start), guard = 0;
  while (cursor <= today && guard < 400) {
    var ds = FT.date(cursor, 'ISO'), matches;
    if (freq === 'weekly') {
      matches = cursor.getDay() === (days[payDay] !== undefined ? days[payDay] : 4);
    } else if (freq === 'biweekly' && days[payDay] !== undefined && u.payAnchor) {
      // Quincenal de verdad: mismo día de la semana que weekly, PERO solo
      // cada 14 días contados desde una fecha ancla real (un pago que sí
      // recibió) -- si solo se comparara el día de la semana, "cada martes"
      // dispararía cada semana, el doble de seguido de lo que en realidad
      // pagan (una semana sí, la otra no).
      var anchor = new Date(u.payAnchor + 'T00:00:00');
      var diffDays = Math.round((cursor - anchor) / 86400000);
      matches = cursor.getDay() === days[payDay] && (diffDays % 14 === 0);
    } else {
      // Quincenal a la antigua (día de mes fijo, sin ancla configurada) o mensual real.
      matches = String(cursor.getDate()) === String(payDay);
    }
    if (matches && !recorded[ds]) missing.push(ds);
    cursor.setDate(cursor.getDate() + 1); guard++;
  }
  return missing;
};
FT.catchUpCheques = function () {
  var missing = FT.getMissingPaydays();
  if (!missing.length) return 0;
  var u = FT._user || FT.loadUser() || {};
  var freq = u.payFreq || 'weekly';
  var checks = freq === 'weekly' ? 4 : freq === 'biweekly' ? 2 : 1;
  var expected = (u.income || 0) / checks;
  if (expected <= 0) return 0;
  missing.forEach(function (f) { FT.recordCheque({ monto: expected, fecha: f, tipo: 'nuevo' }); });
  return missing.length;
};

// Recurrente "libre" (12-oct-2026, a petición de Ramón: "un pago de la
// basura que se cobra cada 4 meses" -- no entraba en semanal/quincenal/
// mensual). `freq` sigue siendo un string en todo el código (clave de
// lookup en varios `{weekly:...,...}[freq]`) -- se extiende con el formato
// 'custom:N:unidad' (unidad: days|weeks|months|years) en vez de inventar
// un segundo campo, así todo lo que ya trata `freq` como string sigue
// funcionando sin tocarlo. FT.advanceByFreq centraliza la matemática de
// fechas -- antes vivía duplicada en _advanceRecDate (familia FT.recurring)
// Y en _applyDueList/recurringItemsScreen (familia aparte de Suscripciones/
// Servicios, que nunca compartió código con la primera) -- una sola función
// evita que las dos familias se desincronicen si esto se toca de nuevo.
FT.advanceByFreq = function (dt, freq) {
  if (typeof freq === 'string' && freq.indexOf('custom:') === 0) {
    var parts = freq.split(':'), n = parseInt(parts[1], 10) || 1, unit = parts[2];
    if (unit === 'days') dt.setDate(dt.getDate() + n);
    else if (unit === 'weeks') dt.setDate(dt.getDate() + n * 7);
    else if (unit === 'years') dt.setFullYear(dt.getFullYear() + n);
    else dt.setMonth(dt.getMonth() + n); // 'months' (default dentro de custom)
  }
  else if (freq === 'weekly') dt.setDate(dt.getDate() + 7);
  else if (freq === 'biweekly') dt.setDate(dt.getDate() + 14);
  else if (freq === 'annual') dt.setFullYear(dt.getFullYear() + 1);
  else dt.setMonth(dt.getMonth() + 1); // 'monthly' y cualquier otro caso
  return dt;
};
/** "cada 4 meses" / "every 4 months" -- null si freq no es formato custom,
 *  para que el que llama pueda hacer `MAPA[freq] || FT.customFreqLabel(freq) || freq`. */
FT.customFreqLabel = function (freq) {
  if (typeof freq !== 'string' || freq.indexOf('custom:') !== 0) return null;
  var parts = freq.split(':'), n = parseInt(parts[1], 10) || 1, unit = parts[2];
  var L = FT.lang === 'es';
  var unitLabel = ({
    days: L ? (n === 1 ? 'día' : 'días') : (n === 1 ? 'day' : 'days'),
    weeks: L ? (n === 1 ? 'semana' : 'semanas') : (n === 1 ? 'week' : 'weeks'),
    months: L ? (n === 1 ? 'mes' : 'meses') : (n === 1 ? 'month' : 'months'),
    years: L ? (n === 1 ? 'año' : 'años') : (n === 1 ? 'year' : 'years')
  })[unit] || unit;
  return (L ? 'cada ' : 'every ') + n + ' ' + unitLabel;
};
/** Sub-formulario compartido "Cada [N] [días/semanas/meses/años]" para
 *  cuando el usuario elige "Personalizado" en cualquier selector de
 *  frecuencia -- cada pantalla sigue dibujando su propio botón
 *  "Personalizado" dentro de su segmented-control (el markup de esos ya
 *  difiere un poco entre pantallas), pero el sub-form y su lectura son uno
 *  solo para que el formato 'custom:N:unidad' nunca se arme distinto en
 *  dos lados. */
FT.customFreqSubFormHTML = function (idPrefix, initFreq) {
  var L = FT.lang === 'es';
  var n = 4, unit = 'months';
  if (typeof initFreq === 'string' && initFreq.indexOf('custom:') === 0) {
    var parts = initFreq.split(':'); n = parseInt(parts[1], 10) || 4; unit = parts[2] || 'months';
  }
  var units = [['days', L ? 'Días' : 'Days'], ['weeks', L ? 'Semanas' : 'Weeks'], ['months', L ? 'Meses' : 'Months'], ['years', L ? 'Años' : 'Years']];
  return '<div id="' + idPrefix + 'CustomWrap" style="display:none;margin-top:8px;align-items:center;gap:8px"><span style="font-size:11.5px;font-weight:700;color:var(--text2)">' + (L ? 'Cada' : 'Every') + '</span>' +
    '<input type="number" min="1" id="' + idPrefix + 'CustomN" value="' + n + '" style="width:60px;padding:8px;border-radius:9px;border:1.5px solid var(--hair);text-align:center;font-family:var(--ui-font);font-weight:700">' +
    '<select id="' + idPrefix + 'CustomUnit" style="flex:1;padding:8px;border-radius:9px;border:1.5px solid var(--hair);font-family:var(--ui-font);font-weight:700">' +
    units.map(function (u) { return '<option value="' + u[0] + '"' + (u[0] === unit ? ' selected' : '') + '>' + u[1] + '</option>'; }).join('') +
    '</select></div>';
};
/** wire(body, idPrefix) -- conecta el sub-form ya insertado con
 *  customFreqSubFormHTML. Devuelve {show(on), getFreq()}. */
FT.wireCustomFreqSubForm = function (body, idPrefix) {
  var wrap = body.querySelector('#' + idPrefix + 'CustomWrap');
  return {
    show: function (on) { if (wrap) wrap.style.display = on ? 'flex' : 'none'; },
    getFreq: function () {
      var n = parseInt((body.querySelector('#' + idPrefix + 'CustomN') || {}).value, 10) || 1;
      var unit = (body.querySelector('#' + idPrefix + 'CustomUnit') || {}).value || 'months';
      return 'custom:' + Math.max(1, n) + ':' + unit;
    }
  };
};
function _advanceRecDate(freq, fromStr) {
  var dt = new Date(fromStr + 'T00:00:00');
  FT.advanceByFreq(dt, freq);
  return FT.date(dt, 'ISO');
}
FT._advanceRecDate = _advanceRecDate;

/** Vincula la emergencia/una meta DEL HOGAR a una cuenta conjunta como apartado (si no lo estaba ya): absorbe lo ya
 *  ahorrado (baja el libre) para que el TOTAL de la cuenta no cambie. kind: 'hogaremerg' | 'hogarmeta'. */
FT.linkHogarFondo = function (kind, id, acctId) {
  if (!acctId) return false;
  var hf = FT.hogarFondos(), item = kind === 'hogaremerg' ? hf.emerg : (hf.metas || []).find(function (m) { return m.id === id; });
  if (!item) return false;
  if (item.accountId && String(item.accountId) === String(acctId)) return true;
  var cur = parseFloat(item.actual) || 0, today = FT.todayISO(), log = [];
  if (item.accountId && cur) { FT.creditChecking(item.accountId, cur); log.push({ date: today, acctId: item.accountId, amount: cur, note: 'release' }); }
  if (cur) { FT.deductChecking(acctId, cur); log.push({ date: today, acctId: acctId, amount: -cur, note: 'absorb' }); }
  var hf2 = FT.hogarFondos(), it2 = kind === 'hogaremerg' ? hf2.emerg : (hf2.metas || []).find(function (m) { return m.id === id; });
  it2.accountId = acctId; it2.foreign = undefined;   // la cuenta nueva absorbió todo lo ya apartado
  if (log.length) it2.vaultLog = (it2.vaultLog || []).concat(log).slice(-40);
  FT.saveHogarFondos(hf2);
  return true;
};
/** Cuánto del DISPONIBLE de `acctId` hace falta, además del monto, para aportar a esta meta/emergencia del hogar. */
FT.hogarAbsorbNeed = function (kind, id, acctId) {
  var hf = FT.hogarFondos(), item = kind === 'hogaremerg' ? hf.emerg : (hf.metas || []).find(function (m) { return m.id === id; });
  if (!item || !acctId) return 0;
  var linkedOk = item.accountId && FT.checking().some(function (a) { return String(a.id) === String(item.accountId); });
  return (linkedOk && String(item.accountId) === String(acctId)) ? 0 : (parseFloat(item.actual) || 0);
};
/** Desvincula (y libera lo apartado a su cuenta) una meta del hogar o la emergencia del hogar -- usar antes de borrarla. */
FT.unlinkHogarFondo = function (kind, id) {
  var hf = FT.hogarFondos(), item = kind === 'hogaremerg' ? hf.emerg : (hf.metas || []).find(function (m) { return m.id === id; });
  if (!item || !item.accountId) return false;
  var cur = Math.max(0, (parseFloat(item.actual) || 0) - (parseFloat(item.foreign) || 0));
  if (cur) FT.creditChecking(item.accountId, cur);
  var hf2 = FT.hogarFondos(), it2 = kind === 'hogaremerg' ? hf2.emerg : (hf2.metas || []).find(function (m) { return m.id === id; });
  it2.accountId = null;
  FT.saveHogarFondos(hf2);
  return true;
};
function _applyRecMeta(rec, hoy, nextId) {
  nextId = nextId || Date.now;
  try {
    var f = FT.hogarFondos();
    var meta = rec.metaTipo === 'emerg' ? f.emerg : (rec.metaId != null ? f.metas.find(function (m) { return m.id === rec.metaId; }) : f.metas[rec.metaIdx]);
    if (!meta) return 'broken';
    // Sale del DISPONIBLE de su cuenta: si no alcanza, no se aplica y se reintenta (no se deja la cuenta en negativo).
    var _kind = rec.metaTipo === 'emerg' ? 'hogaremerg' : 'hogarmeta';
    var srcAcct = (rec.desdePres && rec.checkingAccountId) || (meta.accountId && FT.checking().some(function (a) { return String(a.id) === String(meta.accountId); }) ? meta.accountId : null);
    if (srcAcct && !FT.checkOverdraft(srcAcct, rec.amount + FT.hogarAbsorbNeed(_kind, meta.id, srcAcct)).ok) return 'insufficient';
    if (srcAcct) FT.linkHogarFondo(_kind, meta.id, srcAcct);
    f = FT.hogarFondos(); meta = rec.metaTipo === 'emerg' ? f.emerg : (rec.metaId != null ? f.metas.find(function (m) { return m.id === rec.metaId; }) : f.metas[rec.metaIdx]);
    meta.hist = meta.hist || [];
    if (meta.hist.some(function (h) { return h.fecha === hoy && (h.recId === rec.id || !h.recId); })) return 'already';
    meta.hist.push({ id: 'd_' + nextId(), monto: rec.amount, fecha: hoy, desdePres: rec.desdePres, auto: true, recId: rec.id });
    meta.actual = meta.hist.reduce(function (a, h) { return a + (h.monto || 0); }, 0);
    FT.set(K.hogarFondos, f);
    if (!rec.desdePres && srcAcct) FT.deductChecking(srcAcct, rec.amount, hoy); // meta vinculada: el aporte siempre sale del libre de su cuenta
    if (rec.desdePres) {
      // Si este aporte recurrente se configuró para salir de una cuenta de
      // cheques (conjunta, ya que las metas de hogar son dinero compartido),
      // descontarla también -- solo cuando de verdad es dinero nuevo saliendo
      // del presupuesto (desdePres), no cuando "ya lo tenía ahorrado" (ese
      // caso no mueve nada nuevo del banco, sería descontar de más).
      if (srcAcct) FT.deductChecking(srcAcct, rec.amount, hoy);
      var d = FT.data();
      d.transactions.push({ id: nextId(), type: 'ahorro', desc: rec.desc, amount: rec.amount, date: hoy, cat: '🏠 Hogar', hogar: true, createdBy: FT.userName(), auto: true, recId: rec.id, checkingAccountId: srcAcct || rec.checkingAccountId });
      FT.set(K.data, d);
    }
    return 'applied';
  } catch (e) { return 'broken'; }
}
function _applyRecAhorro(rec, hoy, nextId) {
  nextId = nextId || Date.now;
  try {
    var toEmerg = rec.dest === 'emergencia';
    var id = nextId();
    if (toEmerg) {
      var eh = FT.get(K.emergHist, []) || [];
      // Mismo criterio que la rama de ahorro libre (`|| !h.recId`) -- un
      // depósito manual del mismo día a emergencia también debe evitar que
      // el recurrente lo duplique, no solo otro depósito automático con el
      // mismo recId. Antes esta rama solo comparaba recId, así que un
      // depósito manual el mismo día no frenaba al automático.
      if (eh.some(function (h) { return h.date === hoy && (h.recId === rec.id || !h.recId); })) return 'already';
      FT.addEmergency({ id: id, amount: rec.amount, date: hoy, tipo: 'deposito', note: rec.desc, recId: rec.id, monthTx: true });
    } else {
      var hist = FT.savingsHist();
      if (hist.some(function (h) { return h.fecha === hoy && (h.recId === rec.id || !h.recId); })) return 'already';
      FT.addSavings({ id: id, amount: rec.amount, date: hoy, note: rec.desc, recId: rec.id, monthTx: true, fundId: rec.fundId });
    }
    // Si este recurrente se configuró con una cuenta de origen (tuya
    // personal, o conjunta si el destino es compartido), descontarla
    // también -- igual que ya hace un abono de deuda. PERO si el fondo/
    // Emergencia destino YA está vinculado a una cuenta (Fase 3),
    // FT.addSavings/FT.addEmergency (arriba) ya descontaron esa cuenta
    // vinculada solas -- si aquí TAMBIÉN se descuenta `rec.checkingAccountId`
    // (una elección manual de ANTES de vincular, que la UI ya no deja crear
    // de nuevas pero un recurrente viejo puede seguir trayendo), se
    // duplicaría el descuento cada vez que corra. Revisión independiente.
    var targetFund = toEmerg ? null : ((rec.fundId && FT.savingsFunds().find(function (f) { return f.id === rec.fundId; })) || FT.defaultSavingsFund(FT.savingsFunds()));
    var targetLinkedAcctId = toEmerg ? FT.emergencyAccountId() : (targetFund && targetFund.accountId);
    if (!targetLinkedAcctId && rec.checkingAccountId) FT.deductChecking(rec.checkingAccountId, rec.amount, hoy);
    // Un recurrente de ahorro es un aporte planeado desde el ingreso → cuenta como ahorro del mes.
    var d = FT.data();
    d.transactions.push({ id: id, type: 'ahorro', desc: rec.desc, amount: rec.amount, date: hoy, cat: toEmerg ? '🛡️ Emergencia' : '💵 Ahorro', dest: toEmerg ? 'emergencia' : 'libre', createdBy: FT.userName(), auto: true, recId: rec.id, checkingAccountId: targetLinkedAcctId ? undefined : rec.checkingAccountId });
    FT.set(K.data, d);
    return 'applied';
  } catch (e) { return 'broken'; }
}
function _applyRecInversion(rec, hoy, nextId) {
  nextId = nextId || Date.now;
  try {
    var scope = rec.hogar ? 'hogar' : '';
    var invs = FT.investments(scope);
    if (invs.some(function (i) { return i.recId === rec.id && i.fecha === hoy; })) return 'already';
    var id = nextId();
    var tk = String(rec.desc || '').toUpperCase();
    // suma a la posición existente del mismo ticker, o crea una nueva
    var pos = invs.find(function (i) { return String(i.ticker || '').toUpperCase() === tk; });
    if (pos) {
      var oldAmt = parseFloat(pos.amount) || (parseFloat(pos.shares) || 1) * (parseFloat(pos.avgPrice) || 0);
      pos.amount = oldAmt + rec.amount; pos.avgPrice = pos.amount; pos.curPrice = pos.amount; pos.shares = 1; pos.fecha = hoy; pos.recId = rec.id;
    } else {
      invs.push({ id: 'i_' + id, ticker: tk, type: 'other', shares: 1, avgPrice: rec.amount, curPrice: rec.amount, amount: rec.amount, platform: '', modo: 'nueva', fecha: hoy, addedBy: FT.userName(), addedAt: new Date().toISOString(), recId: rec.id, txId: id });
    }
    FT.saveInvestments(invs, scope);
    // Si este recurrente se configuró con una cuenta de origen, descontarla
    // también -- igual que ya hace un abono de deuda.
    if (rec.checkingAccountId) FT.deductChecking(rec.checkingAccountId, rec.amount, hoy);
    // cuenta contra el disponible del mes (aporte planeado desde el ingreso)
    var d = FT.data();
    d.transactions.push({ id: id, type: 'inversion', desc: tk, amount: rec.amount, date: hoy, cat: '📈 Inversión', hogar: !!rec.hogar, createdBy: FT.userName(), auto: true, recId: rec.id, fromInvPage: true, checkingAccountId: rec.checkingAccountId });
    FT.set(K.data, d);
    return 'applied';
  } catch (e) { return 'broken'; }
}
function _applyRecDebt(rec, hoy, nextId) {
  nextId = nextId || Date.now;
  try {
    var debts = FT.debts();
    var i = debts.findIndex(function (d) { return String(d.id) === String(rec.debtId); });
    if (i < 0) return 'broken';
    var d = debts[i];
    var alreadyAbono = (d.abonos || []).find(function (a) { return a.fecha === hoy && (a.recId === rec.id || !a.recId); });
    if (alreadyAbono) {
      // Un abono que ya quedó esperando MI aprobación (ver más abajo) para
      // este mismo recurrente no cuenta como "ya aplicado" -- si contara, el
      // bucle en FT.applyDueRecurring avanzaría rec.nextDate solo, sin que
      // el usuario haya aceptado ni rechazado nada, y la tarjeta de
      // pendientes quedaría huérfana de su recurrente real.
      if (alreadyAbono.pendingApproval && alreadyAbono.recId === rec.id) return 'awaiting_approval';
      return 'already';
    }
    // Igual que con servicios: si esta deuda es compartida y mi pareja abrió
    // su app primero, es posible que ya haya aplicado este mismo abono
    // automático antes de que la sincronización me avisara -- reviso su
    // última copia conocida (cacheada) antes de aplicarlo yo también.
    if (rec.hogar) {
      var pp2 = FT.partnerProfile();
      var partnerDebt = pp2 && pp2.data && pp2.data.sharedDebts && pp2.data.sharedDebts.find(function (pd) { return String(pd.id) === String(rec.debtId); });
      if (partnerDebt && (partnerDebt.abonos || []).some(function (a) { return a.fecha === hoy && a.recId === rec.id; })) return 'already';
    }
    // Abono recurrente sacado de un fondo/Emergencia (03-oct-2026): a
    // diferencia de una cuenta de cheques (que se puede sobregirar con
    // aviso), un fondo/Emergencia NUNCA se sobregira -- mismo criterio que
    // _applyRecTransferencia ya usa. Si no alcanza TODAVÍA, 'insufficient'
    // deja el recurrente activo sin avanzar su fecha, para reintentar en la
    // próxima corrida en vez de fabricar el pago o matar la regla.
    if (rec.fundSource) {
      var availFund = rec.fundSource.type === 'emerg' ? FT.emergencyBalance()
        : (function () { var f = FT.savingsFunds().find(function (x) { return x.id === rec.fundSource.id; }); return f ? parseFloat(f.actual) || 0 : 0; })();
      if (rec.amount > availFund + 0.005) return 'insufficient';
    }
    // Pedir aprobación antes de mover el fondo (03-oct-2026, a petición de
    // Ramón: "debemos aceptar el movimiento" -- un pago desde cuenta de
    // cheques se queda automático como siempre, pero sacar de un
    // fondo/vault privado no debe aplicarse solo sin que lo veas primero,
    // salvo que tú mismo hayas elegido "automático" al crear el
    // recurrente). No se toca ni la deuda ni el fondo todavía -- solo se
    // deja un abono "esperando aprobación" visible en la tarjeta de
    // pendientes; FT.resolveDebtApproval() es quien de verdad mueve el
    // dinero cuando tú lo aceptas.
    if (rec.fundSource && rec.requireApproval) {
      d.abonos = d.abonos || [];
      d.abonos.push({ id: nextId(), monto: rec.amount, fecha: hoy, nota: '', tipo: 'nuevo', createdBy: FT.userName(), txId: null, pending: true, pendingApproval: true, recId: rec.id, fundSource: rec.fundSource, hogarAbono: false });
      FT.set(K.debts, debts);
      return 'awaiting_approval';
    }
    // Igual que un abono manual (deudas.html/guardarAbono): el saldo baja
    // por el CAPITAL del pago, no por el monto completo -- primero se
    // cubren los intereses acumulados. Mismo bug real de QA, aquí en la
    // versión automática/recurrente del abono.
    var old = parseFloat(d.balance) || 0;
    var apr = parseFloat(d.apr) || 0;
    var interes = apr > 0 ? +(old * (apr / 100 / 12)).toFixed(2) : 0;
    var capital = +Math.max(0, rec.amount - interes).toFixed(2);
    var nu = Math.max(0, +(old - capital).toFixed(2));
    d.balance = nu; d.updatedAt = new Date().toISOString();
    d.paidMonths = d.paidMonths || {}; d.paidMonths[String(hoy).slice(0, 7)] = true;
    d.abonos = d.abonos || [];
    var abonoId = nextId(), txId = nextId();
    var dt = FT.data();
    var autoTx = { id: txId, type: 'gasto', desc: (FT.lang === 'es' ? 'Abono a ' : 'Payment to ') + d.name, amount: rec.amount, date: hoy, cat: '💳 Deudas', hogar: rec.hogar, createdBy: FT.userName(), auto: true, recId: rec.id };
    // Si este abono automático se configuró para salir de una cuenta de
    // cheques conjunta, descontarla igual que un abono manual -- si no, el
    // saldo de la cuenta se queda sin actualizar cada vez que corre solo.
    if (rec.checkingAccountId) { FT.deductChecking(rec.checkingAccountId, rec.amount, hoy); autoTx.checkingAccountId = rec.checkingAccountId; }
    // Igual que el abono manual con fondo (deudas.html/guardarAbono):
    // retiro real con _noAcctMove (el dinero sale del banco de verdad, no
    // es un movimiento interno) y cat:'💳 Deudas' para que borrar esta
    // transacción (FT.deleteTx's rama fundSource) y borrar el movimiento
    // desde la propia pantalla del fondo (FT.balanceScreen's openDetail)
    // reviertan los dos lados correctamente.
    else if (rec.fundSource) {
      var fsPayloadRec = { id: txId, amount: rec.amount, date: hoy, tipo: 'retiro', note: autoTx.desc, cat: '💳 Deudas', fundId: rec.fundSource.type === 'fund' ? rec.fundSource.id : undefined, _noAcctMove: true };
      if (rec.fundSource.type === 'emerg') FT.addEmergency(fsPayloadRec); else FT.addSavings(fsPayloadRec);
      autoTx.fundSource = rec.fundSource;
    }
    dt.transactions.push(autoTx);
    FT.set(K.data, dt);
    d.abonos.push({ id: abonoId, monto: rec.amount, fecha: hoy, nota: '', saldoAntes: old, saldoDespues: nu, tipo: 'nuevo', createdBy: FT.userName(), txId: txId, interesPagado: interes, capitalPagado: capital, auto: true, recId: rec.id });
    FT.set(K.debts, debts);
    return 'applied';
  } catch (e) { return 'broken'; }
}
/** Transferencia recurrente (Fase 2). Idempotencia: mismo patrón que el
 *  resto de la familia _applyRec* -- un chequeo propio contra `d.transactions`
 *  por recId+fecha, ya que una transferencia se guarda ahí (no en un store
 *  propio como ahorro/deuda). */
function _applyRecTransferencia(rec, hoy, nextId) {
  nextId = nextId || Date.now;
  try {
    var d = FT.data();
    if (d.transactions.some(function (t) { return t.type === 'transferencia' && t.recId === rec.id && t.date === hoy; })) return 'already';
    // Revisión independiente: FT.transfer devuelve null tanto si un extremo
    // ya no existe (irrecuperable -- hay que desactivar el recurrente,
    // 'broken') como si un fondo/Emergencia origen no tiene suficiente
    // saldo TODAVÍA (temporal -- el próximo cheque podría cubrirlo). Antes
    // ambos casos se trataban igual ('broken'), así que un recurrente con
    // un mal mes desaparecía de Recurrentes para siempre en vez de
    // reintentarse. Se distinguen aquí para devolver 'insufficient' en el
    // segundo caso -- eso no avanza r.nextDate ni desactiva nada, solo
    // detiene esta pasada para reintentar en la próxima.
    if (!FT._xferExists(rec.from) || !FT._xferExists(rec.to)) return 'broken';
    if (rec.from.type !== 'account' && rec.amount > FT._xferBalance(rec.from) + 0.005) return 'insufficient';
    var entry = FT.transfer({ id: nextId(), from: rec.from, to: rec.to, amount: rec.amount, date: hoy, note: rec.desc, recId: rec.id, auto: true });
    return entry ? 'applied' : 'broken';
  } catch (e) { return 'broken'; }
}
function _applyRecMetaPersonal(rec, hoy, nextId) {
  nextId = nextId || Date.now;
  try {
    var goals = FT.goals();
    var g = goals.find(function (x) { return String(x.id) === String(rec.goalId); });
    if (!g) return 'broken';
    g.hist = g.hist || [];
    if (g.hist.some(function (h) { return h.fecha === hoy && h.recId === rec.id; })) return 'already';
    var acctId = (g.accountId && FT.checking().some(function (a) { return String(a.id) === String(g.accountId); }) ? g.accountId : null) || rec.accountId || null;
    // Sale del DISPONIBLE de la cuenta: si no alcanza, no se aplica y se reintenta (queda pendiente y avisa).
    if (acctId && !FT.checkOverdraft(acctId, rec.amount + FT.goalAbsorbNeed(g.id, acctId)).ok) return 'insufficient';
    FT.goalDeposit(g.id, rec.amount, { accountId: acctId, date: hoy, recId: rec.id, auto: true, id: nextId() });
    return 'applied';
  } catch (e) { return 'broken'; }
}
FT.applyDueRecurring = function () {
  var rec = FT.recurring();
  if (!rec.length) return 0;
  var hoy = FT.todayISO(), applied = 0;
  // Generador de ids compartido para TODA esta pasada -- si un recurrente
  // lleva 2+ periodos atrasados (no se abrió la app en un tiempo) el bucle
  // de abajo corre varias veces 100% síncrono, sin ceder el hilo -- así que
  // Date.now() podía repetirse entre una vuelta y la siguiente (o entre dos
  // recurrentes distintos vencidos a la vez), duplicando ids de
  // transacciones/abonos/depósitos generados en la misma corrida y
  // rompiendo el borrado/edición por id más tarde. Con un contador
  // monótono ningún id se repite dentro de esta pasada.
  var idSeq = 0, idBase = Date.now();
  function nextId() { return idBase + (idSeq++); }
  rec.forEach(function (r) {
    if (!r.active || r.paused || !r.nextDate) return;
    var guard = 0;
    while (r.nextDate && r.nextDate <= hoy && guard < 60) {
      var st = 'broken';
      if (r.kind === 'meta') st = _applyRecMeta(r, r.nextDate, nextId);
      else if (r.kind === 'ahorro') st = _applyRecAhorro(r, r.nextDate, nextId);
      else if (r.kind === 'inversion') st = _applyRecInversion(r, r.nextDate, nextId);
      else if (r.kind === 'debt') st = _applyRecDebt(r, r.nextDate, nextId);
      else if (r.kind === 'metapersonal') st = _applyRecMetaPersonal(r, r.nextDate, nextId);
      else if (r.kind === 'transferencia') st = _applyRecTransferencia(r, r.nextDate, nextId);
      if (st === 'broken') { r.active = false; break; }
      // 'insufficient' (_applyRecTransferencia/_applyRecDebt): un
      // fondo/Emergencia origen no alcanza TODAVÍA -- a diferencia de
      // 'broken', no se desactiva ni se avanza r.nextDate, para poder
      // reintentarlo en la próxima corrida en vez de que el recurrente
      // desaparezca para siempre por un mes corto de fondos.
      if (st === 'insufficient') break;
      // 'awaiting_approval' (solo _applyRecDebt con fundSource+
      // requireApproval): ya se dejó un abono pendiente visible en la
      // tarjeta de aprobaciones -- tampoco se avanza r.nextDate hasta que
      // FT.resolveDebtApproval() lo resuelva (aceptar o saltar), para que
      // el recurrente y el pendiente nunca queden desincronizados.
      if (st === 'awaiting_approval') break;
      if (st === 'applied') applied++;
      r.nextDate = _advanceRecDate(r.freq, r.nextDate);
      guard++;
    }
  });
  FT.set(K.recurring, rec);
  if (applied) FT._changed();
  return applied;
};

function _applyDueList(key, defCat) {
  try {
    var list = FT.get(key, []) || [];
    if (!list.length) return 0;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var d = FT.data(), applied = 0, name = FT.userName();
    // Para un servicio/suscripción de HOGAR: si mi pareja abrió su app antes
    // que yo y ya generó el cargo de este mismo periodo, su copia sincronizada
    // ya trae ese movimiento -- lo reviso aquí para no generarlo otra vez.
    // Esto es justo lo que describió Ramón: no hay dos servicios (solo hay
    // uno, $382 en ambos lados), pero cada dispositivo corre su motor de
    // "cheques automáticos" de forma independiente -- si los dos abren la
    // app cerca de la misma fecha de cobro, antes de que la sincronización
    // alcance a avisarle al otro que ya se aplicó, cada uno genera su
    // propio cargo. Esto reduce esa ventana (no la elimina del todo -- eso
    // requeriría un servidor que reparta turnos, que no es como está armado
    // este backend), revisando la última copia sincronizada de mi pareja
    // antes de generar el cargo yo también.
    var pp = FT.partnerProfile();
    var partnerTx = (pp && pp.data && pp.data.transactions) || [];
    var listChanged = false, dataChanged = false;
    list.forEach(function (s) {
      if (s.paused || !s.date) return;
      var guard = 0;
      while (guard < 60) {
        var p = s.date.split('-').map(Number);
        var dd = new Date(p[0], p[1] - 1, p[2]);
        if (!(dd < today)) break;
        // Endurecido (2026-09-26, QA): antes solo revisaba la copia
        // sincronizada de la pareja -- nunca revisaba MIS PROPIAS
        // transacciones ya creadas para este mismo servId+fecha. Si esta
        // función se llegara a correr dos veces para el mismo periodo
        // antes de que la primera pasada alcanzara a guardar el avance de
        // fecha (ej. dos pestañas abiertas del mismo dispositivo, o
        // cualquier re-entrada), podía generar dos cargos idénticos sin
        // que la sincronización con la pareja tuviera nada que ver. Este
        // chequeo es la misma idea que ya existía, aplicada también hacia
        // adentro, no solo hacia la pareja.
        var alreadyMine = d.transactions.some(function (t) { return t.servId === s.id && t.date === s.date; });
        var alreadyByPartner = s.hogar === true && partnerTx.some(function (t) { return t.servId === s.id && t.date === s.date; });
        if (!alreadyMine && !alreadyByPartner) {
          d.transactions.push({ id: Date.now() + guard, type: 'suscripcion', desc: s.name, amount: parseFloat(s.amount) || 0, date: s.date, cat: s.cat || defCat, hogar: s.hogar === true, createdBy: name, auto: true, servId: s.id });
          applied++; dataChanged = true;
        }
        FT.advanceByFreq(dd, s.freq);
        s.date = FT.date(dd, 'ISO');
        listChanged = true;
        guard++;
      }
    });
    // s.date se puede haber adelantado aunque no se haya creado ningún
    // movimiento nuevo (el caso de "mi pareja ya lo generó") -- si no se
    // guarda esa fecha nueva, el próximo arranque la vuelve a ver vencida y
    // repite el mismo chequeo (inofensivo, pero se guarda de una vez).
    if (dataChanged) FT.set(K.data, d);
    if (listChanged) FT.set(key, list);
    if (dataChanged || listChanged) FT._changed();
    return applied;
  } catch (e) { return 0; }
}
FT.applyDueSubscriptions = function () { return _applyDueList(K.subs, '🔄 Suscripción'); };
FT.applyDueServicios = function () { return _applyDueList(K.servicios, '🏠 Servicio'); };

/** Abonos a deuda con fecha futura (ver deudas.html:guardarAbono) -- se
 *  guardan como `pending:true` SIN tocar el saldo, para que la barra de
 *  progreso no se adelante a un pago que todavía no sucede. En cuanto la
 *  fecha programada llega (o ya pasó), esto los aplica de verdad: descuenta
 *  el saldo, crea la transacción y la cuenta conjunta si aplicaba. */
FT.applyPendingDebtAbonos = function () {
  var n = 0, today = FT.todayISO(), es = FT.lang === 'es';
  var debts = FT.debts();
  debts.forEach(function (d) {
    if (!d || !Array.isArray(d.abonos)) return;
    d.abonos.forEach(function (a) {
      // a.pendingApproval (03-oct-2026): un abono recurrente esperando que
      // TÚ lo aceptes -- a diferencia de un abono programado a futuro
      // (donde solo falta que llegue la fecha), este YA llegó a su fecha a
      // propósito y espera una acción explícita en la tarjeta de
      // pendientes. Sin este chequeo, esta misma función lo aplicaría solo
      // en el siguiente arranque (su fecha ya es <= hoy), moviendo el fondo
      // sin que nadie lo haya aprobado -- justo lo que se pidió evitar.
      if (!a || !a.pending || a.pendingApproval || a.fecha > today) return;
      // try/catch por CADA abono (no uno solo para todo el lote): si algo
      // truena en un abono, el resto de deudas/abonos de este mismo run
      // igual se procesan, en vez de que un solo dato corrupto tire todo el
      // lote y nada se guarde.
      try {
        // Revisión independiente: un abono programado con origen fondo/
        // Emergencia se validaba contra el saldo del DÍA EN QUE SE
        // PROGRAMÓ, no el día en que esto por fin corre (pudo pasar
        // tiempo, o el fondo pudo gastarse en otra cosa mientras tanto).
        // FT.addSavings/addEmergency clampan en 0 en vez de rechazar --
        // sin este chequeo ANTES de tocar el saldo de la deuda, la deuda
        // bajaba el capital completo mientras el fondo solo daba lo que
        // de verdad tenía, fabricando la diferencia de la nada (mismo
        // patrón que ya se blinda en la cobertura de gasto y en la
        // reversa de transferencias). Si no alcanza, se deja pending para
        // reintentar en el próximo arranque -- no se aplica a medias.
        // Solo "nuevo" de verdad toca el fondo (ver el if (a.tipo==='nuevo')
        // de abajo, igual que checkingAccountId) -- un "existente" con
        // fondo elegido nunca iba a descontar nada, así que no tiene
        // sentido bloquearlo aquí por falta de saldo (quedaría pending
        // para siempre sin motivo).
        if (a.fundSource && a.tipo === 'nuevo') {
          var availFund = a.fundSource.type === 'emerg' ? FT.emergencyBalance()
            : (function () { var f = FT.savingsFunds().find(function (x) { return x.id === a.fundSource.id; }); return f ? parseFloat(f.actual) || 0 : 0; })();
          if ((parseFloat(a.monto) || 0) > availFund + 0.005) return;
        }
        // Mismo bug real de QA que en el abono manual/recurrente: el saldo
        // baja por el CAPITAL del pago, no por el monto completo.
        var oldBalance = parseFloat(d.balance) || 0;
        var apr = parseFloat(d.apr) || 0;
        a.interesPagado = apr > 0 ? +(oldBalance * (apr / 100 / 12)).toFixed(2) : 0;
        a.capitalPagado = +Math.max(0, (parseFloat(a.monto) || 0) - a.interesPagado).toFixed(2);
        var newBalance = Math.max(0, +(oldBalance - a.capitalPagado).toFixed(2));
        d.balance = newBalance; d.updatedAt = new Date().toISOString();
        d.paidMonths = d.paidMonths || {}; d.paidMonths[String(a.fecha).slice(0, 7)] = true;
        a.saldoAntes = oldBalance; a.saldoDespues = newBalance;
        a.pending = false;
        // Se guarda YA, antes de crear la transacción ligada -- si algo
        // truena después (ej. al escribir ft_data), este abono en concreto
        // ya quedó marcado como aplicado y nunca se reintenta en el
        // siguiente arranque. Prefiere fallar una vez en silencio a
        // duplicar la transacción o descontar la cuenta dos veces
        // (encontrado por revisión independiente: antes todo el lote se
        // guardaba junto hasta el final, así que un solo error a medias
        // dejaba abonos ya "aplicados" en memoria pero marcados pending
        // para siempre en el disco -- se reaplicaban cada arranque).
        FT.saveDebts(debts);
        if (a.tipo === 'nuevo') {
          var txId = a.id + 1;
          var dt = FT.data();
          var linkedTx = { id: txId, type: 'gasto', desc: (es ? 'Abono a ' : 'Payment to ') + d.name, amount: parseFloat(a.monto) || 0, date: a.fecha, cat: '💳 Deudas', note: a.nota, hogar: a.hogarAbono, createdBy: a.createdBy, auto: true };
          if (a.checkingAccountId) { FT.deductChecking(a.checkingAccountId, a.monto, a.fecha); linkedTx.checkingAccountId = a.checkingAccountId; }
          // Abono programado pagado desde un fondo/Emergencia (QA
          // 03-oct-2026) -- mismo mecanismo que el abono inmediato en
          // deudas.html, aplicado aquí cuando por fin llega la fecha.
          if (a.fundSource) {
            // _noAcctMove: igual que en deudas.html -- el dinero sale del
            // banco a pagar la deuda, no se "des-aparta" dentro de la
            // misma cuenta vinculada (sin esto, una cuenta vinculada se
            // re-acreditaba sola por el monto que de verdad salió).
            var fsPayload2 = { id: txId, amount: a.monto, date: a.fecha, tipo: 'retiro', note: linkedTx.desc, cat: '💳 Deudas', fundId: a.fundSource.type === 'fund' ? a.fundSource.id : undefined, _noAcctMove: true };
            if (a.fundSource.type === 'emerg') FT.addEmergency(fsPayload2); else FT.addSavings(fsPayload2);
            linkedTx.fundSource = a.fundSource;
          }
          dt.transactions.push(linkedTx);
          FT.set(K.data, dt);
          a.txId = txId;
          FT.saveDebts(debts);
        }
        n++;
      } catch (e) {}
    });
  });
  return n;
};
/** Lista para la tarjeta "Pagos pendientes de tu aprobación" (dashboard) --
 *  todo abono de deuda que ya llegó a su fecha pero está esperando que el
 *  usuario lo acepte antes de mover su fondo/Emergencia privado. */
FT.pendingDebtApprovals = function () {
  var out = [];
  FT.debts().forEach(function (d) {
    (d.abonos || []).forEach(function (a) {
      if (!a || !a.pendingApproval) return;
      var fundLabel = '';
      if (a.fundSource && a.fundSource.type === 'emerg') fundLabel = '🛡️ ' + (FT.lang === 'es' ? 'Emergencia' : 'Emergency');
      else if (a.fundSource) { var f = FT.savingsFunds().find(function (x) { return x.id === a.fundSource.id; }); fundLabel = f ? (f.emoji + ' ' + f.name) : (FT.lang === 'es' ? 'Fondo eliminado' : 'Deleted fund'); }
      out.push({ debtId: d.id, debtName: d.name, abonoId: a.id, monto: a.monto, fecha: a.fecha, fundSource: a.fundSource, fundLabel: fundLabel });
    });
  });
  out.sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; });
  return out;
};
/** Recurrentes de deuda sacados de un fondo que llevan su fecha vencida sin
 *  poder aplicarse por falta de saldo -- a diferencia de 'awaiting_approval'
 *  (que sí deja un abono pendiente visible), 'insufficient' no persiste
 *  nada en ningún lado -- así que sin esta función el usuario no tenía
 *  NINGUNA forma de enterarse de que un pago automático lleva días atorado
 *  por falta de fondos (caso real de Ramón, 12-oct-2026: "Abono a SOFI
 *  CREDIT CARD" con next 07/10 congelado, fondo en $0, cero aviso en
 *  ningún lado -- diagnosticado leyendo el código, confirma su propia
 *  sospecha "no tengo dinero en mi fondo"). */
FT.stuckFundedRecurringDebts = function () {
  var out = [], today = FT.todayISO();
  FT.recurring().forEach(function (r) {
    if (r.kind !== 'debt' || !r.active || r.paused || !r.fundSource || !r.nextDate || r.nextDate > today) return;
    var availFund = r.fundSource.type === 'emerg' ? FT.emergencyBalance()
      : (function () { var f = FT.savingsFunds().find(function (x) { return x.id === r.fundSource.id; }); return f ? parseFloat(f.actual) || 0 : 0; })();
    if ((parseFloat(r.amount) || 0) <= availFund + 0.005) return;
    var d = FT.debts().find(function (x) { return String(x.id) === String(r.debtId); });
    if (!d) return;
    var fundLabel = r.fundSource.type === 'emerg' ? '🛡️ ' + (FT.lang === 'es' ? 'Emergencia' : 'Emergency')
      : (function () { var f = FT.savingsFunds().find(function (x) { return x.id === r.fundSource.id; }); return f ? (f.emoji + ' ' + f.name) : (FT.lang === 'es' ? 'Fondo eliminado' : 'Deleted fund'); })();
    out.push({ debtId: d.id, debtName: d.name, recId: r.id, amount: r.amount, nextDate: r.nextDate, fundSource: r.fundSource, fundLabel: fundLabel, shortfall: +((parseFloat(r.amount) || 0) - availFund).toFixed(2) });
  });
  out.sort(function (a, b) { return a.nextDate < b.nextDate ? -1 : 1; });
  return out;
};
/** Resuelve un abono "esperando aprobación": approve=true mueve el dinero
 *  de verdad (mismo cálculo capital/interés y mismo retiro _noAcctMove que
 *  _applyRecDebt ya usa) y avanza el recurrente a su próximo periodo;
 *  approve=false descarta SOLO este periodo (no toca ningún saldo) y
 *  también avanza el recurrente, para que vuelva a preguntar en el
 *  siguiente. Revalida el saldo del fondo fresco al aceptar -- pudo pasar
 *  tiempo, o el fondo pudo gastarse en otra cosa mientras esperaba. */
FT.resolveDebtApproval = function (debtId, abonoId, approve) {
  var debts = FT.debts();
  var d = debts.find(function (x) { return String(x.id) === String(debtId); });
  if (!d) return false;
  var a = (d.abonos || []).find(function (x) { return String(x.id) === String(abonoId) && x.pendingApproval; });
  if (!a) return false;
  var rec = FT.recurring().find(function (r) { return String(r.id) === String(a.recId); });
  if (approve) {
    var availFund = a.fundSource.type === 'emerg' ? FT.emergencyBalance()
      : (function () { var f = FT.savingsFunds().find(function (x) { return x.id === a.fundSource.id; }); return f ? parseFloat(f.actual) || 0 : 0; })();
    if ((parseFloat(a.monto) || 0) > availFund + 0.005) { if (FT.toast) FT.toast(FT.lang === 'es' ? 'Ya no alcanza en ese fondo -- se queda pendiente' : "That fund doesn't have enough anymore -- staying pending"); return false; }
    var old = parseFloat(d.balance) || 0;
    var apr = parseFloat(d.apr) || 0;
    var interes = apr > 0 ? +(old * (apr / 100 / 12)).toFixed(2) : 0;
    var capital = +Math.max(0, (parseFloat(a.monto) || 0) - interes).toFixed(2);
    var nu = Math.max(0, +(old - capital).toFixed(2));
    d.balance = nu; d.updatedAt = new Date().toISOString();
    d.paidMonths = d.paidMonths || {}; d.paidMonths[String(a.fecha).slice(0, 7)] = true;
    var txId = Date.now();
    var dt = FT.data();
    var tx = { id: txId, type: 'gasto', desc: (FT.lang === 'es' ? 'Abono a ' : 'Payment to ') + d.name, amount: a.monto, date: a.fecha, cat: '💳 Deudas', createdBy: FT.userName(), auto: true, recId: a.recId, fundSource: a.fundSource };
    var fsPayload = { id: txId, amount: a.monto, date: a.fecha, tipo: 'retiro', note: tx.desc, cat: '💳 Deudas', fundId: a.fundSource.type === 'fund' ? a.fundSource.id : undefined, _noAcctMove: true };
    if (a.fundSource.type === 'emerg') FT.addEmergency(fsPayload); else FT.addSavings(fsPayload);
    dt.transactions.push(tx);
    FT.set(K.data, dt);
    a.pending = false; a.pendingApproval = false; a.txId = txId;
    a.saldoAntes = old; a.saldoDespues = nu; a.interesPagado = interes; a.capitalPagado = capital;
  } else {
    // Saltar esta vez: se quita el abono pendiente sin tocar ningún saldo
    // -- el recurrente sigue activo y volverá a preguntar en su siguiente
    // fecha.
    d.abonos = (d.abonos || []).filter(function (x) { return x !== a; });
  }
  FT.saveDebts(debts);
  if (rec) { FT.recurUpdate(rec.id, { nextDate: FT._advanceRecDate(rec.freq, a.fecha) }); }
  FT._changed();
  return true;
};
/* ── Migración de ingresos viejos sin etiqueta (19-oct-2026) ────────────────
   Antes de la regla única (solo 'cheque' se reparte con el hogar), un ingreso
   sin incomeKind contaba como cheque. Ahora cuenta como 100% tuyo, así que los
   viejos se etiquetan: lo inequívoco solo (por descripción/nota), el resto se
   le pregunta al usuario UNA vez con FT.reviewIncomeKinds(). */
FT.autoTagIncomes = function () {
  var d = FT.data(), n = 0, chequeRows = FT.cheques() || [];
  (d.transactions || []).forEach(function (t) {
    if (t.type !== 'ingreso' || t.incomeKind) return;
    var desc = String(t.desc || ''), note = String(t.note || ''), k = null;
    if (t.cobId || /^(Cobertura|Coverage):/i.test(desc)) k = 'cobertura';
    else if (/^(Cheque recibido|Paycheck received)/i.test(desc) || chequeRows.some(function (c) { return String(c.txId) === String(t.id) || (c.fecha === t.date && Math.abs((parseFloat(c.monto) || 0) - (parseFloat(t.amount) || 0)) < 0.01); })) k = 'cheque';
    else if (note === 'Venta Fidelity') k = 'venta';
    else if (note === 'Fidelity dividend') k = 'extra';
    if (k) { t.incomeKind = k; n++; }
  });
  if (n) FT.saveData(d);
  return 0; // silencioso: no debe disparar el toast de automatizaciones
};
FT.reviewIncomeKinds = function () {
  try { FT.autoTagIncomes(); } catch (e) {}
  var es = FT.lang === 'es', today = FT.todayISO();
  if (FT.getRaw('ft_ik_snooze') === today) return;
  var pend = FT.txs().filter(function (t) { return t.type === 'ingreso' && !t.incomeKind && t.hogar !== true; });
  if (!pend.length) return;
  FT.setRaw('ft_ik_snooze', today); // se pregunta como máximo una vez al día, aunque se cierre con la ✕
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var shown = pend.slice(0, 30);
  var rows = shown.map(function (t, i) {
    return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--line, #eee)">' +
      '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(t.desc || (es ? 'Ingreso' : 'Income')) + '</div>' +
      '<div style="font-size:11px;color:var(--text3)">' + esc(t.date || '') + ' · ' + FT.money(parseFloat(t.amount) || 0, { cents: true }) + '</div></div>' +
      '<select data-ik="' + i + '" aria-label="' + (es ? 'Tipo de ingreso' : 'Income type') + '" style="max-width:48%;font-size:12px;padding:6px">' +
      '<option value="" selected>' + (es ? 'Elige…' : 'Choose…') + '</option>' +
      '<option value="extra">' + (es ? '🎁 100% mío' : '🎁 100% mine') + '</option>' +
      '<option value="cheque">' + (es ? '🏠 Cheque (se reparte)' : '🏠 Paycheck (split)') + '</option>' +
      '<option value="venta">' + (es ? '🔄 Venta de inversión' : '🔄 Investment sale') + '</option></select></div>';
  }).join('');
  var ov = FT.sheet({
    title: es ? 'Revisa tus ingresos' : 'Review your income',
    html: '<p style="font-size:13px;color:var(--text2);margin:2px 0 8px">' + (es
      ? 'Estos ingresos no tienen tipo. Elige cuál es cada uno para que todas las pantallas los cuenten igual: el cheque se reparte con el hogar, lo demás es 100% tuyo. Los que no elijas siguen contando como 100% tuyo.'
      : 'These incomes have no type. Pick one for each so every screen counts them the same: paychecks are split with the household, everything else is 100% yours. Any you skip keep counting as 100% yours.') +
      (pend.length > shown.length ? ' ' + (es ? 'Hay ' + (pend.length - shown.length) + ' más, aparecerán después.' : (pend.length - shown.length) + ' more will show up later.') : '') + '</p>' +
      '<div style="max-height:46vh;overflow-y:auto">' + rows + '</div>',
    actions: [
      { label: es ? 'Guardar' : 'Save', primary: true, onClick: function () {
        var d = FT.data(), map = {};
        shown.forEach(function (t, i) {
          var sel = ov.querySelector('[data-ik="' + i + '"]');
          if (sel && sel.value) map[String(t.id)] = sel.value; // sin elegir = sigue pendiente, nunca se adivina
        });
        (d.transactions || []).forEach(function (t) { if (t.type === 'ingreso' && !t.incomeKind && map[String(t.id)]) t.incomeKind = map[String(t.id)]; });
        FT.saveData(d);
        FT.toast(es ? 'Ingresos actualizados' : 'Income updated', { icon: '✅' });
      } },
      { label: es ? 'Después' : 'Later' }
    ]
  });
};
/** Aplica los gastos/ingresos pendientes cuya fecha ya llegó: mueve su cuenta y
 *  los vuelve normales (cuentan en el presupuesto). Idempotente. */
FT.applyPendingTxs = function () {
  var hoy = FT.todayISO(), d = FT.data(), due = (d.transactions || []).filter(function (t) { return t.pendiente === true && String(t.date || '') <= hoy; });
  if (!due.length) return 0;
  due.forEach(function (t) {
    if (t.acctPending && t.checkingAccountId) {
      if (t.acctCredited) FT.creditChecking(t.checkingAccountId, t.amount); else FT.deductChecking(t.checkingAccountId, t.amount, t.date);
    }
  });
  var d2 = FT.data(), n = 0;
  (d2.transactions || []).forEach(function (t) { if (t.pendiente === true && String(t.date || '') <= hoy) { delete t.pendiente; delete t.acctPending; n++; } });
  if (n) FT.saveData(d2);
  return n;
};
FT.runAutomations = function () {
  var n = 0;
  try { n += FT.applyPendingTxs(); } catch (e) {}
  try { FT.autoTagIncomes(); } catch (e) {}
  try { n += FT.catchUpCheques(); } catch (e) {}
  try { n += FT.applyDueRecurring(); } catch (e) {}
  try { n += FT.applyDueSubscriptions(); } catch (e) {}
  try { n += FT.applyDueServicios(); } catch (e) {}
  try { n += FT.applyPendingDebtAbonos(); } catch (e) {}
  if (n > 0 && FT.toast) FT.toast(FT.t('automations_done'), { icon: '🔄' });
};

/* ─────────────────────────────────────────────────────────────────────────
   5b · ALTA DE REGISTRO — escritor universal del "＋" (usado por dashboard,
        y como fallback del "＋" contextual). Maneja todas las escrituras
        cruzadas (ahorro, emergencia, inversión, suscripción/servicio).
   ───────────────────────────────────────────────────────────────────────── */
FT.entryCategoryType = function (cat) {
  cat = String(cat || '');
  var NEEDS = ['Supermercado','Renta','Hipoteca','Gasolina','Salud','Teléfono','Internet','Mantenimiento','Deudas','Hogar','Luz','Agua','Gas','Servicio','Servicios'];
  for (var i = 0; i < NEEDS.length; i++) if (cat.indexOf(NEEDS[i]) > -1) return 'needs';
  return 'wants';
};

/**
 * FT.addEntry(o) — o: { type, desc, amount, date, note, cat, hogar, dest,
 *   incomeKind, invType, platform, recurrente:{freq}, esServicioHogar }
 * Devuelve la transacción creada (o null si faltan datos).
 */
FT.addEntry = function (o) {
  o = o || {};
  // 19-oct-2026: un monto escrito a mano como "1,200.50" se leía como 1 con
  // parseFloat -- FT.numMoney entiende los dos formatos (1,200.50 y 1.200,50).
  var amount = typeof o.amount === 'string' ? FT.numMoney(o.amount) : (parseFloat(o.amount) || 0);
  if (!o.desc || !amount || !o.date) return null;
  var es = FT.lang === 'es';
  var name = FT.userName();
  var hogar = FT.hogarConnected() ? !!o.hogar : undefined;

  var cat = o.cat;
  if (o.type === 'ingreso') cat = '💰 Ingreso';
  else if (o.type === 'ahorro') cat = o.dest === 'libre' ? '💵 Ahorro' : '🛡️ Emergencia';
  else if (o.type === 'inversion') cat = '📈 Inversión';

  // Fecha futura en un gasto o ingreso => queda PENDIENTE: no mueve la cuenta
  // ni cuenta en el presupuesto hasta ese día (ver FT.isPending / applyPendingTxs).
  var future = (o.type === 'gasto' || o.type === 'ingreso') && String(o.date) > FT.todayISO();
  var id = Date.now();
  var entry = {
    id: id, type: o.type, desc: o.desc, amount: amount, date: o.date, note: o.note || '', cat: cat,
    hogar: hogar, createdBy: name,
    dest: o.type === 'ahorro' ? (o.dest || 'libre') : undefined,
    incomeKind: o.type === 'ingreso' ? (o.incomeKind || 'extra') : undefined
  };

  // Escrituras cruzadas
  if (o.type === 'ahorro') {
    if (o.dest === 'emergencia') FT.addEmergency({ id: id, amount: amount, date: o.date, tipo: 'deposito', note: o.desc });
    else FT.addSavings({ id: id, amount: amount, date: o.date, tipo: 'deposito', note: o.desc });
    if (o.recurrente && o.recurrente.freq) {
      var recA = FT.recurring();
      recA.push({ id: 'rec_' + Date.now(), kind: 'ahorro', dest: o.dest === 'emergencia' ? 'emergencia' : 'libre', desc: o.desc, amount: amount, freq: o.recurrente.freq, hogar: false, nextDate: _advanceRecDate(o.recurrente.freq, o.date), active: true, createdBy: name });
      FT.set(K.recurring, recA);
    }
  } else if (o.type === 'inversion') {
    var scope = (hogar) ? 'hogar' : '';
    var list = FT.investments(scope);
    list.push({ id: 'i_' + id, ticker: String(o.desc).toUpperCase(), type: o.invType || 'other', shares: 1, avgPrice: amount, curPrice: amount, amount: amount, platform: o.platform || '', modo: 'nueva', fecha: o.date, addedBy: name, addedAt: new Date().toISOString() });
    FT.saveInvestments(list, scope);
    if (o.recurrente && o.recurrente.freq) {
      var rec = FT.recurring();
      rec.push({ id: 'rec_' + Date.now(), kind: 'inversion', desc: o.desc, amount: amount, freq: o.recurrente.freq, hogar: !!hogar, nextDate: _advanceRecDate(o.recurrente.freq, o.date), active: true, createdBy: name });
      FT.set(K.recurring, rec);
    }
  } else if (o.type === 'suscripcion') {
    if (o.esServicioHogar) {
      var sv = FT.servicios();
      sv.push({ id: 'sv_' + id, name: o.desc, amount: amount, freq: (o.recurrente && o.recurrente.freq) || 'monthly', date: o.date, cat: cat || '🏠 Servicio', paused: false, hogar: true, createdBy: name });
      FT.set(K.servicios, sv);
    } else {
      var ss = FT.subs();
      ss.push({ id: 's_' + id, name: o.desc, amount: amount, freq: (o.recurrente && o.recurrente.freq) || 'monthly', date: o.date, cat: cat || '📦 Otro', paused: false, hogar: !!hogar, createdBy: name });
      FT.set(K.subs, ss);
    }
  }

  // Cobertura de gasto (opción C): o.cobertura = { source:'libre'|'emergencia', monto:<faltante> }
  var cobId = null;
  if (o.type === 'gasto' && o.cobertura && parseFloat(o.cobertura.monto) > 0 && !future) {
    var src = o.cobertura.source;
    // OJO: la cobertura siempre sale del fondo DEFAULT de Ahorro libre
    // (FT.addSavings sin fundId cae ahí) -- el tope tiene que ser el saldo
    // de ESE fondo específico, no el agregado de todos los fondos. Si se
    // topara contra el agregado, un usuario con dinero repartido en varios
    // fondos podría "cubrir" más de lo que el fondo default realmente tiene
    // -- FT.addSavings tope su saldo en 0 sin avisar, y la app fabricaría
    // dinero de la nada (el ingreso de cobertura se acredita completo pero
    // el ahorro total baja menos de lo que dice el movimiento).
    var poolBal = src === 'emergencia' ? FT.emergencyBalance() : (parseFloat(FT.defaultSavingsFund().actual) || 0);
    var take = Math.min(parseFloat(o.cobertura.monto), poolBal);   // no cubrir más de lo que hay en el pozo
    if (take > 0) {
      cobId = 'cob_' + id;
      entry.cobId = cobId;
      var d0 = FT.data();
      d0.transactions.push({ id: id + 1, type: 'ingreso', incomeKind: 'cobertura', desc: (es ? 'Cobertura: ' : 'Coverage: ') + o.desc, amount: take, date: o.date, cat: '💰 Ingreso', cobId: cobId, cobFor: o.desc, createdBy: name });
      FT.set(K.data, d0);
      var cobEntry = { id: 'cobm_' + id, amount: take, date: o.date, tipo: 'retiro', note: (es ? 'Cobertura: ' : 'Coverage: ') + o.desc, cobId: cobId, cobFor: o.desc };
      if (src === 'emergencia') FT.addEmergency(cobEntry); else FT.addSavings(cobEntry);
    }
  }

  // Descuento automático de la cuenta elegida para un gasto/suscripción --
  // antes solo pasaba para gastos de HOGAR con cuenta conjunta; con Cuentas
  // como base (Fase 1) un gasto PERSONAL también puede elegir de qué cuenta
  // sale (predeterminada o cambiada para este gasto en particular), así que
  // ya no se exige `hogar`. El sobregiro (¿el libre alcanza?) se revisa y
  // confirma ANTES de llegar aquí (ver FT.checkOverdraft) -- esta función
  // solo aplica el descuento, sin clamp, igual que siempre.
  if (future) {
    entry.pendiente = true;
    if (o.checkingAccountId) { entry.checkingAccountId = o.checkingAccountId; entry.acctPending = true; if (o.type === 'ingreso') entry.acctCredited = true; }
  } else if ((o.type === 'gasto' || o.type === 'suscripcion') && o.checkingAccountId) {
    FT.deductChecking(o.checkingAccountId, amount, o.date);
    entry.checkingAccountId = o.checkingAccountId; // para poder devolver el saldo si se borra este movimiento
  }
  // Un ingreso con cuenta destino (Fase 1: ya no hay "pool sin cuenta") la
  // acredita -- sigue contando contra el mes exactamente igual (esto solo
  // agrega el efecto de saldo real, no cambia el conteo del mes en sí).
  // Nota (29-sep-2026): `totals()`/`FT.personalAvailable()` SÍ leen
  // FT.checking() desde el fix de doble atribución de gasto de hogar --
  // este comentario decía lo contrario y quedó obsoleto, corregido para no
  // guiar a alguien de vuelta al bug ya cerrado.
  if (!future && o.type === 'ingreso' && o.checkingAccountId) {
    FT.creditChecking(o.checkingAccountId, amount);
    entry.checkingAccountId = o.checkingAccountId;
    // acctCredited (no el `type`) es lo que le dice a FT.deleteTx/
    // _editTxDetail en qué dirección revertir -- ver el mismo flag en
    // FT.recordCheque, que también acredita una cuenta desde una
    // transacción type:'ahorro' (no 'ingreso'). Revisión independiente:
    // discriminar por `type==='ingreso'` se quedaba corto justo ahí.
    entry.acctCredited = true;
  }

  var d = FT.data();
  d.transactions.push(entry);
  FT.saveData(d);

  // Ingreso extra + reparto automático solicitado
  if (o.type === 'ingreso' && entry.incomeKind === 'extra' && o.autoDist && !future) FT.applyDist(amount, { note: o.desc });

  return entry;
};

/* ─────────────────────────────────────────────────────────────────────────
   5c · MENÚ DEL ＋ Y FORMULARIO DE REGISTRO (movido desde dashboard.html el 20-oct-2026 para que
   cualquier pantalla lo abra sin salir de ella: FT.openPicker / FT.openEntry)
   ───────────────────────────────────────────────────────────────────────── */
(function () {
/* Menú del "＋" (20-oct-2026, aprobado vía simulación): el MISMO menú en toda la app. En Hogar, gasto/inversión/
   suscripción vienen marcados "del hogar" y aparece el depósito a la emergencia DEL HOGAR (verde, "de los dos");
   en el resto, el depósito a MI emergencia (azul, "solo mía"). */
function openPicker(o) {
  o = o || {};
  if (document.querySelector('[data-picker="1"]')) return; // ya está abierto: un segundo toque no apila otro menú
  var es = FT.lang === 'es', hg = o.ctx === 'hogar' && FT.hogarConnected();
  var items = hg ? [
    { t: 'gasto', e: '💸', l: es ? 'Gasto del hogar' : 'Household expense', p: { hogar: true } },
    { t: 'ingreso', e: '💰', l: es ? 'Ingreso' : 'Income' },
    { t: 'ingreso', e: '🏠', l: es ? 'Aporte al hogar' : 'Household contribution', p: { incomeHogar: true } },
    { t: 'inversion', e: '📈', l: es ? 'Inversión del hogar' : 'Household investment', p: { hogar: true } },
    { t: 'suscripcion', e: '🔄', l: es ? 'Suscripción' : 'Subscription', p: { hogar: true } },
    { t: 'servicio', e: '🏠', l: es ? 'Servicio' : 'Utility bill' },
    { t: 'emerg-hogar', e: '🛡️', l: es ? 'Depósito a emergencia del hogar' : 'Household emergency deposit', k: 'h' }
  ] : [
    { t: 'gasto', e: '💸', l: es ? 'Gasto' : 'Expense' }, { t: 'ingreso', e: '💰', l: es ? 'Ingreso' : 'Income' },
    { t: 'ahorro', e: '💵', l: es ? 'Ahorro' : 'Savings' }, { t: 'inversion', e: '📈', l: es ? 'Inversión' : 'Investment' },
    { t: 'suscripcion', e: '🔄', l: es ? 'Suscripción' : 'Subscription' }, { t: 'servicio', e: '🏠', l: es ? 'Servicio hogar' : 'Utility bill' },
    { t: 'emerg-personal', e: '🛡️', l: es ? 'Depósito a mi emergencia' : 'Deposit to my emergency', k: 'p' }
  ];
  var tagH = '<span style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:99px;background:var(--g-light);color:var(--g-dark)">🏠 ' + (es ? 'DE LOS DOS' : 'SHARED') + '</span>';
  var tagP = '<span style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:99px;background:var(--sky-bg);color:var(--blue)">👤 ' + (es ? 'SOLO MÍA' : 'ONLY MINE') + '</span>';
  var ov = FT.sheet({
    title: es ? '¿Qué quieres registrar?' : 'What do you want to log?',
    html: '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">' +
      items.map(function (it, i) {
        var sp = it.k ? 'grid-column:span 2;' : '', st = it.k === 'h' ? 'border-color:var(--g-main);background:var(--g-light);' : it.k === 'p' ? 'border-color:var(--blue);background:var(--sky-bg);' : 'border:1px solid var(--hair);background:var(--sunk);';
        return '<button class="tap" data-i="' + i + '" style="' + sp + 'display:flex;flex-direction:column;align-items:center;gap:5px;padding:15px 8px;border-radius:13px;border:1px solid var(--hair);' + st + 'cursor:pointer;font-family:var(--ui-font);font-size:12px;font-weight:800;color:var(--ink)"><span style="font-size:21px">' + it.e + '</span>' + it.l + (it.k === 'h' ? tagH : it.k === 'p' ? tagP : '') + '</button>';
      }).join('') + '</div>'
  });
  ov.setAttribute('data-picker', '1');
  ov.querySelectorAll('[data-i]').forEach(function (b) {
    b.addEventListener('click', function () {
      var it = items[parseInt(b.getAttribute('data-i'), 10)];
      FT.closeTop();
      if (it.t === 'emerg-hogar') { if (typeof window.abrirAporteModal === 'function') window.abrirAporteModal('emerg'); else FT.go('hogar.html?deposit=emerg'); }
      else if (it.t === 'emerg-personal') openEntry('ahorro', { dest: 'emergencia' });
      else openEntry(it.t, it.p);
    });
  });
}

// 15-oct-2026 (aprobado vía simulación): antes el selector solo decía "(X libre)"
// y escondía lo apartado en fondos -- una cuenta con $165 en un fondo y
// disponible negativo se veía como "no tengo nada". Ahora muestra las dos
// partes; "libre" se llama "Disponible" porque "Ahorro libre" (el fondo) y el
// libre de la cuenta eran dos cosas distintas con el mismo nombre.
function acctOptLabel(a) {
  var es = FT.lang === 'es', ap = FT.accountEarmarked(a.id);
  return a.name + ' · ' + (es ? 'Disponible ' : 'Available ') + FT.money(FT.accountFree(a), { cents: true }) + (ap > 0.004 ? ' · ' + (es ? 'Apartado ' : 'Set aside ') + FT.money(ap, { cents: true }) : '');
}

// Aviso en vivo bajo "¿De qué cuenta se paga?": solo aparece si el disponible no
// alcanza. Ofrece pasar lo necesario de los fondos vinculados al disponible en
// un toque (FT.coverFromFunds); si ni con los fondos alcanza, lo dice claro.
function renderAcctStatus(body, getAmount, onMoved) {
  var box = body.querySelector('#eAcctStatus'), sel = body.querySelector('#eAcctPers');
  if (!box) return;
  var es = FT.lang === 'es', wrap = body.querySelector('#eAcctPersWrap');
  box.innerHTML = '';
  if (!sel || !sel.value || (wrap && wrap.style.display === 'none')) return;
  var amt = FT.numMoney(getAmount());
  if (amt <= 0) return;
  var cov = FT.accountCoverage(sel.value, amt);
  if (cov.ok) return;
  var acct = FT.checking().find(function (a) { return String(a.id) === String(sel.value); }) || {};
  var box0 = 'style="border-radius:14px;padding:11px 12px;margin-top:8px;display:flex;flex-direction:column;gap:8px;';
  var btn = function (id, primary, txt) { return '<button type="button" id="' + id + '" class="tap" style="padding:10px 12px;border-radius:11px;font-family:var(--ui-font);font-weight:800;font-size:12.5px;cursor:pointer;border:1.5px solid ' + (primary ? 'transparent' : 'var(--hair)') + ';background:' + (primary ? 'linear-gradient(135deg,var(--g-dark),var(--g-main))' : 'transparent') + ';color:' + (primary ? '#fff' : 'var(--ink)') + '">' + txt + '</button>'; };
  var canFunds = cov.fundsTotal + 0.005 >= cov.shortfall;
  var canEmerg = !canFunds && cov.fundsTotal + cov.emerg + 0.005 >= cov.shortfall;
  var names = cov.funds.map(function (f) { return f.name; }).join(', ');
  if (canFunds || canEmerg) {
    box.innerHTML = '<div ' + box0 + 'background:var(--amber-bg,#FFF3DF)"><b style="color:var(--amber,#B7700F)">' + (es ? 'El disponible no alcanza: faltan ' : 'Available doesn\'t cover it: short ') + FT.money(cov.shortfall, { cents: true }) + '</b>' +
      '<span style="font-size:12px;color:var(--text2)">' + (es ? 'La cuenta sí tiene dinero, apartado en ' : 'The account does have money, set aside in ') + (names || (es ? 'Emergencia' : 'Emergency')) + (canEmerg ? (es ? ' y Emergencia.' : ' and Emergency.') : '.') + '</span>' +
      btn('eXfer', true, (es ? 'Pasar ' : 'Move ') + FT.money(cov.shortfall, { cents: true }) + (es ? ' de ' : ' from ') + (canEmerg ? (es ? 'tus fondos y Emergencia' : 'your funds and Emergency') : (cov.funds.length > 1 ? (es ? 'tus fondos' : 'your funds') : cov.funds[0].name)) + (es ? ' al disponible' : ' to available')) +
      '<span style="font-size:11px;color:var(--text3)">' + (es ? 'Es un traspaso dentro de la misma cuenta: el total no cambia.' : 'A transfer inside the same account: the total doesn\'t change.') + '</span></div>';
    body.querySelector('#eXfer').onclick = function () {
      var run = function (useEmerg) {
        // Se recalcula el faltante al ejecutar (no el capturado al dibujar el
        // aviso): con la confirmación de Emergencia (asíncrona) un doble toque
        // movería el mismo monto dos veces y dejaría el disponible de más.
        var fresh = FT.accountCoverage(sel.value, FT.numMoney(getAmount())).shortfall;
        if (fresh <= 0.004) { renderAcctStatus(body, getAmount, onMoved); return; }
        var r = FT.coverFromFunds(sel.value, fresh, { useEmergency: useEmerg }); FT.toast((es ? 'Pasaron ' : 'Moved ') + FT.money(r.moved, { cents: true }) + (es ? ' al disponible de ' : ' to available in ') + (acct.name || ''), { icon: '🔁', ms: 3200 }); if (onMoved) onMoved(); renderAcctStatus(body, getAmount, onMoved); };
      if (canEmerg) FT.confirm(es ? 'Esto usa tu fondo de Emergencia, que es solo para emergencias reales. ¿Continuar?' : 'This uses your Emergency fund, which is only for real emergencies. Continue?').then(function (ok) { if (ok) run(true); });
      else run(false);
    };
  } else if (FT.accountEarmarked(sel.value) > 0.004) {
    box.innerHTML = '<div ' + box0 + 'background:var(--red-bg,#FCECEC)"><b style="color:var(--red)">' + (es ? 'No alcanza ni con lo apartado' : 'Not enough even with what\'s set aside') + '</b>' +
      '<span style="font-size:12px;color:var(--text2)">' + (es ? 'La cuenta tiene ' + FT.money(FT.accountTotal(acct), { cents: true }) + ' en total y el gasto es de ' + FT.money(amt, { cents: true }) + '. Prueba con otra cuenta.' : 'The account has ' + FT.money(FT.accountTotal(acct), { cents: true }) + ' in total and the expense is ' + FT.money(amt, { cents: true }) + '. Try another account.') + '</span></div>';
  }
}

function openEntry(type, preset) {
  var es = FT.lang === 'es';
  var isServ = type === 'servicio';
  var realType = isServ ? 'suscripcion' : type;
  var CATS = ['🛒 Supermercado', '🍔 Restaurantes', '💊 Salud', '⛽ Gasolina', '🏠 Renta / Hipoteca', '📱 Teléfono/Internet', '🎬 Entretenimiento', '👕 Ropa', '✈️ Viajes', '🔧 Mantenimiento', '📦 Otros'];
  var extra = '';
  if (realType === 'gasto' || realType === 'hipoteca') extra += '<div class="ft-field"><label>' + (es ? 'Categoría' : 'Category') + '</label><select id="eCat">' + CATS.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select></div>';
  var hogarAccts = FT.checking().filter(function (a) { return a.hogar; });
  // Cuentas como base (Fase 1): un gasto PERSONAL (no solo de hogar) también
  // puede elegir de qué cuenta sale -- predeterminada (FT.user().
  // defaultAccountId) o cambiada para este gasto en particular. Un ingreso
  // también puede elegir a qué cuenta llega (ya no hay "pool sin cuenta"
  // obligatorio, pero sigue siendo opcional para no romper a quien no usa
  // cuentas todavía).
  var myAccts = FT.checking().filter(function (a) { return !a.hogar; });
  // Un gasto de HOGAR también puede pagarse con tu cuenta PERSONAL (para
  // adelantarlo de tu propio bolsillo) además de la conjunta -- la
  // conjunta va primero en la lista (sugerencia/default), pero el usuario
  // puede elegir cualquiera. Aclarado por Ramón (29-sep-2026): "para eso
  // implementamos lo de las cuentas, para que el usuario escoja... si
  // escojo la mía se restará de mi presupuesto aunque sea un gasto del
  // hogar". Antes este selector solo ofrecía cuentas conjuntas.
  var hogarAcctOpts = hogarAccts.concat(myAccts);
  var canDeductAcct = (realType === 'gasto' || (realType === 'suscripcion' && !isServ)) && hogarAcctOpts.length > 0;
  if (realType === 'gasto' && myAccts.length) {
    var defAcctId = FT.user().defaultAccountId;
    extra += '<div class="ft-field" id="eAcctPersWrap"><label>' + (es ? '¿De qué cuenta se paga? (opcional)' : 'Paid from which account? (optional)') + '</label><select id="eAcctPers"><option value="">' + (es ? 'Ninguna' : 'None') + '</option>' + myAccts.map(function (a) { return '<option value="' + a.id + '"' + (a.id === defAcctId ? ' selected' : '') + '>' + acctOptLabel(a) + '</option>'; }).join('') + '</select></div><div id="eAcctStatus" aria-live="polite"></div>';
  }
  if (realType === 'ingreso' && myAccts.length) {
    extra += '<div class="ft-field"><label>' + (es ? '¿A qué cuenta llega? (opcional)' : 'Which account does it land in? (optional)') + '</label><select id="eAcctIn"><option value="">' + (es ? 'Ninguna' : 'None') + '</option>' + myAccts.map(function (a) { return '<option value="' + a.id + '">' + a.name + ' (' + FT.money(FT.accountFree(a), { cents: true }) + ')</option>'; }).join('') + '</select></div>';
  }
  if (FT.hogarConnected() && (realType === 'gasto' || realType === 'inversion' || (realType === 'suscripcion' && !isServ))) {
    extra += '<div class="ft-field"><label>' + (es ? 'Es para' : 'For') + '</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button type="button" id="ePers" class="tap" style="padding:9px;border-radius:10px;border:1.5px solid var(--g-main);background:var(--g-light);color:var(--g-dark);font-weight:800;font-family:var(--ui-font)">👤 ' + (es ? 'Personal' : 'Personal') + '</button><button type="button" id="eHog" class="tap" style="padding:9px;border-radius:10px;border:1px solid var(--hair);background:var(--sunk);color:var(--text2);font-weight:800;font-family:var(--ui-font)">🏠 ' + (es ? 'Hogar' : 'Household') + '</button></div></div>';
    if (canDeductAcct) {
      // Conjunta primero (grupo aparte, es la sugerencia/default -- no
      // toca tu presupuesto personal), luego tus cuentas personales (si
      // eliges una, SÍ cuenta contra tu presupuesto -- lo estás
      // adelantando de tu bolsillo).
      extra += '<div class="ft-field" id="eAcctWrap" style="display:none"><label>' + (es ? '¿De qué cuenta se paga?' : 'Paid from which account?') + '</label><select id="eAcct">' +
        (hogarAccts.length ? '<optgroup label="' + (es ? 'Conjunta' : 'Joint') + '">' + hogarAccts.map(function (a, i) { return '<option value="' + a.id + '"' + (i === 0 ? ' selected' : '') + '>' + a.name + ' (' + FT.money(FT.accountFree(a), { cents: true }) + ')</option>'; }).join('') + '</optgroup>' : '') +
        (myAccts.length ? '<optgroup label="' + (es ? 'Mi cuenta (adelantar)' : 'My account (front it)') + '">' + myAccts.map(function (a) { return '<option value="' + a.id + '">' + a.name + ' (' + FT.money(FT.accountFree(a), { cents: true }) + ')</option>'; }).join('') + '</optgroup>' : '') +
        // "Ninguna" al final (gasto en efectivo, o sin cuenta conjunta que
        // no quieres adelantar de tu bolsillo) -- si no hay ninguna cuenta
        // conjunta, esta es la que queda seleccionada por default (nunca
        // se elige una cuenta personal en automático, sin que el usuario
        // lo pida).
        '<option value=""' + (hogarAccts.length ? '' : ' selected') + '>' + (es ? 'Ninguna (efectivo / sin registrar)' : 'None (cash / untracked)') + '</option>' +
        '</select>' +
        '<p style="font-size:10px;color:var(--text3);margin-top:4px">' + (es ? 'La conjunta no toca tu presupuesto personal -- tu propia cuenta sí.' : "The joint account doesn't touch your personal budget -- your own account does.") + '</p>' +
      '</div>';
    }
  }
  if (realType === 'ahorro')
    extra += '<div class="ft-field"><label>' + (es ? 'Destino' : 'Destination') + '</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button type="button" id="eLib" class="tap" style="padding:9px;border-radius:10px;border:1.5px solid var(--g-main);background:var(--g-light);color:var(--g-dark);font-weight:800;font-family:var(--ui-font)">💵 ' + (es ? 'Ahorro libre' : 'Free savings') + '</button><button type="button" id="eEmg" class="tap" style="padding:9px;border-radius:10px;border:1px solid var(--hair);background:var(--sunk);color:var(--text2);font-weight:800;font-family:var(--ui-font)">🛡️ ' + (es ? 'Emergencia' : 'Emergency') + '</button></div></div>';
  if (realType === 'ingreso')
    extra += '<label class="tap" style="display:flex;gap:9px;align-items:flex-start;background:var(--sunk);border:1px solid var(--hair);border-radius:11px;padding:10px 12px;cursor:pointer;font-size:11.5px;color:var(--text2)"><input type="checkbox" id="eDist" style="width:17px;height:17px;margin-top:1px;accent-color:var(--g-main)"><span>' + (es ? 'Repartir automáticamente a ahorro / emergencia / inversión según mis %.' : 'Auto-distribute to savings / emergency / investing by my %.') + '</span></label>';

  // 19-oct-2026, a petición de Ramón: un ingreso puede ser 100% mío o un APORTE
  // AL HOGAR (ej. un bono que va completo a la casa). El aporte NO pasa por tu
  // presupuesto personal: se anota como aporte del hogar (hogar:true), que tu
  // pareja ve y que cuenta como "Aportado" en Historial/Hogar. Opcionalmente
  // acredita una cuenta conjunta (se revierte solo si lo eliminas).
  if (realType === 'ingreso' && FT.hogarConnected()) {
    var jointAcctsK = FT.checking().filter(function (c) { return c.hogar; });
    extra = '<div class="ft-field" id="eKindWrap"><label>' + (es ? '¿Qué es este ingreso?' : 'What is this income?') + '</label>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button type="button" id="eKMine" class="tap" style="padding:9px;border-radius:10px;border:1.5px solid var(--g-main);background:var(--g-light);color:var(--g-dark);font-weight:800;font-family:var(--ui-font)">🎁 ' + (es ? '100% mío' : '100% mine') + '</button>' +
      '<button type="button" id="eKHogar" class="tap" style="padding:9px;border-radius:10px;border:1px solid var(--hair);background:var(--sunk);color:var(--text2);font-weight:800;font-family:var(--ui-font)">🏠 ' + (es ? 'Aporte al hogar' : 'Household contribution') + '</button></div>' +
      '<p id="eKNote" style="font-size:10.5px;color:var(--text3);margin:6px 0 0">' + (es ? 'Suma a tu presupuesto personal.' : 'Adds to your personal budget.') + '</p></div>' +
      '<div class="ft-field" id="eAcctHWrap" style="display:none"><label>' + (es ? '¿A qué cuenta conjunta llega? (opcional)' : 'Which joint account does it land in? (optional)') + '</label><select id="eAcctH"><option value="">' + (es ? 'Ninguna' : 'None') + '</option>' +
        jointAcctsK.map(function (a) { return '<option value="' + a.id + '">' + a.name + ' (' + FT.money(FT.accountFree(a), { cents: true }) + ')</option>'; }).join('') + '</select></div>' + extra;
  }
  var state = { hogar: false, dest: 'libre', incomeHogar: false };
  var titles = { gasto: es ? 'Gasto' : 'Expense', ingreso: es ? 'Ingreso' : 'Income', ahorro: es ? 'Ahorro' : 'Savings', inversion: es ? 'Inversión' : 'Investment', suscripcion: es ? 'Suscripción' : 'Subscription', servicio: es ? 'Servicio del hogar' : 'Utility bill' };

  var ov = FT.modal({
    title: (es ? 'Nuevo: ' : 'New: ') + titles[type],
    html:
      '<div class="ft-field"><label>' + (es ? 'Descripción' : 'Description') + '</label><input id="eDesc" placeholder="' + (es ? 'Ej. Soriana' : 'e.g. Store') + '"></div>' +
      '<div class="ft-field"><label>' + (es ? 'Monto' : 'Amount') + '</label><input id="eAmt" inputmode="decimal" placeholder="$0"></div>' +
      '<div class="ft-field"><label>' + (es ? 'Fecha' : 'Date') + '</label><input id="eDate" type="date" value="' + FT.todayISO() + '"></div>' +
      extra,
    saveLabel: es ? 'Guardar registro' : 'Save entry',
    onOpen: function (body) {
      var h = body.querySelector('#eHog'), p = body.querySelector('#ePers'), acctWrap = body.querySelector('#eAcctWrap');
      var persAcctWrap = body.querySelector('#eAcctPersWrap');
      if (h) {
        h.onclick = function () { state.hogar = true; sel(h, p); if (acctWrap) acctWrap.style.display = ''; if (persAcctWrap) persAcctWrap.style.display = 'none'; };
        p.onclick = function () { state.hogar = false; sel(p, h); if (acctWrap) acctWrap.style.display = 'none'; if (persAcctWrap) persAcctWrap.style.display = ''; };
      }
      var kMine = body.querySelector('#eKMine'), kHog = body.querySelector('#eKHogar');
      if (kMine && kHog) {
        var acctInWrap = body.querySelector('#eAcctIn') ? body.querySelector('#eAcctIn').closest('.ft-field') : null, distWrap = body.querySelector('#eDist') ? body.querySelector('#eDist').closest('label') : null;
        var setKind = function (hogarKind) {
          state.incomeHogar = hogarKind;
          sel(hogarKind ? kHog : kMine, hogarKind ? kMine : kHog);
          body.querySelector('#eAcctHWrap').style.display = hogarKind ? '' : 'none';
          if (acctInWrap) acctInWrap.style.display = hogarKind ? 'none' : '';
          if (distWrap) distWrap.style.display = hogarKind ? 'none' : '';
          body.querySelector('#eKNote').textContent = hogarKind
            ? (FT.lang === 'es' ? 'Va completo al hogar y NO suma a tu presupuesto personal. Tu pareja lo ve como aporte.' : 'Goes entirely to the household and does NOT add to your personal budget. Your partner sees it as a contribution.')
            : (FT.lang === 'es' ? 'Suma a tu presupuesto personal.' : 'Adds to your personal budget.');
        };
        kMine.onclick = function () { setKind(false); };
        kHog.onclick = function () { setKind(true); };
      }
      var lib = body.querySelector('#eLib'), emg = body.querySelector('#eEmg');
      if (lib) { emg.onclick = function () { state.dest = 'emergencia'; sel(emg, lib); }; lib.onclick = function () { state.dest = 'libre'; sel(lib, emg); }; }
      preset = preset || {};
      if (preset.dest === 'emergencia' && emg) emg.onclick();
      if (preset.hogar && h) h.onclick();
      if (preset.incomeHogar && kHog) kHog.onclick();
      // Aviso en vivo de la cuenta personal (ver renderAcctStatus): se
      // recalcula al teclear el monto, al cambiar de cuenta y al alternar
      // Personal/Hogar; tras un traspaso se refresca el texto del selector.
      var amtEl = body.querySelector('#eAmt'), persSel = body.querySelector('#eAcctPers');
      if (persSel && amtEl) {
        var refreshPersOpts = function () {
          Array.prototype.forEach.call(persSel.options, function (o) {
            if (!o.value) return;
            var a = FT.checking().find(function (x) { return String(x.id) === String(o.value); });
            if (a) o.textContent = acctOptLabel(a);
          });
        };
        var updAcctStatus = function () { renderAcctStatus(body, function () { return amtEl.value; }, refreshPersOpts); };
        amtEl.addEventListener('input', updAcctStatus);
        persSel.addEventListener('change', updAcctStatus);
        if (h) { h.addEventListener('click', updAcctStatus); p.addEventListener('click', updAcctStatus); }
      }
      function sel(on, off) {
        on.style.borderColor = 'var(--g-main)'; on.style.background = 'var(--g-light)'; on.style.color = 'var(--g-dark)';
        off.style.borderColor = 'var(--hair)'; off.style.background = 'var(--sunk)'; off.style.color = 'var(--text2)';
      }
    },
    onSave: function (body) {
      var o = {
        type: realType,
        desc: body.querySelector('#eDesc').value.trim(),
        amount: body.querySelector('#eAmt').value,
        date: body.querySelector('#eDate').value,
        cat: body.querySelector('#eCat') ? body.querySelector('#eCat').value : undefined,
        hogar: state.hogar, dest: state.dest,
        incomeKind: realType === 'ingreso' ? 'extra' : undefined,
        autoDist: body.querySelector('#eDist') ? body.querySelector('#eDist').checked : false,
        esServicioHogar: isServ,
        // Orden importa: el primer caso (hogar + canDeductAcct) es el
        // comportamiento de SIEMPRE, cubre gasto Y suscripción de hogar --
        // NO se puede perder al agregar los casos nuevos (gasto personal,
        // ingreso). Antes de este comentario hubo una versión que colapsaba
        // el chequeo a solo "realType==='gasto'", rompiendo en silencio la
        // cuenta de una suscripción de hogar -- corregido antes de subir.
        checkingAccountId: (state.hogar && canDeductAcct)
          ? (body.querySelector('#eAcct') ? body.querySelector('#eAcct').value : hogarAcctOpts[0].id)
          : (realType === 'gasto' && !state.hogar && body.querySelector('#eAcctPers') ? (body.querySelector('#eAcctPers').value || undefined)
            : (realType === 'ingreso' && body.querySelector('#eAcctIn') ? (body.querySelector('#eAcctIn').value || undefined) : undefined))
      };
      if (!o.desc || !FT.numMoney(o.amount) || !o.date) { FT.toast(FT.lang === 'es' ? 'Completa descripción, monto y fecha' : 'Fill description, amount and date'); return true; }

      // Aporte al hogar: se anota como aporte del hogar, sin tocar el presupuesto personal.
      if (realType === 'ingreso' && state.incomeHogar) {
        var esA = FT.lang === 'es', amtA = FT.numMoney(o.amount);
        if (!(amtA > 0)) { FT.toast(esA ? 'El monto debe ser mayor a 0' : 'Amount must be greater than 0'); return true; }
        var acctH = body.querySelector('#eAcctH') ? (body.querySelector('#eAcctH').value || '') : '';
        if (acctH) FT.creditChecking(acctH, amtA);
        var dA = FT.data();
        dA.transactions.push({ id: Date.now(), type: 'ahorro', desc: (esA ? 'Aporte al hogar — ' : 'Household contribution — ') + o.desc, amount: amtA, date: o.date, cat: '🏠 Hogar', hogar: true, createdBy: FT.userName(),
          checkingAccountId: acctH || undefined, acctCredited: acctH ? true : undefined, aporteManual: true });
        FT.saveData(dA);
        FT.toast((esA ? 'Aporte al hogar · ' : 'Household contribution · ') + FT.money(amtA, { cents: true }), { icon: '🏠' });
        /* la pantalla se refresca sola (ft:datachanged) */
        FT.closeTop();
        return true;
      }

      // Gasto personal que excede el disponible → hoja de cobertura (opción C).
      function afterOverdraft() {
        if (realType === 'gasto' && !o.hogar && String(o.date) <= FT.todayISO()) {
          var disp = FT.personalAvailable();
          var amt = FT.numMoney(o.amount);
          if (amt > disp) {
            var falt = Math.round((amt - Math.max(0, disp)) * 100) / 100;
            coberturaSheet(o.desc, falt).then(function (choice) {
              if (choice === 'libre' || choice === 'emergencia') o.cobertura = { source: choice, monto: falt };
              commit(o); FT.closeTop();
            });
            return;
          }
        }
        commit(o); FT.closeTop();
      }
      // Sobregiro estilo SoFi (Fase 1/2): si el gasto elige una cuenta y su
      // LIBRE no alcanza, se avisa y pide confirmación antes de dejarla en
      // negativo -- los fondos vinculados a esa cuenta NUNCA se tocan
      // solos para cubrir la diferencia (eso violaría la regla de que un
      // fondo/apartado nunca se mueve sin que el usuario lo pida).
      if (realType === 'gasto' && o.checkingAccountId && String(o.date) <= FT.todayISO()) {
        var chk = FT.checkOverdraft(o.checkingAccountId, FT.numMoney(o.amount));
        if (!chk.ok) {
          var acctObj = FT.checking().find(function (a) { return String(a.id) === String(o.checkingAccountId); }) || {};
          if (acctObj.hogar) {
            // Gasto CONJUNTO sin fondos suficientes (QA 30-sep-2026): Ramón
            // fue explícito -- que la cuenta conjunta llegue a $0 es normal
            // (se hizo para cubrir gastos de la casa), así que el aviso
            // genérico de sobregiro ("¿continuar?") no es lo que quiere
            // aquí. En su lugar, opciones reales: transferir dinero a esa
            // cuenta ahí mismo, continuar igual, o cancelar.
            hogarInsufficientSheet(acctObj, chk).then(function (choice) {
              if (choice === 'continue') afterOverdraft();
              else if (choice === 'transfer') {
                FT.closeTop(); // cierra "Nuevo gasto" -- se retoma después de transferir
                FT.openTransfer({ toType: 'account', toId: acctObj.id, amount: chk.shortfall });
              }
              // 'cancel' o cerrar sin elegir: no hace nada, "Nuevo gasto" sigue abierto.
            });
            return true;
          }
          // Cuenta PERSONAL: el aviso simple de siempre (acortado -- era el
          // confirm() más largo de la app).
          FT.confirm(FT.lang === 'es'
            ? '«' + (acctObj.name || '') + '» quedaría en negativo (te faltan ' + FT.money(chk.shortfall, { cents: true }) + '). ¿Continuar?'
            : '"' + (acctObj.name || '') + '" would go negative (short ' + FT.money(chk.shortfall, { cents: true }) + '). Continue?'
          ).then(function (ok) { if (ok) afterOverdraft(); });
          return true;
        }
      }
      afterOverdraft();
      return true;
    }
  });

  function commit(o) {
    var e = FT.addEntry(o);
    if (e) {
      if (o.cobertura) FT.toast(FT.money(o.cobertura.monto) + (FT.lang === 'es' ? ' movido de ' : ' moved from ') + (o.cobertura.source === 'emergencia' ? (FT.lang === 'es' ? 'Emergencia' : 'Emergency') : (FT.lang === 'es' ? 'Ahorro libre' : 'Free savings')) + (FT.lang === 'es' ? ' para cubrir «' : ' to cover "') + o.desc + '»', { icon: '💵', ms: 4000 });
      else FT.toast((FT.lang === 'es' ? 'Registrado · ' : 'Logged · ') + FT.money(e.amount, { cents: true }), { icon: '✅' });
    }
    /* la pantalla se refresca sola (ft:datachanged) */
  }
}

/** Hoja de cobertura: ¿de dónde cubrir el faltante de un gasto que excede el disponible? */
function coberturaSheet(name, falt) {
  var es = FT.lang === 'es';
  return new Promise(function (resolve) {
    FT.sheet({
      title: es ? 'Excede tu disponible' : 'Over your available',
      html: '<p style="font-size:13px;color:var(--text2);margin:2px 0 6px">' +
        (es ? 'Este gasto supera tu disponible del mes por ' : 'This expense is over your monthly available by ') +
        '<b>' + FT.money(falt) + '</b>. ' + (es ? '¿De dónde lo cubres?' : 'Where do you cover it from?') + '</p>',
      actions: [
        { label: '💵 ' + (es ? 'Ahorro libre' : 'Free savings') + ' · ' + FT.money(FT.savingsBalance()), primary: true, onClick: function () { resolve('libre'); } },
        { label: '🛡️ ' + (es ? 'Emergencia' : 'Emergency') + ' · ' + FT.money(FT.emergencyBalance()), onClick: function () { resolve('emergencia'); } },
        { label: es ? 'Dejarlo en rojo (gasto extra)' : 'Leave it negative', onClick: function () { resolve('rojo'); } }
      ]
    });
  });
}

/** Hoja de opciones cuando un gasto CONJUNTO no alcanza en la cuenta
 *  elegida (QA 30-sep-2026). A diferencia de un gasto personal, quedarse
 *  en $0 en la cuenta conjunta es normal (se hizo justo para cubrir gastos
 *  de la casa) -- Ramón no quiere el aviso genérico de sobregiro aquí,
 *  quiere opciones reales: transferir dinero a esa cuenta ahí mismo,
 *  continuar igual (queda en negativo), o cancelar. Resuelve
 *  'transfer'|'continue'|'cancel' -- cerrar el sheet sin elegir nunca
 *  resuelve nada, mismo criterio que el resto de los sheets de opciones. */
function hogarInsufficientSheet(acctObj, chk) {
  var es = FT.lang === 'es';
  return new Promise(function (resolve) {
    FT.sheet({
      title: '🏠 ' + (es ? 'No alcanza en «' + acctObj.name + '»' : 'Not enough in "' + acctObj.name + '"'),
      html: '<p style="font-size:13px;color:var(--text2);margin:2px 0 6px">' +
        (es ? 'Tiene ' + FT.money(chk.libre, { cents: true }) + ' disponible -- faltan ' : 'Has ' + FT.money(chk.libre, { cents: true }) + ' available -- short ') +
        '<b>' + FT.money(chk.shortfall, { cents: true }) + '</b>' + (es ? ' para este gasto. ¿Qué quieres hacer?' : ' for this expense. What do you want to do?') + '</p>',
      actions: [
        { label: '🔁 ' + (es ? 'Transferir dinero aquí' : 'Transfer money here'), primary: true, onClick: function () { resolve('transfer'); } },
        { label: '✅ ' + (es ? 'Continuar de todas formas' : 'Continue anyway'), onClick: function () { resolve('continue'); } },
        { label: es ? 'Cancelar' : 'Cancel', onClick: function () { resolve('cancel'); } }
      ]
    });
  });
}
FT.openPicker = openPicker;
FT.openEntry = openEntry;
})();

/* ─────────────────────────────────────────────────────────────────────────
   TRANSFERENCIAS (Fase 2, Cuentas como base) — neutral por regla, reversible
   ───────────────────────────────────────────────────────────────────────── */
/** Mueve `amount` (+ entra, − sale) dentro de una cuenta/fondo/Emergencia.
 *  `_noAcctMove:true` evita que FT.addSavings/addEmergency ADEMÁS muevan la
 *  cuenta vinculada del fondo (aquí FT.transfer ya está moviendo esa cuenta
 *  a mano como el otro extremo de la transferencia -- sin este flag se
 *  descontaría/acreditaría dos veces). */
FT._xferMove = function (ref, amount, date, tag) {
  if (!ref) return;
  if (ref.type === 'account') {
    if (amount >= 0) FT.creditChecking(ref.id, amount); else FT.deductChecking(ref.id, -amount, date);
  } else if (ref.type === 'fund') {
    if (amount >= 0) FT.addSavings({ id: tag, amount: amount, date: date, tipo: 'deposito', note: '', fundId: ref.id, _noAcctMove: true });
    else FT.addSavings({ id: tag, amount: -amount, date: date, tipo: 'retiro', note: '', fundId: ref.id, _noAcctMove: true });
  } else if (ref.type === 'emerg') {
    if (amount >= 0) FT.addEmergency({ id: tag, amount: amount, date: date, tipo: 'deposito', note: '', _noAcctMove: true });
    else FT.addEmergency({ id: tag, amount: -amount, date: date, tipo: 'retiro', note: '', _noAcctMove: true });
  }
};
FT._xferLabel = function (ref) {
  if (!ref) return '?';
  if (ref.type === 'account') { var a = FT.checking().find(function (x) { return String(x.id) === String(ref.id); }); return a ? a.name : '?'; }
  if (ref.type === 'fund') { var f = FT.savingsFunds().find(function (x) { return x.id === ref.id; }); return f ? f.emoji + ' ' + f.name : '?'; }
  return '🛡️ ' + (FT.lang === 'es' ? 'Emergencia' : 'Emergency');
};
/** ¿Existe de verdad este extremo? (revisión independiente: un ref que
 *  apunta a una cuenta/fondo ya borrado no debe aplicarse a medias -- ver
 *  FT._xferBalance para el saldo). */
FT._xferExists = function (ref) {
  if (!ref) return false;
  if (ref.type === 'account') return !!FT.checking().find(function (x) { return String(x.id) === String(ref.id); });
  if (ref.type === 'fund') return !!FT.savingsFunds().find(function (x) { return x.id === ref.id; });
  return ref.type === 'emerg';
};
/** Saldo disponible en este extremo -- para cuentas es solo el LIBRE (una
 *  cuenta puede sobregirarse con aviso, ver FT.checkOverdraft); para un
 *  fondo/Emergencia es su `.actual` real, porque esos SIEMPRE se topan en 0
 *  (Math.max(0,...) en FT.addSavings/addEmergency) -- si no se revisa antes
 *  de intentar sacar más de lo que tienen, el retiro se clampa solo pero el
 *  destino igual recibe el monto completo, fabricando la diferencia de la
 *  nada (hallazgo real de revisión independiente). */
FT._xferBalance = function (ref) {
  if (!ref) return 0;
  if (ref.type === 'account') { var a = FT.checking().find(function (x) { return String(x.id) === String(ref.id); }); return a ? FT.accountFree(a) : 0; }
  if (ref.type === 'fund') { var f = FT.savingsFunds().find(function (x) { return x.id === ref.id; }); return f ? parseFloat(f.actual) || 0 : 0; }
  return FT.emergencyBalance();
};
/** Transferencia entre mis propias cuentas/fondos/Emergencia. SIEMPRE
 *  neutral (regla #1: nunca toca ingreso/gasto/presupuesto del mes) -- solo
 *  cambia DÓNDE vive el dinero, nunca cuánto tengo en total. Se registra
 *  como UNA transacción type:'transferencia' (queda en Historial, y
 *  FT.deleteTx sabe revertirla completa desde ambos lados).
 *  o = { from:{type,id}, to:{type,id}, amount, date, note, recId }
 *  type ∈ 'account' | 'fund' | 'emerg'. */
FT.transfer = function (o) {
  o = o || {};
  var amt = parseFloat(o.amount) || 0;
  if (!amt || amt <= 0 || !o.from || !o.to) return null;
  // Revisión independiente: sin esto, un origen apuntando a una cuenta/
  // fondo YA BORRADO aplicaba solo un lado (el otro se descartaba en
  // silencio), y un origen fondo/Emergencia con MENOS saldo del pedido se
  // topaba en 0 mientras el destino igual recibía el monto completo --
  // fabricando la diferencia de la nada. Cuentas SÍ pueden sobregirarse
  // (con aviso, ver FT.checkOverdraft en la UI) -- fondos/Emergencia no,
  // porque su saldo siempre se clampa en 0 sin avisar.
  if (!FT._xferExists(o.from) || !FT._xferExists(o.to)) return null;
  if (o.from.type !== 'account' && amt > FT._xferBalance(o.from) + 0.005) return null;
  var date = o.date || FT.todayISO();
  // Acepta un id ya generado (recurrentes atrasados corren varias veces
  // 100% síncrono en la misma pasada -- Date.now() puede repetirse entre
  // una vuelta y la siguiente, mismo riesgo ya corregido en
  // FT.applyDueRecurring para el resto de _applyRec*).
  var id = o.id || Date.now();
  FT._xferMove(o.from, -amt, date, 'xf_' + id + '_f');
  FT._xferMove(o.to, amt, date, 'xf_' + id + '_t');
  var d = FT.data();
  var entry = {
    id: id, type: 'transferencia', desc: o.note || (FT.lang === 'es' ? 'Transferencia' : 'Transfer'), amount: amt, date: date,
    note: o.note || '', createdBy: FT.userName(), fromRef: o.from, toRef: o.to,
    fromLabel: FT._xferLabel(o.from), toLabel: FT._xferLabel(o.to), recId: o.recId || null, auto: !!o.auto
  };
  d.transactions.push(entry);
  FT.saveData(d);
  return entry;
};

/** Pantalla/modal reutilizable para crear una transferencia -- origen y
 *  destino pueden ser cualquier combinación de cuenta personal, cuenta de
 *  hogar (si hay hogar conectado), fondo de Ahorro libre, o Emergencia.
 *  Sobregiro estilo SoFi (regla de negocio): si el origen es una cuenta y
 *  su LIBRE no alcanza, se avisa y se pide confirmación explícita antes de
 *  dejarla en negativo -- los fondos vinculados a esa cuenta nunca se
 *  tocan solos para cubrir la diferencia. opts.onDone() corre después de
 *  guardar (para refrescar quien haya abierto esto). */
FT.openTransfer = function (opts) {
  opts = opts || {};
  var L = FT.lang === 'es';
  function endpoints() {
    var out = [];
    FT.checking().filter(function (c) { return !c.hogar; }).forEach(function (a) { out.push({ type: 'account', id: a.id, label: '🏦 ' + a.name, sub: FT.money(FT.accountTotal(a), { cents: true }) }); });
    if (FT.hogarConnected()) FT.checking().filter(function (c) { return c.hogar; }).forEach(function (a) { out.push({ type: 'account', id: a.id, label: '🏠 ' + a.name, sub: FT.money(FT.accountTotal(a), { cents: true }) }); });
    FT.savingsFunds().forEach(function (f) { out.push({ type: 'fund', id: f.id, label: f.emoji + ' ' + f.name, sub: FT.money(f.actual, { cents: true }) }); });
    out.push({ type: 'emerg', id: null, label: '🛡️ ' + (L ? 'Emergencia' : 'Emergency'), sub: FT.money(FT.emergencyBalance(), { cents: true }) });
    return out;
  }
  var eps = endpoints();
  if (eps.length < 2) { FT.toast(L ? 'Necesitas al menos 2 cuentas/fondos para transferir' : 'You need at least 2 accounts/funds to transfer'); return; }
  var st = { freq: 'monthly' };
  function selHtml(id, chosenIdx) {
    return '<select id="' + id + '">' + eps.map(function (e, i) { return '<option value="' + i + '"' + (i === chosenIdx ? ' selected' : '') + '>' + e.label + ' (' + e.sub + ')</option>'; }).join('') + '</select>';
  }
  // Fondos insuficientes en una cuenta (QA 30-sep-2026): se puede abrir ya
  // con el destino pre-elegido (ej. "transferir aquí" desde el aviso de un
  // gasto conjunto sin saldo) y el monto que falta precargado -- opts.toType/
  // opts.toId/opts.amount, todos opcionales, sin cambiar el comportamiento
  // normal (Destino en la 2da opción, monto vacío) cuando no se pasan.
  var toIdx = eps.length > 1 ? 1 : 0;
  if (opts.toType) {
    var foundIdx = eps.findIndex(function (e) { return e.type === opts.toType && String(e.id) === String(opts.toId); });
    if (foundIdx >= 0) toIdx = foundIdx;
  }
  // Revisión independiente: "Origen" siempre se asumía índice 0 -- si
  // alguien no tiene NINGUNA cuenta personal (solo la conjunta), Destino
  // pre-elegido también cae en 0 (la conjunta es lo único que hay antes de
  // los fondos), dejando Origen=Destino. El guardado ya lo bloqueaba (no
  // se perdía dinero), pero fallaba justo en el caso de uso para el que se
  // construyó esto ("transferir aquí" con una sola cuenta). Si coinciden,
  // Origen cae al siguiente disponible en vez de forzar al usuario a
  // notarlo y corregirlo él mismo.
  var fromIdx = 0;
  if (fromIdx === toIdx) fromIdx = eps.length > 1 ? 1 : 0;
  FT.modal({
    title: '🔁 ' + (L ? 'Transferir' : 'Transfer'),
    html:
      '<div class="ft-field"><label>' + (L ? 'Origen' : 'From') + '</label>' + selHtml('xfFrom', fromIdx) + '</div>' +
      '<div class="ft-field"><label>' + (L ? 'Destino' : 'To') + '</label>' + selHtml('xfTo', toIdx) + '</div>' +
      '<div class="ft-field"><label>' + (L ? 'Monto' : 'Amount') + '</label><input id="xfAmt" inputmode="decimal" placeholder="$0" value="' + (opts.amount ? (+opts.amount).toFixed(2) : '') + '"></div>' +
      '<div class="ft-field"><label>' + (L ? 'Fecha' : 'Date') + '</label><input id="xfDate" type="date" value="' + FT.todayISO() + '"></div>' +
      '<div class="ft-field"><label>' + (L ? 'Nota (opcional)' : 'Note (optional)') + '</label><input id="xfNote"></div>' +
      '<label style="display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;margin-top:4px;cursor:pointer"><input type="checkbox" id="xfRec"> ' + (L ? 'Hacerla recurrente' : 'Make it recurring') + '</label>' +
      '<div id="xfRecWrap" style="display:none;margin-top:8px"><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px" id="xfFreq">' +
        ['weekly:' + (L ? 'Semanal' : 'Weekly'), 'biweekly:' + (L ? 'Quincenal' : 'Biweekly'), 'monthly:' + (L ? 'Mensual' : 'Monthly')].map(function (o) { var v = o.split(':')[0], on = v === 'monthly'; return '<button type="button" data-f="' + v + '" style="padding:8px;border-radius:9px;border:1.5px solid ' + (on ? 'var(--g-main)' : 'var(--hair)') + ';background:' + (on ? 'var(--g-light)' : 'var(--sunk)') + ';font-family:var(--ui-font);font-size:11px;font-weight:800;color:' + (on ? 'var(--g-dark)' : 'var(--text2)') + ';cursor:pointer">' + o.split(':')[1] + '</button>'; }).join('') + '</div></div>' +
      '<div style="background:var(--sky-bg);color:#2A4CC0;border-radius:10px;padding:9px 11px;font-size:11px;font-weight:600;margin-top:8px">' + (L ? 'Una transferencia entre tus propias cuentas/fondos nunca cuenta como ingreso ni gasto — no toca tu presupuesto del mes.' : "A transfer between your own accounts/funds never counts as income or an expense — it doesn't touch your monthly budget.") + '</div>',
    saveLabel: L ? 'Transferir' : 'Transfer',
    onOpen: function (body) {
      body.querySelector('#xfRec').onchange = function (e) { body.querySelector('#xfRecWrap').style.display = e.target.checked ? 'block' : 'none'; };
      body.querySelectorAll('#xfFreq button').forEach(function (b) {
        b.onclick = function () {
          st.freq = b.getAttribute('data-f');
          body.querySelectorAll('#xfFreq button').forEach(function (x) { var on = x === b; x.style.borderColor = on ? 'var(--g-main)' : 'var(--hair)'; x.style.background = on ? 'var(--g-light)' : 'var(--sunk)'; x.style.color = on ? 'var(--g-dark)' : 'var(--text2)'; });
        };
      });
    },
    onSave: function (body) {
      var amt = FT.numMoney(body.querySelector('#xfAmt').value) || 0;
      if (!amt || amt <= 0) { FT.toast(L ? 'Ingresa un monto' : 'Enter an amount'); return true; }
      var fi = +body.querySelector('#xfFrom').value, ti = +body.querySelector('#xfTo').value;
      if (fi === ti) { FT.toast(L ? 'Elige un origen y un destino distintos' : 'Pick a different origin and destination'); return true; }
      var from = eps[fi], to = eps[ti];
      var date = body.querySelector('#xfDate').value || FT.todayISO();
      var note = body.querySelector('#xfNote').value.trim();
      var makeRec = body.querySelector('#xfRec').checked;
      // onSave siempre devuelve true (el modal se cierra a mano en
      // doTransfer) -- así el sobregiro puede esperar la respuesta async de
      // FT.confirm sin que el framework cierre el modal equivocado mientras
      // tanto (ver FT.modal: onSave falsy = autocierra el de arriba del
      // stack, que para cuando resuelve la promesa ya sería el confirm).
      var doTransfer = function () {
        // Revisión independiente: si un extremo desapareció justo entre
        // abrir este modal y guardar (ventana muy corta pero real),
        // FT.transfer rechaza y devuelve null -- antes se ignoraba ese
        // resultado y igual se mostraba "✅ registrada" y se creaba el
        // recurrente para una transferencia que nunca pasó.
        var ok = FT.transfer({ from: { type: from.type, id: from.id }, to: { type: to.type, id: to.id }, amount: amt, date: date, note: note });
        if (!ok) { FT.toast(L ? '⚠️ No se pudo hacer la transferencia -- revisa los saldos e intenta de nuevo' : "⚠️ Couldn't complete the transfer -- check balances and try again"); return; }
        if (makeRec) {
          var rec = FT.recurring();
          rec.push({ id: 'rec_' + Date.now(), kind: 'transferencia', from: { type: from.type, id: from.id }, to: { type: to.type, id: to.id }, amount: amt, desc: note || ((L ? 'Transferencia: ' : 'Transfer: ') + from.label + ' → ' + to.label), freq: st.freq, hogar: false, nextDate: _advanceRecDate(st.freq, date), active: true, createdBy: FT.userName() });
          FT.set(K.recurring, rec);
        }
        FT.toast(L ? '✅ Transferencia registrada' : '✅ Transfer recorded');
        FT.closeTop();
        if (opts.onDone) opts.onDone();
      };
      if (from.type === 'account') {
        var chk = FT.checkOverdraft(from.id, amt);
        if (!chk.ok) {
          // QA: el mensaje de sobregiro era el texto de confirm() más largo
          // de toda la app -- acortado para que quepa sin depender de que
          // el body del sheet haga scroll (que sí lo hace, pero un
          // navegador automatizado/viewport chico puede no dejarlo ver).
          FT.confirm(L ? '«' + from.label + '» quedaría en negativo (te faltan ' + FT.money(chk.shortfall, { cents: true }) + '). ¿Continuar?' : '"' + from.label + '" would go negative (short ' + FT.money(chk.shortfall, { cents: true }) + '). Continue?').then(function (ok) { if (ok) doTransfer(); });
          return true;
        }
      } else if (amt > FT._xferBalance(from.type === 'fund' ? { type: 'fund', id: from.id } : { type: 'emerg' }) + 0.005) {
        // Fondos/Emergencia nunca se sobregiran (a diferencia de una
        // cuenta) -- su saldo se topa en 0 sin avisar, así que esto se
        // bloquea aquí en vez de dejar que FT.transfer lo rechace en
        // silencio (return null) sin que el usuario sepa por qué no pasó nada.
        FT.toast(L ? 'No tienes suficiente en «' + from.label + '»' : 'Not enough in "' + from.label + '"');
        return true;
      }
      doTransfer();
      return true;
    }
  });
};

/** Reparto del sobrante segun ft_dist_pcts (ahorro / emergencia / inversion-sugerida). */
/** Sugiere cómo repartir `pool` entre los fondos de Ahorro libre según sus
 *  reglas guardadas -- reglas fijas primero (en el orden de la lista),
 *  luego reglas de % (sobre el total `pool`, no sobre lo que quede después
 *  de las fijas) -- mismo criterio para cualquier pantalla que reparta
 *  dinero a fondos (reparto de cheque en dashboard.html, y el reparto de
 *  sobrante de FT.applyDist más abajo), para que las dos formas de repartir
 *  usen exactamente la misma regla y nunca diverjan entre sí.
 *  Devuelve {fundId: monto, ...} -- solo fondos con monto > 0. */
/** Motor compartido: reparte `pool` entre `items` ([{id, rule}]) según cada
 *  `rule` ({type:'fixed'|'pct'|'remainder', value}) -- reglas fijas
 *  primero (en el orden de la lista), luego reglas de % (sobre el total
 *  `pool`, no sobre lo que quede después de las fijas), y al final
 *  'remainder' (15-oct-2026, a petición de Ramón: "debe de haber una
 *  regla en mis cuentas que pueda meter lo restante... para que no esté
 *  haciendo cálculos" -- antes, un fondo sin regla fija/% se quedaba sin
 *  nada, obligándolo a calcular a mano cuánto le sobraba al cheque cada
 *  vez). Si hay más de un fondo/cuenta marcado 'remainder', el restante
 *  se reparte en partes iguales entre ellos (el último se lleva el
 *  centavo de redondeo, para que la suma siga cuadrando exacto con
 *  `pool`). Devuelve {id: monto, ...}, solo ids con monto > 0. Usado
 *  tanto por fondos de Ahorro libre como por cuentas de cheques conjuntas
 *  -- mismo criterio en los dos lados para que nunca diverjan entre sí. */
function _allocateByRules(pool, items) {
  pool = parseFloat(pool) || 0;
  var out = {};
  if (pool <= 0) return out;
  var remaining = pool;
  items.filter(function (it) { return it.rule && it.rule.type === 'fixed'; }).forEach(function (it) {
    var amt = Math.min(remaining, it.rule.value);
    if (amt > 0) { out[it.id] = +amt.toFixed(2); remaining -= amt; }
  });
  items.filter(function (it) { return it.rule && it.rule.type === 'pct'; }).forEach(function (it) {
    var amt = Math.min(remaining, pool * it.rule.value / 100);
    if (amt > 0) { out[it.id] = +((out[it.id] || 0) + amt).toFixed(2); remaining -= amt; }
  });
  var remainderItems = items.filter(function (it) { return it.rule && it.rule.type === 'remainder'; });
  if (remainderItems.length && remaining > 0.005) {
    // Revisión independiente (15-oct-2026): redondear `share` hacia el más
    // cercano podía SUBIR cada una de las primeras n-1 partes lo
    // suficiente para que su suma ya superara `remaining` -- con 4+
    // fondos marcados "lo que sobre" y un resto chico (ej. 7 fondos,
    // $0.11 restantes), eso fabricaba centavos de la nada (confirmado
    // ejecutando la función real: $0.12 repartidos contra $0.11
    // disponibles). Fix: redondear cada parte hacia ABAJO (floor, nunca
    // hacia arriba) -- así ninguna combinación de partes puede sumar más
    // de lo que hay, y el último fondo se lleva el sobrante exacto
    // (incluye el centavo que el floor dejó sin repartir en los demás).
    var share = Math.floor(remaining / remainderItems.length * 100) / 100;
    var used = 0;
    remainderItems.forEach(function (it, idx) {
      var amt = idx === remainderItems.length - 1 ? +(remaining - used).toFixed(2) : share;
      if (amt > 0) { out[it.id] = +((out[it.id] || 0) + amt).toFixed(2); used += amt; }
    });
    remaining = 0;
  }
  return out;
}
FT.suggestFundAllocation = function (pool) {
  return _allocateByRules(pool, FT.savingsFunds());
};
/** Igual que FT.suggestFundAllocation pero para las cuentas de cheques
 *  conjuntas (`FT.checking()` con `hogar:true`) -- así tu parte de hogar de
 *  cada cheque puede repartirse entre varias cuentas con reglas distintas
 *  (ej. $275 fijos a "Casa+Servicio" cada semana), no solo una cuenta al
 *  100% como en la primera versión de este feature. */
FT.suggestCheckingAllocation = function (pool) {
  // Compatibilidad: cuentas ya activadas con el toggle viejo (autoDeposit:true,
  // sin `rule` explícita, de la primera versión de este feature -- solo una
  // cuenta al 100%) se tratan como si tuvieran rule:{type:'pct',value:100},
  // para que sigan funcionando exactamente igual sin que nadie tenga que
  // reconfigurar nada.
  var items = FT.checking().filter(function (a) { return a.hogar; }).map(function (a) {
    return { id: a.id, rule: a.rule || (a.autoDeposit ? { type: 'pct', value: 100 } : null) };
  });
  return _allocateByRules(pool, items);
};
FT.applyDist = function (leftover, opts) {
  opts = opts || {};
  var dist = FT.distPcts();
  var es = FT.lang === 'es';
  var note = opts.note || (es ? 'Distribución del sobrante' : 'Leftover distribution');
  var a = Math.round(leftover * (dist.ahorro || 0) / 100);
  var e = Math.round(leftover * (dist.emergencia || 0) / 100);
  var inv = Math.round(leftover * (dist.inversion || 0) / 100);
  var seq = 0, base = Date.now();
  function nextId() { return base + (seq++); } // +índice, nunca +random -- ver nota en FT.applyReparto sobre colisión de ids
  if (a > 0) {
    // Etapa 3: la parte de "ahorro" del sobrante ya no cae entera al fondo
    // default -- se reparte entre los fondos con nombre según sus reglas
    // guardadas, con el mismo criterio que ya usa el reparto de cheque
    // (FT.suggestFundAllocation) -- un solo sistema de reglas por fondo, no
    // dos que se puedan pisar. Este flujo YA es opt-in explícito del
    // usuario (el checkbox "reparto automático" al registrar el ingreso
    // extra), así que aquí sí se aplica directo, sin pedir confirmación
    // aparte -- distinto del reparto de cheque, que siempre pide confirmar
    // porque ahí el usuario nunca pidió nada de antemano.
    var funds = FT.savingsFunds();
    var allocMap = FT.suggestFundAllocation(a);
    var allocated = 0;
    Object.keys(allocMap).forEach(function (fundId) {
      var amt = allocMap[fundId]; if (amt <= 0) return;
      var f = funds.find(function (x) { return x.id === fundId; });
      var id = nextId();
      FT.addSavings({ id: id, amount: amt, date: FT.todayISO(), tipo: 'deposito', note: note, fundId: fundId });
      var d0 = FT.data();
      d0.transactions.push({ id: id, type: 'ahorro', desc: (es ? 'Ahorro libre — ' : 'Free savings — ') + note + (f ? ' · ' + f.name : ''), amount: amt, date: FT.todayISO(), cat: '💵 Ahorro', dest: 'libre', createdBy: FT.userName() });
      FT.set(K.data, d0);
      allocated += amt;
    });
    // Lo que ninguna regla cubrió (fondos sin regla, o sobrante después de
    // aplicarlas todas) cae al fondo default -- nunca se pierde en silencio.
    var restoA = +(a - allocated).toFixed(2);
    if (restoA > 0.005) {
      var id2 = nextId();
      FT.addSavings({ id: id2, amount: restoA, date: FT.todayISO(), tipo: 'deposito', note: note });
      var d1 = FT.data();
      d1.transactions.push({ id: id2, type: 'ahorro', desc: (es ? 'Ahorro libre — ' : 'Free savings — ') + note, amount: restoA, date: FT.todayISO(), cat: '💵 Ahorro', dest: 'libre', createdBy: FT.userName() });
      FT.set(K.data, d1);
    }
  }
  if (e > 0) FT.addEmergency({ id: nextId(), amount: e, date: FT.todayISO(), tipo: 'deposito', note: note });
  if (inv > 0) FT.setRaw(K.investSuggest, ((parseFloat(FT.getRaw(K.investSuggest, '0')) || 0) + inv).toFixed(2));
  FT._changed();
  return { ahorro: a, emergencia: e, inversion: inv };
};

/* ─────────────────────────────────────────────────────────────────────────
   5c · NOTIFICACIONES — ampliadas (§2): deuda por vencer, presupuesto
        excedido, cheque registrado, dinero movido a ahorro/emergencia.
        Devuelve [{ icon, text, url, tone }]. Cada pantalla puede añadir
        las suyas via FT.setNotifications(fn) — esta es la base.
   ───────────────────────────────────────────────────────────────────────── */
FT.getNotifications = function () {
  var out = [];
  var es = FT.lang === 'es';
  var today = new Date();
  var mk = today.toISOString().slice(0, 7);

  // 1 · Deudas por vencer (<=5 días, no pagadas este mes, no descartadas)
  FT.debts().forEach(function (d) {
    var payDay = d.payDay || 1;
    var due = new Date(today.getFullYear(), today.getMonth(), payDay);
    var diff = Math.ceil((due - today) / 86400000);
    var paid = !!(d.paidMonths && d.paidMonths[mk]);
    var hidden = FT.getRaw('ft_notif_hidden_' + d.id + '_' + mk) === '1';
    if (!paid && !hidden && diff <= 5) {
      // 12-oct-2026 (Ramón): mostraba d.balance (el saldo TOTAL de la
      // deuda, ej. $230,000 de una hipoteca) en vez de lo que de verdad
      // toca pagar este periodo -- d.payment es el campo que ya se usa en
      // toda la app como "pago/mes" (la tarjeta de la deuda, el modal de
      // abono, etc.), así que es el correcto aquí también.
      // debtId + debtOpenMode:'abonar' (15-oct-2026) -- al tocar este aviso,
      // FT.openNotifications deja el deep-link de deudas.html apuntando
      // directo a ESTA deuda con el modal de pago ya abierto, en vez de
      // dejarte en la lista general a buscarla.
      out.push({ icon: '💳', tone: 'red', url: 'deudas.html', debtId: d.id, debtOpenMode: 'abonar',
        text: (es ? d.name + ' vence ' + (diff <= 0 ? 'hoy' : 'en ' + diff + ' día' + (diff > 1 ? 's' : '')) : d.name + ' due ' + (diff <= 0 ? 'today' : 'in ' + diff + ' day' + (diff > 1 ? 's' : ''))) + ' · ' + FT.money(d.payment) });
    }
  });

  // 2 · Cheque registrado hoy
  FT.cheques().forEach(function (c) {
    if (c.fecha === FT.todayISO()) {
      out.push({ icon: '💵', tone: 'green', url: 'dashboard.html',
        text: (es ? 'Cheque registrado · ' : 'Paycheck logged · ') + FT.money(c.monto) + ' · ' + FT.money(c.hogarAmt) + (es ? ' hogar / ' : ' household / ') + FT.money(c.personalAmt) + (es ? ' personal' : ' personal') });
    }
  });

  // 3 · Abonos recurrentes de deuda esperando tu aprobación (03-oct-2026,
  // a petición de Ramón: "debe de ver una notificación" antes de que se
  // mueva el dinero de un fondo/vault privado).
  FT.pendingDebtApprovals().forEach(function (p) {
    // debtOpenMode por default ('detail', ver FT.openNotifications) -- aquí
    // ya existe un abono esperando, así que se abre el detalle de la deuda
    // (donde está la fila "esperando aprobación" con Aceptar/Saltar), no un
    // formulario de pago nuevo.
    out.push({ icon: '🔔', tone: 'blue', url: 'deudas.html', debtId: p.debtId,
      text: (es ? 'Abono a ' + p.debtName + ' listo — acéptalo para mover ' : 'Payment to ' + p.debtName + ' ready — accept to move ') + FT.money(p.monto) + (es ? ' de ' : ' from ') + p.fundLabel });
  });

  // 3b · Abonos recurrentes de deuda ATORADOS por falta de saldo en su
  // fondo (12-oct-2026, caso real de Ramón: SOFI CREDIT CARD llevaba 5 días
  // sin poder cobrarse y no había NINGÚN aviso en ningún lado -- 'insufficient'
  // no deja rastro persistido, así que esto se recalcula fresco cada vez).
  // 15-oct-2026: lo que de verdad falta aquí es dinero en el fondo, no
  // algo que resolver en la deuda -- igual que el botón "Depositar" de la
  // tarjeta roja del Dashboard, lleva directo al fondo/Emergencia
  // correspondiente (mismo deep-link ft_open_fund que ya usa esa tarjeta).
  FT.stuckFundedRecurringDebts().forEach(function (s) {
    var toEmerg = s.fundSource && s.fundSource.type === 'emerg';
    out.push({ icon: '⚠️', tone: 'red', url: toEmerg ? 'emergencia.html' : 'ahorro.html',
      fundId: toEmerg ? null : (s.fundSource && s.fundSource.id),
      text: (es ? 'Abono a ' + _escH(s.debtName) + ' atorado desde el ' + FT.date(s.nextDate) + ' — falta ' : 'Payment to ' + _escH(s.debtName) + ' stuck since ' + FT.date(s.nextDate) + ' — short ') + FT.money(s.shortfall) + (es ? ' en ' : ' in ') + _escH(s.fundLabel) });
  });

  // 4 · Dinero movido hoy a ahorro / emergencia (entradas automáticas)
  var moved = FT.txs().filter(function (t) { return t.date === FT.todayISO() && t.type === 'ahorro' && t.auto; });
  moved.forEach(function (t) {
    var toEmerg = t.cat === '🛡️ Emergencia' || t.dest === 'emergencia';
    out.push({ icon: toEmerg ? '🛡️' : '🏦', tone: 'blue', url: toEmerg ? 'emergencia.html' : 'ahorro.html',
      text: FT.money(t.amount) + (es ? ' movido a ' : ' moved to ') + (toEmerg ? (es ? 'Emergencia' : 'Emergency') : (es ? 'Ahorro libre' : 'Free savings')) });
  });

  // 4b · Aportes recurrentes a metas que no alcanzan en su cuenta (quedan pendientes y se reintentan)
  try {
    FT.recurring().filter(function (r) { return r.kind === 'metapersonal' && r.active !== false && !r.paused && r.nextDate && r.nextDate <= FT.todayISO(); }).forEach(function (r) {
      var g = FT.goals().find(function (x) { return String(x.id) === String(r.goalId); });
      var a = g && ((g.accountId && FT.checking().some(function (x) { return String(x.id) === String(g.accountId); }) ? g.accountId : null) || r.accountId);
      if (!g || !a) return;
      var chk = FT.checkOverdraft(a, r.amount + FT.goalAbsorbNeed(g.id, a));
      if (!chk.ok) { var ac = FT.checking().find(function (x) { return String(x.id) === String(a); }); out.push({ icon: '⏳', tone: 'red', url: 'metas.html', text: (es ? 'Aporte a ' + _escH(g.name) + ' pendiente: faltan ' : 'Deposit to ' + _escH(g.name) + ' pending: short ') + FT.money(chk.shortfall, { cents: true }) + (es ? ' en ' : ' in ') + _escH(ac ? ac.name : '') }); }
    });
  } catch (e) {}

  // 5 · Hogar: dinero sin asignar y cambios de mi pareja (20-oct-2026)
  try {
    FT.hogarUnassigned().forEach(function (u) { out.push({ icon: '💵', tone: 'amber', url: 'hogar.html', text: FT.money(u.monto, { cents: true }) + (es ? ' del hogar sin asignar a ninguna cuenta' : ' of household money not assigned to any account') }); });
    FT.partnerUnassigned().forEach(function (u) { out.push({ icon: '💵', tone: 'amber', url: 'hogar.html', text: FT.money(u.monto, { cents: true }) + (es ? ' de tu pareja sin asignar a ninguna cuenta' : ' of your partner\'s money not assigned to any account') }); });
    FT.hogarNotices().forEach(function (nt) { out.push({ icon: '🏠', tone: 'blue', url: 'hogar.html', text: _escH(nt.by || (es ? 'Tu pareja' : 'Your partner')) + (nt.kind === 'assign' ? (es ? ' asignó un cheque del hogar' : ' assigned a household paycheck') : nt.kind === 'undo' ? (es ? ' deshizo un reparto del hogar' : ' undid a household split') : (es ? ' cambió una regla de reparto' : ' changed a split rule')) }); });
  } catch (e) {}

  return out;
};

/* ─────────────────────────────────────────────────────────────────────────
   6 · PREMIUM
   ───────────────────────────────────────────────────────────────────────── */
FT.getPremiumInfo = function () { return FT.get(K.premium, null); };
FT.getActivePlan = function () {
  try {
    var p = FT.get(K.premium, null);
    if (!p || !p.plan) return 'free';
    if (p.expiresAt && new Date(p.expiresAt) < new Date()) return 'free';
    return String(p.plan).trim().toLowerCase();
  } catch (e) { return 'free'; }
};
FT.isPremium = function () { return FT.getActivePlan() === 'premium'; };
FT.isFree = function () { return FT.getActivePlan() === 'free'; };
FT.savePlan = function (plan, email, expiresAt) {
  FT.set(K.premium, { plan: plan, email: email, activatedAt: new Date().toISOString(), expiresAt: expiresAt || null });
};
FT.clearPlan = function () { FT.del(K.premium); };
var FREE_FEATURES = ['dashboard', 'nuevo_registro', 'historial', 'analisis_basico', 'emergencia', 'metas_basico', 'suscripciones_basico', 'voz', 'atajos', 'csv_import', 'deudas_simple'];
FT.canUse = function (feature) { return FREE_FEATURES.indexOf(feature) > -1 || FT.isPremium(); };

FT.checkAccess = function (email) {
  var url = GAS_URL + '?action=checkAccess&email=' + encodeURIComponent((email || '').trim());
  return (function attempt(n) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('GAS ' + r.status); return r.json(); })
      .catch(function (err) {
        if (n < 1) return new Promise(function (res) { setTimeout(res, 800); }).then(function () { return attempt(n + 1); });
        // 2 intentos fallidos → mantener premium local vigente
        try {
          var c = FT.get(K.premium, {}) || {};
          var plan = c.plan ? String(c.plan).trim().toLowerCase() : '';
          var vig = !c.expiresAt || new Date(c.expiresAt) > new Date();
          if (plan === 'premium' && vig) return { access: true, plan: c.plan, expiresAt: c.expiresAt || null };
        } catch (e) {}
        return { access: true, plan: 'free', expiresAt: null };
      });
  })(0);
};

/* ─────────────────────────────────────────────────────────────────────────
   7 · CRÉDITOS IA
   ───────────────────────────────────────────────────────────────────────── */
FT.getCredits = function () {
  var c = FT.get(K.aiCredits, {}) || {};
  var mo = new Date().toISOString().slice(0, 7);
  if (c.month !== mo) { c = { used: 0, month: mo, extra: c.extra || 0 }; FT.set(K.aiCredits, c); }
  return c;
};
/** Los créditos mensuales son exclusivos de Premium; los extra (comprados/canjeados)
 *  se conservan aunque el plan caduque, pero sin Premium no se pueden gastar. */
FT.creditsLeft = function () {
  if (!FT.isPremium()) return 0;
  var c = FT.getCredits();
  return Math.max(0, MAX_AI_PREMIUM - (c.used || 0)) + (c.extra || 0);
};
/** Consume primero la cuota mensual; solo toca los créditos extra cuando esa
 *  cuota ya se agotó — así los extra sí se gastan (antes nunca bajaban, se
 *  "regeneraban" solos cada mes al resetear `used`). */
FT.useCredit = function () {
  var c = FT.getCredits();
  var mensualLeft = Math.max(0, MAX_AI_PREMIUM - (c.used || 0));
  if (mensualLeft > 0) c.used = (c.used || 0) + 1;
  else if ((c.extra || 0) > 0) c.extra = c.extra - 1;
  FT.set(K.aiCredits, c);
  return FT.creditsLeft();
};
FT.addExtraCredits = function (n) { var c = FT.getCredits(); c.extra = (c.extra || 0) + (parseInt(n, 10) || 0); FT.set(K.aiCredits, c); return FT.creditsLeft(); };
FT.redeemCode = function (code) {
  code = String(code || '').trim().toUpperCase();
  var m = code.match(/^FZ(5|15)-[A-Z0-9]{3,}$/);
  if (!m) return { ok: false, msg: FT.lang === 'es' ? 'Código inválido' : 'Invalid code' };
  var used = FT.get(K.usedCodes, []) || [];
  if (used.indexOf(code) > -1) return { ok: false, msg: FT.lang === 'es' ? 'Este código ya se usó en este dispositivo' : 'This code was already used on this device' };
  var add = m[1] === '15' ? 15 : 5;
  used.push(code); FT.set(K.usedCodes, used);
  FT.addExtraCredits(add);
  return { ok: true, added: add, left: FT.creditsLeft() };
};

/* ─────────────────────────────────────────────────────────────────────────
   8 · GOOGLE APPS SCRIPT
   ───────────────────────────────────────────────────────────────────────── */
FT.gas = function (action, params) {
  var qs = Object.keys(params || {}).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
  return fetch(GAS_URL + '?action=' + action + (qs ? '&' + qs : '')).then(function (r) { return r.json(); });
};
FT.getPartnerProfile = function (email) { return FT.gas('getProfile', { email: email }); };
FT.createInvite = function (email, name, code) { return FT.gas('createInvite', { email: email, name: name || '', code: code }); };
FT.acceptInvite = function (code, email, name) { return FT.gas('acceptInvite', { code: code, email: email, name: name || '' }); };
FT.checkPartner = function (email) { return FT.gas('checkPartner', { email: email }); };
FT.getHogarTxs = function (email) { return FT.gas('getHogarTxs', { email: email }); };

function _mergeById(oldArr, newArr) {
  var by = {};
  (oldArr || []).forEach(function (x) { if (x && x.id != null) by[x.id] = x; });
  (newArr || []).forEach(function (x) { if (x && x.id != null) by[x.id] = x; });
  return Object.keys(by).map(function (k) { return by[k]; });
}
function _histKeyOf(h) { return h.id != null ? ('id:' + h.id) : ('k:' + h.monto + '|' + h.fecha + '|' + !!h.desdePres); }
function _mergeHistByKey(a, b) {
  var byKey = {};
  (a || []).forEach(function (h) { byKey[_histKeyOf(h)] = h; });
  (b || []).forEach(function (h) { byKey[_histKeyOf(h)] = h; });
  return Object.keys(byKey).map(function (k) { return byKey[k]; });
}
/** Fusiona el fondo de emergencia + metas compartidas del hogar (por id, con sus
 *  depósitos fusionados) — lo que sube mi pareja combinado con lo que ya tenía yo. */
function _mergeFondosInto(myFondos, partnerFondos) {
  myFondos = myFondos || FT.hogarFondos();
  if (!partnerFondos) return myFondos;
  var emergHist = _mergeHistByKey(myFondos.emerg && myFondos.emerg.hist, partnerFondos.emerg && partnerFondos.emerg.hist);
  var emerg = {
    meta: (myFondos.emerg && myFondos.emerg.meta) || (partnerFondos.emerg && partnerFondos.emerg.meta) || 0,
    fecha: (myFondos.emerg && myFondos.emerg.fecha) || (partnerFondos.emerg && partnerFondos.emerg.fecha) || '',
    hist: emergHist,
    foreign: ((parseFloat(myFondos.emerg && myFondos.emerg.foreign) || 0) + Math.max(0, emergHist.reduce(function (a, h) { return a + (h.monto || 0); }, 0) - ((myFondos.emerg && myFondos.emerg.hist) || []).reduce(function (a, h) { return a + (h.monto || 0); }, 0))) || undefined,
    actual: emergHist.reduce(function (a, h) { return a + (h.monto || 0); }, 0),
    accountId: (myFondos.emerg && myFondos.emerg.accountId) || null,   // el apartado es de MI cuenta: nunca se toma del otro lado
    vaultLog: (myFondos.emerg && myFondos.emerg.vaultLog) || undefined
  };
  var metasById = {};
  (myFondos.metas || []).forEach(function (m) { if (m && m.id != null) metasById[m.id] = Object.assign({}, m); });
  var partnerMetaIds = {};
  (partnerFondos.metas || []).forEach(function (m) {
    if (!m || m.id == null) return;
    partnerMetaIds[String(m.id)] = true;
    if (metasById[m.id]) {
      // Ya la tenía (mía, o ya fusionada antes) -- se conserva la etiqueta
      // _fromPartner que YA tenía en vez de forzarla a true. Si no, una meta
      // que yo mismo creé y que mi pareja simplemente recibe de vuelta por
      // sync quedaba marcada como ajena, y la poda de abajo podía borrarla
      // (encontrado por revisión independiente).
      var mine = metasById[m.id], hist = _mergeHistByKey(mine.hist, m.hist);
      var sumH = function (l) { return (l || []).reduce(function (a, h) { return a + (h.monto || 0); }, 0); };
      // `foreign`: lo que llegó de mi pareja y NO salió de mi cuenta; no se acredita al soltar/desvincular.
      var foreign = (parseFloat(mine.foreign) || 0) + Math.max(0, sumH(hist) - sumH(mine.hist));
      metasById[m.id] = Object.assign({}, mine, m, { foreign: foreign || undefined, nombre: mine.nombre || m.nombre, hist: hist, actual: hist.reduce(function (a, h) { return a + (h.monto || 0); }, 0), _fromPartner: mine._fromPartner, accountId: mine.accountId || null, vaultLog: mine.vaultLog });
    } else metasById[m.id] = Object.assign({}, m, { _fromPartner: true, accountId: null, vaultLog: undefined, foreign: undefined });
  });
  // Igual que deudas/recurrentes/servicios: si `partnerFondos` trae `metas`
  // (aunque sea vacío -- es la lista completa y actual de mi pareja, no un
  // delta), una meta que solo tengo por _fromPartner y que ya no está ahí
  // se quita también de mi lado. Nunca se toca una meta que YO creé.
  var metasOut = Object.keys(metasById).map(function (k) { return metasById[k]; });
  if (Array.isArray(partnerFondos.metas)) {
    metasOut = metasOut.filter(function (m) {
      var drop = m._fromPartner && !partnerMetaIds[String(m.id)];
      var back = Math.max(0, (parseFloat(m.actual) || 0) - (parseFloat(m.foreign) || 0));
      if (drop && m.accountId && back) { try { FT.creditChecking(m.accountId, back); } catch (e) {} } // libera el apartado antes de soltar la meta
      return !drop;
    });
  }
  return { emerg: emerg, metas: metasOut };
}
/** Fusiona las deudas que mi pareja marcó como compartidas dentro de MI ft_debts
 *  (abonos por id, balance recalculado desde original − Σabonos) — para que
 *  aparezcan completas en Deudas y pueda abonar/crear recurrentes, no solo verlas. */
function _mergeSharedDebtsIntoMine(partnerSharedDebts) {
  partnerSharedDebts = partnerSharedDebts || [];
  var myDebts = FT.debts();
  partnerSharedDebts.forEach(function (pd) {
    var idx = myDebts.findIndex(function (d) { return String(d.id) === String(pd.id); });
    if (idx < 0) { myDebts.push(Object.assign({}, pd, { owner: 'both', _fromPartner: true })); return; }
    var mine = myDebts[idx], byId = {};
    // Un abono AUTOMÁTICO (recId presente) se identifica por fecha+recId, no
    // por su "id" -- ese id es un Date.now() generado por cada dispositivo,
    // así que el mismo pago recurrente aplicado por error en ambos lados
    // (la carrera que _applyRecDebt ahora intenta evitar, pero que igual
    // puede pasar si la red tarda más que el margen de espera en el boot)
    // tenía dos ids distintos y por eso NUNCA se fusionaba en uno solo --
    // se sumaban los dos al balance y la deuda quedaba con un pago de más
    // descontado. Un abono MANUAL (sin recId) sí se identifica por su id,
    // como antes, porque dos abonos manuales el mismo día son válidos y
    // distintos.
    function abKey(a) { return a.recId ? ('rec:' + a.fecha + '|' + a.recId) : ('id:' + a.id); }
    (mine.abonos || []).forEach(function (a) { if (a && a.id != null) byId[abKey(a)] = a; });
    (pd.abonos || []).forEach(function (a) { if (a && a.id != null) byId[abKey(a)] = a; });
    var abonos = Object.keys(byId).map(function (k) { return byId[k]; });
    var original = mine.original || pd.original || mine.balance;
    myDebts[idx] = Object.assign({}, mine, { owner: 'both', abonos: abonos, original: original, balance: Math.max(0, original - abonos.reduce(function (a, x) { return a + (parseFloat(x.monto) || 0); }, 0)) });
  });
  // Reconciliar borrados: si una deuda que YO solo conozco porque mi pareja
  // la compartió (_fromPartner) ya no viene en su snapshot mas reciente, es
  // porque ella la borro o la volvio personal -- hay que quitarla tambien de
  // mi lado. Nunca se borra una deuda que YO cree (sin _fromPartner), aunque
  // hoy no venga en su lista -- esa siempre es mia y punto.
  var partnerIds = {}; partnerSharedDebts.forEach(function (pd) { partnerIds[String(pd.id)] = true; });
  myDebts = myDebts.filter(function (d) { return !(d._fromPartner && d.owner === 'both' && !partnerIds[String(d.id)]); });
  FT.saveDebts(myDebts);
}
/** Fusiona recurrentes de deuda compartida — sin pisar mi copia si ya avanzó más
 *  su nextDate (evita duplicar un pago que aquí ya se aplicó). */
function _mergeSharedRecurringIntoMine(partnerSharedRecurring) {
  // Defensa adicional (FT.pushProfileToGAS ya no sube nada con fundSource,
  // pero una caché vieja en GAS de antes de ese fix podría seguir
  // trayéndolo) -- un recurrente con fondo/Emergencia como origen es
  // siempre privado del dispositivo que lo creó, nunca debe fusionarse.
  partnerSharedRecurring = (partnerSharedRecurring || []).filter(function (r) { return !r.fundSource; });
  var mine = FT.recurring(), byId = {};
  mine.forEach(function (r) { byId[r.id] = r; });
  var partnerIds = {};
  partnerSharedRecurring.forEach(function (r) {
    partnerIds[String(r.id)] = true;
    var m = byId[r.id];
    // Solo se etiqueta _fromPartner en la rama "nunca lo tenía" -- si ya
    // existía localmente (mío o ya fusionado antes), se conserva la
    // etiqueta que ya tenía en vez de forzarla, para que un recurrente que
    // YO creé nunca pueda terminar marcado como ajeno y quedar elegible
    // para podarse después (encontrado por revisión independiente).
    if (!m) { byId[r.id] = Object.assign({}, r, { _fromPartner: true }); return; }
    if (m.nextDate && r.nextDate && r.nextDate > m.nextDate) { byId[r.id] = Object.assign({}, r, { _fromPartner: m._fromPartner }); }
  });
  // Mismo criterio que las deudas: un recurrente de deuda compartida que solo
  // conozco porque mi pareja lo trajo, y que ya no viene en su snapshot mas
  // reciente (lo borro, lo pauso y elimino, o pago la deuda), se quita de mi
  // lado tambien -- nunca se toca un recurrente que yo mismo cree.
  var all = Object.keys(byId).map(function (k) { return byId[k]; })
    .filter(function (r) { return !(r._fromPartner && r.kind === 'debt' && !partnerIds[String(r.id)]); });
  FT.set(K.recurring, all);
}
/** Trae el perfil de mi pareja y lo combina con el mío en todo lo compartido —
 *  no solo la caché de "profile_<email>", también mis propias claves (fondos,
 *  deudas compartidas, recurrentes de esas deudas, servicios, cuenta conjunta)
 *  para que cualquier pantalla —no solo Hogar— quede al día. */
/** Devuelve el Promise del fetch (antes no se regresaba nada -- boot() lo
 *  necesita para poder correr FT.runAutomations() otra vez YA con la caché
 *  de la pareja fresca, en vez de solo con lo que hubiera quedado de la
 *  sesión anterior; ver el comentario en FT.boot). */
FT.syncPartner = function () {
  try {
    var h = FT.hogar();
    if (!h.connected || !h.partnerEmail || h.manuallyLeft) return Promise.resolve();
    var pkey = 'profile_' + h.partnerEmail.replace(/[^a-z0-9]/gi, '_');
    return FT.getPartnerProfile(h.partnerEmail).then(function (data) {
      if (!data || !data.success) return;
      var nd = {}; try { nd = JSON.parse(data.dataJson || '{}'); } catch (e) {}
      var old = FT.get(pkey, null); var od = (old && old.data) || {};
      // OJO: sharedDebts/hogarInv representan el estado ACTUAL de mi pareja (su
      // push manda su lista completa cada vez, no un delta) -- unirlas con la
      // caché vieja vía _mergeById (que nunca quita nada) hacía que una deuda
      // ya borrada del lado de mi pareja se quedara para siempre en esta
      // caché, aunque _mergeSharedDebtsIntoMine ya la hubiera podado de
      // ft_debts -- resultado: la sección "de solo lectura" en Hogar seguía
      // mostrando deudas fantasma que ya no existían en ningún lado real.
      // Aquí SÍ se reemplaza en vez de acumular.
      // transactions es distinto: pushMyProfileToGAS SOLO manda el mes en
      // curso (limited.transactions), no el historial completo -- reemplazar
      // todo con nd.transactions borraría meses anteriores en cuanto cambie
      // el mes. Se reemplaza SOLO la ventana del mes en curso (ahí sí se
      // respeta un borrado del lado de la pareja) y se conserva intacto el
      // resto de meses ya cacheados.
      var thisMonthKey = FT.todayISO().slice(0, 7);
      // 19-oct-2026 (privacidad): también se depura lo ya cacheado de meses
      // anteriores -- versiones viejas subían TODOS los ingresos personales;
      // solo se conserva lo que la pareja puede ver (hogar y cheques).
      var oldOtherMonths = (od.transactions || []).filter(function (t) { return String(t.date || '').slice(0, 7) !== thisMonthKey && (t.hogar === true || t.isHogar || (t.type === 'ingreso' && t.incomeKind === 'cheque')); });
      var merged = {
        transactions: oldOtherMonths.concat((nd.transactions || []).filter(function (t) { return t && (t.hogar === true || t.isHogar === true || (t.type === 'ingreso' && t.incomeKind === 'cheque')); })), // filtrar también al recibir: un cliente viejo subía todo
        emergency: (nd.emergency != null ? nd.emergency : od.emergency) || 0,
        personalSpentThisMonth: (nd.personalSpentThisMonth != null ? nd.personalSpentThisMonth : od.personalSpentThisMonth) || 0,
        subscriptions: _mergeById(od.subscriptions, nd.subscriptions),
        sharedDebts: nd.sharedDebts != null ? nd.sharedDebts : (od.sharedDebts || []),
        hogarInv: nd.hogarInv != null ? nd.hogarInv : (od.hogarInv || []),
        hogarReview: nd.hogarReview !== undefined ? nd.hogarReview : (od.hogarReview || null),
        sinAsignar: nd.sinAsignar !== undefined ? nd.sinAsignar : (od.sinAsignar || []),
        hogarEdits: nd.hogarEdits !== undefined ? nd.hogarEdits : (od.hogarEdits || []),
        hogarAck: nd.hogarAck !== undefined ? nd.hogarAck : (od.hogarAck || [])
      };
      var pp = { name: data.name || (old && old.name) || '', email: data.email || h.partnerEmail, income: parseFloat(data.income) || 0, needs: parseFloat(data.needs) || 0, wants: parseFloat(data.wants) || 0, savings: parseFloat(data.savings) || 0, data: merged };
      FT.set(pkey, pp);
      FT.set(K.profileB, pp);
      // Cambios que mi pareja hizo a lo MÍO del hogar (asignar un cheque, una regla...): se aplican aquí.
      try { FT.processIncomingEdits(merged.hogarEdits); } catch (e) {}

      if (nd.fondos) { try { FT.saveHogarFondos(_mergeFondosInto(FT.hogarFondos(), nd.fondos)); } catch (e) {} }
      if (nd.sharedDebts) { try { _mergeSharedDebtsIntoMine(nd.sharedDebts); } catch (e) {} }
      if (nd.sharedRecurring) { try { _mergeSharedRecurringIntoMine(nd.sharedRecurring); } catch (e) {} }
      if (nd.servicios) {
        // Por id, NUNCA concat crudo: pushProfileToGAS manda TODO mi
        // ft_servicios sin filtrar (incluye lo que ya traigo _fromPartner),
        // así que un concat sin dedup iba a duplicarse solo -- yo le mando a
        // mi pareja su propio servicio de vuelta, ella lo vuelve a agregar
        // como si fuera nuevo, y crece con cada sync. Por id evita eso pase
        // lo que pase del otro lado.
        try {
          var byIdServ = {};
          FT.servicios().filter(function (s) { return !s._fromPartner; }).forEach(function (s) { byIdServ[s.id] = s; });
          nd.servicios.forEach(function (s) { if (!byIdServ[s.id]) byIdServ[s.id] = Object.assign({}, s, { _fromPartner: true }); });
          FT.saveServicios(Object.keys(byIdServ).map(function (k) { return byIdServ[k]; }));
        } catch (e) {}
      }
      if (nd.checking) { try { FT.set(K.partnerChecking, (Array.isArray(nd.checking) ? nd.checking : [nd.checking]).filter(function (c) { return c && c.hogar; })); } catch (e) {} }

      FT._changed();
    }).catch(function () {});
  } catch (e) {}
};

/** Sube mi perfil (deudas/recurrentes/fondos compartidos, etc.) a GAS para que
 *  mi pareja lo lea en su próximo FT.syncPartner(). Antes esto SOLO vivía en
 *  hogar.html y SOLO se disparaba al abrir esa pantalla -- si yo pagaba o
 *  borraba una deuda compartida desde Deudas y nunca volvía a abrir Hogar,
 *  el snapshot en GAS se quedaba viejo para siempre, y mi pareja seguía
 *  jalando esa deuda ya borrada en cada uno de sus syncs (la causa real de
 *  que un abono/deuda "resucite" del lado de la pareja, sin importar cuántas
 *  veces se borre localmente). Ahora es una función compartida que corre
 *  sola cada vez que algo cambia (ver el listener de ft:datachanged en boot). */
FT.pushProfileToGAS = function () {
  try {
    var u = FT.user(), hogar = FT.hogar();
    if (!hogar.connected || !u.email || hogar.manuallyLeft) return;
    var data = FT.data();
    var myDebts = FT.debts();
    var sharedDebts = myDebts.filter(function (d) { return d.owner === 'both' || d.type === 'hipoteca' || d.type === 'hogar'; })
      .map(function (d) { return { id: d.id, name: d.name, balance: d.balance, original: d.original, type: d.type, payment: d.payment, payDay: d.payDay, owner: d.owner, abonos: (d.abonos || []).slice(-30), updatedAt: d.updatedAt }; });
    var sharedDebtIds = {}; sharedDebts.forEach(function (d) { sharedDebtIds[String(d.id)] = true; });
    // Revisión independiente (03-oct-2026, abono recurrente desde fondo):
    // esta deuda puede empezar PERSONAL con un recurrente que saca de mi
    // fondo/Emergencia privado, y luego pasar a "compartida" con un simple
    // cambio en Editar deuda -- sin el filtro `!r.fundSource`, este bloque
    // la subiría igual (ya solo mira `sharedDebtIds`, no de dónde sale el
    // dinero), y la pareja la fusionaría y la correría sola contra SU PROPIO
    // fondo/Emergencia (son siempre locales por dispositivo, nunca por
    // usuario) -- plata ajena desapareciendo sin que ella lo supiera.
    var sharedRecurring = FT.recurring().filter(function (r) { return r.kind === 'debt' && sharedDebtIds[String(r.debtId)] && !r.fundSource; });
    var hogarInv = FT.investments('hogar');
    var thisMonth = FT.todayISO().slice(0, 7);
    var personalSpentThisMonth = (data.transactions || []).filter(function (t) { return String(t.date || '').startsWith(thisMonth) && t.hogar !== true && (t.type === 'gasto' || t.type === 'suscripcion' || t.type === 'hipoteca'); })
      .reduce(function (a, t) { return a + (parseFloat(t.amount) || 0); }, 0);
    // 19-oct-2026, a petición de Ramón: la pareja solo puede ver lo que entra
    // al hogar -- nada personal. Antes se subían TODOS los ingresos del mes
    // (extra, cobertura, dividendos), TODAS las cuentas de cheques (incluidas
    // las personales, con nombre y saldo), el fondo de Emergencia y el total
    // personal gastado. Ahora solo: gastos del hogar, cheques (necesarios para
    // el reparto por %), y cuentas marcadas hogar. Emergencia y gasto
    // personal se mandan en 0 a propósito: así sobrescriben cualquier valor
    // viejo que ya hubiera quedado guardado en el dispositivo de tu pareja.
    var limited = {
      transactions: (data.transactions || []).filter(function (t) { return !FT.isPending(t) && String(t.date || '').startsWith(thisMonth) && (t.hogar === true || (t.type === 'ingreso' && t.incomeKind === 'cheque')); }),
      emergency: 0,
      subscriptions: (data.subscriptions || []).filter(function (s) { return s && s.hogar === true; }).slice(-10),
      sharedDebts: sharedDebts.slice(-20),
      hogarInv: hogarInv.slice(-20),
      fondos: (function () {
        var f = FT.hogarFondos();   // sin accountId/vaultLog: son de MIS cuentas y no deben viajar al otro teléfono
        return { emerg: Object.assign({}, f.emerg, { accountId: undefined, vaultLog: undefined, foreign: undefined }),
          metas: (f.metas || []).map(function (m) { return Object.assign({}, m, { accountId: undefined, vaultLog: undefined, foreign: undefined }); }) };
      })(),
      personalSpentThisMonth: 0,
      sharedRecurring: sharedRecurring,
      servicios: FT.servicios().filter(function (s) { return !s._fromPartner; }).slice(-20), // nunca le hago eco a mi pareja de sus propios servicios
      checking: FT.checking().filter(function (c) { return c.hogar; }),
      hogarReview: FT.hogar().myReview || null, // mi respuesta a lo que mi pareja configuró del hogar (ver hogar.html)
      sinAsignar: FT.hogarUnassigned(), // parte del hogar de mis cheques que aún no está en ninguna cuenta
      hogarEdits: FT.hogarEditsOut(), // cambios que hice a lo del hogar de mi pareja (solo hogar)
      hogarAck: FT.hogarAckOut() // qué pasó con los cambios que ella me mandó
    };
    var params = new URLSearchParams({ action: 'saveProfile', email: u.email, name: u.name || '', income: u.income || 0, needs: 0, wants: 0, savings: 0, dataJson: JSON.stringify(limited) }); // needs/wants/savings personales ya no se suben (nadie los usa del otro lado)
    fetch(FT.GAS_URL + '?' + params.toString()).catch(function () {});
  } catch (e) {}
};
(function () {
  var t = null;
  document.addEventListener('ft:datachanged', function () {
    clearTimeout(t);
    t = setTimeout(function () { FT.pushProfileToGAS(); }, 2500); // debounce -- no un fetch por cada tecla
  });
})();
/** Recordatorios por correo (15-oct-2026, a petición de Ramón: "mandar un
 *  email que diga qué pago se viene, cuándo, y el monto, 1-2 días antes" +
 *  "que no dependa de abrir la app"). Esta app no tiene servidor propio --
 *  el único backend capaz de correr SIN que abras la app es tu Google
 *  Apps Script (ya usado para saveProfile/sync de hogar). Esta función
 *  solo junta y SUBE la lista (acción `saveReminders`, nueva, aparte de
 *  `saveProfile` -- nunca se mezcla con el perfil que comparte tu
 *  pareja); quien de verdad revisa fechas y manda el correo es un trigger
 *  de tiempo en el lado de GAS (código y pasos para activarlo, fuera de
 *  este repo, entregados aparte a Ramón). A diferencia de
 *  FT.pushProfileToGAS, esto NO depende de tener hogar conectado --
 *  cualquier cuenta con correo debe poder recibir sus propios
 *  recordatorios, tenga pareja o no.
 *
 *  Horizonte de 90 días / hasta 12 ocurrencias por recurrente (lo que
 *  llegue primero), no solo la próxima fecha -- así el trigger diario de
 *  GAS tiene margen de sobra para avisar semanas o meses sin que vuelvas
 *  a abrir la app antes de cada vencimiento puntual. No es 100%
 *  independiente para siempre (la lista sigue viniendo de este
 *  dispositivo, no hay otro lugar que la genere) -- pero mientras abras
 *  la app al menos una vez dentro de esos 90 días, el trigger ya tiene
 *  todo lo que necesita sin depender de que coincida justo con la fecha
 *  de cada pago.
 */
FT.pushReminders = function () {
  try {
    var u = FT.user();
    if (!u || !u.email) return;
    var items = [], horizon = new Date(); horizon.setDate(horizon.getDate() + 90);
    (FT.recurAllList() || []).filter(function (i) { return !i.paused && i.nextDate; }).forEach(function (i) {
      var d = new Date(i.nextDate + 'T00:00:00'), guard = 0;
      while (d <= horizon && guard < 12) {
        items.push({ name: i.name, amount: i.amount, dueDate: FT.date(d, 'ISO'), autopay: !!i.autopay });
        FT.advanceByFreq(d, i.freq);
        guard++;
      }
    });
    var params = new URLSearchParams({ action: 'saveReminders', email: u.email, dataJson: JSON.stringify(items) });
    fetch(FT.GAS_URL + '?' + params.toString()).catch(function () {});
  } catch (e) {}
};
(function () {
  var t = null;
  document.addEventListener('ft:datachanged', function () {
    clearTimeout(t);
    t = setTimeout(function () { FT.pushReminders(); }, 2500);
  });
})();

/* ─────────────────────────────────────────────────────────────────────────
   9 · i18n
   ───────────────────────────────────────────────────────────────────────── */
FT.lang = 'es';
var I18N = {
  es: {
    home: 'Inicio', history: 'Historial', household: 'Hogar', more: 'Más',
    save: 'Guardar', cancel: 'Cancelar', delete: 'Eliminar', edit: 'Editar', close: 'Cerrar', confirm: 'Confirmar',
    help: 'Ayuda', logout: 'Cerrar sesión', language: 'Idioma',
    automations_done: 'Movimientos automáticos al día',
    money_group_your: 'Tu dinero', money_group_debts: 'Deudas y pagos', money_group_input: 'Entrada de datos',
    money_group_analysis: 'Análisis', money_group_account: 'Cuenta',
    l_ahorro: 'Ahorro libre', l_emergencia: 'Fondo de emergencia', l_inversiones: 'Inversiones', l_metas: 'Metas', l_midinero: 'Mi dinero',
    l_deudas: 'Deudas', l_suscripciones: 'Suscripciones', l_servicios: 'Servicios', l_recurrentes: 'Recurrentes',
    l_scanner: 'Escanear recibo', l_importar: 'Importar', l_analisis: 'Análisis', l_reporte: 'Reporte mensual',
    l_asistente: 'Asistente IA',
    l_perfil: 'Mi perfil', l_config: 'Configuración', l_saldos: 'Saldos iniciales',
    notif_title: 'Notificaciones', notif_empty: 'Nada pendiente por ahora'
  },
  en: {
    home: 'Home', history: 'History', household: 'Household', more: 'More',
    save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit', close: 'Close', confirm: 'Confirm',
    help: 'Help', logout: 'Log out', language: 'Language',
    automations_done: 'Automatic entries caught up',
    money_group_your: 'Your money', money_group_debts: 'Debts & payments', money_group_input: 'Data entry',
    money_group_analysis: 'Analysis', money_group_account: 'Account',
    l_ahorro: 'Free savings', l_emergencia: 'Emergency fund', l_inversiones: 'Investments', l_metas: 'Goals', l_midinero: 'My money',
    l_deudas: 'Debts', l_suscripciones: 'Subscriptions', l_servicios: 'Utilities', l_recurrentes: 'Recurring',
    l_scanner: 'Scan receipt', l_importar: 'Import', l_analisis: 'Analysis', l_reporte: 'Monthly report',
    l_asistente: 'AI Assistant',
    l_perfil: 'My profile', l_config: 'Settings', l_saldos: 'Starting balances',
    notif_title: 'Notifications', notif_empty: 'Nothing pending for now'
  }
};
FT.t = function (key) { return (I18N[FT.lang] && I18N[FT.lang][key]) || (I18N.es[key]) || key; };
FT.setLang = function (l) {
  FT.lang = (l === 'en') ? 'en' : 'es';
  FT.setRaw(K.lang, FT.lang);
  FT.applyLang(document);
  try { document.dispatchEvent(new CustomEvent('ft:langchange', { detail: FT.lang })); } catch (e) {}
};
FT.applyLang = function (root) {
  root = root || document;
  root.querySelectorAll('[data-es]').forEach(function (el) {
    var v = el.getAttribute('data-' + FT.lang); if (v != null) el.textContent = v;
  });
  root.querySelectorAll('[data-es-ph]').forEach(function (el) {
    var v = el.getAttribute('data-' + FT.lang + '-ph'); if (v != null) el.setAttribute('placeholder', v);
  });
};

/* ─────────────────────────────────────────────────────────────────────────
   10 · SISTEMA DE DISEÑO — inyección de <style id="ft-ds"> (look v3)
   ───────────────────────────────────────────────────────────────────────── */
var DS_CSS = `
:root{
  --g-dark:#0F5132; --g-main:#1A7A4A; --g-light:#E8F7EF;
  --ink:#111318; --text2:#5A5F6E; --text3:#A0A3AF;
  --chip:#F3F3F5; --hair:#EBECEF; --sunk:#F6F7F8; --white:#fff;
  --red:#E14B4F; --red-dim:#FCECEC; --amber:#E0952E; --blue:#4361E0; --purple:#7B5EA7;
  --round-font:'Nunito',-apple-system,'SF Pro Rounded',sans-serif;
  --ui-font:'Plus Jakarta Sans',-apple-system,'Segoe UI',sans-serif;
  --tag-bg:#F0F0F2;
  --peach-bg:#FCE6D2; --peach-tx:#C67B3B; --pink-bg:#FACDDF; --pink-tx:#BF4677;
  --coral-bg:#FAD4C9; --coral-tx:#CC5C41; --sky-bg:#D9EBF8; --sky-tx:#387CB0;
  --mint-bg:#DDF1E5; --mint-tx:#2C8A56;
  --ft-appw:480px;
}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;}
body{font-family:var(--ui-font);background:#EDEEF1;color:var(--ink);-webkit-text-size-adjust:100%;}
body.ft-ready .ft-app{background:var(--white);}
.ft-app{max-width:var(--ft-appw);margin:0 auto;background:var(--white);min-height:100vh;position:relative;box-shadow:0 0 0 1px rgba(20,20,30,.04);}
.ft-page{padding:22px 18px 104px;}
.ft-num{font-family:var(--round-font);font-weight:900;font-variant-numeric:tabular-nums;letter-spacing:-.4px;}
input,select,textarea{font-size:16px;font-family:var(--ui-font);}
.tap{transition:transform .16s ease;}
.tap:active{transform:scale(.95);}
button{font-family:var(--ui-font);}

/* HEADER (§4.5) */
.ft-header{display:flex;align-items:center;justify-content:space-between;padding:6px 2px 20px;}
.ft-title{font-family:var(--ui-font);font-size:15.5px;font-weight:800;color:var(--ink);display:inline-flex;align-items:center;gap:6px;background:none;border:none;cursor:pointer;padding:0;}
.ft-title .car{color:var(--text3);font-size:12px;}
.ft-head-actions{display:flex;gap:9px;align-items:center;}
.ft-ico{width:36px;height:36px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;font-size:15px;cursor:pointer;background:var(--chip);color:var(--text2);border:none;position:relative;}
.ft-ico .ft-dot{position:absolute;top:6px;right:7px;width:7px;height:7px;border-radius:50%;background:var(--red);border:1.5px solid #fff;}
.ft-monthpick{display:inline-flex;align-items:center;gap:9px;padding:6px 11px;border-radius:99px;background:var(--chip);font-size:12.5px;}
.ft-monthpick b{font-family:var(--round-font);font-weight:800;letter-spacing:-.3px;}
/* Bug real de QA (B7): las flechas eran texto plano de 12.5px, sin
   retroalimentación táctil (sin la clase .tap que sí tiene todo lo demás
   clicleable) y con área de toque muy por debajo de lo usable en un dedo
   real -- por eso "no respondían" aunque el listener estuviera bien
   conectado. Ahora tienen tamaño mínimo de toque y la misma animación de
   presión que el resto de los botones de la app. */
.ft-monthpick span{color:var(--text3);cursor:pointer;padding:8px 10px;margin:-8px 0;min-width:20px;text-align:center;font-size:15px;border-radius:8px;}
.ft-monthpick span:active{background:rgba(0,0,0,.08);}

/* HERO (§4.6) */
.ft-hero{text-align:center;margin-bottom:6px;}
.ft-hero .cap{font-size:12px;font-weight:700;color:var(--text3);letter-spacing:.3px;}
.ft-hero .row{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:6px;}
.ft-sign{width:24px;height:24px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;color:#fff;font-size:15px;font-weight:900;line-height:1;}
.ft-sign.neg{background:var(--red);}.ft-sign.pos{background:var(--g-main);}
.ft-hero .amt{font-family:var(--round-font);font-weight:900;font-size:47px;letter-spacing:-1.8px;color:var(--ink);font-variant-numeric:tabular-nums;line-height:1;}
.ft-info{width:14px;height:14px;border-radius:50%;border:1px solid var(--text3);color:var(--text3);font-size:9px;font-weight:900;display:inline-grid;place-items:center;opacity:.55;vertical-align:middle;}
.ft-chev{color:var(--text3);font-weight:900;font-size:12px;}
/* N6 (2026-09-26): el "$" pasó de sufijo a prefijo -- dos revisores
   independientes señalaron que ver "3.290$" (símbolo DESPUÉS del número)
   junto a el resto de la app, que siempre pone "$" antes, se leía como un
   tercer formato roto más, aunque nunca fue un descuido (diseño original a
   propósito para el número grande del hero). El número grande sin
   centavos se conserva -- eso sí es un patrón válido para una cifra
   "de un vistazo"; lo que se corrige es solo la posición del símbolo. */
.ft-hero .amt .cur{font-size:.44em;letter-spacing:0;color:var(--text3);font-weight:800;margin-right:3px;}
.ft-split{display:flex;justify-content:center;gap:9px;margin-top:14px;flex-wrap:wrap;}
.ft-split .chip{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:800;padding:7px 13px;border-radius:99px;background:var(--chip);color:var(--ink);font-variant-numeric:tabular-nums;}
.ft-split .chip .mini{width:17px;height:17px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:11px;font-weight:900;line-height:1;}
.ft-split .chip .mini.neg{background:var(--red);}.ft-split .chip .mini.pos{background:var(--g-main);}

/* CARD (§4.3 → blanco sólido) */
.ft-card{background:var(--white);border:1px solid var(--hair);border-radius:18px;padding:15px 16px;margin-top:22px;box-shadow:0 1px 3px rgba(20,20,30,.035);}
.ft-section{margin-top:24px;}
.ft-section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
.ft-section-head h3{font-size:13.5px;font-weight:800;margin:0;}
.ft-section-head .link{font-size:11.5px;font-weight:800;color:var(--g-main);cursor:pointer;background:none;border:none;}

/* PROGRESO (§5) */
.ft-track{height:9px;border-radius:99px;background:var(--sunk);overflow:hidden;}
.ft-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--g-main),var(--g-dark));width:0;transition:width 1s cubic-bezier(.22,1,.36,1);}

/* TABS (§5) */
.ft-tabs{display:flex;gap:6px;background:var(--sunk);padding:4px;border-radius:13px;margin-bottom:14px;}
.ft-tab{flex:1;text-align:center;padding:8px 6px;border-radius:10px;font-size:12px;font-weight:800;color:var(--text3);cursor:pointer;background:none;border:none;transition:background .2s,color .2s;white-space:nowrap;}
.ft-tab.on{background:#fff;color:var(--ink);box-shadow:0 2px 8px -2px rgba(20,20,30,.14);}
.ft-pane{transition:opacity .25s ease;}
.ft-pane[hidden]{display:none;}

/* BARRAS DE CATEGORÍA (§4.7) */
.ft-catbars{display:flex;gap:10px;align-items:flex-end;height:196px;}
.ft-catcol{flex:1;height:100%;display:flex;align-items:flex-end;position:relative;min-width:0;}
.ft-catbudget{position:absolute;left:0;right:0;bottom:0;border:2px dashed #D9D9DF;border-radius:28px;}
.ft-catfill{position:relative;width:100%;border-radius:28px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;padding:0 4px 14px;min-height:66px;cursor:pointer;}
.ft-catfill .emo{font-size:18px;line-height:1;margin-bottom:3px;}
.ft-catfill .val{font-family:var(--round-font);font-weight:900;font-size:14px;letter-spacing:-.5px;color:var(--ink);}
.ft-catfill .pct{font-size:10px;font-weight:900;}
.ft-catcol.peach .ft-catfill{background:var(--peach-bg);}.ft-catcol.peach .pct{color:var(--peach-tx);}
.ft-catcol.pink .ft-catfill{background:var(--pink-bg);}.ft-catcol.pink .pct{color:var(--pink-tx);}
.ft-catcol.coral .ft-catfill{background:var(--coral-bg);}.ft-catcol.coral .pct{color:var(--coral-tx);}
.ft-catcol.sky .ft-catfill{background:var(--sky-bg);}.ft-catcol.sky .pct{color:var(--sky-tx);}
.ft-catcol.mint .ft-catfill{background:var(--mint-bg);}.ft-catcol.mint .pct{color:var(--mint-tx);}

/* FILA DE TRANSACCIÓN (§4.8) */
.ft-tx{padding:13px 0;border-bottom:1px solid var(--hair);cursor:pointer;}
.ft-tx:last-child{border-bottom:none;}
.ft-tx-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px;}
.ft-pill{background:var(--chip);border-radius:99px;padding:3px 10px;font-size:10.5px;font-weight:800;color:var(--text2);font-variant-numeric:tabular-nums;}
.ft-tx-body{display:flex;align-items:center;gap:12px;}
.ft-tx-ico{width:42px;height:42px;border-radius:13px;flex-shrink:0;display:grid;place-items:center;font-size:17px;}
.ft-tx-ico.peach{background:var(--peach-bg);}.ft-tx-ico.pink{background:var(--pink-bg);}.ft-tx-ico.coral{background:var(--coral-bg);}.ft-tx-ico.sky{background:var(--sky-bg);}.ft-tx-ico.mint{background:var(--mint-bg);}
.ft-tx-main{flex:1;min-width:0;}
.ft-tx-label{font-size:10.5px;font-weight:700;color:var(--text3);letter-spacing:.2px;}
.ft-tx-name{font-family:var(--round-font);font-weight:900;font-size:15px;letter-spacing:-.4px;color:var(--ink);margin:1px 0 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ft-hashtag{display:inline-block;font-size:10.5px;font-weight:700;color:var(--text2);background:var(--tag-bg);padding:2px 8px;border-radius:99px;}
.ft-tx-breakdown{font-size:10.5px;font-weight:800;color:var(--text3);}
.ft-tx-amt{font-family:var(--round-font);font-weight:900;font-size:14.5px;flex-shrink:0;font-variant-numeric:tabular-nums;letter-spacing:-.4px;}
.ft-tx-amt.out{color:var(--ink);}.ft-tx-amt.in{color:var(--g-main);}

/* BOTONES */
.ft-btn{width:100%;border:none;border-radius:14px;padding:12px;cursor:pointer;font-size:13px;font-weight:800;}
.ft-btn-primary{color:#fff;background:linear-gradient(135deg,var(--g-dark),var(--g-main));box-shadow:0 10px 20px -10px rgba(15,81,50,.6);}
.ft-btn-ghost{background:var(--sunk);border:1.5px solid var(--hair);color:var(--ink);}

/* MENÚ INFERIOR (§4.9) */
.ft-nav{position:fixed;left:0;right:0;bottom:0;max-width:var(--ft-appw);margin:0 auto;display:flex;align-items:center;justify-content:space-around;padding:9px 14px calc(9px + env(safe-area-inset-bottom));background:var(--white);border-top:1px solid var(--hair);z-index:80;}
.ft-fab{position:fixed;right:calc(50% - var(--ft-appw)/2 + 18px);bottom:calc(88px + env(safe-area-inset-bottom));width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,var(--g-dark),var(--g-main));display:grid;place-items:center;font-size:23px;box-shadow:0 8px 20px rgba(15,81,50,.35);cursor:pointer;border:none;z-index:60;color:#fff;padding:0;}
@media(max-width:479px){.ft-fab{right:18px;}}
.ft-fab-badge{position:absolute;top:-3px;right:-3px;background:var(--red);color:#fff;font-size:9px;font-weight:800;width:17px;height:17px;border-radius:50%;display:grid;place-items:center;border:2px solid var(--white);}
.ft-nav-item{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:9.5px;font-weight:800;color:var(--text3);cursor:pointer;background:none;border:none;text-decoration:none;}
.ft-nav-item.on{color:var(--g-main);}
.ft-nav-item .i{font-size:19px;line-height:1;}
.ft-nav-plus{width:52px;height:52px;border-radius:50%;margin-top:-24px;flex-shrink:0;display:grid;place-items:center;font-size:26px;color:#fff;cursor:pointer;background:linear-gradient(135deg,var(--g-dark),var(--g-main));box-shadow:0 12px 24px -8px rgba(15,81,50,.6);border:3px solid #fff;}

/* OVERLAYS: modal + hoja inferior — encabezado y pie FIJOS, solo el centro hace scroll */
.ft-overlay{position:fixed;inset:0;background:rgba(15,17,24,.42);z-index:200;display:flex;opacity:0;transition:opacity .2s ease;}
.ft-overlay.on{opacity:1;}
.ft-overlay.center{align-items:flex-end;justify-content:center;}
.ft-overlay.bottom{align-items:flex-end;justify-content:center;}
@media(min-width:560px){.ft-overlay.center{align-items:center;padding:20px;}}

.ft-modal-box{background:var(--white);width:100%;max-width:var(--ft-appw);max-height:92vh;max-height:92dvh;display:flex;flex-direction:column;overflow:hidden;border-radius:22px 22px 0 0;transform:translateY(16px);transition:transform .2s ease;}
.ft-overlay.on .ft-modal-box{transform:translateY(0);}
@media(min-width:560px){.ft-modal-box{width:min(420px,calc(100vw - 32px));border-radius:18px;transform:scale(.96);}.ft-overlay.on .ft-modal-box{transform:scale(1);}}

.ft-sheet-box{background:var(--white);width:100%;max-width:var(--ft-appw);max-height:90vh;max-height:90dvh;display:flex;flex-direction:column;overflow:hidden;border-radius:24px 24px 0 0;transform:translateY(16px);transition:transform .2s ease;}
.ft-overlay.on .ft-sheet-box{transform:translateY(0);}

.ft-sheet-grab{width:38px;height:4px;background:var(--hair);border-radius:99px;margin:10px auto 4px;flex-shrink:0;}
.ft-modal-head{flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:16px 20px 12px;border-bottom:1px solid var(--hair);}
.ft-modal-head h4{font-size:16px;font-weight:800;margin:0;line-height:1.3;}
.ft-modal-head .x{cursor:pointer;font-size:20px;color:var(--text3);background:none;border:none;line-height:1;flex-shrink:0;padding:0 0 0 12px;}
.ft-modal-body,.ft-sheet-body{overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px 20px;flex:1;}
.ft-modal-foot,.ft-sheet-foot{flex-shrink:0;padding:12px 20px calc(14px + env(safe-area-inset-bottom));border-top:1px solid var(--hair);display:flex;flex-direction:column;gap:8px;}
.ft-sheet-box > .ft-modal-head{border-bottom:1px solid var(--hair);}
.ft-sheet-box.noscroll{max-height:none;}
.ft-field{margin-bottom:14px;}
.ft-field label{display:block;font-size:10px;font-weight:900;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;}
.ft-field input,.ft-field select,.ft-field textarea{width:100%;background:var(--sunk);border:1.5px solid var(--hair);border-radius:10px;padding:10px 12px;font-size:14px;outline:none;}
.ft-field input:focus,.ft-field select:focus,.ft-field textarea:focus{border-color:var(--g-main);}
.ft-row{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--hair);font-size:13px;}
.ft-row:last-child{border-bottom:none;}
.ft-row .k{color:var(--text2);}
.ft-row .v{font-weight:800;font-variant-numeric:tabular-nums;}

/* HOJA "MÁS" */
.ft-more-group{margin-bottom:16px;}
.ft-more-group h5{font-size:10px;font-weight:900;letter-spacing:.5px;text-transform:uppercase;color:var(--text3);margin:0 0 8px;}
.ft-more-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px 6px;}
.ft-more-item{display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;background:none;border:none;text-decoration:none;}
.ft-more-item .ic{width:50px;height:50px;border-radius:15px;background:var(--sunk);display:grid;place-items:center;font-size:22px;}
.ft-more-item span{font-size:10px;font-weight:700;color:var(--text2);text-align:center;line-height:1.2;}

/* TOAST */
.ft-toast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%) translateY(8px);background:var(--ink);color:#fff;padding:11px 18px;border-radius:14px;font-size:12.5px;font-weight:700;z-index:400;opacity:0;transition:opacity .2s,transform .2s;max-width:calc(100vw - 40px);text-align:center;pointer-events:none;}
.ft-toast.on{opacity:1;transform:translateX(-50%) translateY(0);}

/* AYUDA */
.ft-help-item{border-bottom:1px solid var(--hair);padding:10px 2px;}
.ft-help-item summary{cursor:pointer;font-size:13.5px;font-weight:800;color:var(--ink);list-style:none;}
.ft-help-item summary::-webkit-details-marker{display:none;}
.ft-help-item .a{font-size:12.5px;color:var(--text2);margin-top:8px;line-height:1.55;}

/* Pantalla de saldo de dominio (ahorro / emergencia) */
.ft-bs-hero{text-align:center;margin-bottom:6px;}
.ft-bs-hero .cap{font-size:11.5px;font-weight:700;color:var(--text3);display:inline-flex;align-items:center;gap:5px;cursor:pointer;background:none;border:none;font-family:var(--ui-font);}
.ft-bs-hero .amt{font-family:var(--round-font);font-weight:900;font-size:44px;letter-spacing:-1.6px;line-height:1;margin-top:7px;font-variant-numeric:tabular-nums;color:var(--g-main);}
.ft-bs-hero.emerg .amt{color:var(--amber);}
.ft-bs-hero .sub{font-size:11.5px;color:var(--text3);margin-top:6px;}
.ft-bs-gtrack{height:9px;border-radius:99px;background:var(--sunk);overflow:hidden;margin:12px 0 6px;}
.ft-bs-gfill{height:100%;border-radius:99px;background:var(--amber);transition:width .8s cubic-bezier(.22,1,.36,1);}
.ft-bs-grow{display:flex;justify-content:space-between;font-size:10.5px;color:var(--text3);font-weight:700;}
.ft-bs-acts{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:18px 0 6px;}
.ft-bs-acts button{padding:11px 6px;border-radius:13px;border:1px solid var(--hair);background:var(--sunk);font-family:var(--ui-font);font-size:12px;font-weight:800;color:var(--ink);cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;}
.ft-bs-acts button .e{font-size:17px;}
.ft-bs-acts button.prim{background:linear-gradient(135deg,var(--g-dark),var(--g-main));color:#fff;border:none;}
.ft-bs-info{background:#FBF0DD;border-radius:14px;padding:13px 15px;margin:16px 0;}
.ft-bs-info b{font-size:12px;color:#8A5A12;display:block;margin-bottom:5px;}
.ft-bs-info p{font-size:11.5px;color:var(--text2);line-height:1.55;}
.ft-mv{display:flex;align-items:center;gap:11px;padding:12px 0;border-bottom:1px solid var(--hair);cursor:pointer;}
.ft-mv:last-child{border-bottom:none;}
.ft-mv .ic{width:38px;height:38px;border-radius:11px;flex-shrink:0;display:grid;place-items:center;font-size:15px;}
.ft-mv .ic.up{background:var(--mint-bg);}.ft-mv .ic.dn{background:var(--red-dim);}.ft-mv .ic.rec{background:var(--sky-bg);}
.ft-mv .m{flex:1;min-width:0;}
.ft-mv .m .n{font-family:var(--round-font);font-weight:900;font-size:14px;letter-spacing:-.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ft-mv .m .d{font-size:10.5px;color:var(--text3);font-weight:700;margin-top:1px;}
.ft-mv .amt{font-family:var(--round-font);font-weight:900;font-size:14px;font-variant-numeric:tabular-nums;flex-shrink:0;}
.ft-mv .amt.in{color:var(--g-main);}.ft-mv .amt.out{color:var(--ink);}
.ft-empty{text-align:center;color:var(--text3);font-size:12.5px;padding:22px 10px;}

@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;}}
@media (min-width:520px){body{padding:0;}}
`;
FT.injectDS = function () {
  if (document.getElementById('ft-ds')) return;
  var st = document.createElement('style');
  st.id = 'ft-ds';
  st.textContent = DS_CSS;
  (document.head || document.documentElement).appendChild(st);
};
FT.injectDS();

/* ─────────────────────────────────────────────────────────────────────────
   11 · UI PRIMITIVOS — toast, sheet, modal, confirm
   ───────────────────────────────────────────────────────────────────────── */
FT.toast = function (msg, opts) {
  opts = opts || {};
  var el = document.getElementById('ft-toast-el');
  if (!el) { el = document.createElement('div'); el.id = 'ft-toast-el'; el.className = 'ft-toast'; document.body.appendChild(el); }
  el.textContent = (opts.icon ? opts.icon + '  ' : '') + msg;
  requestAnimationFrame(function () { el.classList.add('on'); });
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.classList.remove('on'); }, opts.ms || 3000);
};

// Bloqueo real de scroll del body mientras haya algún overlay abierto (sheet/modal).
// Antes solo se confiaba en que el overlay fixed tapara la pantalla -- eso basta para
// que el dedo no arrastre el fondo en iOS/Android, pero NO evita que la rueda del mouse
// o las flechas del teclado en escritorio sigan haciendo scroll del body por detrás
// (doble scroll). Con position:fixed + top:-scrollY se fija el body en su lugar exacto
// y se restaura sin salto al cerrar el último overlay de la pila.
var _scrollLockY = 0, _scrollLockCount = 0;
function _lockBodyScroll() {
  if (_scrollLockCount++ > 0) return; // ya bloqueado por otro overlay en la pila
  _scrollLockY = window.scrollY || document.documentElement.scrollTop || 0;
  document.body.style.position = 'fixed';
  document.body.style.top = (-_scrollLockY) + 'px';
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
}
function _unlockBodyScroll() {
  if (_scrollLockCount <= 0) return;
  if (--_scrollLockCount > 0) return; // todavía queda otro overlay abierto en la pila
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  window.scrollTo(0, _scrollLockY); // posición exacta, sin salto
}
function _overlay(kind, innerHTML) {
  var ov = document.createElement('div');
  ov.className = 'ft-overlay ' + kind;
  ov.innerHTML = innerHTML;
  ov.addEventListener('click', function (e) { if (e.target === ov) FT.closeTop(); });
  document.body.appendChild(ov);
  _lockBodyScroll();
  requestAnimationFrame(function () { ov.classList.add('on'); });
  return ov;
}
FT._stack = [];
FT.closeTop = function () {
  var ov = FT._stack.pop() || document.querySelector('.ft-overlay:last-of-type');
  if (!ov) return;
  ov.classList.remove('on');
  _unlockBodyScroll();
  setTimeout(function () { ov.remove(); }, 200);
};

FT.sheet = function (o) {
  o = o || {};
  var acts = o.actions || [];
  // aria-label explícito (QA de Jett: un botón de acción con emoji al
  // frente le costó varios intentos localizarlo con su navegador
  // automatizado -- un <button> ya es accesible por su texto, pero
  // algunas herramientas de prueba buscan por aria-label explícito en vez
  // de calcular el nombre accesible desde el contenido con emoji).
  var foot = acts.length
    ? '<div class="ft-sheet-foot">' + acts.map(function (a, i) {
        return '<button type="button" class="ft-btn ' + (a.primary ? 'ft-btn-primary' : 'ft-btn-ghost') + ' tap" data-ai="' + i + '" aria-label="' + String(a.label).replace(/"/g, '&quot;') + '" style="margin:0">' + a.label + '</button>';
      }).join('') + '</div>'
    : '';
  var ov = _overlay('bottom',
    '<div class="ft-sheet-box" role="dialog" aria-modal="true">' +
      '<div class="ft-sheet-grab"></div>' +
      (o.title ? '<div class="ft-modal-head"><h4>' + o.title + '</h4><button class="x" aria-label="' + FT.t('close') + '">✕</button></div>' : '') +
      '<div class="ft-sheet-body">' + (o.html || '') + '</div>' + foot +
    '</div>');
  FT._stack.push(ov);
  var x = ov.querySelector('.x'); if (x) x.addEventListener('click', FT.closeTop);
  acts.forEach(function (a, i) {
    var b = ov.querySelector('[data-ai="' + i + '"]');
    if (b) b.addEventListener('click', function () { if (!a.keepOpen) FT.closeTop(); a.onClick && a.onClick(); });
  });
  o.onOpen && o.onOpen(ov.querySelector('.ft-sheet-body'));
  return ov;
};

FT.modal = function (o) {
  o = o || {};
  var ov = _overlay('center',
    '<div class="ft-modal-box" role="dialog" aria-modal="true">' +
      '<div class="ft-modal-head"><h4>' + (o.title || '') + '</h4><button class="x" aria-label="' + FT.t('close') + '">✕</button></div>' +
      '<div class="ft-modal-body">' + (o.html || '') + '</div>' +
      (o.onSave ? '<div class="ft-modal-foot"><button type="button" class="ft-btn ft-btn-primary tap" data-save aria-label="' + String(o.saveLabel || FT.t('save')).replace(/"/g, '&quot;') + '" style="margin:0">' + (o.saveLabel || FT.t('save')) + '</button>' + (o.cancelLabel ? '<button type="button" class="ft-btn ft-btn-ghost tap" data-cancel aria-label="' + String(o.cancelLabel).replace(/"/g, '&quot;') + '" style="margin:0">' + o.cancelLabel + '</button>' : '') + '</div>' : '') +
    '</div>');
  FT._stack.push(ov);
  ov.querySelector('.x').addEventListener('click', FT.closeTop);
  var body = ov.querySelector('.ft-modal-body');
  var sb = ov.querySelector('[data-save]');
  // Blindaje: si onSave truena (error de programación en cualquier pantalla),
  // antes no pasaba NADA visible -- ni error, ni toast, el modal se quedaba
  // ahí sin ninguna pista de qué falló. Ahora al menos se avisa en vez de
  // fallar en silencio total.
  if (sb) sb.addEventListener('click', function () {
    var keep;
    try { keep = o.onSave(body); }
    catch (e) { console.error('onSave error:', e); FT.toast(FT.lang === 'es' ? '⚠️ Algo salió mal, intenta de nuevo' : '⚠️ Something went wrong, try again'); return; }
    if (!keep) FT.closeTop();
  });
  var cb = ov.querySelector('[data-cancel]');
  if (cb) cb.addEventListener('click', FT.closeTop);
  o.onOpen && o.onOpen(body);
  return ov;
};

FT.confirm = function (msg, o) {
  o = o || {};
  return new Promise(function (resolve) {
    FT.sheet({
      title: o.title || FT.t('confirm'),
      html: '<p style="font-size:13.5px;color:var(--text2);margin:2px 0 4px">' + msg + '</p>',
      actions: [
        { label: o.okLabel || FT.t('confirm'), primary: true, onClick: function () { resolve(true); } },
        { label: FT.t('cancel'), onClick: function () { resolve(false); } }
      ]
    });
  });
};

/* ─────────────────────────────────────────────────────────────────────────
   12 · COMPONENTES (devuelven HTML string)
   ───────────────────────────────────────────────────────────────────────── */
/** Parte "🛒 Supermercado" → { emoji:'🛒', label:'Supermercado', pastel:'peach' } */
FT.catMeta = function (cat, idx) {
  cat = String(cat || '').trim();
  var m = cat.match(/^(\p{Extended_Pictographic}(?:️)?)\s*(.*)$/u);
  var emoji = m ? m[1] : '', label = m ? m[2] : cat;
  var pastel = CAT_PASTEL[emoji] || PASTELS[(idx || 0) % PASTELS.length];
  return { emoji: emoji, label: label || cat, pastel: pastel };
};

FT.heroNumber = function (o) {
  o = o || {};
  var p = FT.moneyParts(o.amount, { cents: !!o.cents });
  var neg = o.sign ? o.sign === '−' || o.sign === '-' || o.negative : p.neg;
  return '' +
    '<div class="ft-hero">' +
      (o.label ? '<div class="cap">' + o.label + '</div>' : '') +
      '<div class="row">' +
        '<span class="ft-sign ' + (neg ? 'neg' : 'pos') + '">' + (neg ? '−' : '+') + '</span>' +
        '<span class="amt"><span class="cur">' + p.sym + '</span>' + p.int + (o.cents ? '<span style="font-size:.5em">' + p.decSep + p.dec + '</span>' : '') + '</span>' +
      '</div>' +
      (o.splitHTML ? '<div class="ft-split">' + o.splitHTML + '</div>' : '') +
    '</div>';
};

FT.progress = function (pct) {
  pct = Math.max(0, Math.min(100, pct || 0));
  var id = 'ftp_' + Math.random().toString(36).slice(2, 7);
  setTimeout(function () { var f = document.getElementById(id); if (f) f.style.width = pct + '%'; }, 60);
  return '<div class="ft-track"><div class="ft-fill" id="' + id + '"></div></div>';
};

/** items: [{ cat|emoji|label, spent, budget }] — muestra las 4 mayores */
FT.catBars = function (items, o) {
  o = o || {};
  items = (items || []).slice().sort(function (a, b) { return (b.spent || 0) - (a.spent || 0); }).slice(0, o.max || 4);
  var maxRef = Math.max.apply(null, items.map(function (i) { return Math.max(i.spent || 0, i.budget || 0); }).concat([1]));
  var total = items.reduce(function (a, i) { return a + (i.spent || 0); }, 0) || 1;
  // 19-oct-2026, a petición de Ramón: cada barra es clicable y lleva a
  // Historial ya filtrado por esa categoría (o.scope: 'personal' | 'hogar',
  // o.month: 'AAAA-MM'). Ver el listener delegado justo debajo.
  return '<div class="ft-catbars" data-go="1" data-scope="' + (o.scope || 'personal') + '"' + (o.month ? ' data-month="' + o.month + '"' : '') + '>' + items.map(function (it, idx) {
    var meta = it.emoji ? { emoji: it.emoji, label: it.label, pastel: PASTELS[idx % PASTELS.length] } : FT.catMeta(it.cat, idx);
    var spentH = Math.max(66 / 196 * 100, (it.spent || 0) / maxRef * 100);
    var budH = it.budget ? (it.budget / maxRef * 100) : 0;
    var pctTotal = Math.round((it.spent || 0) / total * 100);
    return '<div class="ft-catcol ' + meta.pastel + '" data-cat="' + _escH(it.cat || meta.label) + '" role="button" tabindex="0">' +
      (budH > spentH ? '<div class="ft-catbudget" style="height:' + budH + '%"></div>' : '') +
      '<div class="ft-catfill tap" style="height:' + spentH + '%">' +
        '<span class="emo">' + (meta.emoji || '•') + '</span>' +
        '<span class="val">' + FT.money(it.spent || 0, { compact: true }) + '</span>' +
        '<span class="pct">' + pctTotal + '%</span>' +
      '</div></div>';
  }).join('') + '</div>';
};

document.addEventListener('keydown', function (e) {
  if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.getAttribute && e.target.getAttribute('role') === 'button' && e.target.tagName !== 'BUTTON') { e.preventDefault(); e.target.click(); }
});
document.addEventListener('click', function (e) {
  var col = e.target && e.target.closest ? e.target.closest('.ft-catcol') : null;
  if (!col) return;
  var box = col.closest('.ft-catbars');
  if (!box || !box.hasAttribute('data-go')) return;
  var m = box.getAttribute('data-month');
  FT.go('historial.html?f=' + (box.getAttribute('data-scope') || 'personal') + (m ? '&m=' + m : '') + '&cat=' + encodeURIComponent(col.getAttribute('data-cat') || ''));
});

/** tx = transacción de ft_data. Devuelve una fila .ft-tx */
FT.txRow = function (t, idx, o) {
  o = o || {};
  var es = FT.lang === 'es';
  // Una transferencia es neutral (regla #1: nunca es ingreso ni gasto) --
  // no lleva `cat`, así que se le da un meta propio en vez de dejar que
  // FT.catMeta(undefined) caiga en el "Otro"/#gasto genérico (revisión
  // independiente, hallazgo cosmético repetido dos veces).
  var isXfer = t.type === 'transferencia';
  var isAdj = t.type === 'ajuste';
  var meta = isXfer ? { emoji: '🔁', label: FT.lang === 'es' ? 'Transferencia' : 'Transfer', pastel: 'sky' }
    : isAdj ? { emoji: '⚖️', label: FT.lang === 'es' ? 'Ajuste de saldo' : 'Balance adjustment', pastel: t.acctCredited ? 'mint' : 'coral' }
    : FT.catMeta(t.cat, idx);
  var isIn = t.type === 'ingreso' || (isAdj && t.acctCredited);
  var neutralSign = isXfer;
  var amt = FT.money(t.amount, { cents: true, sign: true });
  amt = (isIn ? '+' : (neutralSign ? '' : '−')) + FT.money(t.amount, { cents: true });
  var isCheque = t.incomeKind === 'cheque';
  var mid;
  if (isCheque) {
    var h = FT.hogar();
    var totH = (parseFloat(h.payPctHogar) || 50) + (parseFloat(h.saveHogarPct) || 10);
    var hogarAmt = (t.amount || 0) * totH / 100, persAmt = (t.amount || 0) - hogarAmt;
    mid = '<div class="ft-tx-name">' + _escH(t.desc || FT.catMeta(t.cat).label) + '</div>' +
          '<div class="ft-tx-breakdown">🏠 ' + FT.money(hogarAmt) + ' &nbsp;+&nbsp; 👤 ' + FT.money(persAmt) + '</div>';
  } else if (isXfer) {
    mid = '<div class="ft-tx-name">' + _escH(t.desc || meta.label) + '</div>' +
          '<div class="ft-tx-breakdown">' + _escH(t.fromLabel || '?') + ' → ' + _escH(t.toLabel || '?') + '</div>';
  } else {
    // 19-oct-2026, a petición de Ramón: Historial, Overview y Hogar usan ESTA
    // misma fila (antes Historial tenía su propio diseño). El chip dice qué
    // tipo de movimiento es cuando no basta con la categoría.
    var chip = null, dsc = String(t.desc || '');
    if (t.type === 'ingreso') {
      chip = t.incomeKind === 'cobertura' ? (es ? '💵 Cobertura · 100% tuyo' : '💵 Coverage · 100% yours')
        : t.incomeKind === 'venta' ? (es ? '🔄 Venta de inversión · no suma' : '🔄 Investment sale · not counted')
        : (es ? '🎁 Extra · 100% tuyo' : '🎁 Extra · 100% yours');
    } else if (t.type === 'ahorro' && t.hogar !== true && !t.isHogar) {
      if (/autom[aá]tic/i.test(dsc)) chip = es ? '⭐ Ahorro automático' : '⭐ Automatic savings';
      else if (dsc.indexOf('Reparto de cheque') === 0 || dsc.indexOf('Paycheck allocation') === 0) chip = es ? '💵 A tu fondo' : '💵 To your fund';
    }
    mid = '<div class="ft-tx-name">' + _escH(t.desc || meta.label) + '</div>' +
          (chip ? '<span class="ft-hashtag">' + chip + '</span>'
                : '<span class="ft-hashtag">#' + _escH((meta.label || 'gasto').toLowerCase().replace(/\s+/g, '')) + '</span>');
  }
  var esHogarRow = t.hogar === true || t.isHogar === true;
  var who = (o.partner && t._partner && t.createdBy) ? ' · ' + _escH(t.createdBy) : '';
  var lbl = _escH(meta.label) + (FT.isPending(t) ? ' · ⏳ ' + (es ? 'Pendiente · ' + FT.date(t.date) : 'Pending · ' + FT.date(t.date)) : '') + (esHogarRow ? ' · 🏠 ' + (es ? 'Hogar' : 'Household') : '') + who;
  return '<div class="ft-tx tap" data-txid="' + t.id + '" role="button" tabindex="0"' + (t._partner ? ' style="cursor:default"' : '') + '>' +
    '<div class="ft-tx-top"><span class="ft-pill">' + FT.date(t.date) + '</span>' +
      '<span class="ft-pill"' + (isIn ? ' style="color:var(--g-main)"' : '') + '>' + (isIn ? '+' : (neutralSign ? '' : '−')) + FT.money(t.amount, { cents: true, noSymbol: false }).replace('−', '') + '</span></div>' +
    '<div class="ft-tx-body">' +
      '<div class="ft-tx-ico ' + meta.pastel + '">' + (meta.emoji || '•') + '</div>' +
      '<div class="ft-tx-main"><div class="ft-tx-label">' + lbl + '</div>' + mid + '</div>' +
      '<div class="ft-tx-amt ' + (isIn ? 'in' : 'out') + '">' + amt + '</div>' +
    '</div></div>';
};

/** Hoja de detalle de una transacción — compartida por dashboard.html (solo mis
 *  movimientos) e historial.html (los míos + los de mi pareja marcados hogar).
 *  `tx` puede ser un id (busca en FT.txs()) o el objeto ya resuelto por el
 *  caller (necesario para movimientos de la pareja, que no viven en mi ft_data).
 *  `opts.readOnly` oculta editar/eliminar (para movimientos de solo lectura). */
FT.openTxDetail = function (tx, opts) {
  opts = opts || {};
  var es = FT.lang === 'es';
  if (typeof tx !== 'object' || tx === null) tx = FT.txs().find(function (t) { return String(t.id) === String(tx); });
  if (!tx) return;
  var typeName = { gasto: es ? 'Gasto' : 'Expense', ingreso: es ? 'Ingreso' : 'Income', ahorro: es ? 'Ahorro' : 'Savings', inversion: es ? 'Inversión' : 'Investment', suscripcion: es ? 'Suscripción' : 'Subscription', hipoteca: es ? 'Renta/Hipoteca' : 'Rent/Mortgage', transferencia: es ? 'Transferencia' : 'Transfer', ajuste: es ? 'Ajuste de saldo' : 'Balance adjustment' }[tx.type] || tx.type;
  var isCredit = tx.type === 'ingreso' || (tx.type === 'ajuste' && tx.acctCredited);
  var esHogar = tx.hogar === true || tx.isHogar === true;
  var createdMs = parseInt(tx.id, 10);
  var created = new Date(createdMs);
  var hora = isNaN(created.getTime()) ? '—' : created.toLocaleTimeString(es ? 'es-MX' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  var rows = [
    [es ? 'Tipo' : 'Type', typeName],
    [es ? 'Categoría' : 'Category', tx.cat || '—'],
    [es ? 'Fecha' : 'Date', FT.date(tx.date)],
    [es ? 'Hora de registro' : 'Time recorded', hora]
  ];
  if (tx.createdBy) rows.push([es ? 'Registrado por' : 'Recorded by', _escH(tx.createdBy)]);
  if (tx.auto) rows.push([es ? 'Origen' : 'Source', es ? 'Automático' : 'Automatic']);
  var html = '<div style="text-align:center;margin-bottom:16px">' +
      '<div class="ft-num" style="font-size:28px;color:' + (isCredit ? 'var(--g-main)' : 'var(--ink)') + '">' + (isCredit ? '+' : (tx.type === 'transferencia' ? '' : '−')) + FT.money(tx.amount, { cents: true }) + '</div>' +
      (tx.type === 'transferencia' && tx.fromLabel && tx.toLabel ? '<div style="font-size:12px;color:var(--text3);margin-top:2px">' + tx.fromLabel + ' → ' + tx.toLabel + '</div>' : '') +
      (esHogar ? '<span style="background:var(--g-light);color:var(--g-dark);font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;display:inline-block;margin-top:4px">🏠 ' + (es ? 'Del hogar' : 'Household') + '</span>' : '') +
    '</div>' +
    rows.map(function (r) { return '<div class="ft-row"><span class="k">' + r[0] + '</span><span class="v">' + r[1] + '</span></div>'; }).join('') +
    (tx.note ? '<div style="margin-top:10px"><div style="font-size:11px;color:var(--text3);margin-bottom:4px">' + (es ? 'Nota' : 'Note') + '</div><div style="background:var(--sunk);border-radius:10px;padding:10px;font-size:13px">' + tx.note + '</div></div>' : '');
  // Revisión independiente: editar el monto de una TRANSFERENCIA con este
  // formulario genérico (no sabe nada de fromRef/toRef) desajustaba los dos
  // lados sin corregir ninguno -- y borrarla después revertía el monto
  // EDITADO, no el original, fabricando/destruyendo dinero de la nada. En
  // vez de construir un editor de dos lados, se quita "Editar" para
  // transferencias -- borrar y volver a crearla ya es 100% correcto.
  var actions = opts.readOnly ? [] : (tx.type === 'transferencia' ? [] : [
    { label: '✏️ ' + (es ? 'Editar' : 'Edit'), onClick: function () { _editTxDetail(tx); } }
  ]).concat([
    { label: '🗑️ ' + (es ? 'Eliminar' : 'Delete'), onClick: function () {
        FT.confirm(es ? '¿Eliminar este movimiento? Se revierten los saldos vinculados.' : 'Delete this entry? Linked balances will be reverted.').then(function (ok) {
          if (ok) { FT.deleteTx(tx.id); FT.toast(es ? '🗑️ Eliminado' : '🗑️ Deleted'); }
        });
      } }
  ]);
  FT.sheet({ title: tx.desc || typeName, html: html, actions: actions });
};
function _editTxDetail(tx) {
  var es = FT.lang === 'es';
  // 19-oct-2026, a petición de Ramón: cualquier dato se puede corregir, y un
  // ingreso debe poder cambiar de tipo (cheque / 100% mío / venta) cuando te
  // equivocas al capturarlo. Un cheque con su fila en ft_cheques y una
  // cobertura (ligada por cobId) quedan fijos: cambiarles el tipo dejaría
  // descuadrado el bote del hogar o el ahorro que ya movieron -- para
  // corregirlos, se eliminan y se registran de nuevo.
  var kindHtml = '';
  if (tx.type === 'ingreso') {
    var hasChequeRow = FT.cheques().some(function (c) { return String(c.txId) === String(tx.id); });
    // Un cheque con su fila en ft_cheques ya repartió dinero: fijo. Un cheque heredado SIN fila se puede corregir a extra/venta (nunca al revés).
    var lockedKind = tx.incomeKind === 'cobertura' || !!tx.cobId || (tx.incomeKind === 'cheque' && hasChequeRow);
    var kindNames = { cheque: es ? '🏠 Cheque (se reparte con el hogar)' : '🏠 Paycheck (split with household)', extra: es ? '🎁 100% mío' : '🎁 100% mine', venta: es ? '🔄 Venta de inversión (no suma)' : '🔄 Investment sale (not counted)', cobertura: es ? '💵 Cobertura (100% mío)' : '💵 Coverage (100% mine)' };
    var curKind = tx.incomeKind || 'extra';
    kindHtml = lockedKind
      ? '<div class="ft-field"><label>' + (es ? 'Tipo de ingreso' : 'Income type') + '</label><div style="font-size:13px;color:var(--text2)">' + (kindNames[curKind] || curKind) + '</div><p style="font-size:10px;color:var(--text3);margin-top:4px">' + (es ? 'Este tipo ya movió dinero. Para cambiarlo, elimínalo y regístralo de nuevo (un cheque, con «Recibí mi cheque»).' : 'This type already moved money. To change it, delete it and record it again (a paycheck, with "I got paid").') + '</p></div>'
      : '<div class="ft-field"><label>' + (es ? 'Tipo de ingreso' : 'Income type') + '</label><select id="etKind">' +
        (tx.incomeKind === 'cheque' ? ['cheque', 'extra', 'venta'] : ['extra', 'venta']).map(function (k) { return '<option value="' + k + '"' + (k === curKind ? ' selected' : '') + '>' + kindNames[k] + '</option>'; }).join('') + '</select></div>';
  }
  FT.modal({
    title: es ? 'Editar registro' : 'Edit entry',
    html: '<div class="ft-field"><label>' + (es ? 'Descripción' : 'Description') + '</label><input id="etDesc" value="' + (tx.desc || '').replace(/"/g, '&quot;') + '"></div>' + kindHtml +
      '<div class="ft-field"><label>' + (es ? 'Monto' : 'Amount') + '</label><input id="etAmount" type="number" step="0.01" value="' + tx.amount + '"></div>' +
      '<div class="ft-field"><label>' + (es ? 'Fecha' : 'Date') + '</label><input id="etDate" type="date" value="' + tx.date + '"></div>' +
      '<div class="ft-field"><label>' + (es ? 'Nota' : 'Note') + '</label><input id="etNote" value="' + (tx.note || '').replace(/"/g, '&quot;') + '"></div>',
    onSave: function (body) {
      var d0 = FT.data();
      var i0 = d0.transactions.findIndex(function (t) { return String(t.id) === String(tx.id); });
      if (i0 < 0) { FT.closeTop(); FT.closeTop(); return true; }
      var old0 = d0.transactions[i0];
      var newDate0 = body.querySelector('#etDate').value || old0.date;
      var newAmt0 = parseFloat(body.querySelector('#etAmount').value) || 0;
      // Fecha futura en un gasto/ingreso => pendiente (20-oct-2026, aprobado vía simulación).
      var willFuture = (old0.type === 'gasto' || old0.type === 'ingreso') && String(newDate0) > FT.todayISO();
      if (willFuture && (old0.cobId || old0.incomeKind === 'cheque' || old0.incomeKind === 'cobertura')) {
        FT.toast(es ? 'Un cheque o un gasto con cobertura no puede quedar con fecha futura' : 'A paycheck or a covered expense cannot have a future date'); return true;
      }
      var accountMoved = !!old0.checkingAccountId && !old0.acctPending;
      var acctName = '';
      if (old0.checkingAccountId) { var ac0 = FT.checking().find(function (a) { return String(a.id) === String(old0.checkingAccountId); }); acctName = ac0 ? ac0.name : ''; }
      var msg = '';
      if (old0.checkingAccountId && accountMoved && willFuture) {
        msg = es ? 'Con esa fecha futura el movimiento queda ⏳ pendiente: ' + FT.money(old0.amount, { cents: true }) + (old0.acctCredited ? ' salen de «' : ' regresan a «') + acctName + '» y dejan de contar en tu presupuesto hasta el ' + FT.date(newDate0) + '. Ese día se aplica solo.'
          : 'With that future date the entry becomes ⏳ pending: ' + FT.money(old0.amount, { cents: true }) + (old0.acctCredited ? ' leave "' : ' go back to "') + acctName + '" and stop counting in your budget until ' + FT.date(newDate0) + '. It applies on its own that day.';
      } else if (old0.checkingAccountId && !accountMoved && !willFuture) {
        msg = es ? 'Con esa fecha el movimiento se aplica ya: ' + FT.money(newAmt0, { cents: true }) + (old0.acctCredited ? ' entran a «' : ' salen de «') + acctName + '» y cuenta en tu presupuesto.'
          : 'With that date the entry applies now: ' + FT.money(newAmt0, { cents: true }) + (old0.acctCredited ? ' go into "' : ' come out of "') + acctName + '" and counts in your budget.';
      }
      function commit() {
        var d = FT.data();
        var i = d.transactions.findIndex(function (t) { return String(t.id) === String(tx.id); });
        if (i >= 0) {
          var oldTx = d.transactions[i];
          var newAmount = newAmt0;
          if (oldTx.checkingAccountId) {
            var oldAmt = parseFloat(oldTx.amount) || 0, moved = !oldTx.acctPending;
            if (moved && willFuture) {
              // pasa a pendiente: devolver el movimiento viejo a la cuenta
              if (oldTx.acctCredited) FT.deductChecking(oldTx.checkingAccountId, oldAmt); else FT.creditChecking(oldTx.checkingAccountId, oldAmt);
            } else if (!moved && !willFuture) {
              // llegó/cambió a hoy o pasado: se aplica ahora con el monto nuevo
              if (oldTx.acctCredited) FT.creditChecking(oldTx.checkingAccountId, newAmount); else FT.deductChecking(oldTx.checkingAccountId, newAmount, newDate0);
            } else if (moved && newAmount !== oldAmt) {
              // Si este movimiento había movido una cuenta, editar el monto ajusta esa cuenta por la
              // diferencia. Un GASTO deducido de más se devuelve; algo que ACREDITÓ (ingreso o aporte
              // hogar de recordCheque) va en signo contrario (revisión independiente anterior).
              if (oldTx.acctCredited) FT.creditChecking(oldTx.checkingAccountId, newAmount - oldAmt);
              else FT.creditChecking(oldTx.checkingAccountId, oldAmt - newAmount);
            }
            // (pendiente que sigue pendiente: la cuenta no se toca)
          }
          var kindSel = body.querySelector('#etKind');
          var dd = FT.data();
          var j = dd.transactions.findIndex(function (t) { return String(t.id) === String(tx.id); });
          dd.transactions[j] = Object.assign({}, dd.transactions[j], {
            desc: body.querySelector('#etDesc').value.trim(),
            amount: newAmount,
            date: newDate0,
            note: body.querySelector('#etNote').value.trim()
          });
          if (kindSel && kindSel.value) dd.transactions[j].incomeKind = kindSel.value;
          if (willFuture) { dd.transactions[j].pendiente = true; if (dd.transactions[j].checkingAccountId) dd.transactions[j].acctPending = true; }
          else { delete dd.transactions[j].pendiente; delete dd.transactions[j].acctPending; }
          FT.saveData(dd);
          FT.toast(willFuture ? (es ? '⏳ Pendiente hasta el ' + FT.date(newDate0) : '⏳ Pending until ' + FT.date(newDate0)) : (es ? '✅ Registro actualizado' : '✅ Entry updated'));
        }
        FT.closeTop(); // cierra el modal de edición
        FT.closeTop(); // cierra también la hoja de detalle (los datos ya cambiaron)
      }
      if (msg) { FT.confirm(msg, { title: es ? 'Cambio de fecha' : 'Date change' }).then(function (ok) { if (ok) commit(); }); return true; }
      commit();
      return true;   // evita que el wrapper intente cerrar una tercera vez
    }
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   13 · NAVEGACIÓN — pila para "atrás" real
   ───────────────────────────────────────────────────────────────────────── */
FT.go = function (url) {
  try {
    var st = JSON.parse(sessionStorage.getItem(K.navStack) || '[]');
    st.push(location.pathname.split('/').pop() || 'dashboard.html');
    sessionStorage.setItem(K.navStack, JSON.stringify(st.slice(-20)));
  } catch (e) {}
  location.href = url;
};
FT.back = function (fallback) {
  try {
    var st = JSON.parse(sessionStorage.getItem(K.navStack) || '[]');
    var prev = st.pop();
    sessionStorage.setItem(K.navStack, JSON.stringify(st));
    if (prev) { location.href = prev; return; }
  } catch (e) {}
  location.href = fallback || 'dashboard.html';
};

/* ─────────────────────────────────────────────────────────────────────────
   14 · SHELL — header + menú inferior + hoja "Más"
   ───────────────────────────────────────────────────────────────────────── */
var MORE_GROUPS = [
  { key: 'money_group_your', items: [['l_midinero', 'midinero.html', '🏦'], ['l_ahorro', 'ahorro.html', '💵'], ['l_emergencia', 'emergencia.html', '🛡️'], ['l_inversiones', 'inversiones.html', '🏦'], ['l_metas', 'metas.html', '🎯']] },
  { key: 'money_group_debts', items: [['l_deudas', 'deudas.html', '💳'], ['l_suscripciones', 'suscripciones.html', '🔄'], ['l_servicios', 'servicios.html', '🏠'], ['l_recurrentes', 'recurrentes.html', '♻️']] },
  { key: 'money_group_input', items: [['l_scanner', 'scanner.html', '📷'], ['l_importar', 'importar.html', '📥']] },
  { key: 'money_group_analysis', items: [['l_analisis', 'analisis.html', '📈'], ['l_reporte', 'reporte.html', '📄'], ['l_asistente', 'asistente.html', '💬']] },
  { key: 'money_group_account', items: [['l_perfil', 'perfil.html', '👤'], ['l_config', 'config.html', '⚙️'], ['l_saldos', 'onboarding.html', '🧮']] }
];

FT.openMore = function () {
  var here = (location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();
  var html = MORE_GROUPS.map(function (g) {
    var items = g.items.filter(function (it) { return it[1].toLowerCase() !== here; });
    if (!items.length) return '';
    return '<div class="ft-more-group"><h5>' + FT.t(g.key) + '</h5><div class="ft-more-grid">' +
      items.map(function (it) {
        return '<a class="ft-more-item tap" href="' + it[1] + '"><span class="ic">' + it[2] + '</span><span>' + FT.t(it[0]) + '</span></a>';
      }).join('') + '</div></div>';
  }).join('') +
  '<button class="ft-btn ft-btn-ghost tap" id="ft-logout-btn" style="margin-top:4px">🚪 ' + FT.t('logout') + '</button>';
  var ov = FT.sheet({ title: FT.t('more'), html: html });
  ov.querySelector('#ft-logout-btn').addEventListener('click', FT.logout);
  ov.querySelectorAll('.ft-more-item').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); FT.go(a.getAttribute('href')); });
  });
};

FT.openNotifications = function () {
  var items = (FT._notifProvider ? FT._notifProvider() : FT.getNotifications()) || [];
  // data-go-idx (no data-go con la url) -- 15-oct-2026, a petición de
  // Ramón: antes tocar cualquier aviso de deuda siempre caía en la lista
  // general de deudas.html, obligando a buscar cuál era. Indexar contra el
  // array original (en vez de leer solo la url del atributo) permite
  // llevar también el debtId/modo al deep-link antes de navegar.
  var html = items.length
    ? items.map(function (n, i) {
        return '<button class="ft-row tap" style="width:100%;text-align:left;background:none;border:none;border-bottom:1px solid var(--hair)" data-go-idx="' + i + '">' +
          '<span class="k">' + (n.icon || '🔔') + ' ' + n.text + '</span>' + (n.amount != null ? '<span class="v">' + FT.money(n.amount) + '</span>' : '') + '</button>';
      }).join('')
    : '<p style="font-size:13px;color:var(--text3);text-align:center;padding:20px 0">' + FT.t('notif_empty') + '</p>';
  var ov = FT.sheet({ title: FT.t('notif_title'), html: html });
  ov.querySelectorAll('[data-go-idx]').forEach(function (b) {
    b.addEventListener('click', function () {
      var n = items[parseInt(b.getAttribute('data-go-idx'), 10)];
      if (!n || !n.url) return;
      if (n.debtId) FT.setRaw(n.debtOpenMode === 'abonar' ? 'ft_open_abonar' : 'ft_open_debt', n.debtId);
      if (n.fundId) FT.setRaw('ft_open_fund', n.fundId);
      FT.go(n.url);
    });
  });
};
/** Una pantalla registra su lista de notificaciones: FT.setNotifications(fn) */
FT.setNotifications = function (fn) { FT._notifProvider = fn; };

FT.openKebab = function (extraActions) {
  var base = [
    { label: '🌐 ' + (FT.lang === 'es' ? 'English' : 'Español'), onClick: function () { FT.setLang(FT.lang === 'es' ? 'en' : 'es'); } },
    { label: '❓ ' + FT.t('help'), onClick: function () { FT.showHelpModal(); } }
  ];
  FT.sheet({ title: '', html: '<div class="ft-sheet-grab" style="display:none"></div>', actions: (extraActions || []).concat(base) });
};

/**
 * FT.shell({ active, title, month, onMonth, onPlus, kebab })
 *  active: 'home'|'hist'|'hogar'  · title: string/HTML
 *  month:  true → muestra selector de mes  · onMonth(delta)
 *  onPlus: fn — qué hace el "＋" en esta pantalla (§3)
 *  kebab:  [{label,onClick}] extra
 */
FT.shell = function (opts) {
  opts = opts || {};
  var app = document.querySelector('.ft-app');
  if (!app) {
    // Envuelve el body si la pantalla aún no trae .ft-app
    app = document.createElement('div'); app.className = 'ft-app';
    while (document.body.firstChild) app.appendChild(document.body.firstChild);
    document.body.appendChild(app);
  }
  document.body.classList.add('ft-ready');

  // HEADER
  var hdr = document.createElement('header');
  hdr.className = 'ft-header';
  hdr.innerHTML =
    '<button class="ft-title tap">' + (opts.title || '') + (opts.onSwitch ? ' <span class="car">⌄</span>' : '') + '</button>' +
    '<div class="ft-head-actions">' +
      (opts.month ? '<span class="ft-monthpick"><span data-m="-1">‹</span><b id="ft-month">' + (opts.monthLabel || '') + '</b><span data-m="1">›</span></span>' : '') +
      '<button class="ft-ico tap" data-act="bell">🔔<span class="ft-dot" id="ft-bell-dot" hidden></span></button>' +
      '<button class="ft-ico tap" data-act="kebab">⋯</button>' +
    '</div>';
  var page = app.querySelector('.ft-page') || app.firstElementChild;
  app.insertBefore(hdr, app.firstChild);

  hdr.querySelector('.ft-title').addEventListener('click', function () { opts.onSwitch ? opts.onSwitch() : FT.back(); });
  hdr.querySelector('[data-act="bell"]').addEventListener('click', FT.openNotifications);
  hdr.querySelector('[data-act="kebab"]').addEventListener('click', function () { FT.openKebab(opts.kebab); });
  if (opts.month) hdr.querySelectorAll('[data-m]').forEach(function (s) {
    s.addEventListener('click', function () { opts.onMonth && opts.onMonth(parseInt(s.getAttribute('data-m'), 10)); });
  });

  // NAV
  var nav = document.createElement('nav');
  nav.className = 'ft-nav';
  function item(k, ico, label, url) {
    return '<a class="ft-nav-item tap ' + (opts.active === k ? 'on' : '') + '" data-k="' + k + '" href="' + url + '"><span class="i">' + ico + '</span>' + label + '</a>';
  }
  nav.innerHTML =
    item('home', '🏠', FT.t('home'), 'dashboard.html') +
    item('hist', '📅', FT.t('history'), 'historial.html') +
    '<button class="ft-nav-plus tap" data-act="plus" aria-label="+">＋</button>' +
    item('hogar', '👥', FT.t('household'), 'hogar.html') +
    '<button class="ft-nav-item tap" data-act="more"><span class="i">⋯</span>' + FT.t('more') + '</button>';
  document.body.appendChild(nav);
  nav.querySelectorAll('a[data-k]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); FT.go(a.getAttribute('href')); });
  });
  nav.querySelector('[data-act="more"]').addEventListener('click', FT.openMore);
  nav.querySelector('[data-act="plus"]').addEventListener('click', function () {
    if (opts.onPlus) opts.onPlus();
    else if (FT.openPicker) FT.openPicker({ ctx: opts.active === 'hogar' ? 'hogar' : 'overview' });
    else FT.go('dashboard.html');
  });

  // FAB del Asistente IA — visible en todas las pantallas con shell, salvo el
  // propio asistente (ahí no tiene sentido un atajo hacia sí mismo).
  if (opts.active !== 'asistente') {
    var fab = document.createElement('button');
    fab.className = 'ft-fab tap';
    fab.setAttribute('aria-label', FT.t('l_asistente'));
    var credLeft = FT.creditsLeft();
    fab.innerHTML = '💬' + (FT.isPremium() && credLeft > 0 ? '<span class="ft-fab-badge">' + credLeft + '</span>' : '');
    fab.addEventListener('click', function () { FT.go('asistente.html'); });
    document.body.appendChild(fab);
  }

  FT.applyLang(hdr); FT.applyLang(nav);
  return {
    header: hdr, nav: nav,
    setBellDot: function (on) { var d = document.getElementById('ft-bell-dot'); if (d) d.hidden = !on; },
    setMonth: function (s) { var m = document.getElementById('ft-month'); if (m) m.textContent = s; },
    setTitle: function (html) { var b = hdr.querySelector('.ft-title'); if (b) b.innerHTML = html + (opts.onSwitch ? ' <span class="car">⌄</span>' : ''); }
  };
};

FT.logout = function () {
  try { sessionStorage.clear(); } catch (e) {}
  [K.user, K.setup, K.premium].forEach(FT.del);
  location.replace('login.html');
};

/* ─────────────────────────────────────────────────────────────────────────
   15 · MODAL DE AYUDA — bilingüe con búsqueda
   ───────────────────────────────────────────────────────────────────────── */
var FT_HELP_FAQ = [
  { es: ['ahorro libre', 'emergencia', 'diferencia', 'cuando retirar'], en: ['free savings', 'emergency', 'difference', 'when withdraw'],
    q: { es: '¿Cuál es la diferencia entre Ahorro libre y Fondo de emergencia?', en: 'What’s the difference between Free Savings and the Emergency Fund?' },
    a: { es: 'Ahorro libre se usa sin restricciones, para lo que quieras. El Fondo de emergencia está pensado solo para emergencias reales (perder el trabajo, un gasto médico grande).', en: 'Free Savings can be used for anything. The Emergency Fund is meant only for real emergencies (losing your job, a big medical expense).' } },
  { es: ['cheque', 'reparte', 'hogar', 'personal', 'porcentaje'], en: ['paycheck', 'split', 'household', 'personal', 'percentage'],
    q: { es: '¿Cómo se reparte mi cheque entre hogar y personal?', en: 'How does my paycheck get split between household and personal?' },
    a: { es: 'Configuras el % en Perfil → Frecuencia de pago. Cada vez que registras un cheque, la app calcula automáticamente cuánto es de cada lado.', en: 'You set the % in Profile → Pay Frequency. Every time you log a paycheck, the app splits it automatically.' } },
  { es: ['pagate primero', 'ahorro automático'], en: ['pay yourself first', 'automatic savings'],
    q: { es: '¿Qué es "Págate primero"?', en: 'What is "Pay Yourself First"?' },
    a: { es: 'Cuando registras un cheque, un % de tu parte personal se aparta automáticamente a Ahorro libre al momento — antes de que puedas gastarlo.', en: 'When you log a paycheck, a % of your personal share is automatically moved into Free Savings right away.' } },
  { es: ['recurrente', 'pago automático', 'se repite'], en: ['recurring', 'automatic payment', 'repeats'],
    q: { es: '¿Qué son los recurrentes y dónde los veo?', en: 'What are recurring payments and where do I see them?' },
    a: { es: 'Pagos que se repiten solos (abonos a deuda, ahorro, inversión). Todos juntos están en Más → Recurrentes.', en: 'Payments that repeat on their own (debt payments, savings, investments). All of them live in More → Recurring.' } },
  { es: ['pareja', 'hogar', 'sincroniza', 'conectar'], en: ['partner', 'household', 'sync', 'connect'],
    q: { es: '¿Cómo conecto mi cuenta con la de mi pareja?', en: 'How do I connect my account with my partner’s?' },
    a: { es: 'En Hogar → Cambiar modo, generas un código y se lo compartes a tu pareja para que lo ingrese.', en: 'In Household → Change mode, you generate a code and share it with your partner.' } },
  { es: ['importar', 'ia', 'creditos', 'escanear recibo'], en: ['import', 'ai', 'credits', 'scan receipt'],
    q: { es: '¿Cómo funcionan los créditos de análisis con IA?', en: 'How do AI analysis credits work?' },
    a: { es: 'Con Premium tienes 10 análisis con IA al mes; se resetean cada mes. Si se acaban, puedes comprar más o usar la importación por formato de banco, que no gasta créditos.', en: 'With Premium you get 10 AI analyses per month, reset monthly. If you run out, buy more or use bank-format import, which uses no credits.' } },
  { es: ['idioma', 'cambiar idioma'], en: ['language', 'change language'],
    q: { es: '¿Dónde cambio el idioma de la app?', en: 'Where do I change the app’s language?' },
    a: { es: 'En Configuración, o directo desde el menú "⋯" de cualquier pantalla.', en: 'In Settings, or from the "⋯" menu on any screen.' } }
];
FT.showHelpModal = function () {
  var render = function (q) {
    var l = FT.lang, ql = (q || '').toLowerCase().trim();
    var list = FT_HELP_FAQ.filter(function (it) {
      if (!ql) return true;
      var kws = (l === 'es' ? it.es : it.en).concat(it.q[l].toLowerCase());
      return kws.some(function (k) { return k.indexOf(ql) > -1; }) || it.a[l].toLowerCase().indexOf(ql) > -1;
    });
    return list.length
      ? list.map(function (it, i) {
          return '<details class="ft-help-item"' + (ql && i === 0 ? ' open' : '') + '><summary>' + it.q[l] + '</summary><div class="a">' + it.a[l] + '</div></details>';
        }).join('')
      : '<p style="text-align:center;padding:24px 0;color:var(--text3);font-size:13px">' + (FT.lang === 'es' ? 'Sin resultados' : 'No results') + '</p>';
  };
  var ov = FT.sheet({
    title: '❓ ' + FT.t('help'),
    html: '<input id="ft-help-q" type="text" placeholder="' + (FT.lang === 'es' ? 'Busca tu problema…' : 'Search your issue…') + '" style="width:100%;padding:11px 14px;border:1.5px solid var(--hair);border-radius:12px;font-size:14px;margin-bottom:12px;outline:none"><div id="ft-help-list">' + render('') + '</div>'
  });
  var inp = ov.querySelector('#ft-help-q'), listEl = ov.querySelector('#ft-help-list');
  inp.addEventListener('input', function () { listEl.innerHTML = render(inp.value); });
};

/* ─────────────────────────────────────────────────────────────────────────
   16 · UPGRADE MODAL
   ───────────────────────────────────────────────────────────────────────── */
FT.showUpgradeModal = function () {
  var es = FT.lang === 'es';
  var feats = es
    ? ['📷 Escanear recibos con IA', '📧 Reporte mensual por email', '📥 Exportar todos tus datos', '💡 Insights avanzados', '🔄 Suscripciones ilimitadas', '🎯 Metas ilimitadas', '🏠 Hogar compartido', '📐 Amortización real de deudas']
    : ['📷 Scan receipts with AI', '📧 Monthly email report', '📥 Export all your data', '💡 Advanced insights', '🔄 Unlimited subscriptions', '🎯 Unlimited goals', '🏠 Shared household', '📐 Real debt amortization'];
  FT.sheet({
    title: '💎 ' + (es ? 'Función Premium' : 'Premium feature'),
    html: '<p style="font-size:12.5px;color:var(--text3);margin:0 0 12px">' + (es ? 'Incluida en FinTrack Pro Premium.' : 'Included in FinTrack Pro Premium.') + '</p>' +
      '<div style="background:var(--sunk);border-radius:12px;padding:14px;margin-bottom:6px">' +
      feats.map(function (f) { return '<div style="font-size:12.5px;padding:4px 0">✓ ' + f + '</div>'; }).join('') + '</div>',
    actions: [{ label: '🛒 ' + (es ? 'Obtener Premium' : 'Get Premium'), primary: true, onClick: function () { window.open('https://www.etsy.com/shop/finanzone', '_blank'); } }]
  });
};
FT.premiumBadge = function () {
  return '<span style="display:inline-flex;align-items:center;gap:3px;background:linear-gradient(135deg,var(--g-dark),var(--g-main));color:#fff;font-size:9px;font-weight:800;padding:2px 8px;border-radius:20px;margin-left:6px;vertical-align:middle">💎 Premium</span>';
};

/* ─────────────────────────────────────────────────────────────────────────
   16b · PANTALLA DE SALDO DE DOMINIO — compartida por ahorro.html y
         emergencia.html (mismo arquetipo, cambia el flag `emerg`).
   Uso:  FT.balanceScreen({ emerg:false, mount:'#root' })
   ───────────────────────────────────────────────────────────────────────── */
FT.balanceScreen = function (opts) {
  opts = opts || {};
  var E = !!opts.emerg;
  var mount = document.querySelector(opts.mount || '#root');
  if (!mount) return;

  // Ahorro libre (no emergencia) puede tener varios fondos con nombre --
  // bal()/hist() operan sobre el fondo ACTIVO, no sobre el total, para que
  // la pantalla se sienta como "estoy viendo este fondo en particular".
  var funds = [], activeFundId = null;
  function refreshFunds() {
    if (E) { funds = []; return; }
    funds = FT.savingsFunds();
    // Deep-link (12-oct-2026, a petición de Ramón: "que el depósito se
    // vaya directo a donde tiene que ser" -- el botón "Depositar" de un
    // pago atorado/pendiente de aprobación por falta de fondos antes
    // siempre caía en el primer fondo ("General"), obligando a buscar a
    // mano cuál era el correcto). Solo se consume una vez, al primer
    // refreshFunds() de esta pantalla.
    if (!activeFundId) {
      var deepLink = FT.getRaw('ft_open_fund');
      if (deepLink) { FT.del('ft_open_fund'); if (funds.some(function (f) { return f.id === deepLink; })) activeFundId = deepLink; }
    }
    if (!activeFundId || !funds.some(function (f) { return f.id === activeFundId; })) activeFundId = funds[0] && funds[0].id;
  }
  function activeFund() { return funds.find(function (f) { return f.id === activeFundId; }); }
  function bal() { if (E) return FT.emergencyBalance(); var f = activeFund(); return f ? (parseFloat(f.actual) || 0) : 0; }
  function hist() { if (E) return FT.emergencyHist(); var f = activeFund(); return (f && f.hist) || []; }
  function hAmt(h) { return E ? (parseFloat(h.amount) || 0) : (parseFloat(h.monto) || 0); }
  function hTipo(h) { return h.tipo || (hAmt(h) < 0 ? 'retiro' : 'deposito'); }
  function hNota(h) { return h.nota || h.note || ''; }
  function hFecha(h) { return h.fecha || h.date || ''; }
  function hId(h) { return String(h.id != null ? h.id : ''); }
  function goal() { return (FT.user().income || 0) * 3; }
  function es() { return FT.lang === 'es'; }

  function render() {
    refreshFunds();
    var L = es(), b = bal(), af = activeFund();
    var rows = hist().slice().sort(function (a, c) { return String(hFecha(c)).localeCompare(String(hFecha(a))); });

    // Selector de fondos (solo Ahorro libre, no Emergencia) -- chips en fila
    // horizontal, el activo resaltado, + uno al final para crear otro.
    var fundRow = '';
    if (!E) {
      fundRow = '<div style="display:flex;gap:7px;overflow-x:auto;padding:2px 2px 12px;-webkit-overflow-scrolling:touch">' +
        funds.map(function (f) {
          var on = f.id === activeFundId;
          return '<button type="button" class="tap" data-fund="' + f.id + '" style="flex:0 0 auto;padding:8px 13px;border-radius:20px;border:1.5px solid ' + (on ? 'var(--g-main)' : 'var(--hair)') + ';background:' + (on ? 'var(--g-light)' : '#fff') + ';color:' + (on ? 'var(--g-dark)' : 'var(--text2)') + ';font-family:var(--ui-font);font-weight:800;font-size:12px;white-space:nowrap;cursor:pointer">' + f.emoji + ' ' + f.name + '</button>';
        }).join('') +
        '<button type="button" class="tap" data-fund-new="1" style="flex:0 0 auto;padding:8px 13px;border-radius:20px;border:1.5px dashed var(--hair);background:#fff;color:var(--text3);font-family:var(--ui-font);font-weight:800;font-size:12px;white-space:nowrap;cursor:pointer">＋ ' + (L ? 'Nuevo fondo' : 'New fund') + '</button></div>';
    }

    var hero = '<div class="ft-bs-hero' + (E ? ' emerg' : '') + '">' +
      '<button class="cap" data-x="bal">' + (L ? 'Saldo' : 'Balance') + ' <span class="ft-info">i</span></button>' +
      (!E ? ' <button type="button" data-fund-edit="1" style="border:none;background:none;font-size:11px;color:var(--text3);cursor:pointer;vertical-align:middle">✏️</button>' : '') +
      // N6: mismo criterio que el hero del dashboard (ver dashboard.html) --
      // se retira la excepcion de "cifra grande sin decimales" para que el
      // saldo grande de Ahorro libre/Emergencia no vuelva a ser el 3er
      // formato inconsistente en pantallas donde otros montos ya muestran
      // centavos.
      '<div class="amt">' + FT.money(b, { cents: true }) + '</div>';
    if (E) {
      var g = goal(), pct = g > 0 ? Math.min(100, Math.round(b / g * 100)) : 0;
      hero += '<button class="cap" data-x="goal" style="margin-top:4px">' + (L ? 'Meta: ' : 'Goal: ') + FT.money(g) + ' (' + (L ? '3 meses de ingreso' : '3 months income') + ') <span class="ft-info">i</span></button>' +
        '<div class="ft-bs-gtrack"><div class="ft-bs-gfill" id="ftbsGf" style="width:0"></div></div>' +
        '<div class="ft-bs-grow"><span>' + pct + '% ' + (L ? 'completado' : 'complete') + '</span><span>' + (L ? 'Faltan ' + FT.money(Math.max(0, g - b)) : FT.money(Math.max(0, g - b)) + ' remaining') + '</span></div>';
    } else if (af && af.meta > 0) {
      var pctF = Math.min(100, Math.round(b / af.meta * 100));
      hero += '<div class="sub">' + (L ? 'Meta de este fondo: ' : 'This fund\'s goal: ') + FT.money(af.meta) + ' · ' + pctF + '% ' + (L ? 'completado' : 'complete') + '</div>';
    } else {
      hero += '<div class="sub">' + (L ? 'Sin restricciones — úsalo para lo que quieras' : 'No restrictions — use it for anything') + '</div>';
    }
    // 15-oct-2026 (aprobado vía simulación): si este fondo vive dentro de una
    // cuenta, se dice cuál -- y SOLO si el disponible de esa cuenta está en
    // negativo aparece un aviso corto. Sin esto, esta pantalla dice "úsalo
    // para lo que quieras" mientras el formulario de gasto muestra la
    // cuenta en negativo, y parece que la app se contradice.
    var linkAcctId = E ? FT.emergencyAccountId() : (af && af.accountId);
    var linkAcct = linkAcctId ? FT.checking().find(function (a) { return String(a.id) === String(linkAcctId); }) : null;
    var linkWarn = '';
    if (linkAcct) {
      hero += '<div class="sub" style="margin-top:8px">💵 ' + (L ? 'Dentro de ' : 'Inside ') + linkAcct.name + '</div>';
      if (FT.accountFree(linkAcct) < -0.004) {
        linkWarn = '<div style="background:var(--amber-bg,#FFF3DF);border-radius:14px;padding:11px 12px;margin:0 0 12px;font-size:12px;color:var(--text2)"><b style="color:var(--amber,#B7700F)">' +
          linkAcct.name + ' ' + (L ? 'tiene disponible ' : 'has an available balance of ') + FT.money(FT.accountFree(linkAcct), { cents: true }) + '</b><br>' +
          (L ? 'Tu dinero está aquí, apartado en este fondo. Para usarlo, pásalo al disponible al pagar, o cuadra la cuenta con tu banco.' : 'Your money is here, set aside in this fund. To use it, move it to available when you pay, or match the account to your bank.') +
          '<br><button type="button" class="tap" data-cuadrar="' + linkAcct.id + '" style="border:none;background:none;padding:6px 0 0;font-family:inherit;font-weight:800;font-size:12px;color:var(--g-main);text-decoration:underline;cursor:pointer">' + (L ? 'Cuadrar con mi banco' : 'Match my bank') + '</button></div>';
      }
    }
    hero += '</div>' + linkWarn;

    var acts = '<div class="ft-bs-acts">' +
      '<button class="prim tap" data-a="deposito"><span class="e">＋</span>' + (L ? 'Depositar' : 'Deposit') + '</button>' +
      '<button class="tap" data-a="retiro"><span class="e">↩</span>' + (L ? 'Retirar' : 'Withdraw') + '</button>' +
      '<button class="tap" data-a="rec"><span class="e">🔄</span>' + (L ? 'Recurrente' : 'Recurring') + '</button></div>';

    var info = E ? '<div class="ft-bs-info"><b>⚠️ ' + (L ? '¿Cuándo puedo retirar de aquí?' : 'When can I withdraw?') + '</b><p>' +
      (L ? 'Solo para emergencias reales (perder el trabajo, un gasto médico grande). Para gastos normales del mes usa el Ahorro libre.' : 'Only for real emergencies (job loss, a big medical bill). For regular monthly spending use Free savings.') + '</p></div>' : '';

    var recs = FT.recurList(function (r) { return r.kind === 'ahorro' && (E ? r.dest === 'emergencia' : (r.dest !== 'emergencia' && (r.fundId || 'fund_general') === activeFundId)); });
    var recSec = recs.length ? '<div class="ft-section-head" style="margin-top:22px"><h3>🔄 ' + (L ? 'Recurrentes' : 'Recurring') + '</h3><button class="link" data-go="recurrentes.html">' + (L ? 'Ver todos' : 'See all') + '</button></div>' +
      recs.map(function (r) { var RL = FT.recurLabel(r); return '<div class="ft-mv tap" data-rec="' + r.id + '"><div class="ic rec">🔄</div><div class="m"><div class="n">' + RL.name + '</div><div class="d">' + RL.sub + '</div></div><div class="amt in">' + FT.money(r.amount) + '</div></div>'; }).join('') : '';

    var histSec = '<div class="ft-section-head" style="margin-top:22px"><h3>' + (L ? 'Historial' : 'History') + '</h3></div>' +
      (rows.length ? rows.map(function (h) {
        var t = hTipo(h), out = t === 'retiro', cob = !!h.cobId;
        return '<div class="ft-mv tap" data-mv="' + hId(h) + '"><div class="ic ' + (cob || out ? 'dn' : 'up') + '">' + (cob ? '🔗' : out ? '↩' : '＋') + '</div>' +
          '<div class="m"><div class="n">' + (hNota(h) || (out ? (L ? 'Retiro' : 'Withdrawal') : (L ? 'Depósito' : 'Deposit'))) + '</div>' +
          '<div class="d">' + FT.date(hFecha(h)) + (h.auto ? (L ? ' · automático' : ' · automatic') : h.recId ? (L ? ' · recurrente' : ' · recurring') : cob ? (L ? ' · cubrió un gasto' : ' · covered an expense') : '') + '</div></div>' +
          '<div class="amt ' + (out ? 'out' : 'in') + '">' + (out ? '−' : '+') + FT.money(Math.abs(hAmt(h)), { cents: true }) + '</div></div>';
      }).join('') : '<div class="ft-empty">' + (L ? 'Sin movimientos aún' : 'No movements yet') + '</div>');

    mount.innerHTML = fundRow + hero + acts + info + recSec + histSec;

    if (E) requestAnimationFrame(function () { var gf = document.getElementById('ftbsGf'); if (gf) { var g = goal(); gf.style.width = (g > 0 ? Math.min(100, b / g * 100) : 0) + '%'; } });

    mount.querySelectorAll('[data-x]').forEach(function (el) { el.onclick = function () { el.getAttribute('data-x') === 'goal' ? explainGoal() : explainBal(); }; });
    mount.querySelectorAll('[data-a]').forEach(function (el) { el.onclick = function () { var a = el.getAttribute('data-a'); a === 'rec' ? openRec() : openMove(a); }; });
    mount.querySelectorAll('[data-mv]').forEach(function (el) { el.onclick = function () { openDetail(el.getAttribute('data-mv')); }; });
    mount.querySelectorAll('[data-rec]').forEach(function (el) { el.onclick = function () { openRecDetail(el.getAttribute('data-rec')); }; });
    mount.querySelectorAll('[data-go]').forEach(function (el) { el.onclick = function () { FT.go(el.getAttribute('data-go')); }; });
    mount.querySelectorAll('[data-cuadrar]').forEach(function (el) { el.onclick = function () { var a = FT.checking().find(function (x) { return String(x.id) === el.getAttribute('data-cuadrar'); }); if (a) _openAjusteSaldoCuenta(a); }; });
    mount.querySelectorAll('[data-fund]').forEach(function (el) { el.onclick = function () { activeFundId = el.getAttribute('data-fund'); render(); }; });
    mount.querySelectorAll('[data-fund-new]').forEach(function (el) { el.onclick = function () { openFundForm(null); }; });
    mount.querySelectorAll('[data-fund-edit]').forEach(function (el) { el.onclick = function () { var f = activeFund(); if (f) openFundMenu(f); }; });
  }

  function explainBal() {
    var L = es();
    var rows = hist().slice().sort(function (a, c) { return String(hFecha(c)).localeCompare(String(hFecha(a))); }).slice(0, 6)
      .map(function (h) { return [(hNota(h) || (L ? 'Movimiento' : 'Movement')) + ' · ' + FT.date(hFecha(h)), (hTipo(h) === 'retiro' ? '−' : '+') + FT.money(Math.abs(hAmt(h)))]; });
    rows.push([L ? '= Saldo actual' : '= Current balance', FT.money(bal())]);
    var af1 = !E && activeFund();
    FT.sheet({ title: (L ? '¿Cómo se calcula?' : 'How is it calculated?') + ' · ' + (E ? (L ? 'Fondo de emergencia' : 'Emergency fund') : (af1 ? af1.emoji + ' ' + af1.name : (L ? 'Ahorro libre' : 'Free savings'))),
      html: rows.map(function (r) { return '<div class="ft-row"><span class="k">' + r[0] + '</span><span class="v">' + r[1] + '</span></div>'; }).join('') });
  }
  function explainGoal() {
    var L = es(), g = goal(), b = bal();
    FT.sheet({ title: L ? 'Meta del fondo' : 'Fund goal', html: [
      [L ? 'Tu ingreso mensual' : 'Your monthly income', FT.money(FT.user().income || 0)],
      ['× 3 ' + (L ? 'meses (colchón estándar)' : 'months (standard cushion)'), FT.money(g)],
      [L ? 'Tienes hoy' : 'You have today', FT.money(b)],
      [L ? 'Falta' : 'Remaining', FT.money(Math.max(0, g - b))]
    ].map(function (r) { return '<div class="ft-row"><span class="k">' + r[0] + '</span><span class="v">' + r[1] + '</span></div>'; }).join('') });
  }

  function openMove(mode) {
    var L = es(), isW = mode === 'retiro';
    // Cuentas como base (Fase 3): si este fondo/Emergencia YA está vinculado
    // a una cuenta, depositar/retirar es una transferencia neutral DENTRO de
    // esa cuenta -- FT.addSavings/FT.addEmergency ya mueven su "libre" solas
    // (ver esas funciones), así que aquí ya no tiene sentido dejar elegir
    // una cuenta manual distinta (se movería la cuenta equivocada) ni
    // descontarla dos veces. Sin vínculo, el comportamiento es exactamente
    // el de siempre (selector manual opcional, sin tocar ninguna cuenta si
    // no se elige).
    var linkedAcctId = E ? FT.emergencyAccountId() : (activeFund() && activeFund().accountId);
    var linkedAcct = linkedAcctId && FT.checking().find(function (a) { return a.id === linkedAcctId; });
    var origen = 'previo'; // 'previo' = ya lo tenía (no toca el mes) · 'mes' = de mi disponible
    var origToggle = isW ? '' :
      '<div class="ft-field"><label>' + (L ? '¿De dónde sale este dinero?' : 'Where does this money come from?') + '</label>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px" id="mOrig">' +
        '<button type="button" data-o="previo" style="padding:9px 6px;border-radius:10px;border:1.5px solid var(--g-main);background:var(--g-light);color:var(--g-dark);font-family:var(--ui-font);font-size:11px;font-weight:800;cursor:pointer;line-height:1.35">' + (L ? 'Ya lo tenía' : 'I already had it') + '<br><span style="font-weight:600;font-size:9.5px;opacity:.8">' + (L ? 'no afecta tu mes' : "doesn't affect your month") + '</span></button>' +
        '<button type="button" data-o="mes" style="padding:9px 6px;border-radius:10px;border:1.5px solid var(--hair);background:var(--sunk);color:var(--text2);font-family:var(--ui-font);font-size:11px;font-weight:800;cursor:pointer;line-height:1.35">' + (L ? 'De mi disponible del mes' : "From this month's available") + '<br><span style="font-weight:600;font-size:9.5px;opacity:.8">' + (L ? 'cuenta como ahorro del mes' : "counts toward this month's savings") + '</span></button>' +
      '</div></div>';
    // Cuenta de origen (opcional, solo depósitos "de mi disponible del mes"
    // -- si "ya lo tenía", ese dinero no está saliendo de ninguna cuenta
    // ahora mismo, así que no tiene caso descontar una). Antes solo el
    // recurrente de este mismo fondo (openRec) podía elegir cuenta -- un
    // depósito manual de una sola vez no tenía forma de dejar ese rastro.
    // Se oculta por completo si el fondo ya está vinculado (ver arriba).
    var myAccts2 = (!isW && !linkedAcctId) ? FT.checking().filter(function (a) { return !a.hogar; }) : [];
    var acctField = (myAccts2.length ? '<div class="ft-field" id="mAcctWrap" style="display:none"><label>' + (L ? '¿De qué cuenta sale? (opcional)' : 'Which account is this from? (optional)') + '</label><select id="mAcct"><option value="">' + (L ? 'Ninguna' : 'None') + '</option>' + myAccts2.map(function (a) { return '<option value="' + a.id + '">' + a.name + ' (' + FT.money(a.amount) + ')</option>'; }).join('') + '</select></div>' : '');
    var linkedNote = linkedAcct ? '<div style="background:var(--g-light);color:var(--g-dark);border-radius:10px;padding:9px 11px;font-size:11px;font-weight:600;margin-bottom:10px">🔗 ' + (L ? 'Este fondo está vinculado a «' + linkedAcct.name + '» -- ' + (isW ? 'el retiro se suma a tu libre ahí' : 'el depósito sale de tu libre ahí') + '.' : 'This fund is linked to "' + linkedAcct.name + '" -- the ' + (isW ? 'withdrawal adds to your free balance there' : 'deposit comes out of your free balance there') + '.') + '</div>' : '';
    FT.modal({
      title: isW ? (E ? (L ? 'Retirar del fondo' : 'Withdraw from fund') : (L ? 'Retirar del ahorro' : 'Withdraw from savings')) : (L ? 'Depositar' : 'Deposit'),
      html: (isW && E ? '<div class="ft-bs-info" style="margin:0 0 12px"><p>⚠️ ' + (L ? 'Este fondo es solo para emergencias reales. ¿Esto es una emergencia, o debería salir de tu Ahorro libre?' : 'This fund is only for real emergencies. Is this an emergency, or should it come from Free savings?') + '</p></div>' : '') +
        linkedNote +
        '<div class="ft-field"><label>' + (L ? 'Monto' : 'Amount') + '</label><input id="mAmt" inputmode="decimal" placeholder="$0"></div>' +
        origToggle + acctField +
        '<div class="ft-field"><label>' + (L ? 'Nota (opcional)' : 'Note (optional)') + '</label><input id="mNote"></div>' +
        '<div class="ft-field"><label>' + (L ? 'Fecha' : 'Date') + '</label><input id="mDate" type="date" value="' + FT.todayISO() + '"></div>',
      saveLabel: isW ? (L ? 'Confirmar retiro' : 'Confirm withdrawal') : (L ? 'Guardar depósito' : 'Save deposit'),
      onOpen: function (body) {
        var seg = body.querySelector('#mOrig');
        var acctWrap = body.querySelector('#mAcctWrap');
        if (seg) seg.querySelectorAll('button').forEach(function (b) {
          b.onclick = function () {
            origen = b.getAttribute('data-o');
            seg.querySelectorAll('button').forEach(function (x) {
              var on = x === b;
              x.style.borderColor = on ? 'var(--g-main)' : 'var(--hair)';
              x.style.background = on ? 'var(--g-light)' : 'var(--sunk)';
              x.style.color = on ? 'var(--g-dark)' : 'var(--text2)';
            });
            if (acctWrap) acctWrap.style.display = origen === 'mes' ? 'block' : 'none';
          };
        });
      },
      onSave: function (body) {
        var amt = parseFloat(body.querySelector('#mAmt').value) || 0;
        if (!amt || amt <= 0) { FT.toast(L ? 'Ingresa un monto' : 'Enter an amount'); return true; }
        if (isW && amt > bal()) { FT.toast(L ? 'No tienes suficiente' : 'Not enough'); return true; }
        var id = Date.now();
        var counts = !isW && origen === 'mes';
        var acctEl = body.querySelector('#mAcct');
        // Sin vínculo: selector manual, como siempre. Con vínculo: ninguna
        // cuenta manual (FT.addSavings/addEmergency ya descuentan la
        // vinculada solas) -- evita duplicar el descuento.
        var checkingAccountId = (!linkedAcctId && counts && acctEl && acctEl.value) || undefined;
        var payload = { id: id, amount: amt, date: body.querySelector('#mDate').value || FT.todayISO(), tipo: mode, note: body.querySelector('#mNote').value.trim() || (isW ? (L ? 'Retiro' : 'Withdrawal') : ''), monthTx: counts || null, fundId: E ? undefined : activeFundId };
        if (E) FT.addEmergency(payload); else FT.addSavings(payload);
        if (counts) {
          if (checkingAccountId) FT.deductChecking(checkingAccountId, amt, payload.date);
          var d = FT.data();
          d.transactions.push({ id: id, type: 'ahorro', desc: payload.note || (E ? (L ? 'Depósito a Emergencia' : 'To Emergency') : (L ? 'Depósito a Ahorro libre' : 'To Free savings')), amount: amt, date: payload.date, cat: E ? '🛡️ Emergencia' : '💵 Ahorro', dest: E ? 'emergencia' : 'libre', createdBy: FT.userName(), checkingAccountId: checkingAccountId });
          FT.saveData(d);
        }
        FT.toast(isW ? (L ? '✅ Retiro registrado' : '✅ Withdrawal recorded') : (L ? '✅ Depósito guardado' : '✅ Deposit saved'));
        render();
      }
    });
  }

  function openRec() {
    var L = es(), st = { freq: 'monthly' };
    var seg = ['weekly:' + (L ? 'Semanal' : 'Weekly'), 'biweekly:' + (L ? 'Quincenal' : 'Biweekly'), 'monthly:' + (L ? 'Mensual' : 'Monthly'), 'custom:' + (L ? 'Personalizado' : 'Custom')];
    // De qué cuenta PERSONAL sale (opcional) -- para que el saldo de esa
    // cuenta también baje solo cada vez que este recurrente se aplique,
    // igual que ya pasa con las deudas. Revisión independiente: si el fondo
    // YA está vinculado a una cuenta (Fase 3), _applyRecAhorro/FT.addSavings
    // descuentan esa cuenta vinculada SOLAS -- ofrecer aquí una cuenta
    // manual además duplicaría el descuento cada vez que corra el
    // recurrente. Se oculta el selector por completo en ese caso (mismo
    // criterio ya usado en openMove).
    var linkedAcctIdRec = E ? FT.emergencyAccountId() : (activeFund() && activeFund().accountId);
    var myAccts = !linkedAcctIdRec ? FT.checking().filter(function (a) { return !a.hogar; }) : [];
    FT.modal({
      title: L ? 'Depósito recurrente' : 'Recurring deposit',
      html: '<div class="ft-field"><label>' + (L ? 'Monto' : 'Amount') + '</label><input id="rAmt" inputmode="decimal" placeholder="$0"></div>' +
        '<div class="ft-field"><label>' + (L ? 'Frecuencia' : 'Frequency') + '</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px" id="rFreq">' +
        seg.map(function (o) { var v = o.split(':')[0], on = v === 'monthly'; return '<button type="button" data-f="' + v + '" style="padding:8px;border-radius:9px;border:1.5px solid ' + (on ? 'var(--g-main)' : 'var(--hair)') + ';background:' + (on ? 'var(--g-light)' : 'var(--sunk)') + ';font-family:var(--ui-font);font-size:11.5px;font-weight:800;color:' + (on ? 'var(--g-dark)' : 'var(--text2)') + ';cursor:pointer">' + o.split(':')[1] + '</button>'; }).join('') + '</div>' +
          FT.customFreqSubFormHTML('r') + '</div>' +
        '<div class="ft-field"><label>' + (L ? 'Primera fecha' : 'First date') + '</label><input id="rDate" type="date" value="' + FT.todayISO() + '"></div>' +
        (myAccts.length ? '<div class="ft-field"><label>' + (L ? '¿De qué cuenta sale? (opcional)' : 'Which account is this from? (optional)') + '</label><select id="rAcct"><option value="">' + (L ? 'Ninguna -- no descuenta cuenta' : "None -- doesn't deduct an account") + '</option>' + myAccts.map(function (a) { return '<option value="' + a.id + '">' + a.name + ' (' + FT.money(a.amount) + ')</option>'; }).join('') + '</select></div>' : '') +
        '<div style="background:var(--sky-bg);color:#2A4CC0;border-radius:10px;padding:9px 11px;font-size:11px;font-weight:600">' + (L ? 'Aparecerá en Recurrentes, donde podrás editar la fecha, pausarlo o eliminarlo.' : 'It will appear in Recurring for editing, pausing or deleting.') + '</div>',
      saveLabel: L ? 'Activar recurrente' : 'Activate',
      onOpen: function (body) {
        var cf = FT.wireCustomFreqSubForm(body, 'r');
        body.querySelectorAll('#rFreq button').forEach(function (b) {
          b.onclick = function () {
            st.freq = b.getAttribute('data-f');
            body.querySelectorAll('#rFreq button').forEach(function (x) { var on = x === b; x.style.borderColor = on ? 'var(--g-main)' : 'var(--hair)'; x.style.background = on ? 'var(--g-light)' : 'var(--sunk)'; x.style.color = on ? 'var(--g-dark)' : 'var(--text2)'; });
            cf.show(st.freq === 'custom');
          };
        });
      },
      onSave: function (body) {
        var amt = parseFloat(body.querySelector('#rAmt').value) || 0;
        if (!amt || amt <= 0) { FT.toast(es() ? 'Ingresa un monto' : 'Enter an amount'); return true; }
        var freq = st.freq === 'custom' ? FT.wireCustomFreqSubForm(body, 'r').getFreq() : st.freq;
        var rec = FT.recurring();
        var af0 = !E && activeFund();
        var acctEl = body.querySelector('#rAcct');
        rec.push({ id: 'rec_' + Date.now(), kind: 'ahorro', dest: E ? 'emergencia' : 'libre', fundId: E ? undefined : activeFundId,
          desc: E ? (es() ? 'Aporte a Emergencia' : 'To Emergency') : (es() ? 'Aporte a ' + (af0 ? af0.name : 'Ahorro libre') : 'To ' + (af0 ? af0.name : 'Free savings')),
          amount: amt, freq: freq, hogar: false, nextDate: body.querySelector('#rDate').value || FT.todayISO(), active: true, createdBy: FT.userName(),
          checkingAccountId: (acctEl && acctEl.value) || undefined });
        FT.set(K.recurring, rec);
        FT.toast(es() ? '🔄 Recurrente activado' : '🔄 Recurring activated');
        render();
      }
    });
  }
  /** Crear (fund=null) o editar un fondo de Ahorro libre — nombre, emoji,
   *  meta opcional y una regla de reparto opcional (monto fijo o % del
   *  cheque) que luego usará el modal de "repartir cheque" como sugerencia
   *  -- nunca aplica sola, el usuario siempre decide/ajusta al repartir. */
  function openFundForm(fund) {
    var L = es(), editing = !!fund;
    var emojiOpts = ['💵', '🏠', '✈️', '🎓', '🚗', '🎁', '💊', '📱', '🛠️', '🐷', '🛒', '🎉'];
    var chosenEmoji = (fund && fund.emoji) || '💵';
    var chosenRule = (fund && fund.rule && fund.rule.type) || 'none';
    FT.modal({
      title: editing ? (L ? 'Editar fondo' : 'Edit fund') : (L ? 'Nuevo fondo' : 'New fund'),
      html:
        (editing ? '' : '<div style="background:#FBF0DD;color:#8A5A12;border-radius:10px;padding:9px 11px;font-size:11px;font-weight:600;margin-bottom:12px">⚠️ ' + (L ? 'Esto es privado: solo tú lo ves, no se comparte con tu pareja ni cuenta en el patrimonio del hogar. Para dinero compartido (una cuenta o meta de la casa), ve a Hogar en vez de crear el fondo aquí.' : "This is private: only you see it, it isn't shared with your partner or counted in household net worth. For shared money (a household account or goal), go to Hogar instead of creating the fund here.") + '</div>') +
        '<div class="ft-field"><label>' + (L ? 'Nombre' : 'Name') + '</label><input id="fdName" value="' + (fund ? String(fund.name).replace(/"/g, '&quot;') : '') + '" placeholder="' + (L ? 'Ej. Vacaciones' : 'E.g. Vacation') + '"></div>' +
        '<div class="ft-field"><label>' + (L ? 'Emoji' : 'Emoji') + '</label><div id="fdEmoji" style="display:flex;gap:6px;flex-wrap:wrap">' +
          emojiOpts.map(function (e) { var on = e === chosenEmoji; return '<button type="button" data-e="' + e + '" style="width:34px;height:34px;border-radius:10px;border:1.5px solid ' + (on ? 'var(--g-main)' : 'var(--hair)') + ';background:' + (on ? 'var(--g-light)' : '#fff') + ';font-size:16px;cursor:pointer">' + e + '</button>'; }).join('') + '</div></div>' +
        '<div class="ft-field"><label>' + (L ? 'Meta (opcional)' : 'Goal (optional)') + '</label><input id="fdMeta" inputmode="decimal" placeholder="$0" value="' + (fund && fund.meta ? fund.meta : '') + '"></div>' +
        '<div class="ft-field"><label>' + (L ? 'Regla de reparto automático (opcional)' : 'Automatic deposit rule (optional)') + '</label>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px" id="fdRuleSeg">' +
            // 'remainder' (15-oct-2026, a petición de Ramón: "debe de haber
            // una regla... que pueda meter lo restante, para no estar
            // haciendo cálculos") -- se lleva lo que sobre después de
            // aplicar las reglas fijas/% de TODOS los fondos, sin que el
            // usuario tenga que calcular a mano cuánto le queda al cheque.
            ['none:' + (L ? 'Ninguna' : 'None'), 'fixed:' + (L ? 'Monto fijo' : 'Fixed $'), 'pct:' + (L ? '% del cheque' : '% of paycheck'), 'remainder:' + (L ? 'Lo que sobre' : "What's left")].map(function (o) { var v = o.split(':')[0], on = v === chosenRule; return '<button type="button" data-r="' + v + '" style="padding:8px 4px;border-radius:9px;border:1.5px solid ' + (on ? 'var(--g-main)' : 'var(--hair)') + ';background:' + (on ? 'var(--g-light)' : 'var(--sunk)') + ';font-family:var(--ui-font);font-size:10px;font-weight:800;color:' + (on ? 'var(--g-dark)' : 'var(--text2)') + ';cursor:pointer">' + o.split(':')[1] + '</button>'; }).join('') + '</div>' +
          '<input id="fdRuleVal" inputmode="decimal" style="margin-top:8px;display:' + (chosenRule === 'none' || chosenRule === 'remainder' ? 'none' : 'block') + '" placeholder="' + (chosenRule === 'pct' ? (L ? '% del cheque' : '% of paycheck') : '$') + '" value="' + (fund && fund.rule ? (fund.rule.value || '') : '') + '">' +
          '<p id="fdRemainderNote" style="font-size:10.5px;color:var(--text3);margin-top:6px;display:' + (chosenRule === 'remainder' ? 'block' : 'none') + '">' + (L ? 'Se lleva lo que quede del cheque después de aplicar las demás reglas fijas/% -- si hay más de un fondo con esta regla, se reparte en partes iguales.' : "Gets whatever's left of the paycheck after the other fixed/% rules -- if more than one fund has this rule, it's split evenly.") + '</p>' +
        '</div>' +
        '<div style="background:var(--sky-bg);color:#2A4CC0;border-radius:10px;padding:9px 11px;font-size:11px;font-weight:600">' + (L ? 'La regla es una sugerencia: cuando llegue un cheque tú decides si aplicarla, ajustarla o dejar el dinero sin repartir.' : 'The rule is only a suggestion: when a paycheck arrives you decide whether to apply it, adjust it, or leave the money unassigned.') + '</div>',
      saveLabel: editing ? (L ? 'Guardar cambios' : 'Save changes') : (L ? 'Crear fondo' : 'Create fund'),
      onOpen: function (body) {
        body.querySelectorAll('#fdEmoji button').forEach(function (b) {
          b.onclick = function () { chosenEmoji = b.getAttribute('data-e'); body.querySelectorAll('#fdEmoji button').forEach(function (x) { var on = x === b; x.style.borderColor = on ? 'var(--g-main)' : 'var(--hair)'; x.style.background = on ? 'var(--g-light)' : '#fff'; }); };
        });
        var ruleValInput = body.querySelector('#fdRuleVal');
        var remainderNote = body.querySelector('#fdRemainderNote');
        body.querySelectorAll('#fdRuleSeg button').forEach(function (b) {
          b.onclick = function () {
            chosenRule = b.getAttribute('data-r');
            body.querySelectorAll('#fdRuleSeg button').forEach(function (x) { var on = x === b; x.style.borderColor = on ? 'var(--g-main)' : 'var(--hair)'; x.style.background = on ? 'var(--g-light)' : 'var(--sunk)'; x.style.color = on ? 'var(--g-dark)' : 'var(--text2)'; });
            ruleValInput.style.display = (chosenRule === 'none' || chosenRule === 'remainder') ? 'none' : 'block';
            ruleValInput.placeholder = chosenRule === 'pct' ? (L ? '% del cheque' : '% of paycheck') : '$';
            if (remainderNote) remainderNote.style.display = chosenRule === 'remainder' ? 'block' : 'none';
          };
        });
      },
      onSave: function (body) {
        var name = (body.querySelector('#fdName').value || '').trim();
        if (!name) { FT.toast(L ? 'Ingresa un nombre' : 'Enter a name'); return true; }
        var metaVal = FT.numMoney(body.querySelector('#fdMeta').value) || 0;
        var ruleVal = FT.numMoney(body.querySelector('#fdRuleVal').value) || 0;
        var rule = chosenRule === 'remainder' ? { type: 'remainder' } : (chosenRule !== 'none' && ruleVal > 0) ? { type: chosenRule, value: ruleVal } : null;
        var funds2 = FT.savingsFunds();
        if (editing) {
          var f = funds2.find(function (x) { return x.id === fund.id; });
          if (f) { f.name = name; f.emoji = chosenEmoji; f.meta = metaVal; f.rule = rule; }
        } else {
          var newId = 'fund_' + Date.now();
          funds2.push({ id: newId, name: name, emoji: chosenEmoji, meta: metaVal, rule: rule, hist: [], actual: 0 });
          activeFundId = newId;
        }
        FT.saveSavingsFunds(funds2);
        FT.toast(L ? '✅ Guardado' : '✅ Saved');
        render();
      }
    });
  }
  function openFundMenu(fund) {
    var L = es();
    var canDelete = fund.id !== 'fund_general' && Math.abs(parseFloat(fund.actual) || 0) < 0.005;
    var actions = [{ label: '✏️ ' + (L ? 'Editar fondo' : 'Edit fund'), onClick: function () { openFundForm(fund); } }];
    if (canDelete) actions.push({ label: '🗑️ ' + (L ? 'Eliminar fondo' : 'Delete fund'), onClick: function () {
      FT.confirm(L ? '¿Eliminar «' + fund.name + '»?' : 'Delete "' + fund.name + '"?').then(function (ok) {
        if (!ok) return;
        // Re-chequea el saldo AQUÍ, no el que tenía cuando se abrió este menú
        // -- pudo haber entrado un depósito (uno automático, por ejemplo)
        // mientras el usuario tenía el confirm abierto, y no queremos borrar
        // un fondo que ya dejó de estar en $0.
        var fresh = FT.savingsFunds().find(function (x) { return x.id === fund.id; });
        if (!fresh || fresh.id === 'fund_general' || Math.abs(parseFloat(fresh.actual) || 0) >= 0.005) {
          FT.toast(L ? 'Este fondo ya no está vacío — no se eliminó' : 'This fund is no longer empty — not deleted');
          render();
          return;
        }
        var f2 = FT.savingsFunds().filter(function (x) { return x.id !== fund.id; });
        FT.saveSavingsFunds(f2);
        if (activeFundId === fund.id) activeFundId = f2[0] && f2[0].id;
        // Si había un recurrente apuntando a este fondo, hay que borrarlo
        // también -- si no, quedaba huérfano: seguía disparando solo
        // (FT.addSavings no encuentra el fundId y lo manda a General sin
        // avisar a nadie), y desaparecía de la sección "Recurrentes" de
        // este fondo (solo quedaba visible, sin explicación, en el hub de
        // recurrentes.html).
        var orphanRecs = FT.recurring().filter(function (r) { return r.kind === 'ahorro' && r.fundId === fund.id; });
        if (orphanRecs.length) {
          FT.set(K.recurring, FT.recurring().filter(function (r) { return !(r.kind === 'ahorro' && r.fundId === fund.id); }));
          FT.toast(L ? 'Eliminado — también se apagó ' + orphanRecs.length + ' recurrente(s) que apuntaban a este fondo' : 'Deleted — also turned off ' + orphanRecs.length + ' recurring ' + (orphanRecs.length === 1 ? 'item' : 'items') + ' pointing at this fund');
        } else {
          FT.toast(L ? 'Eliminado' : 'Deleted');
        }
        render();
      });
    } });
    FT.sheet({
      title: fund.emoji + ' ' + fund.name,
      html: '<div class="ft-row"><span class="k">' + (L ? 'Saldo' : 'Balance') + '</span><span class="v">' + FT.money(fund.actual || 0) + '</span></div>' +
        (fund.meta > 0 ? '<div class="ft-row"><span class="k">' + (L ? 'Meta' : 'Goal') + '</span><span class="v">' + FT.money(fund.meta) + '</span></div>' : '') +
        (fund.rule ? '<div class="ft-row"><span class="k">' + (L ? 'Regla de reparto' : 'Deposit rule') + '</span><span class="v">' + (fund.rule.type === 'remainder' ? (L ? 'Lo que sobre' : "What's left") : fund.rule.type === 'pct' ? fund.rule.value + '%' : FT.money(fund.rule.value)) + '</span></div>' : '') +
        (!canDelete && fund.id !== 'fund_general' ? '<p style="font-size:10.5px;color:var(--text3);margin-top:6px">' + (L ? 'Vacía este fondo (retira todo) para poder eliminarlo.' : 'Empty this fund (withdraw everything) to delete it.') + '</p>' : '') +
        (fund.id === 'fund_general' ? '<p style="font-size:10.5px;color:var(--text3);margin-top:6px">' + (L ? 'El fondo General no se puede eliminar.' : 'The General fund can\'t be deleted.') + '</p>' : ''),
      actions: actions
    });
  }
  function openRecDetail(id) {
    var L = es(), r = FT.recurGet(id); if (!r) return;
    var RL = FT.recurLabel(r);
    FT.sheet({
      title: RL.name,
      html: '<div class="ft-row"><span class="k">' + (L ? 'Monto' : 'Amount') + '</span><span class="v">' + FT.money(r.amount) + '</span></div><div class="ft-row"><span class="k">' + (L ? 'Frecuencia' : 'Frequency') + '</span><span class="v">' + RL.sub + '</span></div>',
      actions: [
        { label: '✏️ ' + (L ? 'Editar' : 'Edit'), onClick: function () { editRec(id); } },
        { label: r.paused ? '▶️ ' + (L ? 'Reanudar' : 'Resume') : '⏸ ' + (L ? 'Pausar' : 'Pause'), onClick: function () { FT.recurPause(id, !r.paused); FT.toast(r.paused ? (L ? 'Reanudado' : 'Resumed') : (L ? 'Pausado' : 'Paused')); render(); } },
        { label: '🗑️ ' + (L ? 'Eliminar' : 'Delete'), onClick: function () { FT.confirm(L ? '¿Eliminar este recurrente?' : 'Delete this recurring item?').then(function (ok) { if (ok) { FT.recurDelete(id); FT.toast(L ? 'Eliminado' : 'Deleted'); render(); } }); } },
        { label: L ? 'Ver en Recurrentes →' : 'Open in Recurring →', onClick: function () { FT.go('recurrentes.html'); } }
      ]
    });
  }
  function editRec(id) {
    var L = es(), r = FT.recurGet(id); if (!r) return;
    FT.modal({
      title: L ? 'Editar recurrente' : 'Edit recurring',
      html: '<div class="ft-field"><label>' + (L ? 'Monto' : 'Amount') + '</label><input id="eAmt" inputmode="decimal" value="' + r.amount + '"></div><div class="ft-field"><label>' + (L ? 'Próxima fecha' : 'Next date') + '</label><input id="eNext" type="date" value="' + (r.nextDate || FT.todayISO()) + '"></div>',
      onSave: function (body) { FT.recurUpdate(id, { amount: body.querySelector('#eAmt').value, nextDate: body.querySelector('#eNext').value }); FT.toast(L ? 'Actualizado' : 'Updated'); render(); }
    });
  }

  function openDetail(id) {
    var L = es();
    var h = hist().find(function (x) { return hId(x) === String(id); });
    if (!h) return;
    var t = hTipo(h), cob = !!h.cobId;
    var rows = [
      [L ? 'Tipo' : 'Type', cob ? (L ? 'Cobertura de gasto' : 'Expense coverage') : t === 'retiro' ? (L ? 'Retiro' : 'Withdrawal') : (L ? 'Depósito' : 'Deposit')],
      [L ? 'Fecha' : 'Date', FT.date(hFecha(h))],
      [L ? 'Monto' : 'Amount', FT.money(Math.abs(hAmt(h)), { cents: true })]
    ];
    if (h.auto) rows.push([L ? 'Origen' : 'Source', L ? 'Automático (cheque)' : 'Automatic (paycheck)']);
    if (cob) rows.push(['🔗 ' + (L ? 'Gasto vinculado' : 'Linked expense'), h.cobFor || '—']);
    FT.sheet({
      title: hNota(h) || (L ? 'Movimiento' : 'Movement'),
      html: rows.map(function (r) { return '<div class="ft-row"><span class="k">' + r[0] + '</span><span class="v">' + r[1] + '</span></div>'; }).join('') +
        (cob ? '<p style="font-size:11px;color:var(--text3);margin-top:8px">' + (L ? 'Cubrió la parte de «' + (h.cobFor || '') + '» que excedía tu disponible del mes.' : 'Covered the part of "' + (h.cobFor || '') + '" over your monthly available.') + '</p>' : ''),
      actions: [
        { label: cob ? '↩ ' + (L ? 'Deshacer cobertura' : 'Undo coverage') : '🗑️ ' + (L ? 'Eliminar' : 'Delete'),
          onClick: function () {
            FT.confirm(cob ? (L ? '¿Deshacer la cobertura? El dinero vuelve al pozo y el gasto vuelve a contar contra tu disponible.' : 'Undo coverage? Money returns to the fund and the expense counts again.') : (L ? '¿Eliminar este movimiento? Se revierte el saldo.' : 'Delete this movement? The balance is reverted.')).then(function (ok) {
              if (!ok) return;
              // h.cat==='💳 Deudas' (QA 03-oct-2026): este "retiro" en
              // realidad pagó una deuda -- borrarlo debe revertir el fondo
              // Y la deuda Y quitar la transacción vinculada juntos, no
              // solo el fondo (eso dejaba la deuda pagada "de la nada").
              // FT.deleteTx ya sabe hacer las tres cosas (su propia rama
              // fundSource + la rama "💳 Deudas"), igual que ya hace para
              // un retiro marcado monthTx.
              if (cob) FT.undoCobertura(h.cobId);
              else if (h.monthTx || h.cat === '💳 Deudas') FT.deleteTx(String(h.id).replace(/^tx_/, ''));
              else if (E) FT.reverseEmergency(h.id);
              else FT.reverseSavings(h.id);
              FT.toast(L ? 'Listo' : 'Done'); render();
            });
          } }
      ]
    });
  }

  document.addEventListener('ft:datachanged', render);
  document.addEventListener('ft:langchange', render);
  render();
  // Deep-link opcional (12-oct-2026, "Cómo se reparte tu cheque"): además
  // de caer ya en el fondo correcto (ft_open_fund, en refreshFunds), si
  // viene con ft_open_fund_edit abre de una vez "Editar fondo" -- sin
  // esto, el usuario llegaba al fondo correcto pero igual tenía que buscar
  // el botón de editar por su cuenta.
  if (!E && FT.getRaw('ft_open_fund_edit') === '1') {
    FT.del('ft_open_fund_edit');
    var fEdit = activeFund();
    if (fEdit) setTimeout(function () { openFundForm(fEdit); }, 250);
  }
  return { render: render };
};

/* ─────────────────────────────────────────────────────────────────────────
   16c · PANTALLA DE ÍTEMS RECURRENTES DE CATÁLOGO — compartida por
         suscripciones.html y servicios.html (mismo arquetipo: nombre + monto
         + frecuencia + fecha de cobro, con historial/tendencia y próximas a
         pagar). Cambia el flag `opts.kind` ('sub' | 'serv').
   Uso:  FT.recurringItemsScreen({ kind:'sub', mount:'#root' })
   ───────────────────────────────────────────────────────────────────────── */
FT.recurringItemsScreen = function (opts) {
  opts = opts || {};
  var isSub = opts.kind !== 'serv';
  var mount = document.querySelector(opts.mount || '#root');
  if (!mount) return;

  var key = isSub ? K.subs : K.servicios;
  var histKey = isSub ? K.subsHist : K.serviciosHist;
  var icon = isSub ? '🔄' : '🏠';
  var pastel = isSub ? 'pink' : 'coral';
  var pastelTx = isSub ? 'var(--pink-tx)' : 'var(--coral-tx)';
  // 15-oct-2026: estas categorías no tenían rama de idioma -- un usuario en
  // inglés veía "Entretenimiento"/"Luz"/"Agua" sin importar FT.lang. Mismo
  // vocabulario que ya usa el placeholder en inglés del formulario más abajo
  // ("Power, Water, Internet...").
  var CATS = FT.lang === 'es'
    ? (isSub ? ['Entretenimiento', 'Música', 'Trabajo', 'Salud', 'Fitness', 'Cloud/Tech', 'Otro'] : ['💡 Luz', '💧 Agua', '🔥 Gas', '📶 Internet', '🧹 Mantenimiento', 'Otro'])
    : (isSub ? ['Entertainment', 'Music', 'Work', 'Health', 'Fitness', 'Cloud/Tech', 'Other'] : ['💡 Power', '💧 Water', '🔥 Gas', '📶 Internet', '🧹 Maintenance', 'Other']);
  var idPrefix = isSub ? 's_' : 'sv_';

  function list() { return FT.get(key, []) || []; }
  function saveList(l) { FT.set(key, l); FT._changed(); }
  function es() { return FT.lang === 'es'; }
  // Personalizado (12-oct-2026): equivalente mensual aproximado a partir de
  // cuántos días en promedio pasan entre cobros (30.44 = 365.25/12, mismo
  // criterio que ya usaba 4.33 semanas/mes para 'weekly') -- así el total
  // "gasto mensual en servicios" sigue siendo comparable sin importar la
  // frecuencia real de cada uno.
  function toMonthly(s) {
    var amt = parseFloat(s.amount) || 0;
    if (s.freq === 'annual') return amt / 12;
    if (s.freq === 'weekly') return amt * 4.33;
    if (typeof s.freq === 'string' && s.freq.indexOf('custom:') === 0) {
      var parts = s.freq.split(':'), n = parseInt(parts[1], 10) || 1, unit = parts[2];
      var daysPer = unit === 'days' ? n : unit === 'weeks' ? n * 7 : unit === 'years' ? n * 365.25 : n * 30.44;
      return daysPer > 0 ? amt * (30.44 / daysPer) : amt;
    }
    return amt;
  }
  function freqLbl(f) { var L = es(); return { monthly: L ? 'Mensual' : 'Monthly', annual: L ? 'Anual' : 'Annual', weekly: L ? 'Semanal' : 'Weekly' }[f] || FT.customFreqLabel(f) || f; }
  // 15-oct-2026: el filtro de abajo pegaba una 's'/'es' a lo bruto sobre
  // freqLbl() para pluralizar -- producía "Monthlys"/"Annuales", que no son
  // palabras reales en ningún idioma (y en español real "Mensual"+'s' da
  // "Mensuals" en vez de "Mensuales"). En inglés un adjetivo de frecuencia
  // como "Monthly"/"Annual" no necesita plural -- se deja tal cual.
  function freqLblPlural(f) { var L = es(); return { monthly: L ? 'Mensuales' : 'Monthly', annual: L ? 'Anuales' : 'Annual' }[f] || freqLbl(f); }
  // Nombre de unidad para "$10/mes" en inglés ("$10/month", no "$10/monthly"
  // -- freqLbl() es un adjetivo, no sirve como unidad después de "/").
  function freqUnitEn(f) { return { monthly: 'month', annual: 'year', weekly: 'week' }[f] || freqLbl(f).toLowerCase(); }
  function nextBillingDate(s) {
    if (!s.date) return null;
    var p = s.date.split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2]);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var guard = 0;
    while (d < today && guard < 1000) {
      FT.advanceByFreq(d, s.freq);
      guard++;
    }
    return d;
  }
  function loadHistory6() {
    var hist = FT.get(histKey, {}) || {}, now = new Date(), out = [];
    for (var i = 5; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      var k = d.toISOString().slice(0, 7);
      out.push({ month: k, label: d.toLocaleDateString(es() ? 'es-MX' : 'en-US', { month: 'short' }), value: hist[k] != null ? hist[k] : null });
    }
    return out;
  }
  function updateHistorySnapshot(totalMonthly) {
    var hist = FT.get(histKey, {}) || {};
    hist[new Date().toISOString().slice(0, 7)] = totalMonthly;
    FT.set(histKey, hist);
  }

  var filterMode = 'all';

  function trendChartHTML(trend) {
    var L = es(), W = 800, H = 150, padL = 16, padR = 16, padT = 14, padB = 26;
    var vals = trend.map(function (t) { return t.value; }).filter(function (v) { return v != null; });
    var maxVal = Math.max(1, vals.reduce(function (a, b) { return Math.max(a, b); }, 0));
    var stepX = (W - padL - padR) / (trend.length - 1 || 1);
    function scaleY(v) { return H - padB - (v / maxVal) * (H - padT - padB); }
    var pts = trend.map(function (t, i) { return t.value != null ? { x: padL + i * stepX, y: scaleY(t.value) } : null; });
    var path = '';
    pts.forEach(function (p) { if (p) path += (path === '' ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ' '; });
    var dots = pts.map(function (p) { return p ? '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4" fill="var(--g-main)"/>' : ''; }).join('');
    var labels = trend.map(function (t, i) { return '<text x="' + (padL + i * stepX).toFixed(1) + '" y="' + (H - 6) + '" font-size="12" fill="#A0A3AF" text-anchor="middle">' + t.label + '</text>'; }).join('');
    var known = trend.filter(function (t) { return t.value != null; });
    var msg = known.length > 1
      ? (known[known.length - 1].value > known[known.length - 2].value
          ? (L ? '⚠️ Tu gasto subió vs el mes pasado' : '⚠️ Your spending went up vs last month')
          : (L ? '✅ Tu gasto bajó o se mantuvo' : '✅ Your spending went down or stayed the same'))
      : (L ? 'Vamos guardando el histórico mes a mes' : "We're building your monthly history");
    return '<div class="ft-card"><div style="font-size:13px;font-weight:800;margin-bottom:8px">📈 ' + (L ? 'Tendencia (6 meses)' : 'Trend (6 months)') + '</div>' +
      '<svg style="width:100%;max-height:150px;display:block" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' +
      (path ? '<path d="' + path + '" fill="none" stroke="var(--g-main)" stroke-width="3"/>' : '') + dots + labels + '</svg>' +
      '<div style="font-size:11px;color:var(--text3);margin-top:4px">' + msg + '</div></div>';
  }

    /** Herramienta de limpieza de duplicados (pedida explícita en el reporte
     *  de QA de B2, "cargo zombie"): dos suscripciones/servicios con el
     *  mismo nombre y monto generan CADA UNA su propio cargo por separado
     *  -- no es que un cargo "regenere", son dos registros reales
     *  cobrándose cada mes. El resguardo de doble-tap (agregado antes)
     *  previene NUEVOS duplicados, pero no corrige uno que ya se creó antes
     *  de que ese resguardo existiera -- por eso hace falta esta pantalla
     *  aparte: agrupa por nombre+monto normalizados y deja borrar la(s)
     *  copia(s) de más, quedándote solo con una. */
  function findDuplicateGroups() {
    var norm = function (s) { return String(s || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\w\sáéíóúñ]/g, ''); };
    var groups = {};
    list().forEach(function (s) {
      var k = norm(s.name) + '|' + (parseFloat(s.amount) || 0).toFixed(2);
      (groups[k] = groups[k] || []).push(s);
    });
    return Object.keys(groups).map(function (k) { return groups[k]; }).filter(function (g) { return g.length >= 2; });
  }
  function duplicateWarningHTML() {
    var L = es(), dups = findDuplicateGroups();
    if (!dups.length) return '';
    return '<div class="ft-card" style="border:1.5px solid var(--red)">' +
      '<div style="font-size:12.5px;font-weight:800;color:var(--red);margin-bottom:8px">⚠️ ' + (L ? dups.length + ' posible(s) duplicado(s) -- cada copia cobra por separado' : dups.length + ' possible ' + (dups.length === 1 ? 'duplicate' : 'duplicates') + ' -- each copy charges separately') + '</div>' +
      dups.map(function (g) {
        return '<div style="background:var(--sunk);border-radius:10px;padding:8px 10px;margin-bottom:8px">' +
          '<div style="font-size:11.5px;font-weight:700;margin-bottom:6px">' + g[0].name + ' · ' + FT.money(parseFloat(g[0].amount) || 0) + ' × ' + g.length + '</div>' +
          g.map(function (s) { return '<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0"><span style="font-size:10.5px;color:var(--text3)">' + freqLbl(s.freq) + ' · ' + FT.date(s.date) + (s.paused ? ' · ' + (L ? 'pausada' : 'paused') : '') + '</span><button type="button" class="tap" data-deldup="' + s.id + '" style="background:var(--red-dim);color:var(--red);border:none;border-radius:8px;padding:5px 9px;font-size:10.5px;font-weight:700;cursor:pointer;font-family:inherit">🗑️ ' + (L ? 'Borrar esta' : 'Delete this') + '</button></div>'; }).join('') +
        '</div>';
      }).join('') +
      '<div style="font-size:10.5px;color:var(--text3)">' + (L ? 'Deja solo una copia de cada una -- los cargos ya cobrados no se borran solos, revísalos en Historial.' : "Keep only one copy of each -- charges already billed don't delete themselves, check History.") + '</div>' +
    '</div>';
  }

  function render() {
    var L = es(), all = list();
    var filtered = filterMode === 'all' ? all : all.filter(function (s) { return s.freq === filterMode; });
    var active = all.filter(function (s) { return !s.paused; });
    var total = active.reduce(function (a, s) { return a + toMonthly(s); }, 0);
    updateHistorySnapshot(total);

    var upcoming = active.map(function (s) { return { s: s, next: nextBillingDate(s) }; }).filter(function (x) { return x.next; })
      .sort(function (a, b) { return a.next - b.next; }).slice(0, 5);

    var h = duplicateWarningHTML() + '<div class="ft-card"><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      '<div style="text-align:center"><div class="ft-num" style="font-size:21px;color:' + pastelTx + '">' + FT.money(total) + '</div><div style="font-size:11px;color:var(--text3)">' + (L ? 'al mes' : 'per month') + '</div></div>' +
      '<div style="text-align:center"><div class="ft-num" style="font-size:21px;color:var(--red)">' + FT.money(total * 12) + '</div><div style="font-size:11px;color:var(--text3)">' + (L ? 'al año' : 'per year') + '</div></div></div></div>';

    h += trendChartHTML(loadHistory6());

    if (upcoming.length) {
      h += '<div class="ft-card"><div style="font-size:13px;font-weight:800;margin-bottom:8px">⏰ ' + (L ? 'Próximas a pagar' : 'Upcoming payments') + '</div>' +
        upcoming.map(function (x) {
          var days = Math.ceil((x.next - new Date(new Date().toDateString())) / 86400000);
          return '<div class="tap" data-open="' + x.s.id + '" style="display:flex;align-items:center;gap:10px;padding:7px 0;cursor:pointer">' +
            '<div class="ft-tx-ico ' + pastel + '" style="width:34px;height:34px;font-size:15px;display:grid;place-items:center;border-radius:10px">' + icon + '</div>' +
            '<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:700">' + x.s.name + '</div>' +
            '<div style="font-size:10px;color:' + (days <= 3 ? 'var(--red)' : 'var(--text3)') + '">' + FT.date(x.s.date) + ' · ' + (days === 0 ? (L ? 'hoy' : 'today') : days + 'd') + '</div></div>' +
            '<div style="font-size:13px;font-weight:800">' + FT.money(parseFloat(x.s.amount) || 0) + '</div></div>';
        }).join('') + '</div>';
    }

    h += '<div class="ft-chip-row" style="display:flex;gap:6px;overflow-x:auto;margin-bottom:12px">' +
      ['all', 'monthly', 'annual'].map(function (f) {
        var lbl = f === 'all' ? (L ? 'Todas' : 'All') : freqLblPlural(f);
        return '<button class="ft-chip tap' + (filterMode === f ? ' on' : '') + '" data-f="' + f + '" style="flex-shrink:0;background:' + (filterMode === f ? 'var(--ink)' : 'var(--sunk)') + ';border:1.5px solid ' + (filterMode === f ? 'var(--ink)' : 'var(--hair)') + ';color:' + (filterMode === f ? '#fff' : 'var(--text2)') + ';border-radius:99px;padding:6px 13px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer">' + lbl + '</button>';
      }).join('') + '</div>';

    h += '<div class="ft-card" style="padding:2px 16px">';
    if (!filtered.length) {
      h += '<div class="ft-empty">' + (isSub ? (L ? 'Sin suscripciones' : 'No subscriptions') : (L ? 'Sin servicios registrados' : 'No services yet')) + '</div>';
    } else {
      h += filtered.map(function (s) {
        return '<div class="tap" data-open="' + s.id + '" style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--hair);cursor:pointer;' + (s.paused ? 'opacity:.55' : '') + '">' +
          '<div class="ft-tx-ico ' + pastel + '" style="width:42px;height:42px;font-size:19px;display:grid;place-items:center;border-radius:13px;flex-shrink:0">' + icon + '</div>' +
          '<div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:800">' + s.name + (s.paused ? ' <span style="font-size:9px;background:var(--chip);color:var(--text3);padding:2px 7px;border-radius:20px;font-weight:800">' + (L ? 'PAUSADA' : 'PAUSED') + '</span>' : '') + (s.autopay ? ' <span style="font-size:9px;background:var(--g-light);color:var(--g-dark);padding:2px 7px;border-radius:20px;font-weight:800">' + (L ? '🔁 AUTOPAY' : '🔁 AUTOPAY') + '</span>' : ' <span style="font-size:9px;background:var(--amber-bg,#FBF0DD);color:var(--amber,#8A5A12);padding:2px 7px;border-radius:20px;font-weight:800">' + (L ? '✋ MANUAL' : '✋ MANUAL') + '</span>') + '</div>' +
          '<div style="font-size:11px;color:var(--text3)">' + freqLbl(s.freq) + ' · ' + (s.cat || '') + ' · ' + FT.date(s.date) + '</div></div>' +
          '<div style="font-size:14px;font-weight:800;color:' + pastelTx + '">' + FT.money(parseFloat(s.amount) || 0) + '</div></div>';
      }).join('');
    }
    h += '</div>';

    h += '<div class="tap" data-go="recurrentes.html" style="font-size:12px;font-weight:700;color:var(--blue);text-align:center;padding:6px 0 4px">♻️ ' + (L ? 'Ver todos tus recurrentes' : 'See all your recurring items') + ' →</div>';

    mount.innerHTML = h;
    mount.querySelectorAll('[data-f]').forEach(function (b) { b.onclick = function () { filterMode = b.getAttribute('data-f'); render(); }; });
    mount.querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function () { openDetail(b.getAttribute('data-open')); }; });
    mount.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { FT.go(b.getAttribute('data-go')); }; });
    mount.querySelectorAll('[data-deldup]').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-deldup'), L2 = es();
        FT.confirm(L2 ? '¿Eliminar esta copia? Esto NO borra los cargos que ya se cobraron -- revísalos en Historial.' : "Delete this copy? This does NOT delete charges already billed -- check History.").then(function (ok) {
          if (!ok) return;
          saveList(list().filter(function (x) { return String(x.id) !== id; }));
          FT.toast(L2 ? '🗑️ Copia eliminada' : '🗑️ Copy deleted');
          render();
        });
      };
    });
  }

  /* 19-oct-2026, a petición de Ramón: "al ingresar un servicio, que salga todo
     lo necesario de una vez: cada cuándo se cobra o si es una sola vez... el
     botón de autopay se siente confuso sin saber cada cuándo es recurrente".
     Tres preguntas, en este orden y en un mismo paso:
       1) ¿Se repite o es un pago único?  2) ¿Cada cuándo y desde qué fecha?
       3) ¿Quién lo cobra: yo cada vez, o se cobra solo (autopay)?
     Pago único NO crea un recurrente: se registra como un gasto normal en esa
     fecha (así no hace falta una frecuencia nueva en ningún otro lugar). */
  function segBtns(attr, items, cur) {
    return '<div style="display:grid;grid-template-columns:repeat(' + items.length + ',1fr);gap:6px">' + items.map(function (it) {
      var on = it[0] === cur;
      return '<button type="button" data-' + attr + '="' + it[0] + '" class="tap' + (on ? ' on' : '') + '" style="padding:10px 6px;border-radius:10px;border:1.5px solid ' + (on ? 'var(--g-main)' : 'var(--hair)') + ';background:' + (on ? 'var(--g-light)' : 'var(--sunk)') + ';color:' + (on ? 'var(--g-dark)' : 'var(--text2)') + ';font-family:inherit;font-size:12px;font-weight:800;cursor:pointer">' + it[1] + '</button>';
    }).join('') + '</div>';
  }
  function formFields(s) {
    var L = es(), isNew = !s;
    return '<div class="ft-field"><label>' + (L ? 'Nombre' : 'Name') + '</label><input id="siName" value="' + (s ? String(s.name || '').replace(/"/g, '&quot;') : '') + '" placeholder="' + (isSub ? 'Netflix, Spotify...' : (L ? 'Luz, Agua, Internet...' : 'Power, Water, Internet...')) + '"></div>' +
      '<div class="ft-field"><label>' + (L ? 'Monto' : 'Amount') + ' ($)</label><input id="siAmount" type="number" inputmode="decimal" step="0.01" min="0" value="' + (s ? s.amount : '') + '"></div>' +
      (isNew ? '<div class="ft-field"><label>' + (L ? '¿Se repite?' : 'Does it repeat?') + '</label>' + segBtns('st', [['rep', '🔁 ' + (L ? 'Se repite' : 'Repeats')], ['once', '1️⃣ ' + (L ? 'Pago único' : 'One time')]], 'rep') + '</div>' : '') +
      // Personalizado (12-oct-2026, a petición de Ramón: "un pago de la
      // basura que se cobra cada 4 meses" -- no entra en mensual/anual/
      // semanal). Marcado "selected" si ya es custom al editar.
      '<div class="ft-field" id="siRepWrap"><label>' + (L ? '¿Cada cuándo se cobra?' : 'How often is it charged?') + '</label><select id="siFreq">' +
        ['monthly', 'annual', 'weekly'].map(function (f) { return '<option value="' + f + '" ' + (s && s.freq === f ? 'selected' : '') + '>' + freqLbl(f) + '</option>'; }).join('') +
        '<option value="custom"' + (s && typeof s.freq === 'string' && s.freq.indexOf('custom:') === 0 ? ' selected' : '') + '>' + (L ? 'Personalizado (cada X días, semanas, meses…)' : 'Custom (every X days, weeks, months…)') + '</option></select>' +
        FT.customFreqSubFormHTML('si', s && s.freq) + '</div>' +
      '<div class="ft-field"><label id="siDateLbl">' + (L ? 'Próxima fecha de cobro' : 'Next billing date') + '</label><input id="siDate" type="date" value="' + (s ? s.date : FT.todayISO()) + '"></div>' +
      // CATS varía según FT.lang. Si editas un artículo guardado en el OTRO
      // idioma, su s.cat guardado no aparece en CATS del idioma actual -- se
      // agrega como opción extra para que no se pierda en silencio al guardar.
      '<div class="ft-field"><label>' + (L ? 'Categoría' : 'Category') + '</label><select id="siCat">' +
        (s && s.cat && CATS.indexOf(s.cat) === -1 ? '<option selected>' + s.cat + '</option>' : '') +
        CATS.map(function (c) { return '<option ' + (s && s.cat === c ? 'selected' : '') + '>' + c + '</option>'; }).join('') + '</select></div>' +
      // Autopay (15-oct-2026): NO tiene relación con "recurrente" de la app
      // (si ESTA app genera el cargo) -- es si quien de verdad cobra (tu banco,
      // Netflix, etc.) lo hace solo, fuera de la app.
      '<div class="ft-field" id="siApWrap"><label>' + (L ? '¿Quién lo cobra?' : 'Who charges it?') + '</label>' +
        segBtns('ap', [['0', '✋ ' + (L ? 'Yo lo pago' : 'I pay it')], ['1', '🔁 ' + (L ? 'Se cobra solo' : 'Auto-charged')]], s && s.autopay ? '1' : '0') +
        '<p id="siApNote" style="font-size:10.5px;color:var(--text3);margin:6px 0 0"></p></div>';
  }

  function openForm(id) {
    var L = es(), s = id ? list().find(function (x) { return String(x.id) === String(id); }) : null;
    FT.modal({
      title: s ? (L ? 'Editar' : 'Edit') : (isSub ? (L ? 'Nueva suscripción' : 'New subscription') : (L ? 'Nuevo servicio' : 'New service')),
      html: formFields(s),
      onOpen: function (body) {
        var cf = FT.wireCustomFreqSubForm(body, 'si');
        var sel = body.querySelector('#siFreq');
        var st = 'rep', ap = s && s.autopay ? '1' : '0';
        function paint(attr, val) {
          body.querySelectorAll('[data-' + attr + ']').forEach(function (b) {
            var on = b.getAttribute('data-' + attr) === val;
            b.style.borderColor = on ? 'var(--g-main)' : 'var(--hair)'; b.style.background = on ? 'var(--g-light)' : 'var(--sunk)'; b.style.color = on ? 'var(--g-dark)' : 'var(--text2)';
          });
        }
        function sync() {
          var once = st === 'once';
          body.querySelector('#siRepWrap').style.display = once ? 'none' : '';
          body.querySelector('#siApWrap').style.display = once ? 'none' : '';
          cf.show(!once && sel.value === 'custom');
          body.querySelector('#siDateLbl').textContent = once ? (L ? 'Fecha del pago' : 'Payment date') : (L ? 'Próxima fecha de cobro' : 'Next billing date');
          body.querySelector('#siApNote').textContent = ap === '1'
            ? (L ? 'Tu banco o el proveedor lo cobra solo. La app solo lo anota en tu historial.' : 'Your bank or the provider charges it on its own. The app just records it.')
            : (L ? 'Tú lo pagas cada vez. La app te lo recuerda antes de la fecha.' : 'You pay it each time. The app reminds you before the date.');
          paint('st', st); paint('ap', ap);
        }
        body.querySelectorAll('[data-st]').forEach(function (b) { b.onclick = function () { st = b.getAttribute('data-st'); sync(); }; });
        body.querySelectorAll('[data-ap]').forEach(function (b) { b.onclick = function () { ap = b.getAttribute('data-ap'); sync(); }; });
        sel.addEventListener('change', sync);
        body._ftGet = function () { return { st: st, ap: ap }; };
        sync();
      },
      onSave: function (body) {
        // Doble-tap en "Guardar" podía crear dos suscripciones/servicios
        // idénticos -- luego cada uno acumula sus propios cargos por
        // separado (mismo patrón ya blindado en el abono de deudas).
        if (window._savingSubServ) return true;
        window._savingSubServ = true;
        setTimeout(function () { window._savingSubServ = false; }, 800);
        var name = body.querySelector('#siName').value.trim();
        var amount = parseFloat(body.querySelector('#siAmount').value) || 0;
        if (!name || !amount) { FT.toast(L ? '⚠️ Llena nombre y monto' : '⚠️ Fill name and amount'); window._savingSubServ = false; return true; }
        var sv = body._ftGet ? body._ftGet() : { st: 'rep', ap: '0' };
        var date = body.querySelector('#siDate').value, cat = body.querySelector('#siCat').value;
        if (!date) { FT.toast(L ? '⚠️ Elige una fecha' : '⚠️ Pick a date'); window._savingSubServ = false; return true; }

        // Pago único: se anota como un gasto normal en esa fecha, sin recurrente.
        if (!s && sv.st === 'once') {
          FT.addEntry({ type: 'gasto', desc: name, amount: amount, date: date, cat: cat, hogar: !isSub });
          FT.toast(L ? '✅ Pago único registrado' : '✅ One-time payment recorded');
          render();
          FT.closeTop();
          return true;
        }

        var freq = body.querySelector('#siFreq').value;
        if (freq === 'custom') freq = FT.wireCustomFreqSubForm(body, 'si').getFreq();
        var autopay = sv.ap === '1';

        function doSave() {
          var l = list();
          if (s) {
            var i = l.findIndex(function (x) { return String(x.id) === String(id); });
            l[i] = isSub ? Object.assign({}, l[i], { name: name, amount: amount, freq: freq, date: date, cat: cat, autopay: autopay })
                         : Object.assign({}, l[i], { name: name, amount: amount, freq: freq, date: date, cat: cat, autopay: autopay, hogar: true });
          } else {
            l.push(isSub
              ? { id: idPrefix + Date.now(), name: name, amount: amount, freq: freq, date: date, cat: cat, autopay: autopay, paused: false }
              : { id: idPrefix + Date.now(), name: name, amount: amount, freq: freq, date: date, cat: cat, autopay: autopay, paused: false, hogar: true, createdBy: FT.userName() });
          }
          saveList(l);
          FT.toast(L ? '✅ Guardado' : '✅ Saved');
          render();
          FT.closeTop();
        }

        // Aviso de posible duplicado: si tu pareja ya tiene algo con un
        // nombre muy parecido (ella tiene "Home At&t", tú vas a crear "Home
        // ATT"), lo más probable es que ambos hayan configurado el MISMO
        // gasto real por separado sin darse cuenta -- eso genera un cargo
        // doble cada mes. Solo se checa al CREAR y con el hogar conectado.
        if (!s && FT.hogarConnected()) {
          var norm = function (x) { return String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
          var nNorm = norm(name);
          var partnerList = isSub ? ((FT.partnerProfile() && FT.partnerProfile().data && FT.partnerProfile().data.subscriptions) || []) : FT.servicios().filter(function (x) { return x._fromPartner; });
          var dup = partnerList.find(function (x) { return x && norm(x.name) === nNorm; });
          if (dup) {
            var partnerName = (FT.hogar().partnerName || (L ? 'tu pareja' : 'your partner'));
            FT.confirm(L
              ? partnerName + ' ya tiene "' + dup.name + '" (' + FT.money(parseFloat(dup.amount) || 0) + '/' + freqLbl(dup.freq).toLowerCase() + ') — si es el mismo gasto real, se van a cobrar el doble cada mes. ¿Aun así quieres agregar la tuya?'
              : partnerName + ' already has "' + dup.name + '" (' + FT.money(parseFloat(dup.amount) || 0) + '/' + freqUnitEn(dup.freq) + ') — if it\'s the same real expense, you\'ll both get charged for it every month. Add yours anyway?'
            ).then(function (ok) { if (ok) doSave(); });
            return true; // el modal se queda abierto -- se cierra dentro de doSave() si confirman
          }
        }

        doSave();
        return true; // doSave ya cierra el modal -- evita que el wrapper intente cerrar de más
      }
    });
  }

  function openDetail(id) {
    var L = es(), s = list().find(function (x) { return String(x.id) === String(id); });
    if (!s) return;
    var next = nextBillingDate(s);
    FT.sheet({
      title: s.name,
      html: '<div style="text-align:center;margin-bottom:16px">' +
        '<div class="ft-tx-ico ' + pastel + '" style="width:54px;height:54px;font-size:24px;display:grid;place-items:center;border-radius:16px;margin:0 auto 8px">' + icon + '</div>' +
        '<div class="ft-num" style="font-size:26px;color:' + pastelTx + '">' + FT.money(parseFloat(s.amount) || 0) + '</div>' +
        (s.paused ? '<span style="background:var(--chip);color:var(--text3);font-size:10px;font-weight:800;padding:3px 10px;border-radius:20px;display:inline-block;margin-top:6px">⏸️ ' + (L ? 'Pausada' : 'Paused') + '</span>' : '') + '</div>' +
        '<div class="ft-row"><span class="k">' + (L ? 'Frecuencia' : 'Frequency') + '</span><span class="v">' + freqLbl(s.freq) + '</span></div>' +
        '<div class="ft-row"><span class="k">' + (L ? 'Categoría' : 'Category') + '</span><span class="v">' + (s.cat || '—') + '</span></div>' +
        '<div class="ft-row"><span class="k">' + (L ? 'Equivalente mensual' : 'Monthly equivalent') + '</span><span class="v">' + FT.money(toMonthly(s)) + '</span></div>' +
        (next && !s.paused ? '<div class="ft-row"><span class="k">' + (L ? 'Próximo cobro' : 'Next charge') + '</span><span class="v">' + FT.date(next) + '</span></div>' : ''),
      actions: [
        { label: '✏️ ' + (L ? 'Editar' : 'Edit'), onClick: function () { openForm(id); } },
        { label: s.paused ? '▶️ ' + (L ? 'Reanudar' : 'Resume') : '⏸️ ' + (L ? 'Pausar' : 'Pause'), onClick: function () { var l = list(); var i = l.findIndex(function (x) { return String(x.id) === String(id); }); l[i].paused = !l[i].paused; saveList(l); FT.toast(l[i].paused ? (L ? '⏸️ Pausada' : '⏸️ Paused') : (L ? '▶️ Reanudada' : '▶️ Resumed')); render(); } },
        { label: '🗑️ ' + (L ? 'Eliminar' : 'Delete'), onClick: function () { FT.confirm(L ? '¿Eliminar?' : 'Delete?').then(function (ok) { if (ok) { saveList(list().filter(function (x) { return String(x.id) !== String(id); })); FT.toast(L ? '🗑️ Eliminado' : '🗑️ Deleted'); render(); } }); } }
      ]
    });
  }

  document.addEventListener('ft:datachanged', render);
  document.addEventListener('ft:langchange', render);
  render();
  return { render: render, openForm: openForm };
};

/* ─────────────────────────────────────────────────────────────────────────
   16d · ASISTENTE IA — contexto financiero + historial de chat (asistente.html)
   ───────────────────────────────────────────────────────────────────────── */
/** Historial de mensajes guardado en este dispositivo (tope 40 — ida y vuelta
 *  se manda solo una ventana reciente a la API, ver asistente.html). */
FT.chatHistory = function () { return FT.get(K.chatHist, []) || []; };
FT.chatAppend = function (role, text) {
  var h = FT.chatHistory();
  h.push({ role: role, text: text, ts: Date.now() });
  if (h.length > 40) h = h.slice(-40);
  FT.set(K.chatHist, h);
  return h;
};
FT.chatClear = function () { FT.del(K.chatHist); };

/** Arma el resumen de finanzas del usuario que se manda como `system` a Claude
 *  en cada pregunta — números reales, acotado (top de categorías/próximos
 *  recurrentes) para no disparar el consumo de tokens sin importar cuántos
 *  años de historial tenga la cuenta. */
FT.buildFinanceContext = function () {
  var es = FT.lang === 'es';
  var u = FT.user() || {};
  var now = new Date(), y = now.getFullYear(), m = now.getMonth();
  function inMonth(t) {
    if (!t.date) return false;
    var p = String(t.date).split(/[-T]/);
    return parseInt(p[0], 10) === y && (parseInt(p[1], 10) - 1) === m;
  }
  var txs = FT.txsCounted().filter(inMonth);
  var income = parseFloat(u.income) || 0;
  var hogarOn = FT.hogarConnected();
  var pct = FT.personalPct();
  var personalBase = hogarOn ? income * pct / 100 : income;
  var needs = Math.round(personalBase * .5), wants = Math.round(personalBase * .3), savTarget = Math.round(personalBase * .2);

  var gastoPersonal = 0, byCat = {};
  txs.forEach(function (t) {
    if (t.type !== 'gasto' || t.hogar === true) return;
    var amt = parseFloat(t.amount) || 0;
    gastoPersonal += amt;
    var cat = String(t.cat || (es ? 'Otros' : 'Other')).replace(/^\S+\s*/, '');
    byCat[cat] = (byCat[cat] || 0) + amt;
  });
  var topCats = Object.keys(byCat).map(function (c) { return { cat: c, amt: byCat[c] }; })
    .sort(function (a, b) { return b.amt - a.amt; }).slice(0, 6);

  var debts = FT.debts().slice(0, 8);
  var goals = FT.goals().slice(0, 8);
  var invPersonal = FT.investments('');
  var invHogar = hogarOn ? FT.investments('hogar') : [];
  var invTotal = invPersonal.concat(invHogar).reduce(function (a, i) { return a + FT.investmentValue(i); }, 0);
  var subsTotal = FT.subs().filter(function (s) { return !s.paused; }).reduce(function (a, s) { return a + (parseFloat(s.amount) || 0); }, 0);
  var servTotal = FT.servicios().filter(function (s) { return !s.paused; }).reduce(function (a, s) { return a + (parseFloat(s.amount) || 0); }, 0);
  var upcoming = FT.recurAllList().filter(function (r) { return !r.paused; }).slice(0, 6);

  var monthLabel = now.toLocaleDateString(es ? 'es-MX' : 'en-US', { month: 'long', year: 'numeric' });
  var L = [];
  L.push((es ? 'Eres el Asistente financiero dentro de la app FinTrack Pro, hablando con ' : 'You are the financial Assistant inside the FinTrack Pro app, talking to ') + (u.name || (es ? 'el usuario' : 'the user')) + '.');
  L.push(es
    ? 'Responde SIEMPRE en español, directo y sin rodeos, con cifras concretas de los datos de abajo. Nunca inventes números que no estén aquí — si falta un dato para responder bien, dilo claro en vez de adivinar. No repitas avisos genéricos de "consulta a un asesor financiero" salvo que de verdad aplique. Si el usuario adjunta una foto de un producto, evalúa el precio contra su disponible del mes y sus metas antes de responder si "sí se lo puede comprar". Tu respuesta se muestra como texto plano en una burbuja de chat — NUNCA uses markdown (nada de **, #, backticks); para listas usa líneas con "•" o un guion.'
    : "Always answer in English, direct and to the point, with concrete figures from the data below. Never invent numbers that aren't here — if something is missing to answer well, say so instead of guessing. Don't repeat generic \"consult a financial advisor\" disclaimers unless it truly applies. If the user attaches a photo of a product, weigh its price against their available budget and goals before answering whether they can afford it. Your reply is shown as plain text in a chat bubble — NEVER use markdown (no **, #, backticks); for lists use lines starting with \"•\" or a dash.");
  L.push('');
  L.push('=== ' + (es ? 'DATOS DE ' + monthLabel : 'DATA FOR ' + monthLabel).toUpperCase() + ' ===');
  L.push((es ? 'Ingreso mensual' : 'Monthly income') + ': ' + FT.money(income) + (hogarOn ? (es ? ' (de eso, ' + pct + '% es personal — el resto va a hogar/ahorro compartido)' : ' (of that, ' + pct + '% is personal — the rest goes to household/shared savings)') : ''));
  L.push((es ? 'Presupuesto personal del mes (50/30/20)' : "This month's personal budget (50/30/20)") + ': ' + (es ? 'necesidades ' : 'needs ') + FT.money(needs) + ', ' + (es ? 'gustos ' : 'wants ') + FT.money(wants) + ', ' + (es ? 'ahorro meta ' : 'savings target ') + FT.money(savTarget) + '.');
  L.push((es ? 'Gasto personal registrado este mes' : 'Personal spending recorded this month') + ': ' + FT.money(gastoPersonal) + '.');
  if (topCats.length) {
    L.push((es ? 'Categorías con más gasto este mes' : 'Top spending categories this month') + ': ' + topCats.map(function (c) { return c.cat + ' ' + FT.money(c.amt); }).join(', ') + '.');
  }
  L.push((es ? 'Ahorro libre disponible' : 'Free savings available') + ': ' + FT.money(FT.savingsBalance()) + ' · ' + (es ? 'Fondo de emergencia' : 'Emergency fund') + ': ' + FT.money(FT.emergencyBalance()) + '.');
  if (debts.length) {
    L.push((es ? 'Deudas activas' : 'Active debts') + ': ' + debts.map(function (d) {
      return (d.name || d.type) + ' — ' + (es ? 'saldo ' : 'balance ') + FT.money(d.balance) + (d.payment ? (es ? ', pago ' : ', payment ') + FT.money(d.payment) + (es ? '/mes' : '/mo') : '') + (d.apr ? ', ' + d.apr + '% APR' : '');
    }).join(' | ') + '.');
  } else {
    L.push(es ? 'Sin deudas activas registradas.' : 'No active debts on record.');
  }
  if (goals.length) {
    L.push((es ? 'Metas de ahorro' : 'Savings goals') + ': ' + goals.map(function (g) {
      return g.name + ' — ' + FT.money(g.saved) + ' ' + (es ? 'de' : 'of') + ' ' + FT.money(g.target);
    }).join(' | ') + '.');
  }
  L.push((es ? 'Inversiones' : 'Investments') + ' (' + (es ? 'valor total' : 'total value') + (hogarOn ? (es ? ', incluye hogar' : ', includes household') : '') + ')' + ': ' + FT.money(invTotal) + '.');
  if (subsTotal || servTotal) {
    L.push((es ? 'Suscripciones activas' : 'Active subscriptions') + ': ' + FT.money(subsTotal) + (es ? '/mes' : '/mo') + ' · ' + (es ? 'Servicios del hogar' : 'Household services') + ': ' + FT.money(servTotal) + (es ? '/mes' : '/mo') + '.');
  }
  if (upcoming.length) {
    L.push((es ? 'Próximos pagos/aportes automáticos' : 'Upcoming automatic payments/contributions') + ': ' + upcoming.map(function (r) {
      return r.name + ' ' + FT.money(r.amount) + ' (' + FT.date(r.nextDate) + ')';
    }).join(' | ') + '.');
  }
  L.push(hogarOn
    ? (es ? 'Hogar compartido: conectado.' : 'Shared household: connected.')
    : (es ? 'Hogar compartido: no conectado — todos los datos de arriba son solo de este usuario.' : 'Shared household: not connected — all data above is this user only.'));
  return L.join('\n');
};

/* ─────────────────────────────────────────────────────────────────────────
   17 · BOOT
   ───────────────────────────────────────────────────────────────────────── */
FT.lang = (function () { try { return sessionStorage.getItem(K.lang) || localStorage.getItem(K.lang) || 'es'; } catch (e) { return 'es'; } })();

FT.boot = function () {
  var isPublic = document.documentElement.hasAttribute('data-ft-public');
  var u = FT.loadUser();
  if (!u && !isPublic) {
    if (!FT.getRaw(K.setup)) { location.replace('login.html'); return; }
  }
  if (u && !sessionStorage.getItem(K.user)) { try { sessionStorage.setItem(K.user, JSON.stringify(u)); } catch (e) {} }
  FT.lang = (u && u.lang) ? (localStorage.getItem(K.lang) || u.lang) : FT.lang;
  FT.applyLang(document);
  if (!isPublic) {
    var h; try { h = FT.hogar(); } catch (e) { h = null; }
    var needsPartnerSync = h && h.connected && h.partnerEmail && !h.manuallyLeft;
    if (needsPartnerSync) {
      // _applyDueList/_applyRecDebt adelantan la fecha del servicio/abono en
      // cuanto lo revisan, se haya aplicado o no -- así que un cheque
      // automático corrido con caché VIEJA de mi pareja ya no se vuelve a
      // revisar aunque después llegue una copia fresca (por eso una 2da
      // pasada DESPUÉS no sirve de nada: la ventana ya se cerró mal). La
      // única forma real de evitar el duplicado cruzado ("Home At&t"/
      // "Seguro Mazda"/"SOFI CREDIT CARD") es esperar la sincronización
      // ANTES de correr los cheques automáticos por primera vez. Le doy un
      // margen corto (3s) -- si la red está lenta o caída, sigo con lo que
      // haya en caché, igual que antes de este fix (nunca me quedo esperando
      // para siempre).
      var syncP; try { syncP = FT.syncPartner(); } catch (e) { syncP = Promise.resolve(); }
      var timeoutP = new Promise(function (res) { setTimeout(res, 3000); });
      Promise.race([syncP, timeoutP]).then(function () {
        try { FT.runAutomations(); } catch (e) {}
        // Refresca mi snapshot en GAS al abrir la app, no solo cuando cambia
        // algo en esta sesión -- corrige de una vez cualquier snapshot que ya
        // haya quedado viejo antes de este fix (deudas/recurrentes ya
        // borrados que mi pareja seguía jalando).
        try { FT.pushProfileToGAS(); } catch (e) {}
        try { FT.pushReminders(); } catch (e) {}
      }).catch(function () {});
    } else {
      try { FT.runAutomations(); } catch (e) {}
      try { FT.pushProfileToGAS(); } catch (e) {}
      try { FT.pushReminders(); } catch (e) {}
    }
  }
  // ft:ready se dispara de inmediato SIEMPRE (no espera la sincronización de
  // arriba) -- las pantallas ya escuchan ft:datachanged para refrescarse
  // cuando los cheques automáticos terminen unos instantes después.
  document.dispatchEvent(new CustomEvent('ft:ready'));
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', FT.boot);
else FT.boot();

/* ─────────────────────────────────────────────────────────────────────────
   18 · SHIM — nombres globales viejos (quitar cuando todas las pantallas usen FT.*)
   ───────────────────────────────────────────────────────────────────────── */
window.isPremium = FT.isPremium;
window.isFree = FT.isFree;
window.getActivePlan = FT.getActivePlan;
window.getPremiumInfo = FT.getPremiumInfo;
window.savePlan = FT.savePlan;
window.clearPlan = FT.clearPlan;
window.canUse = FT.canUse;
window.hasAccess = function () { return true; };
window.protectPage = function () { return true; };
window.checkAccessWithGAS = FT.checkAccess;
window.premiumBadge = FT.premiumBadge;
window.showHelpModal = FT.showHelpModal;
window.showUpgradeModal = FT.showUpgradeModal;
window.hideUpgradeModal = FT.closeTop;
window.getCredits = FT.getCredits;
window.creditsLeft = FT.creditsLeft;
window.useCredit = FT.useCredit;
window.addExtraCredits = FT.addExtraCredits;

})(window, document);
