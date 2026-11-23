
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { serverDb } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

function respond(error: string, status: number) {
  return NextResponse.json(
    { success: false, error },
    {
      status,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
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
      return respond(
        'Please sign in to accept your invitation.',
        401
      );
    }

    if (!user.email || !user.email_confirmed_at) {
      return respond(
        'Please confirm your email address first.',
        403
      );
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
      return respond('Invalid invitation request.', 400);
    }

    const input = body as Record<string, unknown>;
    const token = input.token;

    if (
      typeof token !== 'string' ||
      !TOKEN_PATTERN.test(token)
    ) {
      return respond('Invalid invitation token.', 400);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      console.error('Staff activation configuration missing.');

      return respond(
        'Staff activation is temporarily unavailable.',
        503
      );
    }

    const adminDb = createClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const tokenHash = createHash('sha256')
      .update(token)
      .digest('hex');

    const { data: invitation, error: lookupError } =
      await adminDb
        .from('staff_invitations')
        .select('id,email,role,status,expires_at,accepted_at')
        .eq('token_hash', tokenHash)
        .eq('status', 'pending')
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

    if (lookupError) {
      console.error('Invitation lookup failed:', lookupError);

      return respond('Unable to verify invitation.', 500);
    }

    if (!invitation) {
      return respond(
        'This invitation is invalid, expired, or already used.',
        404
      );
    }

    if (
      invitation.email.trim().toLowerCase() !==
      user.email.trim().toLowerCase()
    ) {
      return respond(
        'Please sign in with the email address that received this invitation.',
        403
      );
    }

    if (!['manager', 'specialist'].includes(invitation.role)) {
      return respond('Invalid invitation role.', 400);
    }

    // The database function must atomically verify the
    // invitation, update the profile role, and mark it accepted.
    // It is restricted to the service_role database role.
    const { data: accepted, error: acceptError } =
      await adminDb.rpc('accept_staff_invitation', {
        p_invitation_id: invitation.id,
        p_user_id: user.id,
      });

    if (acceptError) {
      console.error('Staff activation failed:', acceptError);

      return respond(
        'Unable to activate staff account.',
        500
      );
    }

    if (accepted !== true) {
      return respond(
        'This invitation could not be accepted. It may have expired or already been used.',
        409
      );
    }

    return NextResponse.json(
      {
        success: true,
        role: invitation.role,
        message:
          'Your Legavora staff account has been activated successfully.',
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    console.error('Staff invitation acceptance failed:', error);

    return respond(
      'Unable to process invitation acceptance.',
      500
    );
  }
}
