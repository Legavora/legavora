
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase';
import { z } from 'zod';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const schema = z.object({
  project_id: z.string().uuid(),
  previous_file_id: z.string().uuid(),
  storage_path: z.string().min(1),
  file_name: z.string().min(1).max(255),
  size_bytes: z.number().int().positive().max(MAX_FILE_SIZE),
  revision_notes: z.string().trim().min(1).max(5000),
});

const allowedExtensions = new Set([
  'pdf',
  'docx',
  'epub',
  'jpg',
  'jpeg',
  'png',
]);

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
        { error: 'Invalid revision information.' },
        { status: 400 }
      );
    }

    const input = parsed.data;

    const extension = input.file_name
      .split('.')
      .pop()
      ?.toLowerCase();

    if (!extension || !allowedExtensions.has(extension)) {
      return NextResponse.json(
        { error: 'Unsupported file format.' },
        { status: 400 }
      );
    }

    // Validate the administrator's storage directory.
    const expectedPrefix = `${user.id}/${input.project_id}/`;

    const storageFileName = input.storage_path.slice(
      expectedPrefix.length
    );

    const expectedStorageName = new RegExp(
      `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.${extension}$`,
      'i'
    );

    if (
      !input.storage_path.startsWith(expectedPrefix) ||
      !expectedStorageName.test(storageFileName)
    ) {
      return NextResponse.json(
        { error: 'Invalid storage location.' },
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

    // Confirm the original file belongs to this project.
    const { data: previous, error: previousError } = await db
      .from('project_files')
      .select('id, project_id, version_number')
      .eq('id', input.previous_file_id)
      .eq('project_id', input.project_id)
      .single();

    if (previousError || !previous) {
      return NextResponse.json(
        { error: 'Original file not found.' },
        { status: 404 }
      );
    }

    // Verify the uploaded object through Storage.
    // Do not register a revision if the file is missing.
    const { data: storageFile, error: storageError } =
      await db.storage
        .from('manuscripts')
        .info(input.storage_path);

    if (storageError || !storageFile) {
      return NextResponse.json(
        {
          error:
            'Storage verification failed: ' +
            (storageError?.message || 'File not found.'),
        },
        { status: 400 }
      );
    }

    // Check the file size when Storage provides it.
    const actualSize = storageFile.metadata?.size;

    if (
      actualSize != null &&
      Number(actualSize) !== input.size_bytes
    ) {
      return NextResponse.json(
        { error: 'Uploaded file size does not match.' },
        { status: 400 }
      );
    }

    // Calculate the next revision number.
    const nextVersion =
      (previous.version_number ?? 1) + 1;

    // Save the revision without deleting the original.
    const { data: revision, error: insertError } = await db
      .from('project_files')
      .insert({
        project_id: input.project_id,
        uploaded_by: user.id,
        file_name: input.file_name,
        storage_path: input.storage_path,
        size_bytes: input.size_bytes,
        previous_file_id: previous.id,
        version_number: nextVersion,
        revision_notes: input.revision_notes,
        revised_at: new Date().toISOString(),
      })
      .select('id, version_number')
      .single();

    if (insertError || !revision) {
      return NextResponse.json(
        {
          error:
            insertError?.message ||
            'Unable to record revised file.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      file_id: revision.id,
      version_number: revision.version_number,
      message: 'Revised file registered successfully.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to register revised file.',
      },
      { status: 500 }
    );
  }
}
