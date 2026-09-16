// ─────────────────────────────────────────────────────────────────────────────
// FinTrack Pro · función serverless de Vercel  →  POST /api/chat
// Relay del Asistente con IA: recibe la conversación + el resumen financiero
// del usuario (armado en el navegador por FT.buildFinanceContext(), porque los
// datos viven en localStorage) y los reenvía a Claude con la key del servidor.
// La ANTHROPIC_API_KEY nunca sale de aquí — no se guarda ni se devuelve nada
// de la key al cliente.
//
// Contrato de entrada (JSON body):
//   { context, messages, image }
//     · context   string — resumen financiero (system prompt), de FT.buildFinanceContext()
//     · messages  [{role:'user'|'assistant', content:string}] — ventana reciente del chat
//     · image     opcional — { data (base64), mediaType } se adjunta al ÚLTIMO mensaje user
// ─────────────────────────────────────────────────────────────────────────────

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// Conversación/consejo financiero: más razonamiento que clasificar un recibo,
// pero sigue siendo texto corto y acotado por créditos → Sonnet (no Opus, para
// no disparar el costo de una key compartida entre todos los usuarios).
const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 1024;
const MAX_MESSAGES = 16; // ventana de conversación — el resto del historial ya vive en el navegador

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { context, messages, image, lang } = req.body || {};
    if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: 'Missing messages' });

    // Ventana reciente nada más — el contexto financiero ya trae los números
    // que importan, no hace falta reenviar toda la charla desde el principio.
    const recent = messages.slice(-MAX_MESSAGES).map(function (m) {
      return { role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') };
    });

    // La imagen (foto de un producto a comparar) va SOLO en el último mensaje,
    // y solo si ese último mensaje es del usuario.
    const last = recent[recent.length - 1];
    if (image && image.data && last && last.role === 'user') {
      const b64 = String(image.data).replace(/^data:[^,]+,/, '').replace(/\s+/g, '');
      recent[recent.length - 1] = {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.mediaType || 'image/jpeg', data: b64 } },
          { type: 'text', text: last.content || (lang === 'en' ? 'What do you think about this?' : '¿Qué opinas de esto?') }
        ]
      };
    }

    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: String(context || ''),
        messages: recent
      })
    });

    if (!r.ok) {
      const details = await r.text();
      console.error('Anthropic error:', details);
      return res.status(r.status).json({ error: 'Anthropic API error', details });
    }

    const data = await r.json();
    // OJO: Sonnet 5 puede anteponer un bloque type:'thinking' SIN que se le haya
    // pedido -- content[0] entonces no es el texto. Hay que juntar todos los
    // bloques type:'text' (nunca asumir que el texto está en la posición 0).
    const reply = ((data && data.content) || [])
      .filter(function (b) { return b && b.type === 'text'; })
      .map(function (b) { return b.text; })
      .join('\n').trim();

    if (!reply) console.error('Empty reply from Anthropic. stop_reason=' + (data && data.stop_reason) + ' content=' + JSON.stringify(data && data.content));
    return res.status(200).json({ success: true, reply: reply });
  } catch (err) {
    console.error('Function error:', err);
    return res.status(500).json({ error: 'Internal error', message: err.message });
  }
}
