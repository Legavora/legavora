
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase';
import { z } from 'zod';

const reviewSchema = z.object({
  project_id: z.string().uuid(),
  file_id: z.string().uuid(),

  decision: z.enum([
    'approved',
    'revision_requested',
    'rejected',
  ]),

  review_notes: z
    .string()
    .trim()
    .min(1, 'Editorial feedback is required.')
    .max(10000, 'Editorial feedback is too long.'),
});

export async function POST(request: Request) {
  try {
    const { db, user } = await requireUser();

    // Verify administrator permissions.
    const { data: profile, error: profileError } =
      await db
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

    // Validate the submitted review.
    const parsed = reviewSchema.safeParse(
      await request.json()
    );

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid manuscript review information.' },
        { status: 400 }
      );
    }

    const input = parsed.data;

    // Confirm the publishing project exists.
    const { data: project, error: projectError } =
      await db
        .from('projects')
        .select('id')
        .eq('id', input.project_id)
        .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Publishing project not found.' },
        { status: 404 }
      );
    }

    // Confirm the document belongs to this project.
    const { data: file, error: fileError } =
      await db
        .from('project_files')
        .select('id,project_id')
        .eq('id', input.file_id)
        .eq('project_id', input.project_id)
        .single();

    if (fileError || !file) {
      return NextResponse.json(
        { error: 'Project document not found.' },
        { status: 404 }
      );
    }

    // Record the review using the authenticated
    // administrator's identity.
    const { data: review, error: insertError } =
      await db
        .from('manuscript_reviews')
        .insert({
          project_id: input.project_id,
          file_id: input.file_id,
          reviewer_id: user.id,
          decision: input.decision,
          review_notes: input.review_notes,
        })
        .select('id,decision,created_at')
        .single();

    if (insertError || !review) {
      return NextResponse.json(
        {
          error:
            insertError?.message ||
            'Unable to save manuscript review.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        review_id: review.id,
        decision: review.decision,
        created_at: review.created_at,
        message: 'Editorial review saved successfully.',
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to process manuscript review.',
      },
      { status: 500 }
    );
  }
}
