
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const schema = z.object({
  project_id: z.string().uuid(),
  storage_path: z.string().min(1),
  file_name: z.string().min(1).max(255),
  size_bytes: z.number().int().positive().max(MAX_FILE_SIZE),
  proof_label: z.string().trim().min(1).max(255),
});

export async function POST(request: Request) {
  try {
    const { db, user } = await requireUser();

    // Verify administrator permissions.
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

    const parsed = schema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid proof information.' },
        { status: 400 }
      );
    }

    const input = parsed.data;

    // Only PDF proof documents are permitted.
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

    // Validate the administrator's private storage directory.
    const expectedPrefix = `${user.id}/${input.project_id}/`;

    if (!input.storage_path.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { error: 'Invalid proof storage location.' },
        { status: 400 }
      );
    }

    const storageName = input.storage_path.slice(
      expectedPrefix.length
    );

    // UUID filenames have five groups: 8-4-4-4-12.
    const validStorageName =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i;

    if (!validStorageName.test(storageName)) {
      return NextResponse.json(
        { error: 'Invalid proof storage location.' },
        { status: 400 }
      );
    }

    // Confirm the publishing project exists.
    const { data: project, error: projectError } = await db
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

    // Verify the uploaded proof exists in private storage.
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

    return NextResponse.json({
      ok: true,
      file_id: proof.id,
      approval_id: approval.id,
      message: 'Proof submitted for author review.',
    });
  } catch (error) {
    console.error('Proof registration failed:', error);

    return NextResponse.json(
      { error: 'Unable to register proof for review.' },
      { status: 500 }
    );
  }
}
