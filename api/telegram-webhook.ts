// Telegram Webhook Handler for Stars Payments & pre_checkout_query
// Automatically confirms payments and credits stars

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).send('OK');
  }

  const update = req.body;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!update) return res.status(200).send('OK');

  try {
    // 1. Handle pre_checkout_query (Mandatory to answer within 10s or Telegram rejects payment)
    if (update.pre_checkout_query) {
      const queryId = update.pre_checkout_query.id;
      if (botToken) {
        await fetch(`https://api.telegram.org/bot${botToken}/answerPreCheckoutQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pre_checkout_query_id: queryId,
            ok: true
          })
        });
      }
      return res.status(200).send('OK');
    }

    // 2. Handle successful_payment (Payment Completed)
    if (update.message?.successful_payment) {
      const payment = update.message.successful_payment;
      const totalStars = payment.total_amount;
      const chargeId = payment.telegram_payment_charge_id;
      const payload = JSON.parse(payment.invoice_payload || '{}');

      console.log(`[STAR PAYMENT SUCCESS] User ${payload.userId} bought ${totalStars} Stars! Charge ID: ${chargeId}`);

      // Optional: Save payment record to TiDB Serverless database
    }
  } catch (e) {
    console.error('Webhook error', e);
  }

  return res.status(200).send('OK');
}
