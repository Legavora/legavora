
import { NextRequest, NextResponse } from 'next/server';
import { serverDb } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const db = await serverDb();

    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in.' },
        { status: 401 }
      );
    }

    // Only Legavora staff may download project files.
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

    const fileId = request.nextUrl.searchParams.get('id');

    if (!fileId) {
      return NextResponse.json(
        { error: 'File ID is required.' },
        { status: 400 }
      );
    }

    const { data: file, error: fileError } = await db
      .from('project_files')
      .select('id, project_id, storage_path')
      .eq('id', fileId)
      .single();

    if (fileError || !file) {
      return NextResponse.json(
        { error: 'File not found.' },
        { status: 404 }
      );
    }

    const { data: project, error: projectError } = await db
      .from('projects')
      .select('id, author_id')
      .eq('id', file.project_id)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found.' },
        { status: 404 }
      );
    }

    // Files may be uploaded by authors or Legavora staff.
    const pathParts = file.storage_path.split('/');

    if (
      pathParts.length !== 3 ||
      pathParts[1] !== project.id ||
      ![project.author_id, user.id].includes(pathParts[0])
    ) {
      return NextResponse.json(
        { error: 'Invalid file location.' },
        { status: 403 }
      );
    }

    const { data, error } = await db.storage
      .from('manuscripts')
      .createSignedUrl(file.storage_path, 60);

    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { error: 'Unable to generate download link.' },
        { status: 500 }
      );
    }

    return NextResponse.redirect(data.signedUrl, 302);
  } catch {
    return NextResponse.json(
      { error: 'Download request failed.' },
      { status: 500 }
    );
  }
}
