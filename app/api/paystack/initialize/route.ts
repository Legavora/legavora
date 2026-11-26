
import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    // Online payments are disabled by default.
    if (process.env.PAYMENTS_ENABLED !== 'true') {
      return NextResponse.json(
        {
          error: 'Online payments are currently unavailable. Please contact hello@legavora.com for payment assistance.',
        },
        { status: 503 }
      );
    }

    const { db, user } = await currentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const fd = await req.formData();
    const id = fd.get('invoice_id');

    if (
      typeof id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ) {
      return NextResponse.json(
        { error: 'Valid invoice required' },
        { status: 400 }
      );
    }

    const { data: invoice, error: invoiceError } =
      await db
        .from('invoices')
        .select(
          'id,author_id,amount_cents,currency,status'
        )
        .eq('id', id)
        .eq('author_id', user.id)
        .single();

    if (
      invoiceError ||
      !invoice ||
      invoice.status !== 'pending'
    ) {
      return NextResponse.json(
        { error: 'Invoice not available' },
        { status: 404 }
      );
    }

    if (invoice.currency !== 'USD') {
      return NextResponse.json(
        { error: 'Only USD invoices are supported' },
        { status: 400 }
      );
    }

    if (
      !Number.isSafeInteger(invoice.amount_cents) ||
      invoice.amount_cents <= 0 ||
      !user.email
    ) {
      return NextResponse.json(
        { error: 'Invalid payment information' },
        { status: 400 }
      );
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (
      !secretKey ||
      !siteUrl ||
      !supabaseUrl ||
      !serviceKey
    ) {
      return NextResponse.json(
        { error: 'Payments are not configured' },
        { status: 503 }
      );
    }

    const callbackUrl = new URL('/dashboard', siteUrl);

    if (callbackUrl.protocol !== 'https:') {
      throw new Error('Invalid payment callback configuration');
    }

    const service = createClient(
      supabaseUrl,
      serviceKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data: existingAttempt, error: attemptError } =
      await service
        .from('payment_attempts')
        .select('reference')
        .eq('invoice_id', invoice.id)
        .in('status', ['initialized', 'paid'])
        .limit(1)
        .maybeSingle();

    if (attemptError) {
      throw attemptError;
    }

    if (existingAttempt) {
      return NextResponse.json(
        {
          error: 'An existing payment attempt requires verification. Please contact financial support.',
        },
        { status: 409 }
      );
    }

    const reference =
      `LGV-${invoice.id}-${crypto.randomUUID()}`;

    const response = await fetch(
      'https://api.paystack.co/transaction/initialize',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: user.email,
          amount: invoice.amount_cents,
          currency: 'USD',
          reference,
          callback_url: callbackUrl.toString(),
          metadata: {
            invoice_id: invoice.id,
          },
        }),
        cache: 'no-store',
      }
    );

    const payload = await response.json();

    if (
      !response.ok ||
      !payload.status ||
      !payload.data?.authorization_url
    ) {
      throw new Error('Payment initialization failed');
    }

    const authorizationUrl = new URL(
      payload.data.authorization_url
    );

    if (
      authorizationUrl.protocol !== 'https:' ||
      authorizationUrl.hostname !== 'checkout.paystack.com'
    ) {
      throw new Error('Invalid payment authorization URL');
    }

    const { error } = await service
      .from('payment_attempts')
      .insert({
        invoice_id: invoice.id,
        reference,
        amount_cents: invoice.amount_cents,
        currency: 'USD',
        status: 'initialized',
      });

    if (error) {
      throw error;
    }

    return NextResponse.redirect(
      authorizationUrl.toString(),
      303
    );

  } catch (error) {
    console.error('Payment initialization failed:', error);

    return NextResponse.json(
      {
        error: 'Unable to initialize payment. Please contact financial support.',
      },
      { status: 500 }
    );
  }
}
