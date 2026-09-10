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
  savings:'ft_available_savings', savingsHist:'ft_savings_hist',
  investments:'ft_investments', hogarInv:'ft_hogar_inv',
  debts:'ft_debts', goals:'ft_goals', subs:'ft_subs', servicios:'ft_servicios',
  recurring:'ft_recurring', recurringInvLegacy:'ft_inv_recurrentes',
  checking:'ft_checking_balance', partnerChecking:'ft_partner_checking',
  hogar:'ft_hogar', hogarFondos:'ft_hogar_fondos',
  premium:'ft_premium', aiCredits:'ft_ai_credits', usedCodes:'ft_used_codes',
  distPcts:'ft_dist_pcts', dashTab:'ft_dash_tab',
  onbSaldos:'ft_onboarding_saldos_done', openAbonar:'ft_open_abonar',
  shortcuts:'ft_shortcuts', googleUser:'ft_google_user',
  investSuggest:'ft_invest_suggest', importAnswers:'ft_import_answers',
  navStack:'ft_nav_stack', profileB:'ft_profile_B'
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
function groupInt(s) { return String(s).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

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
  var neg = n < 0, abs = Math.abs(n), sym = opts.noSymbol ? '' : '$';
  var pfx = opts.sign ? (neg ? '−' : '+') : (neg ? '−' : '');

  if (opts.compact && abs >= 1000) {
    var big = abs >= 1e6, div = big ? 1e6 : 1e3, unit = big ? 'M' : 'k';
    var v = abs / div;
    var str = v >= 100 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '').replace('.', ',');
    return pfx + sym + str + unit;
  }
  var dec = opts.cents ? 2 : 0;
  var parts = abs.toFixed(dec).split('.');
  return pfx + sym + groupInt(parts[0]) + (dec ? ',' + parts[1] : '');
};

/** Partes del monto para render custom (hero con "$" chico al final). */
FT.moneyParts = function (n, opts) {
  opts = opts || {};
  n = Number(n) || 0;
  var neg = n < 0, dec = opts.cents ? 2 : 0;
  var parts = Math.abs(n).toFixed(dec).split('.');
  return { neg: neg, sign: neg ? '−' : '+', int: groupInt(parts[0]), dec: parts[1] || '', sym: '$' };
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
FT.del = function (key) { try { localStorage.removeItem(key); } catch (e) {} };

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
  }
  var freq = { weekly: es ? 'cada semana' : 'weekly', biweekly: es ? 'cada quincena' : 'biweekly', monthly: es ? 'cada mes' : 'monthly' }[r.freq] || r.freq;
  var sub = freq + ' · ' + (es ? 'próximo ' : 'next ') + FT.date(r.nextDate) + (r.paused ? (es ? ' · pausado' : ' · paused') : '');
  return { name: name, sub: sub };
};

/* ── Ahorro libre ── */
FT.savingsBalance = function () { return parseFloat(FT.getRaw(K.savings, '0')) || 0; };
FT.savingsHist = function () { return FT.get(K.savingsHist, []) || []; };
FT.addSavings = function (entry) {
  var cur = FT.savingsBalance();
  var amt = parseFloat(entry.amount) || 0;
  var tipo = entry.tipo || 'deposito';
  FT.setRaw(K.savings, Math.max(0, cur + (tipo === 'retiro' ? -amt : amt)).toFixed(2));
  var hist = FT.savingsHist();
  hist.push({ id: 'tx_' + entry.id, tipo: tipo, monto: amt, fecha: entry.date, nota: entry.note || '', cat: entry.cat || '', recId: entry.recId || null, cobId: entry.cobId || null, cobFor: entry.cobFor || null, monthTx: entry.monthTx || null });
  FT.set(K.savingsHist, hist);
  FT._changed();
};
FT.reverseSavings = function (txId) {
  var hist = FT.savingsHist();
  var i = hist.findIndex(function (h) { return h.id === 'tx_' + txId || h.id === txId; });
  if (i < 0) return;
  var cur = FT.savingsBalance();
  var sign = hist[i].tipo === 'retiro' ? 1 : -1;
  FT.setRaw(K.savings, Math.max(0, cur + sign * (parseFloat(hist[i].monto) || 0)).toFixed(2));
  hist.splice(i, 1);
  FT.set(K.savingsHist, hist);
  FT._changed();
};

/* ── Fondo de emergencia (saldo en ft_data.emergency; historial en 2 claves) ── */
FT.emergencyBalance = function () { return FT.data().emergency || 0; };
/** Historial de emergencia — funde ft_emerg_hist + ft_emergency_history (legado), dedup por id. */
FT.emergencyHist = function () {
  var a = FT.get(K.emergHist, []) || [];
  var b = (FT.get(K.emergHistLegacy, []) || []).map(function (h) {
    return { id: h.id, amount: h.amount, note: h.note, date: h.date, tipo: h.tipo || (h.type === 'retiro' ? 'retiro' : 'deposito') };
  });
  var seen = {}, out = [];
  a.concat(b).forEach(function (h) { var id = h.id != null ? String(h.id) : (h.date + '|' + h.amount); if (!seen[id]) { seen[id] = 1; out.push(h); } });
  return out;
};
FT.addEmergency = function (entry) {
  var d = FT.data();
  var amt = parseFloat(entry.amount) || 0;
  var tipo = entry.tipo || 'deposito';
  d.emergency = Math.max(0, (d.emergency || 0) + (tipo === 'retiro' ? -amt : amt));
  FT.set(K.data, d);
  var row = { id: entry.id != null ? String(entry.id) : ('e_' + Date.now()), amount: amt, note: entry.note || '', date: entry.date || FT.todayISO(), tipo: tipo, recId: entry.recId || null, cobId: entry.cobId || null, cobFor: entry.cobFor || null, monthTx: entry.monthTx || null };
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
    d.emergency = Math.max(0, (d.emergency || 0) + (row.tipo === 'retiro' ? amt : -amt));
    FT.set(K.data, d);
  }
  FT.set(K.emergHist, h1.filter(function (r) { return String(r.id) !== target && String(r.id) !== 'tx_' + target; }));
  var h2 = FT.get(K.emergHistLegacy, []) || [];
  FT.set(K.emergHistLegacy, h2.filter(function (r) { return String(r.id) !== 'tx_' + target && String(r.id) !== target; }));
  FT._changed();
};

/* ── Cuentas de cheques (array de cuentas nombradas; migra objeto único) ── */
FT.checking = function () {
  var raw = FT.get(K.checking, []);
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return [{ id: 'chk_legacy', name: 'Cuenta', amount: parseFloat(raw.amount || raw) || 0, hogar: !!raw.hogar, updatedAt: FT.todayISO() }];
  return [];
};
FT.saveChecking = function (list) { FT.set(K.checking, list); FT._changed(); };

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
FT.subs = function () { return FT.get(K.subs, []) || []; };
FT.saveSubs = function (s) { FT.set(K.subs, s); FT._changed(); };
FT.servicios = function () { return FT.get(K.servicios, []) || []; };
FT.saveServicios = function (s) { FT.set(K.servicios, s); FT._changed(); };
FT.hogarFondos = function () {
  var f = FT.get(K.hogarFondos, null);
  if (!f || typeof f !== 'object') f = {};
  if (!f.emerg) f.emerg = { meta: 0, actual: 0, fecha: '', hist: [] };
  if (!Array.isArray(f.metas)) f.metas = [];
  return f;
};
FT.saveHogarFondos = function (f) { FT.set(K.hogarFondos, f); FT._changed(); };
FT.distPcts = function () { return FT.get(K.distPcts, null) || { ahorro: 50, emergencia: 25, inversion: 25 }; };

/* Evento global cuando cambian los datos — cada pantalla lo escucha para re-render */
FT._changed = function () { try { document.dispatchEvent(new CustomEvent('ft:datachanged')); } catch (e) {} };

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

  // Fuente vinculada
  if (t.type === 'ahorro' && (t.dest === 'libre' || t.cat === '💰 Ahorro')) {
    FT.reverseSavings(t.id);
  } else if (t.type === 'ahorro' || t.cat === '🛡️ Emergencia') {
    FT.reverseEmergency(t.id);
  } else if (t.type === 'inversion' || t.fromInvPage) {
    ['', 'hogar'].forEach(function (sc) {
      var list = FT.investments(sc);
      var f = list.filter(function (i) { return i.id !== 'inv_' + t.id && i.id !== 'tx_' + t.id && String(i.txId) !== String(t.id); });
      if (f.length !== list.length) FT.saveInvestments(f, sc);
    });
  } else if (t.cat === '💳 Deudas') {
    var debts = FT.debts(), touched = false;
    debts.forEach(function (deb) {
      if (!deb.abonos) return;
      var keep = deb.abonos.filter(function (a) { return String(a.txId) !== String(t.id); });
      if (keep.length !== deb.abonos.length) {
        var removed = deb.abonos.find(function (a) { return String(a.txId) === String(t.id); });
        if (removed) deb.balance = (parseFloat(deb.balance) || 0) + (parseFloat(removed.monto) || 0);
        deb.abonos = keep; touched = true;
      }
    });
    if (touched) FT.saveDebts(debts);
  }

  d.transactions = d.transactions.filter(function (x) { return String(x.id) !== String(id); });
  FT.saveData(d);
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
  var txs = FT.txs();
  var inc = txs.filter(function (t) { return t.type === 'ingreso' && String(t.date || '').slice(0, 7) === mk; });
  var cheque = inc.filter(function (t) { return t.incomeKind !== 'extra' && t.incomeKind !== 'cobertura'; }).reduce(function (s, t) { return s + (parseFloat(t.amount) || 0); }, 0);
  var extra = inc.filter(function (t) { return t.incomeKind === 'extra' || t.incomeKind === 'cobertura'; }).reduce(function (s, t) { return s + (parseFloat(t.amount) || 0); }, 0);
  var mtx = txs.filter(function (t) { return String(t.date || '').slice(0, 7) === mk && t.hogar !== true; });
  var sum = function (types) { return mtx.filter(function (t) { return types.indexOf(t.type) > -1; }).reduce(function (s, t) { return s + (parseFloat(t.amount) || 0); }, 0); };
  return cheque * FT.personalPct() / 100 + extra - sum(['gasto', 'suscripcion', 'hipoteca']) - sum(['ahorro']) - sum(['inversion']);
};

/* ─────────────────────────────────────────────────────────────────────────
   5 · AUTOMATIZACIONES — corren al cargar cualquier pantalla
   ───────────────────────────────────────────────────────────────────────── */
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

  var cheques = FT.cheques();
  cheques.push({ id: Date.now() + Math.floor(Math.random() * 1000), monto: monto, hogarAmt: hogarAmt, personalAmt: personalAmt, fecha: fecha, mes: mes, tipo: tipo });
  FT.set(K.cheques, cheques);

  var autoSaved = 0;
  if (tipo === 'nuevo') {
    var d = FT.data();
    d.transactions.push({ id: Date.now(), type: 'ingreso', desc: es ? 'Cheque recibido' : 'Paycheck received', amount: monto, date: fecha, cat: '💰 Ingreso', incomeKind: 'cheque', createdBy: FT.userName() });
    FT.set(K.data, d);

    var u = FT._user || FT.loadUser() || {};
    var savPct = u.savingsPct != null ? u.savingsPct : 20;
    autoSaved = Math.round(personalAmt * savPct / 100);
    if (autoSaved > 0) {
      var savId = Date.now() + 1;
      FT.addSavings({ id: savId, amount: autoSaved, date: fecha, note: es ? 'Págate primero (automático del cheque)' : 'Pay yourself first (automatic from paycheck)' });
      var d2 = FT.data();
      d2.transactions.push({ id: savId, type: 'ahorro', desc: es ? 'Ahorro automático del cheque' : 'Automatic paycheck savings', amount: autoSaved, date: fecha, cat: '💰 Ahorro', dest: 'libre', createdBy: FT.userName() });
      FT.set(K.data, d2);
    }
  }
  FT._changed();
  return { monto: monto, hogarAmt: hogarAmt, personalAmt: personalAmt, autoSaved: autoSaved };
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
  } else { start = new Date(today); start.setDate(start.getDate() - 60); }
  var missing = [], cursor = new Date(start), guard = 0;
  while (cursor <= today && guard < 400) {
    var ds = FT.date(cursor, 'ISO'), matches;
    if (freq === 'weekly') matches = cursor.getDay() === (days[payDay] !== undefined ? days[payDay] : 4);
    else matches = String(cursor.getDate()) === String(payDay);
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

function _advanceRecDate(freq, fromStr) {
  var dt = new Date(fromStr + 'T00:00:00');
  if (freq === 'weekly') dt.setDate(dt.getDate() + 7);
  else if (freq === 'biweekly') dt.setDate(dt.getDate() + 14);
  else dt.setMonth(dt.getMonth() + 1);
  return FT.date(dt, 'ISO');
}
FT._advanceRecDate = _advanceRecDate;

function _applyRecMeta(rec, hoy) {
  try {
    var f = FT.hogarFondos();
    var meta = rec.metaTipo === 'emerg' ? f.emerg : (rec.metaId != null ? f.metas.find(function (m) { return m.id === rec.metaId; }) : f.metas[rec.metaIdx]);
    if (!meta) return 'broken';
    meta.hist = meta.hist || [];
    if (meta.hist.some(function (h) { return h.fecha === hoy && (h.recId === rec.id || !h.recId); })) return 'already';
    meta.hist.push({ id: 'd_' + Date.now() + '_' + Math.floor(Math.random() * 1000), monto: rec.amount, fecha: hoy, desdePres: rec.desdePres, auto: true, recId: rec.id });
    meta.actual = meta.hist.reduce(function (a, h) { return a + (h.monto || 0); }, 0);
    FT.set(K.hogarFondos, f);
    if (rec.desdePres) {
      var d = FT.data();
      d.transactions.push({ id: Date.now(), type: 'ahorro', desc: rec.desc, amount: rec.amount, date: hoy, cat: '🏠 Hogar', hogar: true, createdBy: FT.userName(), auto: true, recId: rec.id });
      FT.set(K.data, d);
    }
    return 'applied';
  } catch (e) { return 'broken'; }
}
function _applyRecAhorro(rec, hoy) {
  try {
    var toEmerg = rec.dest === 'emergencia';
    var id = Date.now();
    if (toEmerg) {
      var eh = FT.get(K.emergHist, []) || [];
      if (eh.some(function (h) { return h.date === hoy && h.recId === rec.id; })) return 'already';
      FT.addEmergency({ id: id, amount: rec.amount, date: hoy, tipo: 'deposito', note: rec.desc, recId: rec.id, monthTx: true });
    } else {
      var hist = FT.savingsHist();
      if (hist.some(function (h) { return h.fecha === hoy && (h.recId === rec.id || !h.recId); })) return 'already';
      FT.addSavings({ id: id, amount: rec.amount, date: hoy, note: rec.desc, recId: rec.id, monthTx: true });
    }
    // Un recurrente de ahorro es un aporte planeado desde el ingreso → cuenta como ahorro del mes.
    var d = FT.data();
    d.transactions.push({ id: id, type: 'ahorro', desc: rec.desc, amount: rec.amount, date: hoy, cat: toEmerg ? '🛡️ Emergencia' : '💵 Ahorro', dest: toEmerg ? 'emergencia' : 'libre', createdBy: FT.userName(), auto: true, recId: rec.id });
    FT.set(K.data, d);
    return 'applied';
  } catch (e) { return 'broken'; }
}
function _applyRecInversion(rec, hoy) {
  try {
    var invs = FT.investments();
    if (invs.some(function (i) { return i.recId === rec.id && i.date === hoy; })) return 'already';
    invs.push({ id: 'tx_' + Date.now(), name: rec.desc, ticker: rec.desc, amount: rec.amount, date: hoy, fecha: hoy, platform: FT.lang === 'es' ? 'Sin asignar' : 'Unassigned', invType: 'varias', recId: rec.id, fromDashboard: true });
    FT.saveInvestments(invs);
    return 'applied';
  } catch (e) { return 'broken'; }
}
function _applyRecDebt(rec, hoy) {
  try {
    var debts = FT.debts();
    var i = debts.findIndex(function (d) { return String(d.id) === String(rec.debtId); });
    if (i < 0) return 'broken';
    var d = debts[i];
    if ((d.abonos || []).some(function (a) { return a.fecha === hoy && (a.recId === rec.id || !a.recId); })) return 'already';
    var old = parseFloat(d.balance) || 0, nu = Math.max(0, old - rec.amount);
    d.balance = nu; d.updatedAt = new Date().toISOString();
    d.paidMonths = d.paidMonths || {}; d.paidMonths[String(hoy).slice(0, 7)] = true;
    d.abonos = d.abonos || [];
    var apr = parseFloat(d.apr) || 0;
    var interes = apr > 0 ? +(old * (apr / 100 / 12)).toFixed(2) : 0;
    var capital = +Math.max(0, rec.amount - interes).toFixed(2);
    var abonoId = Date.now(), txId = abonoId + 1;
    var dt = FT.data();
    dt.transactions.push({ id: txId, type: 'gasto', desc: (FT.lang === 'es' ? 'Abono a ' : 'Payment to ') + d.name, amount: rec.amount, date: hoy, cat: '💳 Deudas', hogar: rec.hogar, createdBy: FT.userName(), auto: true, recId: rec.id });
    FT.set(K.data, dt);
    d.abonos.push({ id: abonoId, monto: rec.amount, fecha: hoy, nota: '', saldoAntes: old, saldoDespues: nu, tipo: 'nuevo', createdBy: FT.userName(), txId: txId, interesPagado: interes, capitalPagado: capital, auto: true, recId: rec.id });
    FT.set(K.debts, debts);
    return 'applied';
  } catch (e) { return 'broken'; }
}
FT.applyDueRecurring = function () {
  var rec = FT.recurring();
  if (!rec.length) return 0;
  var hoy = FT.todayISO(), applied = 0;
  rec.forEach(function (r) {
    if (!r.active || r.paused || !r.nextDate) return;
    var guard = 0;
    while (r.nextDate && r.nextDate <= hoy && guard < 60) {
      var st = 'broken';
      if (r.kind === 'meta') st = _applyRecMeta(r, r.nextDate);
      else if (r.kind === 'ahorro') st = _applyRecAhorro(r, r.nextDate);
      else if (r.kind === 'inversion') st = _applyRecInversion(r, r.nextDate);
      else if (r.kind === 'debt') st = _applyRecDebt(r, r.nextDate);
      if (st === 'broken') { r.active = false; break; }
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
    list.forEach(function (s) {
      if (s.paused || !s.date) return;
      var guard = 0;
      while (guard < 60) {
        var p = s.date.split('-').map(Number);
        var dd = new Date(p[0], p[1] - 1, p[2]);
        if (!(dd < today)) break;
        d.transactions.push({ id: Date.now() + guard, type: 'suscripcion', desc: s.name, amount: parseFloat(s.amount) || 0, date: s.date, cat: s.cat || defCat, hogar: s.hogar === true, createdBy: name, auto: true });
        applied++;
        if (s.freq === 'annual') dd.setFullYear(dd.getFullYear() + 1);
        else if (s.freq === 'weekly') dd.setDate(dd.getDate() + 7);
        else dd.setMonth(dd.getMonth() + 1);
        s.date = FT.date(dd, 'ISO');
        guard++;
      }
    });
    if (applied) { FT.set(K.data, d); FT.set(key, list); FT._changed(); }
    return applied;
  } catch (e) { return 0; }
}
FT.applyDueSubscriptions = function () { return _applyDueList(K.subs, '🔄 Suscripción'); };
FT.applyDueServicios = function () { return _applyDueList(K.servicios, '🏠 Servicio'); };

FT.runAutomations = function () {
  var n = 0;
  try { n += FT.catchUpCheques(); } catch (e) {}
  try { n += FT.applyDueRecurring(); } catch (e) {}
  try { n += FT.applyDueSubscriptions(); } catch (e) {}
  try { n += FT.applyDueServicios(); } catch (e) {}
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
  var amount = parseFloat(o.amount) || 0;
  if (!o.desc || !amount || !o.date) return null;
  var es = FT.lang === 'es';
  var name = FT.userName();
  var hogar = FT.hogarConnected() ? !!o.hogar : undefined;

  var cat = o.cat;
  if (o.type === 'ingreso') cat = '💰 Ingreso';
  else if (o.type === 'ahorro') cat = o.dest === 'libre' ? '💵 Ahorro' : '🛡️ Emergencia';
  else if (o.type === 'inversion') cat = '📈 Inversión';

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
  if (o.type === 'gasto' && o.cobertura && parseFloat(o.cobertura.monto) > 0) {
    var src = o.cobertura.source;
    var poolBal = src === 'emergencia' ? FT.emergencyBalance() : FT.savingsBalance();
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

  var d = FT.data();
  d.transactions.push(entry);
  FT.saveData(d);

  // Ingreso extra + reparto automático solicitado
  if (o.type === 'ingreso' && entry.incomeKind === 'extra' && o.autoDist) FT.applyDist(amount, { note: o.desc });

  return entry;
};

/** Reparto del sobrante segun ft_dist_pcts (ahorro / emergencia / inversion-sugerida). */
FT.applyDist = function (leftover, opts) {
  opts = opts || {};
  var dist = FT.distPcts();
  var es = FT.lang === 'es';
  var note = opts.note || (es ? 'Distribución del sobrante' : 'Leftover distribution');
  var a = Math.round(leftover * (dist.ahorro || 0) / 100);
  var e = Math.round(leftover * (dist.emergencia || 0) / 100);
  var inv = Math.round(leftover * (dist.inversion || 0) / 100);
  if (a > 0) {
    FT.addSavings({ id: Date.now(), amount: a, date: FT.todayISO(), tipo: 'deposito', note: note });
    var d0 = FT.data();
    d0.transactions.push({ id: Date.now() + 1, type: 'ahorro', desc: (es ? 'Ahorro libre — ' : 'Free savings — ') + note, amount: a, date: FT.todayISO(), cat: '💵 Ahorro', dest: 'libre', createdBy: FT.userName() });
    FT.set(K.data, d0);
  }
  if (e > 0) FT.addEmergency({ id: Date.now() + 2, amount: e, date: FT.todayISO(), tipo: 'deposito', note: note });
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
      out.push({ icon: '💳', tone: 'red', url: 'deudas.html',
        text: (es ? d.name + ' vence ' + (diff <= 0 ? 'hoy' : 'en ' + diff + ' día' + (diff > 1 ? 's' : '')) : d.name + ' due ' + (diff <= 0 ? 'today' : 'in ' + diff + ' day' + (diff > 1 ? 's' : ''))) + ' · ' + FT.money(d.balance) });
    }
  });

  // 2 · Cheque registrado hoy
  FT.cheques().forEach(function (c) {
    if (c.fecha === FT.todayISO()) {
      out.push({ icon: '💵', tone: 'green', url: 'dashboard.html',
        text: (es ? 'Cheque registrado · ' : 'Paycheck logged · ') + FT.money(c.monto) + ' · ' + FT.money(c.hogarAmt) + (es ? ' hogar / ' : ' household / ') + FT.money(c.personalAmt) + (es ? ' personal' : ' personal') });
    }
  });

  // 3 · Dinero movido hoy a ahorro / emergencia (entradas automáticas)
  var moved = FT.txs().filter(function (t) { return t.date === FT.todayISO() && t.type === 'ahorro' && t.auto; });
  moved.forEach(function (t) {
    var toEmerg = t.cat === '🛡️ Emergencia' || t.dest === 'emergencia';
    out.push({ icon: toEmerg ? '🛡️' : '🏦', tone: 'blue', url: toEmerg ? 'emergencia.html' : 'ahorro.html',
      text: FT.money(t.amount) + (es ? ' movido a ' : ' moved to ') + (toEmerg ? (es ? 'Emergencia' : 'Emergency') : (es ? 'Ahorro libre' : 'Free savings')) });
  });

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
FT.creditsLeft = function () { var c = FT.getCredits(); return Math.max(0, MAX_AI_PREMIUM + (c.extra || 0) - (c.used || 0)); };
FT.useCredit = function () { var c = FT.getCredits(); c.used = (c.used || 0) + 1; FT.set(K.aiCredits, c); return FT.creditsLeft(); };
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
FT.syncPartner = function () {
  try {
    var h = FT.hogar();
    if (!h.connected || !h.partnerEmail || h.manuallyLeft) return;
    var pkey = 'profile_' + h.partnerEmail.replace(/[^a-z0-9]/gi, '_');
    FT.getPartnerProfile(h.partnerEmail).then(function (data) {
      if (!data || !data.success) return;
      var nd = {}; try { nd = JSON.parse(data.dataJson || '{}'); } catch (e) {}
      var old = FT.get(pkey, null); var od = (old && old.data) || {};
      var merged = {
        transactions: _mergeById(od.transactions, nd.transactions),
        emergency: (nd.emergency != null ? nd.emergency : od.emergency) || 0,
        subscriptions: _mergeById(od.subscriptions, nd.subscriptions),
        sharedDebts: _mergeById(od.sharedDebts, nd.sharedDebts),
        hogarInv: _mergeById(od.hogarInv, nd.hogarInv)
      };
      var pp = { name: data.name || (old && old.name) || '', email: data.email || h.partnerEmail, income: parseFloat(data.income) || 0, needs: parseFloat(data.needs) || 0, wants: parseFloat(data.wants) || 0, savings: parseFloat(data.savings) || 0, data: merged };
      FT.set(pkey, pp);
      FT.set(K.profileB, pp);
      FT._changed();
    }).catch(function () {});
  } catch (e) {}
};

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
    l_ahorro: 'Ahorro libre', l_emergencia: 'Fondo de emergencia', l_inversiones: 'Inversiones', l_metas: 'Metas',
    l_deudas: 'Deudas', l_suscripciones: 'Suscripciones', l_servicios: 'Servicios', l_recurrentes: 'Recurrentes',
    l_scanner: 'Escanear recibo', l_importar: 'Importar', l_analisis: 'Análisis', l_reporte: 'Reporte mensual',
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
    l_ahorro: 'Free savings', l_emergencia: 'Emergency fund', l_inversiones: 'Investments', l_metas: 'Goals',
    l_deudas: 'Debts', l_suscripciones: 'Subscriptions', l_servicios: 'Services', l_recurrentes: 'Recurring',
    l_scanner: 'Scan receipt', l_importar: 'Import', l_analisis: 'Analysis', l_reporte: 'Monthly report',
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
.ft-monthpick span{color:var(--text3);cursor:pointer;padding:0 2px;}

/* HERO (§4.6) */
.ft-hero{text-align:center;margin-bottom:6px;}
.ft-hero .cap{font-size:12px;font-weight:700;color:var(--text3);letter-spacing:.3px;}
.ft-hero .row{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:6px;}
.ft-sign{width:24px;height:24px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;color:#fff;font-size:15px;font-weight:900;line-height:1;}
.ft-sign.neg{background:var(--red);}.ft-sign.pos{background:var(--g-main);}
.ft-hero .amt{font-family:var(--round-font);font-weight:900;font-size:47px;letter-spacing:-1.8px;color:var(--ink);font-variant-numeric:tabular-nums;line-height:1;}
.ft-info{width:14px;height:14px;border-radius:50%;border:1px solid var(--text3);color:var(--text3);font-size:9px;font-weight:900;display:inline-grid;place-items:center;opacity:.55;vertical-align:middle;}
.ft-chev{color:var(--text3);font-weight:900;font-size:12px;}
.ft-hero .amt .cur{font-size:.44em;letter-spacing:0;color:var(--text3);font-weight:800;margin-left:3px;}
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

.ft-modal-box{background:var(--white);width:100%;max-width:var(--ft-appw);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;border-radius:22px 22px 0 0;transform:translateY(16px);transition:transform .2s ease;}
.ft-overlay.on .ft-modal-box{transform:translateY(0);}
@media(min-width:560px){.ft-modal-box{width:min(420px,calc(100vw - 32px));border-radius:18px;transform:scale(.96);}.ft-overlay.on .ft-modal-box{transform:scale(1);}}

.ft-sheet-box{background:var(--white);width:100%;max-width:var(--ft-appw);max-height:90vh;display:flex;flex-direction:column;overflow:hidden;border-radius:24px 24px 0 0;transform:translateY(16px);transition:transform .2s ease;}
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
.ft-toast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%) translateY(8px);background:var(--ink);color:#fff;padding:11px 18px;border-radius:14px;font-size:12.5px;font-weight:700;z-index:400;opacity:0;transition:opacity .2s,transform .2s;max-width:calc(100vw - 40px);text-align:center;}
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

function _overlay(kind, innerHTML) {
  var ov = document.createElement('div');
  ov.className = 'ft-overlay ' + kind;
  ov.innerHTML = innerHTML;
  ov.addEventListener('click', function (e) { if (e.target === ov) FT.closeTop(); });
  document.body.appendChild(ov);
  requestAnimationFrame(function () { ov.classList.add('on'); });
  return ov;
}
FT._stack = [];
FT.closeTop = function () {
  var ov = FT._stack.pop() || document.querySelector('.ft-overlay:last-of-type');
  if (!ov) return;
  ov.classList.remove('on');
  setTimeout(function () { ov.remove(); }, 200);
};

FT.sheet = function (o) {
  o = o || {};
  var acts = o.actions || [];
  var foot = acts.length
    ? '<div class="ft-sheet-foot">' + acts.map(function (a, i) {
        return '<button class="ft-btn ' + (a.primary ? 'ft-btn-primary' : 'ft-btn-ghost') + ' tap" data-ai="' + i + '" style="margin:0">' + a.label + '</button>';
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
      (o.onSave ? '<div class="ft-modal-foot"><button class="ft-btn ft-btn-primary tap" data-save style="margin:0">' + (o.saveLabel || FT.t('save')) + '</button>' + (o.cancelLabel ? '<button class="ft-btn ft-btn-ghost tap" data-cancel style="margin:0">' + o.cancelLabel + '</button>' : '') + '</div>' : '') +
    '</div>');
  FT._stack.push(ov);
  ov.querySelector('.x').addEventListener('click', FT.closeTop);
  var body = ov.querySelector('.ft-modal-body');
  var sb = ov.querySelector('[data-save]');
  if (sb) sb.addEventListener('click', function () { var keep = o.onSave(body); if (!keep) FT.closeTop(); });
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
        '<span class="amt">' + p.int + (o.cents ? '<span style="font-size:.5em">,' + p.dec + '</span>' : '') + '<span class="cur">$</span></span>' +
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
  return '<div class="ft-catbars">' + items.map(function (it, idx) {
    var meta = it.emoji ? { emoji: it.emoji, label: it.label, pastel: PASTELS[idx % PASTELS.length] } : FT.catMeta(it.cat, idx);
    var spentH = Math.max(66 / 196 * 100, (it.spent || 0) / maxRef * 100);
    var budH = it.budget ? (it.budget / maxRef * 100) : 0;
    var pctTotal = Math.round((it.spent || 0) / total * 100);
    return '<div class="ft-catcol ' + meta.pastel + '" data-cat="' + (it.cat || meta.label) + '">' +
      (budH > spentH ? '<div class="ft-catbudget" style="height:' + budH + '%"></div>' : '') +
      '<div class="ft-catfill tap" style="height:' + spentH + '%">' +
        '<span class="emo">' + (meta.emoji || '•') + '</span>' +
        '<span class="val">' + FT.money(it.spent || 0, { compact: true }) + '</span>' +
        '<span class="pct">' + pctTotal + '%</span>' +
      '</div></div>';
  }).join('') + '</div>';
};

/** tx = transacción de ft_data. Devuelve una fila .ft-tx */
FT.txRow = function (t, idx) {
  var meta = FT.catMeta(t.cat, idx);
  var isIn = t.type === 'ingreso';
  var amt = FT.money(t.amount, { cents: true, sign: true });
  amt = (isIn ? '+' : '−') + FT.money(t.amount, { cents: true });
  var isCheque = t.incomeKind === 'cheque';
  var mid;
  if (isCheque) {
    var h = FT.hogar();
    var totH = (parseFloat(h.payPctHogar) || 50) + (parseFloat(h.saveHogarPct) || 10);
    var hogarAmt = (t.amount || 0) * totH / 100, persAmt = (t.amount || 0) - hogarAmt;
    mid = '<div class="ft-tx-name">' + (t.desc || FT.catMeta(t.cat).label) + '</div>' +
          '<div class="ft-tx-breakdown">🏠 ' + FT.money(hogarAmt) + ' &nbsp;+&nbsp; 👤 ' + FT.money(persAmt) + '</div>';
  } else {
    mid = '<div class="ft-tx-name">' + (t.desc || meta.label) + '</div>' +
          '<span class="ft-hashtag">#' + (meta.label || 'gasto').toLowerCase().replace(/\s+/g, '') + '</span>';
  }
  return '<div class="ft-tx tap" data-txid="' + t.id + '">' +
    '<div class="ft-tx-top"><span class="ft-pill">' + FT.date(t.date) + '</span>' +
      '<span class="ft-pill"' + (isIn ? ' style="color:var(--g-main)"' : '') + '>' + (isIn ? '+' : '−') + FT.money(t.amount, { cents: true, noSymbol: false }).replace('−', '') + '</span></div>' +
    '<div class="ft-tx-body">' +
      '<div class="ft-tx-ico ' + meta.pastel + '">' + (meta.emoji || '•') + '</div>' +
      '<div class="ft-tx-main"><div class="ft-tx-label">' + meta.label + '</div>' + mid + '</div>' +
      '<div class="ft-tx-amt ' + (isIn ? 'in' : 'out') + '">' + amt + '</div>' +
    '</div></div>';
};

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
  { key: 'money_group_your', items: [['l_ahorro', 'ahorro.html', '💵'], ['l_emergencia', 'emergencia.html', '🛡️'], ['l_inversiones', 'inversiones.html', '🏦'], ['l_metas', 'metas.html', '🎯']] },
  { key: 'money_group_debts', items: [['l_deudas', 'deudas.html', '💳'], ['l_suscripciones', 'suscripciones.html', '🔄'], ['l_servicios', 'servicios.html', '🏠'], ['l_recurrentes', 'recurrentes.html', '♻️']] },
  { key: 'money_group_input', items: [['l_scanner', 'scanner.html', '📷'], ['l_importar', 'importar.html', '📥']] },
  { key: 'money_group_analysis', items: [['l_analisis', 'analisis.html', '📈'], ['l_reporte', 'reporte.html', '📄']] },
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
  var html = items.length
    ? items.map(function (n) {
        return '<button class="ft-row tap" style="width:100%;text-align:left;background:none;border:none;border-bottom:1px solid var(--hair)" data-go="' + (n.url || '') + '">' +
          '<span class="k">' + (n.icon || '🔔') + ' ' + n.text + '</span>' + (n.amount != null ? '<span class="v">' + FT.money(n.amount) + '</span>' : '') + '</button>';
      }).join('')
    : '<p style="font-size:13px;color:var(--text3);text-align:center;padding:20px 0">' + FT.t('notif_empty') + '</p>';
  var ov = FT.sheet({ title: FT.t('notif_title'), html: html });
  ov.querySelectorAll('[data-go]').forEach(function (b) {
    b.addEventListener('click', function () { var u = b.getAttribute('data-go'); if (u) FT.go(u); });
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
    else FT.go('dashboard.html');
  });

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

  function bal() { return E ? FT.emergencyBalance() : FT.savingsBalance(); }
  function hist() { return E ? FT.emergencyHist() : FT.savingsHist(); }
  function hAmt(h) { return E ? (parseFloat(h.amount) || 0) : (parseFloat(h.monto) || 0); }
  function hTipo(h) { return h.tipo || (hAmt(h) < 0 ? 'retiro' : 'deposito'); }
  function hNota(h) { return h.nota || h.note || ''; }
  function hFecha(h) { return h.fecha || h.date || ''; }
  function hId(h) { return String(h.id != null ? h.id : ''); }
  function goal() { return (FT.user().income || 0) * 3; }
  function es() { return FT.lang === 'es'; }

  function render() {
    var L = es(), b = bal();
    var rows = hist().slice().sort(function (a, c) { return String(hFecha(c)).localeCompare(String(hFecha(a))); });

    var hero = '<div class="ft-bs-hero' + (E ? ' emerg' : '') + '">' +
      '<button class="cap" data-x="bal">' + (L ? 'Saldo' : 'Balance') + ' <span class="ft-info">i</span></button>' +
      '<div class="amt">' + FT.money(b) + '</div>';
    if (E) {
      var g = goal(), pct = g > 0 ? Math.min(100, Math.round(b / g * 100)) : 0;
      hero += '<button class="cap" data-x="goal" style="margin-top:4px">' + (L ? 'Meta: ' : 'Goal: ') + FT.money(g) + ' (' + (L ? '3 meses de ingreso' : '3 months income') + ') <span class="ft-info">i</span></button>' +
        '<div class="ft-bs-gtrack"><div class="ft-bs-gfill" id="ftbsGf" style="width:0"></div></div>' +
        '<div class="ft-bs-grow"><span>' + pct + '% ' + (L ? 'completado' : 'complete') + '</span><span>' + (L ? 'Faltan ' : 'Missing ') + FT.money(Math.max(0, g - b)) + '</span></div>';
    } else {
      hero += '<div class="sub">' + (L ? 'Sin restricciones — úsalo para lo que quieras' : 'No restrictions — use it for anything') + '</div>';
    }
    hero += '</div>';

    var acts = '<div class="ft-bs-acts">' +
      '<button class="prim tap" data-a="deposito"><span class="e">＋</span>' + (L ? 'Depositar' : 'Deposit') + '</button>' +
      '<button class="tap" data-a="retiro"><span class="e">↩</span>' + (L ? 'Retirar' : 'Withdraw') + '</button>' +
      '<button class="tap" data-a="rec"><span class="e">🔄</span>' + (L ? 'Recurrente' : 'Recurring') + '</button></div>';

    var info = E ? '<div class="ft-bs-info"><b>⚠️ ' + (L ? '¿Cuándo puedo retirar de aquí?' : 'When can I withdraw?') + '</b><p>' +
      (L ? 'Solo para emergencias reales (perder el trabajo, un gasto médico grande). Para gastos normales del mes usa el Ahorro libre.' : 'Only for real emergencies (job loss, a big medical bill). For regular monthly spending use Free savings.') + '</p></div>' : '';

    var recs = FT.recurList(function (r) { return r.kind === 'ahorro' && (E ? r.dest === 'emergencia' : r.dest !== 'emergencia'); });
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

    mount.innerHTML = hero + acts + info + recSec + histSec;

    if (E) requestAnimationFrame(function () { var gf = document.getElementById('ftbsGf'); if (gf) { var g = goal(); gf.style.width = (g > 0 ? Math.min(100, b / g * 100) : 0) + '%'; } });

    mount.querySelectorAll('[data-x]').forEach(function (el) { el.onclick = function () { el.getAttribute('data-x') === 'goal' ? explainGoal() : explainBal(); }; });
    mount.querySelectorAll('[data-a]').forEach(function (el) { el.onclick = function () { var a = el.getAttribute('data-a'); a === 'rec' ? openRec() : openMove(a); }; });
    mount.querySelectorAll('[data-mv]').forEach(function (el) { el.onclick = function () { openDetail(el.getAttribute('data-mv')); }; });
    mount.querySelectorAll('[data-rec]').forEach(function (el) { el.onclick = function () { openRecDetail(el.getAttribute('data-rec')); }; });
    mount.querySelectorAll('[data-go]').forEach(function (el) { el.onclick = function () { FT.go(el.getAttribute('data-go')); }; });
  }

  function explainBal() {
    var L = es();
    var rows = hist().slice().sort(function (a, c) { return String(hFecha(c)).localeCompare(String(hFecha(a))); }).slice(0, 6)
      .map(function (h) { return [(hNota(h) || (L ? 'Movimiento' : 'Movement')) + ' · ' + FT.date(hFecha(h)), (hTipo(h) === 'retiro' ? '−' : '+') + FT.money(Math.abs(hAmt(h)))]; });
    rows.push([L ? '= Saldo actual' : '= Current balance', FT.money(bal())]);
    FT.sheet({ title: (L ? '¿Cómo se calcula?' : 'How is it calculated?') + ' · ' + (E ? (L ? 'Fondo de emergencia' : 'Emergency fund') : (L ? 'Ahorro libre' : 'Free savings')),
      html: rows.map(function (r) { return '<div class="ft-row"><span class="k">' + r[0] + '</span><span class="v">' + r[1] + '</span></div>'; }).join('') });
  }
  function explainGoal() {
    var L = es(), g = goal(), b = bal();
    FT.sheet({ title: L ? 'Meta del fondo' : 'Fund goal', html: [
      [L ? 'Tu ingreso mensual' : 'Your monthly income', FT.money(FT.user().income || 0)],
      ['× 3 ' + (L ? 'meses (colchón estándar)' : 'months (standard cushion)'), FT.money(g)],
      [L ? 'Tienes hoy' : 'You have today', FT.money(b)],
      [L ? 'Falta' : 'Missing', FT.money(Math.max(0, g - b))]
    ].map(function (r) { return '<div class="ft-row"><span class="k">' + r[0] + '</span><span class="v">' + r[1] + '</span></div>'; }).join('') });
  }

  function openMove(mode) {
    var L = es(), isW = mode === 'retiro';
    var origen = 'previo'; // 'previo' = ya lo tenía (no toca el mes) · 'mes' = de mi disponible
    var origToggle = isW ? '' :
      '<div class="ft-field"><label>' + (L ? '¿De dónde sale este dinero?' : 'Where does this money come from?') + '</label>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px" id="mOrig">' +
        '<button type="button" data-o="previo" style="padding:9px 6px;border-radius:10px;border:1.5px solid var(--g-main);background:var(--g-light);color:var(--g-dark);font-family:var(--ui-font);font-size:11px;font-weight:800;cursor:pointer;line-height:1.35">' + (L ? 'Ya lo tenía' : 'I already had it') + '<br><span style="font-weight:600;font-size:9.5px;opacity:.8">' + (L ? 'no afecta tu mes' : "doesn't affect your month") + '</span></button>' +
        '<button type="button" data-o="mes" style="padding:9px 6px;border-radius:10px;border:1.5px solid var(--hair);background:var(--sunk);color:var(--text2);font-family:var(--ui-font);font-size:11px;font-weight:800;cursor:pointer;line-height:1.35">' + (L ? 'De mi disponible del mes' : "From this month's available") + '<br><span style="font-weight:600;font-size:9.5px;opacity:.8">' + (L ? 'cuenta como ahorro del mes' : 'counts as this-month saving') + '</span></button>' +
      '</div></div>';
    FT.modal({
      title: isW ? (E ? (L ? 'Retirar del fondo' : 'Withdraw from fund') : (L ? 'Retirar del ahorro' : 'Withdraw from savings')) : (L ? 'Depositar' : 'Deposit'),
      html: (isW && E ? '<div class="ft-bs-info" style="margin:0 0 12px"><p>⚠️ ' + (L ? 'Este fondo es solo para emergencias reales. ¿Esto es una emergencia, o debería salir de tu Ahorro libre?' : 'This fund is only for real emergencies. Is this an emergency, or should it come from Free savings?') + '</p></div>' : '') +
        '<div class="ft-field"><label>' + (L ? 'Monto' : 'Amount') + '</label><input id="mAmt" inputmode="decimal" placeholder="$0"></div>' +
        origToggle +
        '<div class="ft-field"><label>' + (L ? 'Nota (opcional)' : 'Note (optional)') + '</label><input id="mNote"></div>' +
        '<div class="ft-field"><label>' + (L ? 'Fecha' : 'Date') + '</label><input id="mDate" type="date" value="' + FT.todayISO() + '"></div>',
      saveLabel: isW ? (L ? 'Confirmar retiro' : 'Confirm withdrawal') : (L ? 'Guardar depósito' : 'Save deposit'),
      onOpen: function (body) {
        var seg = body.querySelector('#mOrig');
        if (seg) seg.querySelectorAll('button').forEach(function (b) {
          b.onclick = function () {
            origen = b.getAttribute('data-o');
            seg.querySelectorAll('button').forEach(function (x) {
              var on = x === b;
              x.style.borderColor = on ? 'var(--g-main)' : 'var(--hair)';
              x.style.background = on ? 'var(--g-light)' : 'var(--sunk)';
              x.style.color = on ? 'var(--g-dark)' : 'var(--text2)';
            });
          };
        });
      },
      onSave: function (body) {
        var amt = parseFloat(body.querySelector('#mAmt').value) || 0;
        if (!amt || amt <= 0) { FT.toast(L ? 'Ingresa un monto' : 'Enter an amount'); return true; }
        if (isW && amt > bal()) { FT.toast(L ? 'No tienes suficiente' : 'Not enough'); return true; }
        var id = Date.now();
        var counts = !isW && origen === 'mes';
        var payload = { id: id, amount: amt, date: body.querySelector('#mDate').value || FT.todayISO(), tipo: mode, note: body.querySelector('#mNote').value.trim() || (isW ? (L ? 'Retiro' : 'Withdrawal') : ''), monthTx: counts || null };
        if (E) FT.addEmergency(payload); else FT.addSavings(payload);
        if (counts) {
          var d = FT.data();
          d.transactions.push({ id: id, type: 'ahorro', desc: payload.note || (E ? (L ? 'Depósito a Emergencia' : 'To Emergency') : (L ? 'Depósito a Ahorro libre' : 'To Free savings')), amount: amt, date: payload.date, cat: E ? '🛡️ Emergencia' : '💵 Ahorro', dest: E ? 'emergencia' : 'libre', createdBy: FT.userName() });
          FT.saveData(d);
        }
        FT.toast(isW ? (L ? '✅ Retiro registrado' : '✅ Withdrawal recorded') : (L ? '✅ Depósito guardado' : '✅ Deposit saved'));
        render();
      }
    });
  }

  function openRec() {
    var L = es(), st = { freq: 'monthly' };
    var seg = ['weekly:' + (L ? 'Semanal' : 'Weekly'), 'biweekly:' + (L ? 'Quincenal' : 'Biweekly'), 'monthly:' + (L ? 'Mensual' : 'Monthly')];
    FT.modal({
      title: L ? 'Depósito recurrente' : 'Recurring deposit',
      html: '<div class="ft-field"><label>' + (L ? 'Monto' : 'Amount') + '</label><input id="rAmt" inputmode="decimal" placeholder="$0"></div>' +
        '<div class="ft-field"><label>' + (L ? 'Frecuencia' : 'Frequency') + '</label><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px" id="rFreq">' +
        seg.map(function (o) { var v = o.split(':')[0], on = v === 'monthly'; return '<button type="button" data-f="' + v + '" style="padding:8px;border-radius:9px;border:1.5px solid ' + (on ? 'var(--g-main)' : 'var(--hair)') + ';background:' + (on ? 'var(--g-light)' : 'var(--sunk)') + ';font-family:var(--ui-font);font-size:11.5px;font-weight:800;color:' + (on ? 'var(--g-dark)' : 'var(--text2)') + ';cursor:pointer">' + o.split(':')[1] + '</button>'; }).join('') + '</div></div>' +
        '<div class="ft-field"><label>' + (L ? 'Primera fecha' : 'First date') + '</label><input id="rDate" type="date" value="' + FT.todayISO() + '"></div>' +
        '<div style="background:var(--sky-bg);color:#2A4CC0;border-radius:10px;padding:9px 11px;font-size:11px;font-weight:600">' + (L ? 'Aparecerá en Recurrentes, donde podrás editar la fecha, pausarlo o eliminarlo.' : 'It will appear in Recurring for editing, pausing or deleting.') + '</div>',
      saveLabel: L ? 'Activar recurrente' : 'Activate',
      onOpen: function (body) {
        body.querySelectorAll('#rFreq button').forEach(function (b) {
          b.onclick = function () {
            st.freq = b.getAttribute('data-f');
            body.querySelectorAll('#rFreq button').forEach(function (x) { var on = x === b; x.style.borderColor = on ? 'var(--g-main)' : 'var(--hair)'; x.style.background = on ? 'var(--g-light)' : 'var(--sunk)'; x.style.color = on ? 'var(--g-dark)' : 'var(--text2)'; });
          };
        });
      },
      onSave: function (body) {
        var amt = parseFloat(body.querySelector('#rAmt').value) || 0;
        if (!amt || amt <= 0) { FT.toast(es() ? 'Ingresa un monto' : 'Enter an amount'); return true; }
        var rec = FT.recurring();
        rec.push({ id: 'rec_' + Date.now(), kind: 'ahorro', dest: E ? 'emergencia' : 'libre',
          desc: E ? (es() ? 'Aporte a Emergencia' : 'To Emergency') : (es() ? 'Aporte a Ahorro libre' : 'To Free savings'),
          amount: amt, freq: st.freq, hogar: false, nextDate: body.querySelector('#rDate').value || FT.todayISO(), active: true, createdBy: FT.userName() });
        FT.set(K.recurring, rec);
        FT.toast(es() ? '🔄 Recurrente activado' : '🔄 Recurring activated');
        render();
      }
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
              if (cob) FT.undoCobertura(h.cobId);
              else if (h.monthTx) FT.deleteTx(String(h.id).replace(/^tx_/, ''));
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
  return { render: render };
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
    try { FT.runAutomations(); } catch (e) {}
    try { FT.syncPartner(); } catch (e) {}
  }
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
