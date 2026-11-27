import 'server-only';

const RESEND_API_URL = 'https://api.resend.com/emails';
const REQUEST_TIMEOUT_MS = 15000;
const SAFE_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

export type NotificationEmailPayload = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  reply_to?: string;
};

export type EmailDeliveryResult =
  | {
      success: true;
      providerMessageId: string;
    }
  | {
      success: false;
      retryable: boolean;
      uncertain: boolean;
      error: string;
    };

type ResendResponse = {
  id?: string;
  name?: string;
  message?: string;
};

function failure(
  error: string,
  retryable: boolean,
  uncertain = false
): EmailDeliveryResult {
  return {
    success: false,
    retryable,
    uncertain,
    error,
  };
}

export async function sendNotificationEmail(
  payload: NotificationEmailPayload,
  idempotencyKey: string,
  firstAttemptAt: string
): Promise<EmailDeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    return failure(
      'Email provider configuration unavailable',
      true
    );
  }

  if (
    typeof idempotencyKey !== 'string' ||
    !/^legavora-notification-[a-f0-9-]{36}$/.test(
      idempotencyKey
    )
  ) {
    return failure(
      'Invalid notification idempotency key',
      false
    );
  }

  const firstAttemptTime = Date.parse(firstAttemptAt);
  const now = Date.now();

  if (
    !Number.isFinite(firstAttemptTime) ||
    firstAttemptTime > now + 60000
  ) {
    return failure(
      'Invalid first provider attempt timestamp',
      false
    );
  }

  if (
    now + REQUEST_TIMEOUT_MS - firstAttemptTime >=
    SAFE_RETRY_WINDOW_MS
  ) {
    return failure(
      'Safe provider retry window expired; manual reconciliation required',
      false,
      true
    );
  }

  if (
    !payload ||
    typeof payload.from !== 'string' ||
    !payload.from.trim() ||
    !Array.isArray(payload.to) ||
    payload.to.length !== 1 ||
    typeof payload.to[0] !== 'string' ||
    !payload.to[0].trim() ||
    typeof payload.subject !== 'string' ||
    !payload.subject.trim() ||
    typeof payload.html !== 'string' ||
    !payload.html.trim()
  ) {
    return failure(
      'Invalid notification email payload',
      false
    );
  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',

      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },

      body: JSON.stringify(payload),

      signal: controller.signal,

      cache: 'no-store',

      redirect: 'error',
    });

    let data: ResendResponse | null = null;

    try {
      const parsed: unknown = await response.json();

      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed)
      ) {
        data = parsed as ResendResponse;
      }
    } catch {
      data = null;
    }

    if (response.ok) {
      if (
        typeof data?.id === 'string' &&
        data.id.trim().length > 0 &&
        data.id.trim().length <= 255
      ) {
        return {
          success: true,
          providerMessageId: data.id.trim(),
        };
      }

      return failure(
        'Provider returned an uncertain success response',
        true,
        true
      );
    }

    if (
      data?.name ===
      'invalid_idempotent_request'
    ) {
      return failure(
        'Provider idempotency payload conflict; manual review required',
        false,
        true
      );
    }

    if (
      data?.name ===
      'concurrent_idempotent_requests'
    ) {
      return failure(
        'Concurrent provider request; retry required',
        true,
        true
      );
    }

    if (response.status === 429) {
      return failure(
        'Email provider rate limit reached',
        true
      );
    }

    if (
      response.status === 408 ||
      response.status === 425 ||
      response.status >= 500
    ) {
      return failure(
        'Temporary email provider interruption',
        true,
        true
      );
    }

    if (response.status === 409) {
      return failure(
        'Provider request conflict; manual review required',
        false,
        true
      );
    }

    if (
      response.status === 401 ||
      response.status === 403
    ) {
      return failure(
        'Email provider authentication or permission failure',
        false
      );
    }

    return failure(
      `Email provider rejected request (HTTP ${response.status})`,
      false
    );
  } catch {
    if (controller.signal.aborted) {
      return failure(
        'Email provider request timed out; delivery outcome unknown',
        true,
        true
      );
    }

    return failure(
      'Email provider connection interrupted; delivery outcome unknown',
      true,
      true
    );
  } finally {
    clearTimeout(timeout);
  }
}
