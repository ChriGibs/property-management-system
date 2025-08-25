const stripeLib = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
const { Invoice, Payment, PaymentAllocation, PaymentRequest } = require('../models');

module.exports = async function stripeWebhookHandler(req, res) {
  try {
    let event = req.body;
    const sig = req.headers['stripe-signature'];
    if (process.env.STRIPE_WEBHOOK_SECRET && stripeLib) {
      try {
        event = stripeLib.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        console.error('Stripe webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }
    }

    if (event && event.type === 'checkout.session.completed') {
      const session = event.data.object;

      try {
        const prId = session.metadata && session.metadata.paymentRequestId ? parseInt(session.metadata.paymentRequestId) : null;
        if (!prId) {
          console.warn('checkout.session.completed missing paymentRequestId');
        } else {
          const pr = await PaymentRequest.findByPk(prId);
          if (pr && pr.status !== 'completed') {
            const snapshot = (pr.metadata && pr.metadata.allocations) || (session.metadata && JSON.parse(session.metadata.allocationsJson)) || [];
            const totalFromSnapshot = Array.isArray(snapshot) ? snapshot.reduce((s, a) => s + parseFloat(a.amount || 0), 0) : 0;
            const amountPaid = session.amount_total ? session.amount_total / 100 : totalFromSnapshot;

            // Idempotency: avoid duplicate creation by payment_intent if present
            const existingByIntent = session.payment_intent ? await Payment.findOne({ where: { transactionId: String(session.payment_intent) } }) : null;
            if (!existingByIntent) {
              const createdPayment = await Payment.create({
                invoiceId: null,
                amount: amountPaid,
                paymentDate: new Date(),
                paymentMethod: 'online',
                status: 'completed',
                transactionId: session.payment_intent ? String(session.payment_intent) : null,
                description: `Stripe ${session.id}`,
                notes: `Stripe Checkout session=${session.id} intent=${session.payment_intent || ''}`
              });

              if (Array.isArray(snapshot) && snapshot.length) {
                const rows = snapshot
                  .filter(a => a && a.invoiceId && parseFloat(a.amount || 0) > 0)
                  .map(a => ({ paymentId: createdPayment.id, invoiceId: parseInt(a.invoiceId), amount: parseFloat(a.amount) }));
                if (rows.length) {
                  await PaymentAllocation.bulkCreate(rows);
                }
              }
            }

            pr.status = 'completed';
            pr.stripePaymentIntentId = session.payment_intent || null;
            await pr.save();
          }
        }
      } catch (e) {
        console.error('Stripe webhook processing error:', e);
        throw e;
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}



