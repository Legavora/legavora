import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { currentUser } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function failure(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        'Cache-Control': 'private, no-store',
      },
    }
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'long',
    timeStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ) {
      return failure('Invalid agreement version.', 400);
    }

    const { db, user } = await currentUser();

    if (!user) {
      return failure('Authentication required.', 401);
    }

    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return failure('Access denied.', 403);
    }

    const isManagement =
      profile.role === 'admin' ||
      profile.role === 'manager';

    const { data: version, error: versionError } = await db
      .from('contract_versions')
      .select(
        'id, contract_id, version_number, status, issued_at, document_sha256'
      )
      .eq('id', id)
      .maybeSingle();

    if (versionError || !version) {
      return failure('Agreement not available.', 404);
    }

    const { data: contract, error: contractError } = await db
      .from('contracts')
      .select('id, project_id, author_id, title, contract_type')
      .eq('id', version.contract_id)
      .maybeSingle();

    if (contractError || !contract) {
      return failure('Agreement not available.', 404);
    }

    if (
      !isManagement &&
      (
        profile.role !== 'author' ||
        contract.author_id !== user.id
      )
    ) {
      return failure('Agreement not available.', 404);
    }

    if (
      version.status !== 'accepted' ||
      !version.issued_at
    ) {
      return failure(
        'An acceptance certificate is not available for this version.',
        409
      );
    }

    const { data: response, error: responseError } = await db
      .from('contract_responses')
      .select(
        'id, author_id, decision, full_name, acceptance_statement, document_sha256, responded_at'
      )
      .eq('contract_version_id', version.id)
      .maybeSingle();

    if (responseError || !response) {
      return failure('Acceptance record not available.', 404);
    }

    if (
      response.decision !== 'accepted' ||
      response.author_id !== contract.author_id ||
      !response.acceptance_statement?.trim() ||
      !response.responded_at ||
      response.document_sha256 !== version.document_sha256
    ) {
      return failure(
        'Agreement acceptance verification failed.',
        409
      );
    }

    const certificateReference =
      `LGV-CERT-${response.id.toUpperCase()}`;

    const pdf = await PDFDocument.create();

    pdf.setTitle('Legavora Agreement Acceptance Certificate');
    pdf.setAuthor('Legavora Global Services Ltd');
    pdf.setSubject('Recorded electronic agreement acceptance');
    pdf.setCreator('Legavora Publishing Platform');

    const regular = await pdf.embedFont(
      StandardFonts.Helvetica
    );

    const bold = await pdf.embedFont(
      StandardFonts.HelveticaBold
    );

    const mono = await pdf.embedFont(
      StandardFonts.Courier
    );

    const navy = rgb(0.06, 0.12, 0.21);
    const gold = rgb(0.67, 0.48, 0.23);
    const slate = rgb(0.29, 0.35, 0.43);
    const green = rgb(0.08, 0.40, 0.25);
    const pale = rgb(0.95, 0.97, 0.98);
    const white = rgb(1, 1, 1);

    const width = 595.28;
    const height = 841.89;
    const margin = 46;
    const contentWidth = width - margin * 2;

    // Standard PDF fonts have limited character coverage.
    // Reject unsupported text rather than silently changing
    // the author's recorded name or agreement statement.
    function verifyText(value: string) {
      regular.encodeText(value.replace(/[\r\n\t]/g, ' '));
    }

    try {
      verifyText(contract.title);
      verifyText(response.full_name);
      verifyText(response.acceptance_statement);
    } catch {
      return failure(
        'This certificate requires an extended Unicode font.',
        422
      );
    }

    let page = pdf.addPage([width, height]);
    let y = height - 150;

    function decoratePage(continuation = false) {
      page.drawRectangle({
        x: 0,
        y: height - 112,
        width,
        height: 112,
        color: navy,
      });

      page.drawRectangle({
        x: 0,
        y: height - 116,
        width,
        height: 4,
        color: gold,
      });

      page.drawText('LEGAVORA', {
        x: margin,
        y: height - 44,
        size: 27,
        font: bold,
        color: white,
      });

      page.drawText('GLOBAL SERVICES LTD', {
        x: margin,
        y: height - 65,
        size: 10,
        font: bold,
        color: white,
      });

      page.drawText(
        continuation
          ? 'AGREEMENT ACCEPTANCE RECORD - CONTINUED'
          : 'PUBLISHING, MARKETING & AUTHOR GROWTH',
        {
          x: margin,
          y: height - 87,
          size: 8,
          font: regular,
          color: white,
        }
      );
    }

    decoratePage();

    function ensureSpace(required: number) {
      if (y - required >= 90) return;

      page = pdf.addPage([width, height]);
      decoratePage(true);
      y = height - 150;
    }

    function wrapText(
      value: string,
      size: number,
      maxWidth: number
    ) {
      const words = value.trim().split(/\s+/);
      const lines: string[] = [];
      let line = '';

      for (const word of words) {
        const candidate = line
          ? `${line} ${word}`
          : word;

        if (
          regular.widthOfTextAtSize(candidate, size)
          <= maxWidth
        ) {
          line = candidate;
          continue;
        }

        if (line) {
          lines.push(line);
          line = '';
        }

        for (const character of word) {
          if (
            regular.widthOfTextAtSize(
              line + character,
              size
            ) > maxWidth
          ) {
            lines.push(line);
            line = character;
          } else {
            line += character;
          }
        }
      }

      if (line) lines.push(line);

      return lines;
    }

    function paragraph(
      value: string,
      size = 10,
      color = slate
    ) {
      const lines = wrapText(
        value,
        size,
        contentWidth
      );

      for (const line of lines) {
        ensureSpace(size + 8);

        page.drawText(line, {
          x: margin,
          y,
          size,
          font: regular,
          color,
        });

        y -= size + 5;
      }

      y -= 6;
    }

    function field(label: string, value: string) {
      ensureSpace(48);

      page.drawText(label.toUpperCase(), {
        x: margin,
        y,
        size: 8,
        font: bold,
        color: slate,
      });

      y -= 17;

      paragraph(value, 11, navy);
      y -= 7;
    }

    function section(title: string) {
      ensureSpace(50);

      page.drawRectangle({
        x: margin,
        y: y - 9,
        width: contentWidth,
        height: 25,
        color: pale,
      });

      page.drawText(title, {
        x: margin + 10,
        y,
        size: 11,
        font: bold,
        color: navy,
      });

      y -= 30;
    }

    page.drawText('Agreement Acceptance', {
      x: margin,
      y,
      size: 25,
      font: bold,
      color: navy,
    });

    y -= 29;

    page.drawText('Certificate', {
      x: margin,
      y,
      size: 25,
      font: bold,
      color: navy,
    });

    y -= 30;

    paragraph(
      'This certificate documents an electronic agreement acceptance recorded through the Legavora Publishing Platform.'
    );

    y -= 8;

    page.drawRectangle({
      x: margin,
      y: y - 12,
      width: contentWidth,
      height: 29,
      color: rgb(0.91, 0.97, 0.93),
    });

    page.drawText('STATUS: ACCEPTED', {
      x: margin + 12,
      y,
      size: 11,
      font: bold,
      color: green,
    });

    y -= 35;

    field('Certificate reference', certificateReference);
    field('Agreement title', contract.title);

    field(
      'Agreement version',
      `Version ${version.version_number}`
    );

    field('Accepted by', response.full_name);

    field(
      'Agreement issued',
      formatDate(version.issued_at)
    );

    field(
      'Electronic acceptance recorded',
      formatDate(response.responded_at)
    );

    section('Electronic Acceptance Statement');

    paragraph(
      response.acceptance_statement,
      10,
      navy
    );

    section('Document Integrity Record');

    paragraph(
      'The SHA-256 fingerprint stored with the acceptance record matches the fingerprint recorded for this agreement version.'
    );

    ensureSpace(45);

    page.drawText('SHA-256 DOCUMENT FINGERPRINT', {
      x: margin,
      y,
      size: 8,
      font: bold,
      color: slate,
    });

    y -= 18;

    page.drawText(version.document_sha256, {
      x: margin,
      y,
      size: 9,
      font: mono,
      color: navy,
    });

    y -= 28;

    field('Agreement version ID', version.id);
    field('Acceptance record ID', response.id);

    section('Certificate Notice');

    paragraph(
      'This certificate is a record of electronic acceptance. It does not replace the original agreement, constitute independent identity verification, or independently establish legal enforceability.',
      9
    );

    paragraph(
      'Retain this certificate together with the corresponding agreement document.',
      9
    );

    const pages = pdf.getPages();

    pages.forEach((pdfPage, index) => {
      pdfPage.drawLine({
        start: { x: margin, y: 70 },
        end: { x: width - margin, y: 70 },
        thickness: 0.7,
        color: gold,
      });

      pdfPage.drawText(
        'Legavora Global Services Ltd | RC 10009828',
        {
          x: margin,
          y: 53,
          size: 8,
          font: bold,
          color: navy,
        }
      );

      pdfPage.drawText(
        'legavora.com | hello@legavora.com',
        {
          x: margin,
          y: 39,
          size: 8,
          font: regular,
          color: slate,
        }
      );

      pdfPage.drawText(
        `${index + 1} / ${pages.length}`,
        {
          x: width - margin - 25,
          y: 39,
          size: 8,
          font: regular,
          color: slate,
        }
      );
    });

    const bytes = await pdf.save();

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          `attachment; filename="Legavora-Acceptance-${response.id}.pdf"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error(
      'Agreement certificate generation failed:',
      error
    );

    return failure(
      'Unable to generate the acceptance certificate.',
      500
    );
  }
}
