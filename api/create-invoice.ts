// Serverless API Endpoint: Create Telegram Stars Invoice Link
// Compatible with Vercel Serverless / Cloudflare Workers / Node.js

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, packageId, starsAmount, title, description } = req.body;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    // If BOT_TOKEN is not configured yet, return a mock invoice for testing
    return res.status(200).json({
      success: true,
      invoiceLink: `https://t.me/$${packageId}_invoice_mock`,
      mock: true
    });
  }

  try {
    // Official Telegram Bot API createInvoiceLink with currency XTR (Telegram Stars)
    const payload = JSON.stringify({
      userId,
      packageId,
      timestamp: Date.now()
    });

    const response = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title || `${starsAmount} Telegram Stars`,
        description: description || 'شراء نجوم تيليجرام لفتح الخزائن في لعبة Star Vault',
        payload,
        currency: 'XTR', // Telegram Stars Official Currency Code
        prices: [
          { label: `${starsAmount} Stars`, amount: starsAmount }
        ]
      })
    });

    const data = await response.json();
    if (!data.ok) {
      return res.status(400).json({ error: data.description });
    }

    return res.status(200).json({
      success: true,
      invoiceLink: data.result
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
