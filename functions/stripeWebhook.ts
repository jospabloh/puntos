import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@17.5.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), {
  apiVersion: '2024-12-18.acacia',
});

Deno.serve(async (req) => {
  try {
    const signature = req.headers.get('stripe-signature');
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

    if (!signature || !webhookSecret) {
      return Response.json(
        { error: 'Missing signature or webhook secret' },
        { status: 400 }
      );
    }

    // Get raw body for signature verification
    const body = await req.text();

    // Initialize Base44 client BEFORE Stripe validation
    const base44 = createClientFromRequest(req);

    let event;
    try {
      // CRITICAL: Use async version for Deno's Web Crypto API
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return Response.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    console.log('✅ Webhook verified:', event.type);

    // Process the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        
        // Get customer email and subscription details
        const customerEmail = session.customer_email || session.customer_details?.email;
        const stripeCustomerId = session.customer;
        const stripeSubscriptionId = session.subscription;

        if (!customerEmail) {
          console.error('No customer email in session');
          break;
        }

        // Find the loyalty account by email
        const accounts = await base44.asServiceRole.entities.LoyaltyAccount.filter({
          user_email: customerEmail
        });

        if (accounts.length === 0) {
          console.error('No loyalty account found for:', customerEmail);
          break;
        }

        const account = accounts[0];

        // Update account to active subscription
        await base44.asServiceRole.entities.LoyaltyAccount.update(account.id, {
          subscription_status: 'active',
          subscription_plan: session.metadata?.plan || 'monthly',
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId
        });

        console.log('✅ Account activated:', customerEmail);

        // Send confirmation email
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: customerEmail,
            from_name: 'Puntos+',
            subject: '¡Bienvenido a Puntos+! Tu suscripción está activa',
            body: `
              <h2>¡Gracias por suscribirte a Puntos+!</h2>
              <p>Tu suscripción está activa y puedes disfrutar de todos los beneficios de nuestro programa de lealtad.</p>
              <p>Plan: ${session.metadata?.plan === 'annual' ? 'Anual' : 'Mensual'}</p>
              <p>Si tienes alguna pregunta, no dudes en contactarnos.</p>
              <p>¡Disfruta de Puntos+!</p>
            `
          });
        } catch (emailError) {
          console.error('Error sending email:', emailError);
        }

        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const stripeCustomerId = subscription.customer;

        // Find account by stripe_customer_id
        const accounts = await base44.asServiceRole.entities.LoyaltyAccount.filter({
          stripe_customer_id: stripeCustomerId
        });

        if (accounts.length === 0) {
          console.error('No account found for Stripe customer:', stripeCustomerId);
          break;
        }

        const account = accounts[0];

        // Update subscription status based on Stripe status
        let newStatus = 'active';
        if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
          newStatus = 'inactive';
        } else if (subscription.status === 'past_due') {
          newStatus = 'inactive';
        }

        await base44.asServiceRole.entities.LoyaltyAccount.update(account.id, {
          subscription_status: newStatus,
          stripe_subscription_id: subscription.id
        });

        console.log('✅ Subscription updated:', account.user_email, newStatus);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const stripeCustomerId = subscription.customer;

        // Find account by stripe_customer_id
        const accounts = await base44.asServiceRole.entities.LoyaltyAccount.filter({
          stripe_customer_id: stripeCustomerId
        });

        if (accounts.length === 0) {
          console.error('No account found for Stripe customer:', stripeCustomerId);
          break;
        }

        const account = accounts[0];

        await base44.asServiceRole.entities.LoyaltyAccount.update(account.id, {
          subscription_status: 'canceled',
          stripe_subscription_id: null
        });

        console.log('✅ Subscription canceled:', account.user_email);

        // Send cancellation email
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: account.user_email,
            from_name: 'Puntos+',
            subject: 'Tu suscripción a Puntos+ ha sido cancelada',
            body: `
              <h2>Suscripción Cancelada</h2>
              <p>Tu suscripción a Puntos+ ha sido cancelada.</p>
              <p>Si deseas volver a activarla, puedes hacerlo en cualquier momento desde tu cuenta.</p>
              <p>¡Gracias por haber sido parte de Puntos+!</p>
            `
          });
        } catch (emailError) {
          console.error('Error sending cancellation email:', emailError);
        }

        break;
      }

      default:
        console.log('Unhandled event type:', event.type);
    }

    return Response.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return Response.json(
      { error: 'Webhook handler failed', details: error.message },
      { status: 500 }
    );
  }
});