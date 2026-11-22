
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { serverDb } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_ROLES = ['manager', 'specialist'] as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function respond(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get('origin');

    if (origin && origin !== request.nextUrl.origin) {
      return respond('Invalid request origin.', 403);
    }

    const db = await serverDb();

    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser();

    if (authError || !user) {
      return respond('Please sign in.', 401);
    }

    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      !profile ||
      profile.role !== 'admin'
    ) {
      return respond('Administrator access required.', 403);
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return respond('Invalid request body.', 400);
    }

    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body)
    ) {
      return respond('Invalid invitation information.', 400);
    }

    const input = body as Record<string, unknown>;

    if (
      typeof input.email !== 'string' ||
      typeof input.role !== 'string'
    ) {
      return respond('Email and staff role are required.', 400);
    }

    const email = input.email.trim().toLowerCase();
    const role = input.role.trim().toLowerCase();

    if (
      email.length > 254 ||
      !EMAIL_PATTERN.test(email)
    ) {
      return respond('Enter a valid email address.', 400);
    }

    if (
      !ALLOWED_ROLES.some(
        (allowedRole) => allowedRole === role
      )
    ) {
      return respond('Invalid staff role.', 400);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      console.error('Supabase administrator credentials missing.');
      return respond('Invitation service unavailable.', 503);
    }

    const adminDb = createClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Check existing accounts using server-only credentials.
    // Paginate so accounts beyond the first page are checked.
    let page = 1;
    const perPage = 1000;
    let existingAccount = false;

    while (true) {
      const { data, error } = await adminDb.auth.admin.listUsers({
        page,
        perPage,
      });

      if (error) {
        console.error('Account lookup failed:', error);
        return respond('Unable to verify existing accounts.', 500);
      }

      if (
        data.users.some(
          (account) =>
            account.email?.trim().toLowerCase() === email
        )
      ) {
        existingAccount = true;
        break;
      }

      if (data.users.length < perPage) {
        break;
      }

      page += 1;
    }

    if (existingAccount) {
      return respond(
        'This email address already belongs to a registered Legavora account.',
        409
      );
    }

    const { data: pendingInvitation, error: lookupError } =
      await db
        .from('staff_invitations')
        .select('id,expires_at')
        .eq('status', 'pending')
        .ilike('email', email)
        .maybeSingle();

    if (lookupError) {
      console.error('Invitation lookup failed:', lookupError);
      return respond('Unable to check existing invitations.', 500);
    }

    if (pendingInvitation) {
      const expired =
        new Date(pendingInvitation.expires_at).getTime() <=
        Date.now();

      if (!expired) {
        return respond(
          'An active invitation already exists for this email address.',
          409
        );
      }

      // Expire the old invitation before creating another.
      const { data: expiredRecord, error: expireError } =
        await db
          .from('staff_invitations')
          .update({ status: 'expired' })
          .eq('id', pendingInvitation.id)
          .eq('status', 'pending')
          .lte('expires_at', new Date().toISOString())
          .select('id')
          .maybeSingle();

      if (expireError || !expiredRecord) {
        console.error('Invitation expiration failed:', expireError);
        return respond(
          'Unable to expire the previous invitation. Please try again.',
          409
        );
      }
    }

    const { data: invitation, error: insertError } = await db
      .from('staff_invitations')
      .insert({
        email,
        role,
        status: 'pending',
        invited_by: user.id,
      })
      .select('id,email,role,status,created_at,expires_at')
      .single();

    if (insertError || !invitation) {
      console.error('Staff invitation creation failed:', insertError);

      if (insertError?.code === '23505') {
        return respond(
          'An active invitation already exists for this email address.',
          409
        );
      }

      return respond('Unable to create staff invitation.', 500);
    }

    return NextResponse.json(
      {
        success: true,
        invitation,
        emailSent: false,
        message:
          'Invitation record created successfully. Email delivery is not enabled yet.',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Staff invitation endpoint failed:', error);
    return respond('Unable to process staff invitation.', 500);
  }
}
