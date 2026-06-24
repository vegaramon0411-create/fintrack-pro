// Vercel Serverless Function — FinTrack Pro Scanner
// Proxies image analysis requests to Anthropic API
// keeping the API key secure on the server side.

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, mediaType, prompt } = req.body;

    if (!image || !mediaType) {
      return res.status(400).json({ error: 'Missing image or mediaType' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: image }
            },
            {
              type: 'text',
              text: prompt || `Analyze this receipt image and extract the following information. Respond ONLY with a valid JSON object, no markdown, no explanation:
{
  "merchant": "store or restaurant name",
  "amount": 0.00,
  "date": "YYYY-MM-DD",
  "category": "one of: Supermercado, Restaurantes, Gasolina, Salud, Entretenimiento, Ropa, Transporte, Servicios, Otros",
  "items": ["item1", "item2"],
  "confidence": 85
}
Today's date is ${new Date().toISOString().split('T')[0]}. If you cannot read a field clearly, use your best estimate and lower the confidence score.`
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: 'Anthropic API error', details: err });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    // Try to parse JSON from the response
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      return res.status(200).json({ success: true, result: parsed });
    } catch(e) {
      // Return raw text if JSON parsing fails
      return res.status(200).json({ success: true, result: null, raw: text });
    }

  } catch (err) {
    console.error('Scanner function error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
