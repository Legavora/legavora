
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase';
import { z } from 'zod';

export const runtime = 'nodejs';

const invoiceSchema = z.object({
  author_id: z.string().uuid(),
  project_id: z.string().uuid().nullable(),
  description: z.string().trim().min(3).max(1000),
  amount_cents: z.number().int().positive().safe(),
  currency: z.literal('USD'),
});

export async function POST(request: Request) {
  try {
    const { db, user } = await requireUser();

    // Confirm the signed-in user is authorized staff.
    const { data: staff, error: staffError } = await db
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (
      staffError ||
      !staff ||
      !['admin', 'manager'].includes(staff.role)
    ) {
      return NextResponse.json(
        { error: 'Administrator access required.' },
        { status: 403 }
      );
    }

    const parsed = invoiceSchema.safeParse(
      await request.json()
    );

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid invoice information.' },
        { status: 400 }
      );
    }

    const input = parsed.data;

    // Confirm that the recipient is a registered author.
    const { data: author, error: authorError } = await db
      .from('profiles')
      .select('id,role')
      .eq('id', input.author_id)
      .single();

    if (
      authorError ||
      !author ||
      author.role !== 'author'
    ) {
      return NextResponse.json(
        { error: 'Select a valid registered author.' },
        { status: 400 }
      );
    }

    // Ensure the selected project belongs to this author.
    if (input.project_id) {
      const { data: project, error: projectError } =
        await db
          .from('projects')
          .select('id')
          .eq('id', input.project_id)
          .eq('author_id', input.author_id)
          .single();

      if (projectError || !project) {
        return NextResponse.json(
          {
            error:
              'The selected project does not belong to this author.',
          },
          { status: 400 }
        );
      }
    }

    const { data: invoice, error: insertError } = await db
      .from('invoices')
      .insert({
        author_id: input.author_id,
        project_id: input.project_id,
        description: input.description,
        amount_cents: input.amount_cents,
        currency: 'USD',
        status: 'pending',
      })
      .select('id, status')
      .single();

    if (insertError) {
      console.error('Invoice creation failed:', insertError);

      return NextResponse.json(
        { error: 'Unable to save invoice.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        invoice_id: invoice.id,
        status: invoice.status,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: 'Invoice creation request failed.' },
      { status: 500 }
    );
  }
}
