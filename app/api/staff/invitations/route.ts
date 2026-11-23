
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import { Resend } from 'resend';
import { serverDb } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_ROLES = ['manager', 'specialist'] as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SENDER_EMAIL = 'Legavora Invitations <invitations@legavora.com>';

function respond(error: string, status: number) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };

    return entities[character] ?? character;
  });
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
    const resendKey = process.env.RESEND_API_KEY;
    const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

    if (!supabaseUrl || !serviceKey || !resendKey || !configuredSiteUrl) {
      console.error('Staff invitation configuration missing.');

      return respond(
        'Staff invitation service is temporarily unavailable.',
        503
      );
    }

    let siteOrigin: string;

    try {
      const parsedUrl = new URL(configuredSiteUrl);

      if (
        parsedUrl.protocol !== 'https:' ||
        parsedUrl.username ||
        parsedUrl.password ||
        parsedUrl.search ||
        parsedUrl.hash
      ) {
        throw new Error('Invalid site URL');
      }

      siteOrigin = parsedUrl.origin;
    } catch {
      console.error('Invalid staff invitation site URL.');

      return respond(
        'Staff invitation service is temporarily unavailable.',
        503
      );
    }

    const adminDb = createClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const resend = new Resend(resendKey);

    // Prevent invitations to already registered accounts.
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

        return respond(
          'Unable to verify existing accounts.',
          500
        );
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

    // Check for existing pending invitations.
    const { data: pendingInvitation, error: lookupError } =
      await db
        .from('staff_invitations')
        .select('id,expires_at')
        .eq('status', 'pending')
        .ilike('email', email)
        .maybeSingle();

    if (lookupError) {
      console.error('Invitation lookup failed:', lookupError);

      return respond(
        'Unable to check existing invitations.',
        500
      );
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
        console.error(
          'Invitation expiration failed:',
          expireError
        );

        return respond(
          'Unable to expire the previous invitation.',
          409
        );
      }
    }

    // Generate a cryptographically secure invitation token.
    const invitationToken = randomBytes(32).toString('hex');

    // Store only its SHA-256 hash.
    const tokenHash = createHash('sha256')
      .update(invitationToken)
      .digest('hex');

    const { data: invitation, error: insertError } =
      await db
        .from('staff_invitations')
        .insert({
          email,
          role,
          status: 'pending',
          invited_by: user.id,
          token_hash: tokenHash,
        })
        .select(
          'id,email,role,status,created_at,expires_at'
        )
        .single();

    if (insertError || !invitation) {
      console.error(
        'Staff invitation creation failed:',
        insertError
      );

      if (insertError?.code === '23505') {
        return respond(
          'An active invitation already exists for this email address.',
          409
        );
      }

      return respond(
        'Unable to create staff invitation.',
        500
      );
    }

    // Construct the invitation URL using the configured site.
    const invitationUrl = new URL(
      '/staff/accept-invitation',
      siteOrigin
    );

    invitationUrl.searchParams.set('token', invitationToken);

    const roleName =
      role === 'manager'
        ? 'Publishing Manager'
        : 'Publishing Specialist';

    const safeRoleName = escapeHtml(roleName);
    const safeEmail = escapeHtml(email);
    const safeUrl = escapeHtml(invitationUrl.toString());

    const emailHtml = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
        <body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#172033;">
          <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;">
            <div style="background:#101827;padding:32px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:28px;letter-spacing:1px;">
                LEGAVORA
              </h1>
              <p style="color:#d6b77b;margin:10px 0 0;font-size:13px;">
                International Publishing Platform
              </p>
            </div>

            <div style="padding:36px 30px;">
              <h2 style="margin-top:0;font-size:24px;">
                You're Invited to Join Legavora
              </h2>

              <p style="font-size:15px;line-height:1.8;">
                You have been invited to join the Legavora team as a
                <strong>${safeRoleName}</strong>.
              </p>

              <p style="font-size:15px;line-height:1.8;">
                This invitation was created for
                <strong>${safeEmail}</strong>.
              </p>

              <p style="font-size:15px;line-height:1.8;">
                To begin, please use the secure invitation link below.
              </p>

              <div style="text-align:center;margin:32px 0;">
                <a href="${safeUrl}"
                   style="display:inline-block;background:#b08a45;color:#ffffff;text-decoration:none;padding:15px 28px;border-radius:7px;font-weight:bold;">
                  Accept Your Invitation
                </a>
              </div>

              <p style="font-size:14px;line-height:1.7;">
                This invitation expires seven days after it was issued.
                It can only be accepted once.
              </p>

              <p style="font-size:14px;line-height:1.7;">
                If you were not expecting this invitation,
                you may safely ignore this email.
              </p>

              <p style="margin-top:30px;font-size:14px;">
                Legavora Administration Team
              </p>
            </div>

            <div style="background:#f0f1f3;padding:20px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#64748b;">
                © 2026 Legavora Global Services Ltd.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const emailText = [
      'You are invited to join Legavora.',
      '',
      `Role: ${roleName}`,
      `Invitation email: ${email}`,
      '',
      'Accept your invitation:',
      invitationUrl.toString(),
      '',
      'This invitation expires seven days after it was issued.',
      'If you did not expect this invitation, ignore this email.',
      '',
      'Legavora Administration Team',
    ].join('\n');

    // Send the invitation through Resend.
    let emailId: string | undefined;

    try {
      const { data, error: emailError } =
        await resend.emails.send({
          from: SENDER_EMAIL,
          to: [email],
          subject: 'Your Invitation to Join the Legavora Team',
          html: emailHtml,
          text: emailText,
        });

      if (emailError || !data?.id) {
        console.error(
          'Staff invitation email delivery failed:',
          emailError
        );

        return NextResponse.json(
          {
            success: true,
            emailSent: false,
            invitation,
            message:
              'Invitation record created, but email delivery failed. Contact your administrator.',
          },
          {
            status: 202,
            headers: {
              'Cache-Control': 'no-store',
            },
          }
        );
      }

      emailId = data.id;
    } catch (emailError) {
      console.error(
        'Staff invitation email request failed:',
        emailError
      );

      return NextResponse.json(
        {
          success: true,
          emailSent: false,
          invitation,
          message:
            'Invitation record created, but email delivery could not be confirmed.',
        },
        {
          status: 202,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    // Record successful acceptance by the email provider.
    const { error: updateError } = await db
      .from('staff_invitations')
      .update({
        email_sent_at: new Date().toISOString(),
      })
      .eq('id', invitation.id)
      .eq('status', 'pending');

    if (updateError) {
      console.error(
        'Invitation email timestamp update failed:',
        updateError
      );
    }

    return NextResponse.json(
      {
        success: true,
        invitation,
        emailSent: true,
        emailId,
        message:
          'Staff invitation email submitted successfully. Account activation is not yet enabled.',
      },
      {
        status: 201,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error(
      'Staff invitation endpoint failed:',
      error
    );

    return respond(
      'Unable to process staff invitation.',
      500
    );
  }
}
