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
import { USDC_ISSUER } from '@/lib/config';
import { AMOUNT_PATTERN } from '@/lib/patterns';
import type { Intent } from '@/lib/intent/hash';

/**
 * Single source of truth for the off-ramp intent business logic — REST's
 * `POST /api/intent/offramp` and the GraphQL `submitOfframpIntent` mutation
 * both resolve through here so routing, quote hashing and transaction
 * building can never drift between the two surfaces.
 */

// ─── Request schema ────────────────────────────────────────────────────────────

export const IntentSchema = z.object({
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

export type OfframpIntentErrorCode = 'NO_ROUTE' | 'TX_BUILD_FAILED';

/** Thrown by {@link resolveOfframpIntent} for any business-rule failure. */
export class OfframpIntentError extends Error {
  readonly code: OfframpIntentErrorCode;

  constructor(code: OfframpIntentErrorCode, message: string) {
    super(message);
    this.name = 'OfframpIntentError';
    this.code = code;
  }
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

/**
 * Resolves an already-validated off-ramp intent to a route, a firm-enough
 * quote id (an intent hash, not a SEP-38 firm quote), and an unsigned
 * Stellar payment transaction the caller can hand back to the client for
 * signing. Throws {@link OfframpIntentError} for any business-rule failure
 * (no route for the corridor, transaction build failure).
 */
export async function resolveOfframpIntent(intent: Intent): Promise<OfframpIntentResponse> {
  const route = resolveRoute(intent.sourceAsset, intent.destinationAsset);

  if (!route) {
    throw new OfframpIntentError(
      'NO_ROUTE',
      `No route found for ${intent.sourceAsset} → ${intent.destinationAsset}`
    );
  }

  const quoteId = await hashIntent(intent);
  const anchorEntry = ANCHOR_ROUTING[route.corridorId];

  if (!anchorEntry) {
    throw new OfframpIntentError('NO_ROUTE', 'Anchor configuration missing');
  }

  try {
    const unsignedTx = buildUnsignedOfframpTx(
      intent.sender,
      anchorEntry.anchorAccount,
      intent.amount,
      intent.sourceAsset,
      USDC_ISSUER,
      quoteId
    );
    return { route, unsignedTx, quoteId };
  } catch (err) {
    throw new OfframpIntentError(
      'TX_BUILD_FAILED',
      err instanceof Error ? err.message : 'Failed to build transaction'
    );
  }
}
