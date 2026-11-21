
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { requireUser } from '@/lib/supabase';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const SENDER_EMAIL = 'notifications@legavora.com';
const TEAM_EMAIL = 'hello@legavora.com';

const schema = z.object({
  project_id: z.string().uuid(),
  storage_path: z.string().min(1),
  file_name: z.string().min(1).max(255),
  size_bytes: z.number().int().positive().max(MAX_FILE_SIZE),
  proof_label: z.string().trim().min(1).max(255),
});

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(request: Request) {
  try {
    const requestOrigin = new URL(request.url).origin;
    const origin = request.headers.get('origin');

    if (origin && origin !== requestOrigin) {
      return NextResponse.json(
        { error: 'Invalid request origin.' },
        { status: 403 }
      );
    }

    const { db, user } = await requireUser();

    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      !profile ||
      !['admin', 'manager'].includes(profile.role)
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

    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid proof information.' },
        { status: 400 }
      );
    }

    const input = parsed.data;

    const extension = input.file_name
      .split('.')
      .pop()
      ?.toLowerCase();

    if (extension !== 'pdf') {
      return NextResponse.json(
        { error: 'Proof documents must be PDF files.' },
        { status: 400 }
      );
    }

    const expectedPrefix =
      `${user.id}/${input.project_id}/`;

    if (!input.storage_path.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { error: 'Invalid proof storage location.' },
        { status: 400 }
      );
    }

    const storageName = input.storage_path.slice(
      expectedPrefix.length
    );

    const validStorageName =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i;

    if (!validStorageName.test(storageName)) {
      return NextResponse.json(
        { error: 'Invalid proof storage location.' },
        { status: 400 }
      );
    }

    const { data: project, error: projectError } = await db
      .from('projects')
      .select('id,title,author_id')
      .eq('id', input.project_id)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Publishing project not found.' },
        { status: 404 }
      );
    }

    const { data: storageFile, error: storageError } =
      await db.storage
        .from('manuscripts')
        .info(input.storage_path);

    if (storageError || !storageFile) {
      return NextResponse.json(
        { error: 'Uploaded proof could not be verified.' },
        { status: 400 }
      );
    }

    const actualSize = storageFile.metadata?.size;

    if (
      actualSize != null &&
      Number(actualSize) !== input.size_bytes
    ) {
      return NextResponse.json(
        { error: 'Uploaded proof size does not match.' },
        { status: 400 }
      );
    }

    // Avoid registering the same storage object twice.
    const { data: existingFile, error: lookupError } =
      await db
        .from('project_files')
        .select('id')
        .eq('project_id', input.project_id)
        .eq('storage_path', input.storage_path)
        .maybeSingle();

    if (lookupError) {
      return NextResponse.json(
        { error: 'Unable to check existing proof records.' },
        { status: 500 }
      );
    }

    if (existingFile) {
      return NextResponse.json(
        {
          error:
            'This PDF has already been registered. ' +
            'Please check the project proof history ' +
            'before submitting another proof.',
        },
        { status: 409 }
      );
    }

    // Register the proof document.
    const { data: proof, error: fileError } = await db
      .from('project_files')
      .insert({
        project_id: input.project_id,
        uploaded_by: user.id,
        file_name: input.file_name,
        storage_path: input.storage_path,
        size_bytes: input.size_bytes,
        file_category: 'proof',
        version_number: 1,
      })
      .select('id')
      .single();

    if (fileError || !proof) {
      return NextResponse.json(
        {
          error:
            fileError?.message ||
            'Unable to register the proof file.',
        },
        { status: 400 }
      );
    }

    // Create the author's proof approval request.
    const { data: approval, error: approvalError } = await db
      .from('approvals')
      .insert({
        project_id: input.project_id,
        file_id: proof.id,
        label: input.proof_label,
        status: 'pending',
      })
      .select('id')
      .single();

    if (approvalError || !approval) {
      console.error(
        'Proof approval creation failed:',
        approvalError
      );

      return NextResponse.json(
        {
          error:
            'The proof file was registered, but the approval ' +
            'request could not be created. Please contact ' +
            'an administrator before retrying.',
        },
        { status: 500 }
      );
    }

    // The proof and approval request now exist.
    // Email failure must not undo either record.
    let notificationSent = false;

    try {
      const resendKey = process.env.RESEND_API_KEY;
      const serviceKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY;
      const supabaseUrl =
        process.env.NEXT_PUBLIC_SUPABASE_URL;

      if (!resendKey || !serviceKey || !supabaseUrl) {
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
        data: authorResult,
        error: authorError,
      } = await adminDb.auth.admin.getUserById(
        project.author_id
      );

      if (authorError || !authorResult.user?.email) {
        throw new Error(
          'Author notification email unavailable.'
        );
      }

      const recipient = authorResult.user.email;
      const projectTitle =
        project.title || 'Publishing Project';
      const proofTitle = input.proof_label;

      const projectPath =
        `/dashboard/projects/${project.id}#proof-approvals`;

      const reviewUrl = new URL(
        projectPath,
        requestOrigin
      ).toString();

      const resend = new Resend(resendKey);

      const { error: emailError } = await resend.emails.send({
        from:
          `Legavora Notifications <${SENDER_EMAIL}>`,
        to: [recipient],
        replyTo: TEAM_EMAIL,
        subject:
          `Your Book Proof Is Ready for Review: ${projectTitle}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#14263d;">
            <h2 style="color:#14263d;">Legavora</h2>

            <h3>Your Book Proof Is Ready for Review</h3>

            <p>
              A new publishing proof is available
              for your review and approval.
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
              Please sign in to your secure Legavora
              author portal to review the document
              and submit your decision.
            </p>

            <p>
              <a
                href="${escapeHtml(reviewUrl)}"
                style="display:inline-block;background:#14263d;color:#ffffff;padding:12px 20px;text-decoration:none;border-radius:6px;"
              >
                Review Your Proof
              </a>
            </p>

            <p style="font-size:12px;color:#64748b;">
              This is an automated notification from
              Legavora Global Services Ltd.
              Your proof document is available only
              through the secure author portal.
            </p>
          </div>
        `,
        text: [
          'Legavora - Your Book Proof Is Ready for Review',
          '',
          `Book: ${projectTitle}`,
          `Proof: ${proofTitle}`,
          '',
          'Sign in to review your proof:',
          reviewUrl,
        ].join('\n'),
      });

      if (emailError) {
        throw new Error(emailError.message);
      }

      notificationSent = true;
    } catch (notificationError) {
      console.error(
        'Proof-ready email notification failed:',
        notificationError
      );
    }

    return NextResponse.json({
      ok: true,
      file_id: proof.id,
      approval_id: approval.id,
      notificationSent,
      message: notificationSent
        ? 'Proof submitted. Author email notification sent.'
        : 'Proof submitted. Author email notification was not sent.',
    });
  } catch (error) {
    console.error('Proof registration failed:', error);

    return NextResponse.json(
      { error: 'Unable to register proof for review.' },
      { status: 500 }
    );
  }
}
