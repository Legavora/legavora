
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { requireUser } from '@/lib/supabase';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TEAM_EMAIL = 'hello@legavora.com';
const SENDER_EMAIL = 'notifications@legavora.com';

const approvalSchema = z
  .object({
    id: z.string().uuid(),
    decision: z.enum([
      'approved',
      'corrections_requested',
    ]),
    feedback: z.string().trim().max(5000).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.decision === 'corrections_requested' &&
      !value.feedback
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['feedback'],
        message: 'Please explain the corrections required.',
      });
    }
  });

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(req: Request) {
  try {
    const requestOrigin = new URL(req.url).origin;
    const origin = req.headers.get('origin');

    if (origin && origin !== requestOrigin) {
      return NextResponse.json(
        { error: 'Invalid request origin.' },
        { status: 403 }
      );
    }

    const { db, user } = await requireUser();

    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body.' },
        { status: 400 }
      );
    }

    const parsed = approvalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid approval request.',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const input = parsed.data;

    const { data: profile, error: profileError } =
      await db
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profileError || profile?.role !== 'author') {
      return NextResponse.json(
        { error: 'Author access required.' },
        { status: 403 }
      );
    }

    const { error: decisionError } = await db.rpc(
      'respond_to_proof',
      {
        p_approval_id: input.id,
        p_decision: input.decision,
        p_feedback: input.feedback || '',
      }
    );

    if (decisionError) {
      console.error(
        'Proof response failed:',
        decisionError.message
      );

      return NextResponse.json(
        {
          error:
            'Unable to save your proof decision. ' +
            'Please verify that the request is still pending.',
        },
        { status: 400 }
      );
    }

    let notificationSent = false;

    try {
      const resendKey = process.env.RESEND_API_KEY;
      const serviceKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY;
      const supabaseUrl =
        process.env.NEXT_PUBLIC_SUPABASE_URL;

      if (!resendKey || !serviceKey || !supabaseUrl) {
        console.error(
          'Proof notification configuration:',
          {
            hasResendKey: Boolean(resendKey),
            hasServiceKey: Boolean(serviceKey),
            hasSupabaseUrl: Boolean(supabaseUrl),
          }
        );

        throw new Error(
          'Notification service configuration is missing.'
        );
      }

      const adminDb = createClient(
        supabaseUrl,
        serviceKey,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }
      );

      const {
        data: approval,
        error: approvalError,
      } = await adminDb
        .from('approvals')
        .select(
          'id,project_id,label,status,author_feedback'
        )
        .eq('id', input.id)
        .single();

      if (approvalError || !approval) {
        console.error(
          'Proof notification approval lookup failed:',
          {
            code: approvalError?.code,
            message: approvalError?.message,
            details: approvalError?.details,
            hint: approvalError?.hint,
            recordFound: Boolean(approval),
          }
        );

        throw new Error(
          'Saved approval details could not be retrieved.'
        );
      }

      if (approval.status !== input.decision) {
        throw new Error(
          'Saved approval status does not match the decision.'
        );
      }

      const {
        data: project,
        error: projectError,
      } = await adminDb
        .from('projects')
        .select('id,title,author_id')
        .eq('id', approval.project_id)
        .single();

      if (
        projectError ||
        !project ||
        project.author_id !== user.id
      ) {
        console.error(
          'Proof notification project lookup failed:',
          {
            code: projectError?.code,
            message: projectError?.message,
            details: projectError?.details,
            hint: projectError?.hint,
            recordFound: Boolean(project),
          }
        );

        throw new Error(
          'Project details could not be verified.'
        );
      }

      const projectTitle =
        project.title || 'Publishing Project';

      const proofTitle =
        approval.label || 'Book Proof';

      const isApproved =
        input.decision === 'approved';

      const decisionTitle = isApproved
        ? 'Proof Approved'
        : 'Corrections Requested';

      const subject = isApproved
        ? `Author Approved Proof: ${projectTitle}`
        : `Author Requested Corrections: ${projectTitle}`;

      const feedback =
        approval.author_feedback || '';

      const dashboardUrl = new URL(
        `/admin/projects/${project.id}#author-proof-decisions`,
        requestOrigin
      ).toString();

      const feedbackHtml =
        !isApproved && feedback
          ? `
            <p><strong>Author Feedback:</strong></p>
            <div style="background:#f4f6f8;padding:16px;border-radius:6px;white-space:pre-wrap;overflow-wrap:anywhere;">
              ${escapeHtml(feedback)}
            </div>
          `
          : '';

      const resend = new Resend(resendKey);

      const { error: emailError } =
        await resend.emails.send({
          from:
            `Legavora Notifications <${SENDER_EMAIL}>`,
          to: [TEAM_EMAIL],
          replyTo: TEAM_EMAIL,
          subject,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#14263d;">
              <h2 style="color:#14263d;">Legavora</h2>
              <h3>${escapeHtml(decisionTitle)}</h3>

              <p>
                An author has submitted a decision
                on a publishing proof.
              </p>

              <p>
                <strong>Book:</strong>
                ${escapeHtml(projectTitle)}
              </p>

              <p>
                <strong>Proof:</strong>
                ${escapeHtml(proofTitle)}
              </p>

              <p>
                <strong>Decision:</strong>
                ${escapeHtml(decisionTitle)}
              </p>

              ${feedbackHtml}

              <p>
                Sign in to the secure administrator
                portal to review the decision.
              </p>

              <p>
                <a
                  href="${escapeHtml(dashboardUrl)}"
                  style="display:inline-block;background:#14263d;color:#ffffff;padding:12px 20px;text-decoration:none;border-radius:6px;"
                >
                  View Author Decision
                </a>
              </p>

              <p style="font-size:12px;color:#64748b;">
                Automated notification from
                Legavora Global Services Ltd.
              </p>
            </div>
          `,
          text: [
            'Legavora - Author Proof Decision',
            '',
            `Book: ${projectTitle}`,
            `Proof: ${proofTitle}`,
            `Decision: ${decisionTitle}`,
            ...(!isApproved && feedback
              ? ['', 'Author Feedback:', feedback]
              : []),
            '',
            'Review the decision:',
            dashboardUrl,
          ].join('\n'),
        });

      if (emailError) {
        console.error(
          'Proof notification Resend failure:',
          emailError.message
        );

        throw new Error(emailError.message);
      }

      notificationSent = true;
    } catch (notificationError) {
      console.error(
        'Proof decision notification failed:',
        notificationError
      );
    }

    return NextResponse.json({
      ok: true,
      status: input.decision,
      notificationSent,
      message:
        input.decision === 'approved'
          ? 'Proof approved successfully.'
          : 'Correction request submitted successfully.',
    });
  } catch (error) {
    console.error(
      'Proof approval request failed:',
      error
    );

    return NextResponse.json(
      {
        error: 'Unable to process the proof decision.',
      },
      { status: 500 }
    );
  }
}
