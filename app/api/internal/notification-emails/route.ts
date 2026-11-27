import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

import {
  buildNotificationEmail,
  type EmailNotificationCategory,
} from '@/lib/notification-email-template';

import {
  sendNotificationEmail,
  type NotificationEmailPayload,
} from '@/lib/notification-email-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TEST_EVENT = 'notification_email_delivery_test';

const EMAIL_CATEGORIES = new Set([
  'project',
  'editorial',
  'production',
  'distribution',
  'contract',
  'invoice',
  'payment',
  'staff',
  'support',
  'marketing',
]);

type Claim = {
  queue_id: string;
  notification_id: string;
  attempt_number: number;
  max_attempts: number;
  processing_started_at: string;
};

type Preparation = {
  preparation_status: string;
  idempotency_key: string | null;
  request_payload: NotificationEmailPayload | null;
  first_attempt_at: string | null;
};

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

function createWorkerClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    throw new Error('Database configuration unavailable');
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

type WorkerClient = ReturnType<typeof createWorkerClient>;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function validEmail(value: string): boolean {
  return (
    value.length <= 254 &&
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)
  );
}

function validUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value
    )
  );
}

function claimArguments(claim: Claim) {
  return {
    p_queue_id: claim.queue_id,
    p_processing_started_at:
      claim.processing_started_at,
  };
}

async function recordFailure(
  db: WorkerClient,
  claim: Claim,
  message: string,
  retryable: boolean
): Promise<string> {
  const { data, error } = await db.rpc(
    'fail_notification_email',
    {
      ...claimArguments(claim),
      p_error_message: message,
      p_retryable: retryable,
    }
  );

  if (error) {
    return 'recording_failed';
  }

  return typeof data === 'string'
    ? data
    : 'recording_failed';
}

async function checkEligibility(
  db: WorkerClient,
  claim: Claim
): Promise<boolean> {
  const { data, error } = await db.rpc(
    'check_notification_email_eligibility',
    claimArguments(claim)
  );

  if (error) {
    throw new Error('Eligibility check unavailable');
  }

  return data === true;
}

async function processTestClaim(
  db: WorkerClient,
  claim: Claim,
  testEmail: string
): Promise<string> {
  let providerInvoked = false;

  try {
    if (!(await checkEligibility(db, claim))) {
      return 'suppressed_or_stale';
    }

    const {
      data: notification,
      error: notificationError,
    } = await db
      .from('notifications')
      .select(
        'id,recipient_id,event_type,category,title,message,priority,action_url'
      )
      .eq('id', claim.notification_id)
      .single();

    if (notificationError || !notification) {
      return recordFailure(
        db,
        claim,
        'Notification lookup unavailable',
        true
      );
    }

    if (notification.event_type !== TEST_EVENT) {
      return recordFailure(
        db,
        claim,
        'Test notification restriction failed',
        false
      );
    }

    if (!EMAIL_CATEGORIES.has(notification.category)) {
      return recordFailure(
        db,
        claim,
        'Unsupported notification category',
        false
      );
    }

    const {
      data: authData,
      error: authError,
    } = await db.auth.admin.getUserById(
      notification.recipient_id
    );

    if (authError || !authData.user) {
      return recordFailure(
        db,
        claim,
        'Recipient account lookup unavailable',
        true
      );
    }

    const recipient = authData.user;
    const recipientEmail = recipient.email?.trim();

    if (
      !recipientEmail ||
      !recipient.email_confirmed_at ||
      !validEmail(recipientEmail) ||
      normalizeEmail(recipientEmail) !== testEmail
    ) {
      return recordFailure(
        db,
        claim,
        'Authorized test recipient verification failed',
        false
      );
    }

    const {
      data: queue,
      error: queueError,
    } = await db
      .from('notification_email_queue')
      .select(
        'provider_request_payload,first_provider_attempt_at'
      )
      .eq('id', claim.queue_id)
      .eq('status', 'processing')
      .eq(
        'processing_started_at',
        claim.processing_started_at
      )
      .single();

    if (queueError || !queue) {
      return recordFailure(
        db,
        claim,
        'Queue state lookup unavailable',
        true
      );
    }

    let payload: NotificationEmailPayload | null = null;

    if (
      queue.provider_request_payload === null &&
      queue.first_provider_attempt_at === null
    ) {
      const {
        data: profile,
        error: profileError,
      } = await db
        .from('profiles')
        .select('full_name')
        .eq('id', notification.recipient_id)
        .single();

      if (profileError || !profile) {
        return recordFailure(
          db,
          claim,
          'Recipient profile lookup unavailable',
          true
        );
      }

      const priority =
        notification.priority === 'high' ||
        notification.priority === 'urgent' ||
        notification.priority === 'low'
          ? notification.priority
          : 'normal';

      try {
        payload = buildNotificationEmail({
          recipientEmail,
          recipientName: profile.full_name,
          category:
            notification.category as EmailNotificationCategory,
          title: notification.title,
          message: notification.message,
          priority,
          actionUrl: notification.action_url,
        });
      } catch {
        return recordFailure(
          db,
          claim,
          'Email template preparation failed',
          false
        );
      }
    }

    const {
      data: preparationData,
      error: preparationError,
    } = await db.rpc(
      'prepare_notification_email_request',
      {
        ...claimArguments(claim),
        p_payload: payload,
      }
    );

    if (preparationError) {
      return recordFailure(
        db,
        claim,
        'Provider request preparation unavailable',
        true
      );
    }

    const prepared = (
      Array.isArray(preparationData)
        ? preparationData[0]
        : null
    ) as Preparation | null;

    if (!prepared) {
      return recordFailure(
        db,
        claim,
        'Provider request preparation missing',
        true
      );
    }

    if (
      prepared.preparation_status === 'cancelled' ||
      prepared.preparation_status === 'not_found' ||
      prepared.preparation_status === 'expired' ||
      prepared.preparation_status === 'invalid_state'
    ) {
      return prepared.preparation_status;
    }

    if (
      prepared.preparation_status !== 'ready' ||
      !prepared.request_payload ||
      !prepared.idempotency_key ||
      !prepared.first_attempt_at
    ) {
      return recordFailure(
        db,
        claim,
        'Provider request state requires manual review',
        false
      );
    }

    const savedPayload = prepared.request_payload;

    if (
      !Array.isArray(savedPayload.to) ||
      savedPayload.to.length !== 1 ||
      typeof savedPayload.to[0] !== 'string' ||
      normalizeEmail(savedPayload.to[0]) !== testEmail ||
      normalizeEmail(savedPayload.to[0]) !==
        normalizeEmail(recipientEmail) ||
      savedPayload.from !==
        'Legavora <notifications@legavora.com>' ||
      'cc' in savedPayload ||
      'bcc' in savedPayload
    ) {
      return recordFailure(
        db,
        claim,
        'Stored provider payload failed recipient safety checks',
        false
      );
    }

    // Recheck the verified recipient before delivery.

    const {
      data: latestAuth,
      error: latestAuthError,
    } = await db.auth.admin.getUserById(
      notification.recipient_id
    );

    if (latestAuthError || !latestAuth.user) {
      return recordFailure(
        db,
        claim,
        'Final recipient lookup unavailable',
        true
      );
    }

    if (
      !latestAuth.user.email ||
      !latestAuth.user.email_confirmed_at ||
      normalizeEmail(latestAuth.user.email) !== testEmail
    ) {
      return recordFailure(
        db,
        claim,
        'Recipient verification changed; manual review required',
        false
      );
    }

    // Final preference check immediately before delivery.

    if (!(await checkEligibility(db, claim))) {
      return 'suppressed_or_stale';
    }

    providerInvoked = true;

    const delivery = await sendNotificationEmail(
      savedPayload,
      prepared.idempotency_key,
      prepared.first_attempt_at
    );

    if (delivery.success === false) {
      return recordFailure(
        db,
        claim,
        delivery.uncertain
          ? `Delivery outcome uncertain: ${delivery.error}`
          : delivery.error,
        delivery.retryable
      );
    }

    const {
      data: completed,
      error: completionError,
    } = await db.rpc(
      'complete_notification_email',
      {
        ...claimArguments(claim),
        p_provider_message_id:
          delivery.providerMessageId,
      }
    );

    if (completionError || completed !== true) {
      return 'delivery_recording_uncertain';
    }

    return 'sent';
  } catch {
    if (providerInvoked) {
      return 'delivery_recording_uncertain';
    }

    return recordFailure(
      db,
      claim,
      'Unexpected worker interruption',
      true
    );
  }
}

export async function POST(request: NextRequest) {
  const secret =
    process.env.NOTIFICATION_WORKER_SECRET?.trim();

  if (!secret || !/^[a-f0-9]{64}$/.test(secret)) {
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

  const enabled =
    process.env.NOTIFICATION_EMAILS_ENABLED === 'true';

  if (!enabled) {
    return respond({
      success: true,
      service: 'Legavora Notification Email Worker',
      authentication: 'verified',
      delivery_enabled: false,
      mode: 'disabled',
      processed: 0,
      sent: 0,
      message: 'Notification email delivery is disabled.',
    });
  }

  const mode =
    process.env.NOTIFICATION_EMAIL_MODE?.trim();

  // This deployment supports controlled testing only.
  // Live processing requires a separately reviewed release.

  if (mode !== 'test') {
    return respond(
      {
        success: false,
        delivery_enabled: false,
        error: 'Only controlled test mode is supported',
      },
      503
    );
  }

  if (process.env.VERCEL_ENV !== 'preview') {
    return respond(
      {
        success: false,
        delivery_enabled: false,
        error: 'Test worker requires a preview deployment',
      },
      503
    );
  }

  const testEmail = normalizeEmail(
    process.env.NOTIFICATION_TEST_EMAIL || ''
  );

  if (
    !validEmail(testEmail) ||
    !process.env.RESEND_API_KEY?.trim() ||
    !process.env.LEGAVORA_APP_URL?.trim()
  ) {
    return respond(
      {
        success: false,
        delivery_enabled: false,
        error: 'Test configuration unavailable',
      },
      503
    );
  }

  let queueId: unknown;

  try {
    const raw = await request.text();

    if (raw.length > 2048) {
      return respond(
        {
          success: false,
          error: 'Invalid request size',
        },
        400
      );
    }

    const body = JSON.parse(raw);
    queueId = body?.queue_id;
  } catch {
    return respond(
      {
        success: false,
        error: 'Valid JSON request required',
      },
      400
    );
  }

  if (!validUuid(queueId)) {
    return respond(
      {
        success: false,
        error: 'Valid test queue ID required',
      },
      400
    );
  }

  try {
    const db = createWorkerClient();

    const { data, error } = await db.rpc(
      'claim_test_notification_email',
      {
        p_queue_id: queueId,
        p_test_email: testEmail,
      }
    );

    if (error) {
      return respond(
        {
          success: false,
          error: 'Test queue claim unavailable',
        },
        503
      );
    }

    const claims = Array.isArray(data)
      ? (data as Claim[])
      : [];

    if (claims.length === 0) {
      return respond({
        success: true,
        delivery_enabled: true,
        mode: 'test',
        processed: 0,
        sent: 0,
        message: 'No eligible test notification found.',
      });
    }

    if (claims.length !== 1) {
      return respond(
        {
          success: false,
          error: 'Unexpected test claim result',
        },
        500
      );
    }

    const outcome = await processTestClaim(
      db,
      claims[0],
      testEmail
    );

    const uncertain =
      outcome === 'delivery_recording_uncertain' ||
      outcome === 'recording_failed';

    return respond(
      {
        success: outcome === 'sent',
        service: 'Legavora Notification Email Worker',
        authentication: 'verified',
        delivery_enabled: true,
        mode: 'test',
        processed: 1,
        sent: outcome === 'sent' ? 1 : 0,
        outcome,
      },
      uncertain ? 503 : 200
    );
  } catch {
    return respond(
      {
        success: false,
        error: 'Worker processing unavailable',
      },
      503
    );
  }
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
