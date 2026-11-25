
import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/supabase';
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
    const { db, user } = await currentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 }
      );
    }

    // Only administrators and managers can issue
    // official editorial decisions.
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
        { error: 'Management access required.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = reviewSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid manuscript review information.' },
        { status: 400 }
      );
    }

    const input = parsed.data;

    // Verify the publishing project.
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

    // Verify that the document belongs to this
    // project and is a manuscript.
    const { data: file, error: fileError } =
      await db
        .from('project_files')
        .select('id,project_id,file_category')
        .eq('id', input.file_id)
        .eq('project_id', input.project_id)
        .single();

    if (fileError || !file) {
      return NextResponse.json(
        { error: 'Project document not found.' },
        { status: 404 }
      );
    }

    if (file.file_category !== 'manuscript') {
      return NextResponse.json(
        {
          error:
            'Editorial decisions can only be issued for manuscript files.',
        },
        { status: 400 }
      );
    }

    // Create a separate official editorial decision.
    // Existing internal specialist reviews remain private
    // and are never modified or automatically published.
    const { data: review, error: insertError } =
      await db
        .from('manuscript_reviews')
        .insert({
          project_id: input.project_id,
          file_id: input.file_id,
          reviewer_id: user.id,
          decision: input.decision,
          review_notes: input.review_notes,
          visibility: 'author_visible',
        })
        .select('id,decision,visibility,created_at')
        .single();

    if (insertError || !review) {
      console.error(
        'Official editorial review insert failed:',
        insertError
      );

      return NextResponse.json(
        {
          error: 'Unable to save official editorial decision.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        review_id: review.id,
        decision: review.decision,
        visibility: review.visibility,
        created_at: review.created_at,
        message:
          'Official editorial decision published successfully.',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      'Management editorial review error:',
      error
    );

    return NextResponse.json(
      {
        error: 'Unable to process manuscript review.',
      },
      { status: 500 }
    );
  }
}
