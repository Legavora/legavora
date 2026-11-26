import { readFile } from 'node:fs/promises';
import path from 'node:path';
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

    const logo = await pdf.embedPng(await readFile(path.join(process.cwd(), 'public', 'legavora-logo.png')));
    const navy = rgb(0.07, 0.13, 0.23);
    const gold = rgb(0.78, 0.62, 0.32);
    const slate = rgb(0.29, 0.35, 0.43);
    const green = rgb(0.08, 0.40, 0.25);
    const pale = rgb(0.95, 0.97, 0.98);
    

    const width = 595.28;
    const height = 841.89;
    const margin = 45;
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
    let y = height - 175;

    function decoratePage(continuation = false) {
      const watermark = logo.scaleToFit(410, 360);
      page.drawImage(logo, {
        x: (width - watermark.width) / 2,
        y: (height - watermark.height) / 2,
        ...watermark,
        opacity: 0.07,
      });
      page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: navy });
      page.drawRectangle({ x: 0, y: height - 11, width, height: 3, color: gold });
      const mark = logo.scaleToFit(170, 105);
      page.drawImage(logo, { x: margin, y: height - 132, ...mark });
      function right(text: string, baseline: number, size: number, font = bold) {
        page.drawText(text, { x: width - margin - font.widthOfTextAtSize(text, size), y: baseline, size, font, color: navy });
      }
      right('AGREEMENT ACCEPTANCE', height - 52, 17);
      right(continuation ? 'CERTIFICATE - CONTINUED' : 'CERTIFICATE', height - 74, 17);
      right('STATUS: ACCEPTED', height - 101, 10);
      page.drawLine({ start: { x: margin, y: height - 148 }, end: { x: width - margin, y: height - 148 }, thickness: 1.5, color: gold });
    }

    decoratePage();

    function ensureSpace(required: number) {
      if (y - required >= 95) return;
      page = pdf.addPage([width, height]);
      decoratePage(true);
      y = height - 175;
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

    function paragraph(value: string, size = 10, color = slate) {
      for (const line of wrapText(value, size, contentWidth)) {
        ensureSpace(size + 3);
        page.drawText(line, { x: margin, y, size, font: regular, color });
        y -= size + 3;
      }
      y -= 5;
    }

    function field(label: string, value: string) {
      ensureSpace(32);
      page.drawText(label.toUpperCase(), { x: margin, y, size: 8, font: bold, color: slate });
      y -= 14;
      paragraph(value, 10, navy);
      y -= 3;
    }

    function pair(leftLabel: string, leftValue: string, rightLabel: string, rightValue: string) {
      const gap = 20;
      const column = (contentWidth - gap) / 2;
      const left = wrapText(leftValue, 10, column);
      const right = wrapText(rightValue, 10, column);
      const count = Math.max(left.length, right.length);
      if (count > 12) {
        field(leftLabel, leftValue);
        field(rightLabel, rightValue);
        return;
      }
      ensureSpace(18 + count * 13);
      for (const [label, lines, x] of [[leftLabel, left, margin], [rightLabel, right, margin + column + gap]] as const) {
        page.drawText(label.toUpperCase(), { x, y, size: 8, font: bold, color: slate });
        lines.forEach((line, index) => page.drawText(line, { x, y: y - 14 - index * 13, size: 10, font: regular, color: navy }));
      }
      y -= 22 + count * 13;
    }

    function section(title: string) {
      ensureSpace(42);
      page.drawRectangle({ x: margin, y: y - 6, width: contentWidth, height: 20, color: pale });
      page.drawText(title, { x: margin + 8, y, size: 10, font: bold, color: navy });
      y -= 24;
    }

    paragraph('This certificate documents an electronic agreement acceptance recorded through the Legavora Publishing Platform.');
    field('Certificate reference', certificateReference);
    field('Agreement title', contract.title);
    pair('Agreement version', `Version ${version.version_number}`, 'Accepted by', response.full_name);
    pair('Agreement issued', formatDate(version.issued_at), 'Acceptance recorded', formatDate(response.responded_at));
    section('Electronic Acceptance Statement');
    paragraph(response.acceptance_statement, 10, navy);
    section('Document Integrity Record');
    paragraph('The SHA-256 fingerprint stored with the acceptance record matches the fingerprint recorded for this agreement version.', 9);
    ensureSpace(32);
    page.drawText('SHA-256 DOCUMENT FINGERPRINT', { x: margin, y, size: 8, font: bold, color: slate });
    y -= 14;
    page.drawText(version.document_sha256, { x: margin, y, size: 9, font: mono, color: navy });
    y -= 23;
    pair('Agreement version ID', version.id, 'Acceptance record ID', response.id);
    section('Certificate Notice');
    paragraph('This certificate is a record of electronic acceptance. It does not replace the original agreement, constitute independent identity verification, or independently establish legal enforceability.', 9);
    paragraph('Retain this certificate together with the corresponding agreement document.', 9);

    const pages = pdf.getPages();

    pages.forEach((pdfPage, index) => {
      pdfPage.drawLine({
        start: { x: margin, y: 75 },
        end: { x: width - margin, y: 75 },
        thickness: 1,
        color: gold,
      });

      pdfPage.drawText(
        'Legavora Global Services Ltd | RC 10009828',
        {
          x: margin,
          y: 57,
          size: 8,
          font: bold,
          color: navy,
        }
      );

      pdfPage.drawText(
        'legavora.com | hello@legavora.com',
        {
          x: margin,
          y: 42,
          size: 8,
          font: regular,
          color: slate,
        }
      );

      pdfPage.drawText(
        `${index + 1} / ${pages.length}`,
        {
          x: width - margin - 25,
          y: 42,
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
