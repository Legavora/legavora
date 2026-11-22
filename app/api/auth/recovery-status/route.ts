
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { serverDb } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COOKIE_NAME = 'legavora_recovery';

function unauthorized() {
  return NextResponse.json(
    { authorized: false },
    {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}

export async function GET(request: NextRequest) {
  const secret = process.env.RECOVERY_SIGNING_SECRET;
  const cookie = request.cookies.get(COOKIE_NAME)?.value;

  if (!secret || !cookie) {
    return unauthorized();
  }

  const parts = cookie.split('.');

  if (parts.length !== 4) {
    return unauthorized();
  }

  const [userId, expiresText, nonce, signature] = parts;

  if (
    !/^[0-9a-f-]{36}$/i.test(userId) ||
    !/^\d+$/.test(expiresText) ||
    !/^[0-9a-f]{32}$/.test(nonce) ||
    !/^[A-Za-z0-9_-]+$/.test(signature)
  ) {
    return unauthorized();
  }

  const expiresAt = Number(expiresText);
  const now = Math.floor(Date.now() / 1000);

  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= now ||
    expiresAt > now + 600
  ) {
    return unauthorized();
  }

  const payload = `${userId}.${expiresText}.${nonce}`;

  const expected = createHmac('sha256', secret)
    .update(payload)
    .digest();

  const provided = Buffer.from(signature, 'base64url');

  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return unauthorized();
  }

  const db = await serverDb();

  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser();

  if (authError || !user || user.id !== userId) {
    return unauthorized();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('Recovery database configuration is incomplete.');
    return unauthorized();
  }

  const adminDb = createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const storedTokenHash = createHmac('sha256', secret)
    .update(cookie)
    .digest('hex');

  const { data: authorization, error: lookupError } =
    await adminDb
      .from('password_recovery_authorizations')
      .select('id')
      .eq('user_id', user.id)
      .eq('token_hash', storedTokenHash)
      .is('consumed_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

  if (lookupError || !authorization) {
    return unauthorized();
  }

  return NextResponse.json(
    { authorized: true },
    {
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}

export async function DELETE() {
  const response = NextResponse.json(
    { success: true },
    {
      headers: { 'Cache-Control': 'no-store' },
    }
  );

  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
