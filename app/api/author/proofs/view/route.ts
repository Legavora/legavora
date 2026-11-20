
import { NextRequest, NextResponse } from 'next/server';
import { serverDb } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const db = await serverDb();

    // Verify the signed-in user.
    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to view this proof.' },
        { status: 401 }
      );
    }

    // Only authors can access this endpoint.
    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      !profile ||
      profile.role !== 'author'
    ) {
      return NextResponse.json(
        { error: 'Author access required.' },
        { status: 403 }
      );
    }

    // Validate the requested approval ID.
    const approvalId = request.nextUrl.searchParams.get('id');

    if (
      !approvalId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        approvalId
      )
    ) {
      return NextResponse.json(
        { error: 'A valid proof approval ID is required.' },
        { status: 400 }
      );
    }

    // Find the approval request.
    const { data: approval, error: approvalError } = await db
      .from('approvals')
      .select('id,project_id,file_id')
      .eq('id', approvalId)
      .single();

    if (approvalError || !approval || !approval.file_id) {
      return NextResponse.json(
        { error: 'Proof approval request not found.' },
        { status: 404 }
      );
    }

    // Confirm that the project belongs to this author.
    const { data: project, error: projectError } = await db
      .from('projects')
      .select('id,author_id')
      .eq('id', approval.project_id)
      .eq('author_id', user.id)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'You do not have access to this proof.' },
        { status: 403 }
      );
    }

    // Confirm that the approval refers to a proof in this project.
    const { data: file, error: fileError } = await db
      .from('project_files')
      .select('id,project_id,storage_path,file_category,file_name')
      .eq('id', approval.file_id)
      .eq('project_id', project.id)
      .eq('file_category', 'proof')
      .single();

    if (fileError || !file) {
      return NextResponse.json(
        { error: 'The proof document could not be found.' },
        { status: 404 }
      );
    }

    // Check that the storage location follows the project path.
    const pathParts = file.storage_path.split('/');

    if (
      pathParts.length !== 3 ||
      pathParts[1] !== project.id ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i.test(
        pathParts[2]
      )
    ) {
      return NextResponse.json(
        { error: 'Invalid proof storage location.' },
        { status: 403 }
      );
    }

    // Generate a temporary private file access URL.
    const { data: signedFile, error: signedError } =
      await db.storage
        .from('manuscripts')
        .createSignedUrl(file.storage_path, 60, {
          download: false,
        });

    if (signedError || !signedFile?.signedUrl) {
      return NextResponse.json(
        { error: 'Unable to open the proof document.' },
        { status: 500 }
      );
    }

    return NextResponse.redirect(
      signedFile.signedUrl,
      302
    );
  } catch (error) {
    console.error('Author proof viewing failed:', error);

    return NextResponse.json(
      { error: 'Unable to view proof at this time.' },
      { status: 500 }
    );
  }
}
