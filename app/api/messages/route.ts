import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { serverDb } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_MESSAGE_LENGTH = 10000;
const TEAM_EMAIL = 'hello@legavora.com';
const SENDER_EMAIL = 'notifications@legavora.com';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(request: NextRequest) {
  try {
    // Reject cross-origin browser requests.
    const origin = request.headers.get('origin');
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
    }

    const db = await serverDb();
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in to send a message.' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid message information.' }, { status: 400 });
    }

    const input = body as Record<string, unknown>;
    const projectId = input.projectId;
    const rawMessage = input.message;
    if (typeof projectId !== 'string' || !UUID_PATTERN.test(projectId) || typeof rawMessage !== 'string') {
      return NextResponse.json({ error: 'Valid project and message are required.' }, { status: 400 });
    }

    const message = rawMessage.trim();
    if (message.length === 0 || message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: 'Message must contain 1 to 10,000 characters.' }, { status: 400 });
    }

    // Check the authenticated user's role.
    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('role,full_name')
      .eq('id', user.id)
      .single();
    if (profileError || !profile) {
      return NextResponse.json({ error: 'Unable to verify your account.' }, { status: 403 });
    }

    const role = profile.role;
    const isStaff = role === 'admin' || role === 'manager';
    if (role !== 'author' && !isStaff) {
      return NextResponse.json({ error: 'Messaging access denied.' }, { status: 403 });
    }

    // Check that the project is accessible.
    const { data: project, error: projectError } = await db
      .from('projects')
      .select('id,title,author_id')
      .eq('id', projectId)
      .single();
    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found or access denied.' }, { status: 404 });
    }
    if (!isStaff && project.author_id !== user.id) {
      return NextResponse.json({ error: 'You cannot message this project.' }, { status: 403 });
    }

    // Save with the user's authenticated Supabase client, preserving RLS.
    const { data: savedMessage, error: saveError } = await db
      .from('project_messages')
      .insert({ project_id: project.id, sender_id: user.id, message })
      .select('id,created_at')
      .single();
    if (saveError || !savedMessage) {
      console.error('Project message save failed:', saveError);
      return NextResponse.json({ error: 'Unable to save your message.' }, { status: 500 });
    }

    // Email failure does not undo or duplicate the saved message.
    let notificationSent = false;
    try {
      const resendKey = process.env.RESEND_API_KEY;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!resendKey) throw new Error('RESEND_API_KEY is missing.');

      let recipient = TEAM_EMAIL;
      if (isStaff) {
        if (!serviceKey || !supabaseUrl) {
          throw new Error('Supabase server credentials are missing.');
        }
        const adminDb = createClient(supabaseUrl, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data: authorResult, error: authorError } = await adminDb.auth.admin.getUserById(project.author_id);
        if (authorError || !authorResult.user?.email) {
          throw new Error('Author notification email unavailable.');
        }
        recipient = authorResult.user.email;
      }

      const projectTitle = project.title || 'Publishing Project';
      const dashboardPath = isStaff
        ? `/dashboard/projects/${project.id}#project-messages`
        : `/admin/projects/${project.id}`;
      // Use the current deployment origin; preserve the hash for direct messaging navigation.
      const dashboardUrl = new URL(dashboardPath, request.nextUrl.origin).toString();
      const subject = isStaff
        ? `New message from Legavora: ${projectTitle}`
        : `New author message: ${projectTitle}`;
      const senderName = isStaff
        ? 'Legavora Publishing Team'
        : profile.full_name?.trim() || 'An author';

      const resend = new Resend(resendKey);
      const { error: emailError } = await resend.emails.send({
        from: `Legavora Notifications <${SENDER_EMAIL}>`,
        to: [recipient],
        replyTo: TEAM_EMAIL,
        subject,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#14263d;">
            <h2 style="color:#14263d;">Legavora</h2>
            <p>You have received a new project message.</p>
            <p><strong>Project:</strong> ${escapeHtml(projectTitle)}</p>
            <p><strong>From:</strong> ${escapeHtml(senderName)}</p>
            <p>Sign in to your secure Legavora dashboard to read and respond.</p>
            <p>
              <a href="${escapeHtml(dashboardUrl)}"
                 style="display:inline-block;background:#14263d;color:#ffffff;padding:12px 20px;text-decoration:none;border-radius:6px;">
                View Project Message
              </a>
            </p>
            <p style="font-size:12px;color:#64748b;">
              This is an automated notification from Legavora Global Services Ltd.
              Please do not share confidential information by email.
            </p>
          </div>
        `,
        text: [
          'Legavora - New Project Message',
          '',
          `Project: ${projectTitle}`,
          `From: ${senderName}`,
          '',
          'Sign in to your secure dashboard to read and respond:',
          dashboardUrl,
        ].join('\n'),
      });
      if (emailError) throw new Error(emailError.message);
      notificationSent = true;
    } catch (notificationError) {
      console.error('Project email notification failed:', notificationError);
    }

    return NextResponse.json({
      success: true,
      messageId: savedMessage.id,
      notificationSent,
    }, { status: 201 });
  } catch (error) {
    console.error('Project messaging endpoint failed:', error);
    return NextResponse.json({ error: 'Unable to process your message.' }, { status: 500 });
  }
}
