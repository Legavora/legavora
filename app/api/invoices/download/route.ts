import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { currentUser } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')
    .trim();
}

function formatDate(value: string | null): string {
  if (!value) return 'Not specified';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not specified';
  }

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function fail(message: string, status: number) {
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

export async function GET(request: NextRequest) {
  try {
    const invoiceId =
      request.nextUrl.searchParams.get('id');

    const documentType =
      request.nextUrl.searchParams.get('type') ||
      'invoice';

    if (
      !invoiceId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceId)
    ) {
      return fail('Invalid invoice identifier', 400);
    }

    if (!['invoice', 'receipt'].includes(documentType)) {
      return fail('Invalid document type', 400);
    }

    const { db, user } = await currentUser();

    if (!user) {
      return fail('Authentication required', 401);
    }

    const { data: profile, error: profileError } =
      await db
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profileError || !profile) {
      return fail('Access denied', 403);
    }

    const isManagement = [
      'admin',
      'manager',
    ].includes(profile.role);

    if (!isManagement && profile.role !== 'author') {
      return fail('Access denied', 403);
    }

    const { data: invoice, error: invoiceError } =
      await db
        .from('invoices')
        .select(`
          id,
          invoice_number,
          author_id,
          project_id,
          description,
          amount_cents,
          currency,
          status,
          created_at,
          due_date,
          paid_at,
          payment_method
        `)
        .eq('id', invoiceId)
        .single();

    if (invoiceError || !invoice) {
      return fail('Invoice not found', 404);
    }

    if (
      !isManagement &&
      invoice.author_id !== user.id
    ) {
      return fail('Invoice not found', 404);
    }

    const isReceipt = documentType === 'receipt';

    if (
      isReceipt &&
      (
        invoice.status !== 'paid' ||
        !invoice.paid_at
      )
    ) {
      return fail(
        'Receipts are available for paid invoices only',
        409
      );
    }

    const { data: author } = await db
      .from('profiles')
      .select('full_name,author_number')
      .eq('id', invoice.author_id)
      .single();

    let projectTitle = 'Publishing Services';

    if (invoice.project_id) {
      const { data: project } = await db
        .from('projects')
        .select('title')
        .eq('id', invoice.project_id)
        .single();

      if (project?.title) {
        projectTitle = project.title;
      }
    }

    const pdf = await PDFDocument.create();

    const regular = await pdf.embedFont(
      StandardFonts.Helvetica
    );

    const bold = await pdf.embedFont(
      StandardFonts.HelveticaBold
    );

    const logo = await pdf.embedPng(await readFile(path.join(process.cwd(), 'public', 'legavora-logo.png')));

    const navy = rgb(0.07, 0.13, 0.23);
    const gold = rgb(0.78, 0.62, 0.32);
    const grey = rgb(0.34, 0.38, 0.43);
    const white = rgb(1, 1, 1);

    const width = 595.28;
    const height = 841.89;
    const margin = 45;
    const contentWidth = width - margin * 2;

    const invoiceNumber = safeText(
      invoice.invoice_number || invoice.id
    );

    const amount = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(invoice.amount_cents / 100);

    const heading = isReceipt
      ? 'PAYMENT RECEIPT'
      : 'SERVICE INVOICE';

    pdf.setTitle(`${heading} ${invoiceNumber}`);
    pdf.setAuthor('Legavora Global Services Ltd');
    pdf.setSubject('Publishing and author services');
    pdf.setCreator('Legavora Author Platform');

    let page = pdf.addPage([width, height]);
    let y = height - 175;

    const invoiceStatus = safeText(invoice.status).toUpperCase();

    function drawHeader() {
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
      right(heading, height - 55, 19);
      right(invoiceNumber, height - 79, 11, regular);
      right(invoiceStatus, height - 100, 11);
      page.drawLine({ start: { x: margin, y: height - 148 }, end: { x: width - margin, y: height - 148 }, thickness: 1.5, color: gold });
    }

    function drawFooter() {
      page.drawLine({ start: { x: margin, y: 75 }, end: { x: width - margin, y: 75 }, thickness: 1, color: gold });
      page.drawText('Legavora Global Services Ltd | RC 10009828', { x: margin, y: 57, size: 9, font: bold, color: navy });
      page.drawText('legavora.com | hello@legavora.com', { x: margin, y: 42, size: 9, font: regular, color: grey });
    }

    function ensureSpace(required: number) {
      if (y - required < 95) {
        drawFooter();
        page = pdf.addPage([width, height]);
        drawHeader();
        y = height - 175;
      }
    }

    function wrapText(
      value: unknown,
      maxWidth: number,
      size: number
    ): string[] {
      const text = safeText(value);
      const words = text.split(/\s+/);
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

        if (line) lines.push(line);

        line = '';

        for (const character of word) {
          const next = line + character;

          if (
            regular.widthOfTextAtSize(next, size)
            > maxWidth
          ) {
            if (line) lines.push(line);
            line = character;
          } else {
            line = next;
          }
        }
      }

      if (line) lines.push(line);

      return lines.length ? lines : ['Not specified'];
    }

    function drawField(label: string, value: unknown) {
      ensureSpace(45);
      page.drawText(label.toUpperCase(), { x: margin, y, size: 9, font: bold, color: grey });
      y -= 18;
      for (const line of wrapText(value, contentWidth, 11)) {
        ensureSpace(18);
        page.drawText(line, { x: margin, y, size: 11, font: regular, color: navy });
        y -= 16;
      }
      y -= 12;
    }

    function drawPair(leftLabel: string, leftValue: unknown, rightLabel: string, rightValue: unknown) {
      const colWidth = (contentWidth - 28) / 2;
      const left = wrapText(leftValue, colWidth, 11);
      const right = wrapText(rightValue, colWidth, 11);
      const required = 30 + Math.max(left.length, right.length) * 16;
      if (required > 540) {
        drawField(leftLabel, leftValue);
        drawField(rightLabel, rightValue);
        return;
      }
      ensureSpace(required);
      const x2 = margin + colWidth + 28;
      page.drawText(leftLabel.toUpperCase(), { x: margin, y, size: 9, font: bold, color: grey });
      page.drawText(rightLabel.toUpperCase(), { x: x2, y, size: 9, font: bold, color: grey });
      left.forEach((line, i) => page.drawText(line, { x: margin, y: y - 18 - i * 16, size: 11, font: regular, color: navy }));
      right.forEach((line, i) => page.drawText(line, { x: x2, y: y - 18 - i * 16, size: 11, font: regular, color: navy }));
      y -= required;
    }

    drawHeader();
    drawPair('Issued By', 'Legavora Global Services Ltd', 'Billed To', author?.full_name || 'Registered Author');
    drawPair('Author Number', author?.author_number ? `#${author.author_number}` : 'Not assigned', 'Publishing Project', projectTitle);
    drawPair('Invoice Issue Date', formatDate(invoice.created_at), 'Payment Due Date', formatDate(invoice.due_date));
    if (isReceipt) {
      drawPair('Payment Confirmation Date', formatDate(invoice.paid_at), 'Payment Method', invoice.payment_method ? invoice.payment_method.replace(/_/g, ' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase()) : 'Recorded payment');
    }

    ensureSpace(65);
    page.drawRectangle({ x: margin, y: y - 8, width: contentWidth, height: 24, color: navy });
    page.drawText('SERVICE DESCRIPTION', { x: margin + 10, y, size: 10, font: bold, color: white });
    y -= 32;
    for (const line of wrapText(invoice.description || 'Publishing Services', contentWidth - 20, 11)) {
      ensureSpace(18);
      page.drawText(line, { x: margin + 10, y, size: 11, font: regular, color: navy });
      y -= 16;
    }
    y -= 15;

    ensureSpace(90);
    page.drawRectangle({ x: margin, y: y - 62, width: contentWidth, height: 76, color: navy });
    page.drawText(isReceipt ? 'TOTAL PAYMENT RECEIVED' : 'TOTAL INVOICE AMOUNT', { x: margin + 15, y: y - 8, size: 10, font: bold, color: gold });
    page.drawText(`${invoice.currency} ${amount}`, { x: margin + 15, y: y - 38, size: 24, font: bold, color: white });
    y -= 90;

    drawField(isReceipt ? 'Payment Confirmation' : 'Payment Information', isReceipt
      ? 'This receipt acknowledges the recorded full payment of the referenced invoice.'
      : invoice.status === 'paid' ? 'This invoice has been recorded as paid.'
      : invoice.status === 'pending' ? 'Please contact Legavora for approved payment instructions.'
      : `Current invoice status: ${safeText(invoice.status)}. Contact Legavora for clarification.`);

    drawFooter();

    const pages = pdf.getPages();

    pages.forEach((pdfPage, index) => {
      pdfPage.drawText(
        `Page ${index + 1} of ${pages.length}`,
        {
          x: width - margin - 65,
          y: 42,
          size: 8,
          font: regular,
          color: grey,
        }
      );
    });

    const pdfBytes = await pdf.save();

    const safeFilename = invoiceNumber.replace(
      /[^a-zA-Z0-9_-]/g,
      '_'
    );

    const filename =
      `${safeFilename}-${documentType}.pdf`;

    return new NextResponse(
      new Uint8Array(pdfBytes),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition':
            `attachment; filename="${filename}"`,
          'Cache-Control':
            'private, no-store, max-age=0',
          'X-Content-Type-Options': 'nosniff',
        },
      }
    );

  } catch (error) {
    console.error(
      'Financial document generation failed:',
      error
    );

    return fail(
      'Unable to generate financial document',
      500
    );
  }
}
