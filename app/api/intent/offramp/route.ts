import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  Asset,
  Networks,
  TransactionBuilder,
  Operation,
  Memo,
  BASE_FEE,
  Account,
} from '@stellar/stellar-sdk';
import { hashIntent } from '@/lib/intent/hash';
import { checkRateLimit, getClientIp } from '@/lib/api/rate-limit';
import { getIdempotentResponse, storeIdempotentResponse } from '@/lib/api/idempotency';
import {
  API_VERSION,
  apiErrorResponse,
  apiSuccessResponse,
  rateLimitedResponse,
  withRateLimitHeaders,
} from '@/lib/api/response';
import { USDC_ISSUER } from '@/lib/config';
import { withRequestLogger } from '@/lib/logger';
import { recordIntentError, recordIntentSuccess } from '@/lib/metrics';
import { AMOUNT_PATTERN } from '@/lib/patterns';
import type { Intent } from '@/lib/intent/hash';
import type { ApiError } from '@/types';

// ─── Request schema ────────────────────────────────────────────────────────────

const IntentSchema = z.object({
  type: z.literal('offramp'),
  sourceAsset: z.string().min(1),
  destinationAsset: z.string().min(1),
  amount: z.string().regex(AMOUNT_PATTERN, 'amount must be a positive decimal string'),
  sender: z.string().min(1),
  recipient: z.string().min(1),
});

// ─── Response types ────────────────────────────────────────────────────────────

export interface OfframpRoute {
  anchorId: string;
  anchorDomain: string;
  corridorId: string;
  estimatedFee: string;
  estimatedReceived: string;
}

export interface OfframpIntentResponse {
  route: OfframpRoute;
  unsignedTx: string;
  quoteId: string;
}

// ─── Anchor routing (simple first-match by corridor) ──────────────────────────

const ANCHOR_ROUTING: Record<
  string,
  { anchorId: string; anchorDomain: string; anchorAccount: string }
> = {
  'usdc-ngn': {
    anchorId: 'cowrie',
    anchorDomain: 'cowrie.exchange',
    anchorAccount: 'GAIJ3VXNY7RPPLGVVCLGBK7NPHLL5ZRKATHETOA7M7UPZPAAHEGQQIY2',
  },
  'usdc-kes': {
    anchorId: 'flutterwave',
    anchorDomain: 'flutterwave.com',
    anchorAccount: 'GC6PVZIZYHHROHYBBOZDJ5ZZI4RH6LDSHRT4K7BA5QGZFKMZ6HAZUQAK',
  },
};

function resolveRoute(sourceAsset: string, destinationAsset: string): OfframpRoute | null {
  const corridorId = `${sourceAsset.toLowerCase()}-${destinationAsset.toLowerCase()}`;
  const anchor = ANCHOR_ROUTING[corridorId];
  if (!anchor) return null;
  return {
    anchorId: anchor.anchorId,
    anchorDomain: anchor.anchorDomain,
    corridorId,
    estimatedFee: '2',
    estimatedReceived: '0',
  };
}

// ─── Unsigned transaction builder ─────────────────────────────────────────────

function buildUnsignedOfframpTx(
  senderPublicKey: string,
  anchorAccount: string,
  amount: string,
  assetCode: string,
  assetIssuer: string,
  quoteId: string
): string {
  const asset = new Asset(assetCode, assetIssuer);
  const account = new Account(senderPublicKey, '0');

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.PUBLIC,
  })
    .addOperation(
      Operation.payment({
        destination: anchorAccount,
        asset,
        amount,
      })
    )
    .addMemo(Memo.hash(Buffer.from(quoteId, 'hex')))
    .setTimeout(300)
    .build();

  return tx.toXDR();
}

// ─── Route handler ────────────────────────────────────────────────────────────

/**
 * Responses that are safe to replay verbatim for a repeated Idempotency-Key:
 * deterministic outcomes given the same input (success, or a validation/
 * routing error that will not change on retry). 500s are deliberately never
 * cached -- a transient failure should not be pinned to a key, since a
 * retry might succeed once the underlying issue clears.
 */
function isIdempotentCacheable(status: number): boolean {
  return status === 200 || status === 400;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withRequestLogger(request, 'api.intent.offramp', async (logger) => {
    const idempotencyKey = request.headers.get('idempotency-key');

    if (idempotencyKey) {
      const cached = getIdempotentResponse(idempotencyKey);
      if (cached) {
        logger.info({ event: 'idempotent_replay', idempotencyKey });
        const response = NextResponse.json(cached.body, {
          status: cached.status,
          headers: { ...cached.headers, 'Idempotency-Replayed': 'true' },
        });
        response.headers.set('API-Version', API_VERSION);
        return response;
      }
    }

    const ip = getClientIp(request.headers);
    const rl = checkRateLimit(ip, { bucket: 'api.intent.offramp', maxRequests: 20 });
    if (!rl.allowed) {
      logger.warn({ event: 'rate_limit_exceeded', ip, retryAfter: rl.retryAfter });
      return rateLimitedResponse(rl);
    }

    const respond = <T>(payload: T, status: number): NextResponse => {
      const response =
        status >= 400
          ? apiErrorResponse(payload as ApiError, status)
          : apiSuccessResponse(payload, { status });
      withRateLimitHeaders(response, rl);
      if (idempotencyKey && isIdempotentCacheable(status)) {
        storeIdempotentResponse(idempotencyKey, status, payload);
      }
      return response;
    };

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      logger.warn({ event: 'invalid_json', message: 'Request body must be valid JSON' });
      recordIntentError('INVALID_JSON');
      return respond<ApiError>(
        { code: 'INVALID_JSON', message: 'Request body must be valid JSON' },
        400
      );
    }

    const parsed = IntentSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      logger.warn({ event: 'validation_failed', issues: parsed.error.issues });
      recordIntentError('VALIDATION_ERROR');
      return respond<ApiError>(
        { code: 'VALIDATION_ERROR', message: first?.message ?? 'Invalid intent payload' },
        400
      );
    }

    const intent = parsed.data as Intent;
    const route = resolveRoute(intent.sourceAsset, intent.destinationAsset);

    logger.info({
      event: 'intent_parsed',
      sourceAsset: intent.sourceAsset,
      destinationAsset: intent.destinationAsset,
    });

    if (!route) {
      logger.warn({
        event: 'no_route',
        sourceAsset: intent.sourceAsset,
        destinationAsset: intent.destinationAsset,
      });
      recordIntentError('NO_ROUTE');
      return respond<ApiError>(
        {
          code: 'NO_ROUTE',
          message: `No route found for ${intent.sourceAsset} → ${intent.destinationAsset}`,
        },
        400
      );
    }

    const quoteId = await hashIntent(intent);
    const anchorEntry = ANCHOR_ROUTING[route.corridorId];

    if (!anchorEntry) {
      logger.error({ event: 'anchor_config_missing', corridorId: route.corridorId });
      recordIntentError('NO_ROUTE');
      return respond<ApiError>({ code: 'NO_ROUTE', message: 'Anchor configuration missing' }, 400);
    }

    let unsignedTx: string;
    try {
      unsignedTx = buildUnsignedOfframpTx(
        intent.sender,
        anchorEntry.anchorAccount,
        intent.amount,
        intent.sourceAsset,
        USDC_ISSUER,
        quoteId
      );
    } catch (err) {
      logger.error({
        event: 'tx_build_failed',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      recordIntentError('TX_BUILD_FAILED');
      // Not cached under the idempotency key (isIdempotentCacheable excludes
      // 500s) -- a retry with the same key should try building again.
      return respond<ApiError>(
        {
          code: 'TX_BUILD_FAILED',
          message: err instanceof Error ? err.message : 'Failed to build transaction',
        },
        500
      );
    }

    logger.info({ event: 'intent_response', corridorId: route.corridorId, quoteId });
    recordIntentSuccess();
    return respond<OfframpIntentResponse>({ route, unsignedTx, quoteId }, 200);
  });
}
