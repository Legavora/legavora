
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');

  const errorUrl = new URL('/login', url.origin);
  errorUrl.searchParams.set(
    'error',
    'email_confirmation_failed'
  );

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
  successUrl.searchParams.set(
    'confirmed',
    'true'
  );

  const response = NextResponse.redirect(successUrl);

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet) {
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
