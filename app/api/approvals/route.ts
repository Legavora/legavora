
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const approvalSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(['approved', 'corrections_requested']).default('approved'),
  feedback: z.string().trim().max(5000).optional(),
}).superRefine((value, ctx) => {
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

export async function POST(req: Request) {
  try {
    const { db, user } = await requireUser();

    const input = approvalSchema.parse(await req.json());

    const { data: profile, error: profileError } = await db
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

    const { data: approval, error: lookupError } = await db
      .from('approvals')
      .select('id,project_id,status,projects!inner(author_id)')
      .eq('id', input.id)
      .single();

    if (lookupError || !approval) {
      return NextResponse.json(
        { error: 'Approval request not found.' },
        { status: 404 }
      );
    }

    const project = approval.projects as unknown as {
      author_id: string;
    };

    if (project?.author_id !== user.id) {
      return NextResponse.json(
        { error: 'You cannot respond to this request.' },
        { status: 403 }
      );
    }

    if (approval.status !== 'pending') {
      return NextResponse.json(
        { error: 'This approval request has already been answered.' },
        { status: 409 }
      );
    }

    const respondedAt = new Date().toISOString();

    const updates =
      input.decision === 'approved'
        ? {
            status: 'approved',
            approved_by: user.id,
            approved_at: respondedAt,
            responded_at: respondedAt,
            author_feedback: input.feedback || null,
          }
        : {
            status: 'corrections_requested',
            approved_by: null,
            approved_at: null,
            responded_at: respondedAt,
            author_feedback: input.feedback!,
          };

    const { data: updated, error: updateError } = await db
      .from('approvals')
      .update(updates)
      .eq('id', input.id)
      .eq('status', 'pending')
      .select('id,status')
      .maybeSingle();

    if (updateError) {
      console.error('Proof approval update failed:', updateError.message);

      return NextResponse.json(
        { error: 'Unable to save your proof decision.' },
        { status: 500 }
      );
    }

    if (!updated) {
      return NextResponse.json(
        { error: 'This request is no longer pending.' },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      status: updated.status,
      message:
        input.decision === 'approved'
          ? 'Proof approved successfully.'
          : 'Correction request submitted successfully.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid approval request.',
          details: error.flatten(),
        },
        { status: 400 }
      );
    }

    console.error('Proof approval request failed:', error);

    return NextResponse.json(
      { error: 'Unable to process the proof decision.' },
      { status: 500 }
    );
  }
}
