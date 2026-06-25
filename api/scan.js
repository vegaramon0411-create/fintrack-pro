// Vercel Serverless Function — FinTrack Pro
// Handles: receipt images, PDFs, and CSV text analysis via Claude

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { image, mediaType, prompt, isTextOnly, csvContent } = req.body;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

    // Build message based on input type
    let messages;

    if (isTextOnly && (csvContent || prompt)) {
      // TEXT ONLY MODE — for CSV content sent as plain text
      const textPrompt = prompt || `Extract all transactions from this CSV and return a JSON array.`;
      messages = [{ role: 'user', content: textPrompt }];

    } else {
      // IMAGE/PDF MODE
      if (!image || !mediaType) {
        return res.status(400).json({ error: 'Missing image or mediaType' });
      }

      const defaultPrompt = `You are analyzing a receipt image. Extract the information and respond with ONLY a raw JSON object (no markdown, no code blocks, no explanation):
{"merchant":"store name","amount":0.00,"date":"YYYY-MM-DD","category":"Supermercado","items":["item1"],"confidence":85}
Category must be one of: Supermercado, Restaurantes, Gasolina, Salud, Entretenimiento, Ropa, Servicios, Otros
Today is ${new Date().toISOString().split('T')[0]}.`;

      messages = [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: prompt || defaultPrompt }
        ]
      }];
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic error:', errText);
      return res.status(response.status).json({ error: 'Anthropic API error', details: errText });
    }

    const data = await response.json();
    const rawText = (data.content?.[0]?.text || '').trim();

    // Aggressive JSON extraction — try 4 methods
    let result = null;

    try { result = JSON.parse(rawText); } catch(e) {}

    if (!result) {
      const jsonMatch = rawText.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
      if (jsonMatch) { try { result = JSON.parse(jsonMatch[0]); } catch(e) {} }
    }

    if (!result) {
      const clean = rawText.replace(/```json|```/g, '').trim();
      try { result = JSON.parse(clean); } catch(e) {}
    }

    if (!result && !isTextOnly) {
      const amountMatch = rawText.match(/"amount"\s*:\s*(-?[\d.]+)/);
      const merchantMatch = rawText.match(/"merchant"\s*:\s*"([^"]+)"/);
      const dateMatch = rawText.match(/"date"\s*:\s*"([^"]+)"/);
      const catMatch = rawText.match(/"category"\s*:\s*"([^"]+)"/);
      if (amountMatch || merchantMatch) {
        result = {
          merchant: merchantMatch?.[1] || 'Desconocido',
          amount: parseFloat(amountMatch?.[1] || '0'),
          date: dateMatch?.[1] || new Date().toISOString().split('T')[0],
          category: catMatch?.[1] || 'Otros',
          confidence: 60
        };
      }
    }

    return res.status(200).json({ success: true, result, raw: rawText });

  } catch (err) {
    console.error('Function error:', err);
    return res.status(500).json({ error: 'Internal error', message: err.message });
  }
}
