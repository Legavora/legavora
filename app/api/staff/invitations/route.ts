
import { NextRequest, NextResponse } from 'next/server';
import { serverDb } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_ROLES = ['manager', 'specialist'] as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get('origin');

    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json(
        { error: 'Invalid request origin.' },
        { status: 403 }
      );
    }

    const db = await serverDb();

    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in.' },
        { status: 401 }
      );
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
      return NextResponse.json(
        { error: 'Administrator access required.' },
        { status: 403 }
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body.' },
        { status: 400 }
      );
    }

    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        { error: 'Invalid invitation information.' },
        { status: 400 }
      );
    }

    const input = body as Record<string, unknown>;

    if (
      typeof input.email !== 'string' ||
      typeof input.role !== 'string'
    ) {
      return NextResponse.json(
        { error: 'Email and staff role are required.' },
        { status: 400 }
      );
    }

    const email = input.email.trim().toLowerCase();
    const role = input.role;

    if (
      email.length > 254 ||
      !EMAIL_PATTERN.test(email)
    ) {
      return NextResponse.json(
        { error: 'Enter a valid email address.' },
        { status: 400 }
      );
    }

    if (
      !ALLOWED_ROLES.some(
        (allowedRole) => allowedRole === role
      )
    ) {
      return NextResponse.json(
        { error: 'Invalid staff role.' },
        { status: 400 }
      );
    }

    const { data: existingInvitation, error: lookupError } =
      await db
        .from('staff_invitations')
        .select('id,expires_at')
        .eq('status', 'pending')
        .ilike('email', email)
        .maybeSingle();

    if (lookupError) {
      console.error('Invitation lookup failed:', lookupError);

      return NextResponse.json(
        { error: 'Unable to check existing invitations.' },
        { status: 500 }
      );
    }

    if (existingInvitation) {
      return NextResponse.json(
        {
          error:
            'A pending invitation already exists for this email address.',
          expired:
            new Date(existingInvitation.expires_at).getTime() <=
            Date.now(),
        },
        { status: 409 }
      );
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
        return NextResponse.json(
          {
            error:
              'A pending invitation already exists for this email address.',
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: 'Unable to create staff invitation.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        invitation,
        emailSent: false,
        message:
          'Invitation record created. Email delivery is not enabled yet.',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Staff invitation endpoint failed:', error);

    return NextResponse.json(
      { error: 'Unable to process staff invitation.' },
      { status: 500 }
    );
  }
}
