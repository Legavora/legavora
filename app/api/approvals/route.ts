
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const approvalSchema = z
  .object({
    id: z.string().uuid(),
    decision: z
      .enum(['approved', 'corrections_requested'])
      .default('approved'),
    feedback: z
      .string()
      .trim()
      .max(5000)
      .optional(),
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

    const { error } = await db.rpc('respond_to_proof', {
      p_approval_id: input.id,
      p_decision: input.decision,
      p_feedback: input.feedback || '',
    });

    if (error) {
      console.error(
        'Proof response failed:',
        error.message
      );

      return NextResponse.json(
        {
          error:
            'Unable to save your proof decision. Please verify that the request is still pending.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      status: input.decision,
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
