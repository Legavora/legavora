
import { NextRequest, NextResponse } from 'next/server';
import {
  createServerClient,
  type CookieOptions,
} from '@supabase/ssr';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

const INVITATION_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

function getSafeInvitationRedirect(
  value: string | null,
  origin: string
): string | null {
  if (!value) return null;

  try {
    const parsed = new URL(value, origin);

    // Only accept redirects belonging to this deployment.
    if (parsed.origin !== origin) {
      return null;
    }

    // The registration form sends the callback URL
    // with an embedded staff invitation destination.
    if (parsed.pathname !== '/auth/callback') {
      return null;
    }

    const next = parsed.searchParams.get('next');

    if (!next) return null;

    const invitation = new URL(next, origin);

    if (
      invitation.origin !== origin ||
      invitation.pathname !==
        '/staff/accept-invitation' ||
      invitation.searchParams.size !== 1
    ) {
      return null;
    }

    const token = invitation.searchParams.get('token');

    if (
      !token ||
      !INVITATION_TOKEN_PATTERN.test(token)
    ) {
      return null;
    }

    return (
      '/staff/accept-invitation?token=' +
      encodeURIComponent(token)
    );
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');

  const invitationRedirect = getSafeInvitationRedirect(
    url.searchParams.get('redirect_to'),
    url.origin
  );

  const errorUrl = new URL('/login', url.origin);
  errorUrl.searchParams.set(
    'error',
    'email_confirmation_failed'
  );

  if (invitationRedirect) {
    errorUrl.searchParams.set(
      'next',
      invitationRedirect
    );
  }

  if (!tokenHash || type !== 'signup') {
    return NextResponse.redirect(errorUrl);
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      'Supabase email confirmation configuration is missing.'
    );

    return NextResponse.redirect(errorUrl);
  }

  const successUrl = new URL('/login', url.origin);
  successUrl.searchParams.set('confirmed', 'true');

  if (invitationRedirect) {
    successUrl.searchParams.set(
      'next',
      invitationRedirect
    );
  }

  const response = NextResponse.redirect(successUrl);

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
              request.cookies.set(name, value);

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

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'signup',
  });

  if (error) {
    console.error(
      'Email confirmation failed:',
      error.message
    );

    return NextResponse.redirect(errorUrl);
  }

  return response;
}
