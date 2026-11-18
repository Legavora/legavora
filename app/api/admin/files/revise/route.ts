
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase';
import { z } from 'zod';

const schema = z.object({
  project_id: z.string().uuid(),
  previous_file_id: z.string().uuid(),
  storage_path: z.string().min(1),
  file_name: z.string().min(1).max(255),
  size_bytes: z.number().int().positive().max(50 * 1024 * 1024),
  revision_notes: z.string().trim().min(1).max(5000),
});

const allowedExtensions = new Set([
  'pdf', 'docx', 'epub', 'jpg', 'jpeg', 'png',
]);

export async function POST(request: Request) {
  try {
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

    const expectedPrefix = `${user.id}/${input.project_id}/`;

    if (
      !input.storage_path.startsWith(expectedPrefix) ||
      !input.storage_path.endsWith(`.${extension}`) ||
      input.storage_path.slice(expectedPrefix.length).includes('/')
    ) {
      return NextResponse.json(
        { error: 'Invalid storage location.' },
        { status: 400 }
      );
    }

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

    const { data: storageFile, error: storageError } =
      await db.storage
        .from('manuscripts')
        .info(input.storage_path);

    if (
      storageError ||
      !storageFile ||
      Number(storageFile.metadata?.size) !== input.size_bytes
    ) {
      return NextResponse.json(
        { error: 'Uploaded file could not be verified.' },
        { status: 400 }
      );
    }

    const nextVersion = (previous.version_number ?? 1) + 1;

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
        { error: insertError?.message || 'Unable to record revision.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      file_id: revision.id,
      version_number: revision.version_number,
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
