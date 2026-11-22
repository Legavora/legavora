
import { NextRequest, NextResponse } from 'next/server';
import {
  createServerClient,
  type CookieOptions,
} from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomBytes } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RECOVERY_COOKIE = 'legavora_recovery';
const RECOVERY_TTL_SECONDS = 10 * 60;

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

function recoverySignature(
  payload: string,
  secret: string
): string {
  return createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');

  const errorUrl = new URL('/forgot-password', url.origin);
  errorUrl.searchParams.set('error', 'invalid_link');

  if (!tokenHash || type !== 'recovery') {
    return NextResponse.redirect(errorUrl);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const recoverySecret = process.env.RECOVERY_SIGNING_SECRET;

  if (
    !supabaseUrl ||
    !supabaseKey ||
    !serviceKey ||
    !recoverySecret
  ) {
    console.error('Recovery configuration is incomplete.');
    return NextResponse.redirect(errorUrl);
  }

  const response = NextResponse.redirect(
    new URL('/reset-password', url.origin)
  );

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(
            ({ name, value, options }) => {
              response.cookies.set(
                name,
                value,
                options
              );
            }
          );
        },
      },
    }
  );

  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'recovery',
  });

  if (error || !data.user) {
    return NextResponse.redirect(errorUrl);
  }

  const adminDb = createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const expiresAt =
    Math.floor(Date.now() / 1000) +
    RECOVERY_TTL_SECONDS;

  const nonce = randomBytes(16).toString('hex');

  const payload = [
    data.user.id,
    expiresAt.toString(),
    nonce,
  ].join('.');

  const signature = recoverySignature(
    payload,
    recoverySecret
  );

  const authorization = `${payload}.${signature}`;

  const tokenHashForStorage = createHmac(
    'sha256',
    recoverySecret
  )
    .update(authorization)
    .digest('hex');

  const { error: insertError } = await adminDb
    .from('password_recovery_authorizations')
    .insert({
      user_id: data.user.id,
      token_hash: tokenHashForStorage,
      expires_at: new Date(
        expiresAt * 1000
      ).toISOString(),
    });

  if (insertError) {
    console.error(
      'Unable to create recovery authorization:',
      insertError
    );

    return NextResponse.redirect(errorUrl);
  }

  response.cookies.set(
    RECOVERY_COOKIE,
    authorization,
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: RECOVERY_TTL_SECONDS,
    }
  );

  return response;
}
