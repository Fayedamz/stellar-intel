import { NextRequest, NextResponse } from 'next/server';
import { withRequestLogger } from '@/lib/logger';
import { isAdminRequest } from '@/lib/auth/admin';
import { getWebhookStore } from '@/lib/webhooks/store';
import type { ApiError } from '@/types';

export const runtime = 'nodejs';

// ─── GET /api/webhooks/failures ───────────────────────────────────────────────
//
// Returns dead-letter delivery records: events that exhausted all retry
// attempts without a successful 2xx response from the subscriber endpoint.

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withRequestLogger(request, 'api.webhooks.failures.list', async (logger) => {
    if (!isAdminRequest(request)) {
      return NextResponse.json<ApiError>(
        { code: 'FORBIDDEN', message: 'Admin key required' },
        { status: 403 }
      );
    }

    const failures = await getWebhookStore().listDeadLetters();
    logger.info({ event: 'dead_letters_listed', count: failures.length });
    return NextResponse.json(failures);
  });
}
