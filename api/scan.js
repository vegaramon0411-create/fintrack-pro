// ─────────────────────────────────────────────────────────────────────────────
// FinTrack Pro · función serverless de Vercel  →  POST /api/scan
// Manda imágenes de recibos, PDFs o texto (CSV) a la API de Claude y devuelve
// las transacciones extraídas como JSON.
//
// Contrato de entrada (JSON body):
//   { image, mediaType, prompt, isTextOnly, csvContent }
//     · image      base64 (con o sin prefijo data:) — recibo o PDF
//     · mediaType  'image/jpeg' | 'image/png' | 'application/pdf'
//     · prompt     instrucción personalizada (opcional)
//     · isTextOnly true → modo texto puro (CSV pegado / instrucción)
//     · csvContent contenido CSV para el modo texto
//
// Regla clave: un PDF se manda como bloque  type:'document'  (NUNCA 'image').
// ─────────────────────────────────────────────────────────────────────────────

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// Extracción de recibos/estados de cuenta: tarea de clasificación de alto volumen
// con tope de créditos → Haiku 4.5 (rápido y barato). Cambiar aquí si se quiere
// más precisión a mayor costo.
const MODEL = 'claude-haiku-4-5';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { image, mediaType, prompt, isTextOnly, csvContent } = req.body || {};
    const today = new Date().toISOString().split('T')[0];

    let messages, maxTokens;

    if (isTextOnly || (!image && (csvContent || prompt))) {
      // ── MODO TEXTO — CSV pegado o instrucción libre ──
      const text =
        (prompt || 'Extrae TODAS las transacciones de este texto y devuelve SOLO un arreglo JSON, sin markdown ni explicación.') +
        (csvContent ? '\n\n--- DATOS ---\n' + csvContent : '');
      messages = [{ role: 'user', content: text }];
      maxTokens = 16000; // un estado de cuenta puede traer cientos de filas
    } else {
      // ── MODO IMAGEN / PDF ──
      if (!image || !mediaType) return res.status(400).json({ error: 'Missing image or mediaType' });

      // base64 limpio: sin prefijo "data:...;base64," y sin saltos de línea
      const b64 = String(image).replace(/^data:[^,]+,/, '').replace(/\s+/g, '');
      const isPdf = mediaType === 'application/pdf';

      const fileBlock = {
        type: isPdf ? 'document' : 'image',
        source: { type: 'base64', media_type: mediaType, data: b64 }
      };

      const defaultPrompt =
        'Analiza este ' + (isPdf ? 'documento' : 'recibo') + '. Devuelve SOLO un objeto JSON crudo ' +
        '(sin markdown, sin bloques de código, sin explicación):\n' +
        '{"merchant":"nombre de la tienda","amount":0.00,"date":"YYYY-MM-DD","category":"Supermercado","items":["item1"],"confidence":85}\n' +
        'category debe ser una de: Supermercado, Restaurantes, Gasolina, Salud, Entretenimiento, Ropa, Servicios, Otros\n' +
        'Hoy es ' + today + '.';

      // El bloque de archivo va ANTES del bloque de texto.
      messages = [{ role: 'user', content: [fileBlock, { type: 'text', text: prompt || defaultPrompt }] }];
      maxTokens = isPdf ? 16000 : 4000;
    }

    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION
      },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages })
    });

    if (!r.ok) {
      const details = await r.text();
      console.error('Anthropic error:', details);
      return res.status(r.status).json({ error: 'Anthropic API error', details });
    }

    const data = await r.json();
    const rawText = ((data && data.content && data.content[0] && data.content[0].text) || '').trim();

    return res.status(200).json({ success: true, result: extractJSON(rawText, !!isTextOnly), raw: rawText });
  } catch (err) {
    console.error('Function error:', err);
    return res.status(500).json({ error: 'Internal error', message: err.message });
  }
}

// Extracción tolerante — el modelo a veces envuelve el JSON en ```json o agrega texto.
function extractJSON(text, isTextOnly) {
  if (!text) return null;

  const attempts = [
    function () { return JSON.parse(text); },
    function () { const m = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/); return m ? JSON.parse(m[0]) : null; },
    function () { return JSON.parse(text.replace(/```json|```/g, '').trim()); }
  ];
  for (let i = 0; i < attempts.length; i++) {
    try { const v = attempts[i](); if (v) return v; } catch (e) { /* siguiente intento */ }
  }

  // Último recurso para un recibo simple: rascar los campos con regex
  if (!isTextOnly) {
    const num = /"amount"\s*:\s*(-?[\d.]+)/.exec(text);
    const mer = /"merchant"\s*:\s*"([^"]+)"/.exec(text);
    const dat = /"date"\s*:\s*"([^"]+)"/.exec(text);
    const cat = /"category"\s*:\s*"([^"]+)"/.exec(text);
    if (num || mer) {
      return {
        merchant: mer ? mer[1] : 'Desconocido',
        amount: parseFloat(num ? num[1] : '0'),
        date: dat ? dat[1] : new Date().toISOString().split('T')[0],
        category: cat ? cat[1] : 'Otros',
        confidence: 60
      };
    }
  }
  return null;
}
