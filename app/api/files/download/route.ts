
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
        { error: 'Please sign in to download files.' },
        { status: 401 }
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
      .select('id')
      .eq('id', file.project_id)
      .eq('author_id', user.id)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'You do not have permission to download this file.' },
        { status: 403 }
      );
    }

    if (!file.storage_path.startsWith(`${user.id}/${project.id}/`)) {
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
