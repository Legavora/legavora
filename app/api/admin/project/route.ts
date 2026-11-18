
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase';
import { z } from 'zod';

const schema = z.object({
  project_id: z.string().uuid(),
  stage: z.enum([
    'assessment',
    'agreement',
    'editing',
    'cover_design',
    'formatting',
    'proof_approval',
    'distribution',
    'published',
    'completed',
  ]),
  status: z.enum([
    'submitted',
    'in_review',
    'in_progress',
    'awaiting_author',
    'completed',
    'on_hold',
  ]),
});

export async function PATCH(req: Request) {
  try {
    const { db, user } = await requireUser();

    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile ||
        !['admin', 'manager'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const input = schema.parse(await req.json());

    const { data, error } = await db
      .from('projects')
      .update({
        stage: input.stage,
        status: input.status,
      })
      .eq('id', input.project_id)
      .select('id,stage,status')
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        {
          error: 'Project was not updated. Check database permissions.',
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      ok: true,
      project: data,
    });
  } catch (e: unknown) {
    const message = e instanceof Error
      ? e.message
      : 'Request failed';

    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}
