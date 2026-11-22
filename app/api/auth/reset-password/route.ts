
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { serverDb } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COOKIE_NAME = 'legavora_recovery';

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}

function clearRecoveryCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}

export async function POST(request: NextRequest) {
  try {
    // Reject requests from a different website.
    const origin = request.headers.get('origin');

    if (origin !== request.nextUrl.origin) {
      return errorResponse('Invalid request origin.', 403);
    }

    const secret = process.env.RECOVERY_SIGNING_SECRET;
    const cookie = request.cookies.get(COOKIE_NAME)?.value;

    if (!secret || !cookie) {
      return errorResponse(
        'Recovery authorization is missing or expired.',
        401
      );
    }

    const parts = cookie.split('.');

    if (parts.length !== 4) {
      return errorResponse('Invalid recovery authorization.', 401);
    }

    const [userId, expiresText, nonce, signature] = parts;

    if (
      !/^[0-9a-f-]{36}$/i.test(userId) ||
      !/^\d+$/.test(expiresText) ||
      !/^[0-9a-f]{32}$/.test(nonce) ||
      !/^[A-Za-z0-9_-]+$/.test(signature)
    ) {
      return errorResponse('Invalid recovery authorization.', 401);
    }

    const expiresAt = Number(expiresText);
    const now = Math.floor(Date.now() / 1000);

    if (
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= now ||
      expiresAt > now + 600
    ) {
      return errorResponse(
        'Recovery authorization has expired.',
        401
      );
    }

    const payload = `${userId}.${expiresText}.${nonce}`;

    const expectedSignature = createHmac('sha256', secret)
      .update(payload)
      .digest();

    const providedSignature = Buffer.from(
      signature,
      'base64url'
    );

    if (
      providedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(
        providedSignature,
        expectedSignature
      )
    ) {
      return errorResponse('Invalid recovery authorization.', 401);
    }

    // Verify the Supabase session belongs to the
    // account authorized for recovery.
    const db = await serverDb();

    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser();

    if (authError || !user || user.id !== userId) {
      return errorResponse('Unauthorized recovery request.', 401);
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
      return errorResponse('Invalid password information.', 400);
    }

    const input = body as Record<string, unknown>;
    const password = input.password;

    if (
      typeof password !== 'string' ||
      password.length < 8 ||
      password.length > 128
    ) {
      return errorResponse(
        'Password must contain between 8 and 128 characters.',
        400
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      console.error('Password recovery configuration is incomplete.');
      return errorResponse('Password recovery unavailable.', 503);
    }

    const adminDb = createClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Match the hash stored when the recovery
    // email link was verified.
    const storedTokenHash = createHmac('sha256', secret)
      .update(cookie)
      .digest('hex');

    // Atomically consume the authorization.
    // Only one concurrent request can succeed.
    const { data: consumed, error: consumeError } =
      await adminDb.rpc('consume_password_recovery', {
        p_token_hash: storedTokenHash,
        p_user_id: user.id,
      });

    if (consumeError) {
      console.error(
        'Unable to consume recovery authorization:',
        consumeError
      );

      return errorResponse(
        'Unable to verify recovery authorization.',
        500
      );
    }

    if (consumed !== true) {
      return clearRecoveryCookie(
        errorResponse(
          'This recovery authorization has expired or already been used. Please request a new link.',
          401
        )
      );
    }

    // Only update the password after the
    // authorization has been consumed.
    const { error: updateError } =
      await adminDb.auth.admin.updateUserById(user.id, {
        password,
      });

    if (updateError) {
      console.error(
        'Password recovery update failed:',
        updateError
      );

      return clearRecoveryCookie(
        errorResponse(
          'Unable to update your password. Please request a new reset link.',
          500
        )
      );
    }

    const response = NextResponse.json(
      {
        success: true,
        message: 'Your password has been updated successfully.',
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );

    return clearRecoveryCookie(response);
  } catch (error) {
    console.error('Password recovery endpoint failed:', error);

    return errorResponse(
      'Unable to complete password recovery.',
      500
    );
  }
}
