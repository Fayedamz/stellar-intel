import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/api/rate-limit';
import { withRequestLogger } from '@/lib/logger';
import { recordIntentError, recordIntentSuccess } from '@/lib/metrics';
import {
  IntentSchema,
  OfframpIntentError,
  resolveOfframpIntent,
  type OfframpIntentResponse,
} from '@/lib/api/offramp-intent';
import type { Intent } from '@/lib/intent/hash';
import type { ApiError } from '@/types';

export type { OfframpRoute, OfframpIntentResponse } from '@/lib/api/offramp-intent';

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withRequestLogger(request, 'api.intent.offramp', async (logger) => {
    const ip = getClientIp(request.headers);
    const rl = checkRateLimit(ip, { bucket: 'api.intent.offramp', maxRequests: 20 });
    if (!rl.allowed) {
      logger.warn({ event: 'rate_limit_exceeded', ip, retryAfter: rl.retryAfter });
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: rl.retryAfter },
        {
          status: 429,
          headers: {
            'Retry-After': String(rl.retryAfter),
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      logger.warn({ event: 'invalid_json', message: 'Request body must be valid JSON' });
      recordIntentError('INVALID_JSON');
      return NextResponse.json<ApiError>(
        { code: 'INVALID_JSON', message: 'Request body must be valid JSON' },
        { status: 400 }
      );
    }

    const parsed = IntentSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      logger.warn({ event: 'validation_failed', issues: parsed.error.issues });
      recordIntentError('VALIDATION_ERROR');
      return NextResponse.json<ApiError>(
        {
          code: 'VALIDATION_ERROR',
          message: first?.message ?? 'Invalid intent payload',
        },
        { status: 400 }
      );
    }

    const intent = parsed.data as Intent;

    logger.info({
      event: 'intent_parsed',
      sourceAsset: intent.sourceAsset,
      destinationAsset: intent.destinationAsset,
    });

    let response: OfframpIntentResponse;
    try {
      response = await resolveOfframpIntent(intent);
    } catch (err) {
      if (err instanceof OfframpIntentError) {
        const status = err.code === 'TX_BUILD_FAILED' ? 500 : 400;
        logger.warn({
          event: err.code === 'NO_ROUTE' ? 'no_route' : 'tx_build_failed',
          sourceAsset: intent.sourceAsset,
          destinationAsset: intent.destinationAsset,
          error: err.message,
        });
        recordIntentError(err.code);
        return NextResponse.json<ApiError>({ code: err.code, message: err.message }, { status });
      }
      throw err;
    }

    logger.info({
      event: 'intent_response',
      corridorId: response.route.corridorId,
      quoteId: response.quoteId,
    });
    recordIntentSuccess();
    return NextResponse.json<OfframpIntentResponse>(response);
  });
}
