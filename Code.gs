/* ═══════════════════════════════════════════════════════════
   FinTrack Pro — Google Apps Script Backend
   Sheet ID: 1ejVaASjToPpqDZEltxWPNU8GVJisMxywzHkabRMgXTg
   
   SHEET STRUCTURE — hoja llamada "FT_Users":
   A: Email | B: Plan | C: Estado | D: FechaAlta | E: Expira | F: Notas | G: UltimoAcceso
   
   PLAN VALUES: free / premium
   ESTADO VALUES: ACTIVO / INACTIVO / EXPIRADO
   ═══════════════════════════════════════════════════════════ */

const SHEET_ID   = '1ejVaASjToPpqDZEltxWPNU8GVJisMxywzHkabRMgXTg';
const FT_USERS   = 'FT_Users'; // separate tab from FinHome users

function doGet(e) {
  const action = (e.parameter.action || '').trim();
  try {
    switch(action) {
      case 'checkAccess':  return json(checkAccess(e.parameter.email));
      case 'ping':         return json({ ok: true, ts: new Date().toISOString() });
      case 'createInvite': return json(createInvite(e.parameter.email, e.parameter.name, e.parameter.code));
      case 'acceptInvite': return json(acceptInvite(e.parameter.code, e.parameter.email, e.parameter.name));
      case 'checkPartner': return json(checkPartner(e.parameter.email));
      default:             return json({ error: 'Unknown action: ' + action });
    }
  } catch(err) {
    return json({ error: err.toString() });
  }
}

function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents || '{}');
    const action = (body.action || '').trim();
    switch(action) {
      case 'checkAccess': return json(checkAccess(body.email));
      default:            return json({ error: 'Unknown action' });
    }
  } catch(err) {
    return json({ error: err.toString() });
  }
}

function json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ══════════════════════════════════════════════════
   CHECK ACCESS
   Returns:
   { access: true,  plan: 'free'|'premium', email, expiresAt }
   { access: false, reason: 'not_found'|'inactive'|'expired' }
══════════════════════════════════════════════════ */
function checkAccess(email) {
  if (!email || email.trim() === '') {
    return { access: false, reason: 'empty_email' };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const ss    = SpreadsheetApp.openById(SHEET_ID);

  // Get or create the FT_Users sheet
  let sheet = ss.getSheetByName(FT_USERS);
  if (!sheet) {
    // Create it with headers if it doesn't exist
    sheet = ss.insertSheet(FT_USERS);
    sheet.appendRow(['Email','Plan','Estado','FechaAlta','Expira','Notas','UltimoAcceso']);
    return { access: false, reason: 'not_found' };
  }

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const rowEmail = String(data[i][0]).trim().toLowerCase();
    if (rowEmail !== normalizedEmail) continue;

    const plan   = String(data[i][1]).trim().toLowerCase() || 'free';
    const estado = String(data[i][2]).trim().toUpperCase();
    const expira = data[i][4] ? new Date(data[i][4]) : null;

    if (estado !== 'ACTIVO') {
      return { access: false, reason: 'inactive' };
    }

    if (expira && expira < new Date()) {
      sheet.getRange(i + 1, 3).setValue('EXPIRADO');
      return { access: false, reason: 'expired', plan };
    }

    // Log last access
    try { sheet.getRange(i + 1, 7).setValue(new Date().toISOString()); } catch(e) {}

    return {
      access:    true,
      plan:      plan,
      email:     normalizedEmail,
      expiresAt: expira ? expira.toISOString() : null
    };
  }

  return { access: false, reason: 'not_found' };
}

/* ══════════════════════════════════════════════════
   ADD USER — run manually from the Apps Script editor
   Usage: addFTUser('cliente@gmail.com', 'free')
          addFTUser('vip@gmail.com', 'premium', '2027-06-01')
══════════════════════════════════════════════════ */
function addFTUser(email, plan, expiresDate) {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  let sheet   = ss.getSheetByName(FT_USERS);

  if (!sheet) {
    sheet = ss.insertSheet(FT_USERS);
    sheet.appendRow(['Email','Plan','Estado','FechaAlta','Expira','Notas','UltimoAcceso']);
  }

  sheet.appendRow([
    email.trim().toLowerCase(),
    (plan || 'free').toLowerCase(),
    'ACTIVO',
    new Date().toISOString(),
    expiresDate || '',
    '',
    ''
  ]);

  return 'User added: ' + email + ' (' + plan + ')';
}

/* ══════════════════════════════════════════════════
   SETUP — run once to add yourself as premium owner
   Run this from the Apps Script editor: setupOwner()
══════════════════════════════════════════════════ */
function setupOwner() {
  return addFTUser('ramon002719@gmail.com', 'premium', '');
}

/* ══════════════════════════════════════════════════
   HOGAR — INVITE SYSTEM
   
   Persona A genera un código → GAS lo guarda
   Persona B ingresa el código → GAS devuelve datos de A
   Ambos quedan conectados en la Sheet
   
   SHEET: "FT_Hogar"
   Columns: InviteCode | EmailA | NameA | EmailB | NameB | CreatedAt | ConnectedAt
══════════════════════════════════════════════════ */

const FT_HOGAR = 'FT_Hogar';

function getOrCreateHogarSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(FT_HOGAR);
  if (!sheet) {
    sheet = ss.insertSheet(FT_HOGAR);
    sheet.appendRow(['InviteCode','EmailA','NameA','EmailB','NameB','CreatedAt','ConnectedAt']);
  }
  return sheet;
}

// Called by doGet — route to hogar functions
function handleHogar(action, params) {
  switch(action) {
    case 'createInvite':  return createInvite(params.email, params.name, params.code);
    case 'acceptInvite':  return acceptInvite(params.code, params.email, params.name);
    case 'checkPartner':  return checkPartner(params.email);
    default: return { error: 'Unknown hogar action' };
  }
}

function createInvite(emailA, nameA, code) {
  if (!emailA || !code) return { error: 'Missing email or code' };
  const sheet = getOrCreateHogarSheet();
  const data = sheet.getDataRange().getValues();

  // Remove any existing invites from this user
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][1]).toLowerCase() === emailA.toLowerCase()) {
      sheet.deleteRow(i + 1);
    }
  }

  // Create new invite
  sheet.appendRow([code, emailA.toLowerCase(), nameA || '', '', '', new Date().toISOString(), '']);
  return { success: true, code };
}

function acceptInvite(code, emailB, nameB) {
  if (!code || !emailB) return { error: 'Missing code or email' };
  const sheet = getOrCreateHogarSheet();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toUpperCase() === code.toUpperCase()) {
      const emailA = data[i][1];
      const nameA  = data[i][2];

      // Already connected?
      if (data[i][3]) return { error: 'code_already_used' };

      // Connect B to A
      sheet.getRange(i + 1, 4).setValue(emailB.toLowerCase());
      sheet.getRange(i + 1, 5).setValue(nameB || '');
      sheet.getRange(i + 1, 7).setValue(new Date().toISOString());

      return { success: true, partnerEmail: emailA, partnerName: nameA };
    }
  }
  return { error: 'code_not_found' };
}

function checkPartner(email) {
  if (!email) return { error: 'Missing email' };
  const sheet = getOrCreateHogarSheet();
  const data = sheet.getDataRange().getValues();
  const norm = email.toLowerCase();

  for (let i = 1; i < data.length; i++) {
    const emailA = String(data[i][1]).toLowerCase();
    const emailB = String(data[i][3]).toLowerCase();

    // This user is A
    if (emailA === norm && emailB) {
      return { connected: true, role: 'A', partnerEmail: emailB, partnerName: data[i][4] || 'Tu pareja' };
    }
    // This user is B
    if (emailB === norm) {
      return { connected: true, role: 'B', partnerEmail: emailA, partnerName: data[i][2] || 'Tu pareja' };
    }
  }
  return { connected: false };
}
