const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const DOMAIN = process.env.DOMAIN || 'http://localhost:3000';

// Create checkout session for deposits
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount < 100) {
      return res.status(400).json({ error: 'Minimum deposit is $1.00' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: req.body.email || undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'AviatorX Premium Deposit',
              description: `Deposit $${(amount / 100).toFixed(2)} to your betting account`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      success_url: `${DOMAIN}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${DOMAIN}/cancel`,
      metadata: {
        userId: req.body.userId || 'anonymous',
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Retrieve session details (to confirm payment)
app.get('/api/checkout-session/:sessionId', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    res.json({
      id: session.id,
      status: session.payment_status,
      amount: session.amount_total,
      currency: session.currency,
      customer_email: session.customer_email,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Webhook for payment confirmation (optional but recommended)
app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);

    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        console.log('✅ Payment successful:', {
          sessionId: session.id,
          amount: session.amount_total,
          email: session.customer_email,
        });
        // TODO: Update user balance in your database here
        break;

      case 'charge.failed':
        console.log('❌ Payment failed:', event.data.object);
        break;
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).send(`Webhook error: ${error.message}`);
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🎰 AviatorX backend running on port ${PORT}`);
  console.log(`Stripe Secret Key: ${process.env.STRIPE_SECRET_KEY ? '✓ Loaded' : '✗ Missing'}`);
});
