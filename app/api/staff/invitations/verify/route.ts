
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    {
      valid: false,
      error: message,
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get('origin');

    if (origin && origin !== request.nextUrl.origin) {
      return errorResponse('Invalid request origin.', 403);
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid request body.', 400);
    }

    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body)
    ) {
      return errorResponse('Invalid invitation request.', 400);
    }

    const input = body as Record<string, unknown>;
    const token = input.token;

    if (
      typeof token !== 'string' ||
      !TOKEN_PATTERN.test(token)
    ) {
      return errorResponse(
        'This invitation link is invalid or has expired.',
        400
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      console.error('Staff verification configuration missing.');

      return errorResponse(
        'Invitation verification is temporarily unavailable.',
        503
      );
    }

    const adminDb = createClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Hash the supplied token before searching the database.
    // The raw token is never stored.
    const tokenHash = createHash('sha256')
      .update(token)
      .digest('hex');

    const { data: invitation, error } = await adminDb
      .from('staff_invitations')
      .select('id,email,role,status,expires_at,accepted_at')
      .eq('token_hash', tokenHash)
      .eq('status', 'pending')
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error) {
      console.error('Staff invitation verification failed:', error);

      return errorResponse(
        'Unable to verify this invitation.',
        500
      );
    }

    if (
      !invitation ||
      !['manager', 'specialist'].includes(invitation.role)
    ) {
      return errorResponse(
        'This invitation is invalid, expired, or already used.',
        404
      );
    }

    return NextResponse.json(
      {
        valid: true,
        invitation: {
          email: invitation.email,
          role: invitation.role,
          expires_at: invitation.expires_at,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('Staff invitation verification error:', error);

    return errorResponse(
      'Unable to verify this invitation.',
      500
    );
  }
}
