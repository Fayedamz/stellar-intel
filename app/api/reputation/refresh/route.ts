import { NextRequest, NextResponse } from 'next/server';
import { acquireLock, releaseLock } from '@/lib/reputation/lock';
import { withLoggerContext } from '@/lib/logger';
import { getReputationStore } from '@/lib/reputation/store';
import {
  DurableProbeStore,
  probeAllAnchors,
  probeAllAnchorQuotes,
  probeAllAnchorIssuers,
  probeAllAnchorIntegrity,
} from '@/lib/reputation/probe';

const LOCK_KEY = 'reputation-refresh';
const LOCK_TTL_MS = 5 * 60 * 1000;

let lastRefreshAt: Date | null = null;

interface ProbeSweepCounts {
  uptime: number;
  quote: number;
  issuerMismatch: number;
  tomlIntegrity: number;
}

// Runs every registered anchor through all four probe dimensions (Issue
// #D007) and persists every sample straight into the durable health ledger
// via `DurableProbeStore`, so a probe run survives past this invocation
// instead of only existing in memory.
async function runProbeSweep(): Promise<ProbeSweepCounts> {
  const store = getReputationStore();
  const uptimeSink = new DurableProbeStore(store, 'uptime');
  const quoteSink = new DurableProbeStore(store, 'quote');
  const issuerSink = new DurableProbeStore(store, 'issuer-mismatch');
  const integritySink = new DurableProbeStore(store, 'toml-integrity');

  const [uptimeSamples, quoteSamples, issuerSamples, integritySamples] = await Promise.all([
    probeAllAnchors(uptimeSink),
    probeAllAnchorQuotes(quoteSink),
    probeAllAnchorIssuers(issuerSink),
    probeAllAnchorIntegrity(integritySink),
  ]);

  await Promise.all([
    uptimeSink.drain(),
    quoteSink.drain(),
    issuerSink.drain(),
    integritySink.drain(),
  ]);

  return {
    uptime: uptimeSamples.size,
    quote: quoteSamples.length,
    issuerMismatch: issuerSamples.length,
    tomlIntegrity: integritySamples.length,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return withLoggerContext('api.reputation.refresh', async (logger) => {
    if (!acquireLock(LOCK_KEY, LOCK_TTL_MS)) {
      logger.warn({ event: 'refresh_conflict' });
      return NextResponse.json({ error: 'Refresh already in progress' }, { status: 409 });
    }

    try {
      const probed = await runProbeSweep();
      lastRefreshAt = new Date();
      logger.info({
        event: 'refresh_completed',
        refreshedAt: lastRefreshAt.toISOString(),
        ...probed,
      });

      return NextResponse.json({
        ok: true,
        refreshedAt: lastRefreshAt.toISOString(),
        probed,
      });
    } finally {
      releaseLock(LOCK_KEY);
    }
  });
}

export async function GET(): Promise<NextResponse> {
  return withLoggerContext('api.reputation.refresh', async (logger) => {
    logger.info({
      event: 'refresh_status_requested',
      lastRefreshAt: lastRefreshAt?.toISOString() ?? null,
    });
    return NextResponse.json({
      lastRefreshAt: lastRefreshAt?.toISOString() ?? null,
    });
  });
}
