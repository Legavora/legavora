import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function respond(
  body: Record<string, unknown>,
  status = 200
) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function isAuthorized(
  request: NextRequest,
  secret: string
): boolean {
  const authorization =
    request.headers.get('authorization');

  if (
    !authorization ||
    !authorization.startsWith('Bearer ')
  ) {
    return false;
  }

  const supplied = authorization.slice(7);

  if (!/^[a-f0-9]{64}$/.test(supplied)) {
    return false;
  }

  const expectedBuffer = Buffer.from(secret, 'utf8');
  const suppliedBuffer = Buffer.from(supplied, 'utf8');

  if (
    expectedBuffer.length !== suppliedBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    expectedBuffer,
    suppliedBuffer
  );
}

export async function POST(request: NextRequest) {
  const secret =
    process.env.NOTIFICATION_WORKER_SECRET?.trim();

  if (
    !secret ||
    !/^[a-f0-9]{64}$/.test(secret)
  ) {
    return respond(
      {
        success: false,
        error: 'Worker configuration unavailable',
      },
      503
    );
  }

  if (!isAuthorized(request, secret)) {
    return respond(
      {
        success: false,
        error: 'Unauthorized',
      },
      401
    );
  }

  return respond({
    success: true,
    service: 'Legavora Notification Email Worker',
    authentication: 'verified',
    delivery_enabled: false,
    mode: 'authentication_test',
    processed: 0,
    sent: 0,
    message:
      'Worker authentication successful. Email delivery remains disabled.',
  });
}

export async function GET() {
  return respond(
    {
      success: false,
      error: 'Method not allowed',
    },
    405
  );
}
