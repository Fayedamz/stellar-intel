import type { NextRequest, NextResponse } from 'next/server';
import { withV1 } from '@/lib/api/v1';
import { IntentSchema, createOfframpIntent } from '@/lib/intent/offramp';
import type { Intent } from '@/lib/intent/hash';

export const runtime = 'nodejs';

/**
 * POST /api/v1/intent/offramp — the public, hardened off-ramp intent surface.
 *
 * Returns the standard v1 error envelope, `X-RateLimit-*` headers on every
 * response, and honours `Idempotency-Key`: a retried request replays the
 * original response instead of building a second intent.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return withV1(
    request,
    { bucket: 'v1.intent.offramp', maxRequests: 20, idempotent: true },
    async (ctx) => {
      const body = await request.json().catch(() => null);

      const parsed = IntentSchema.safeParse(body);
      if (!parsed.success) {
        return ctx.error(
          'validation_error',
          parsed.error.issues[0]?.message ?? 'Invalid intent payload',
          400
        );
      }

      const result = await createOfframpIntent(parsed.data as Intent);
      if (!result.ok) {
        return ctx.error(result.code.toLowerCase(), result.message, result.status);
      }

      return { status: 200, body: result.response };
    }
  );
}
