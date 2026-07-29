import {
  Asset,
  Networks,
  TransactionBuilder,
  Operation,
  Memo,
  BASE_FEE,
  Account,
} from '@stellar/stellar-sdk';
import { z } from 'zod';
import { hashIntent, type Intent } from '@/lib/intent/hash';
import { USDC_ISSUER } from '@/lib/config';
import { AMOUNT_PATTERN } from '@/lib/patterns';

/**
 * lib/intent/offramp.ts
 *
 * The off-ramp intent core — anchor routing and unsigned-transaction assembly —
 * extracted from the route handler so the internal (`/api/intent/offramp`) and
 * the public v1 (`/api/v1/intent/offramp`) surfaces share one implementation.
 */

export const IntentSchema = z.object({
  type: z.literal('offramp'),
  sourceAsset: z.string().min(1),
  destinationAsset: z.string().min(1),
  amount: z.string().regex(AMOUNT_PATTERN, 'amount must be a positive decimal string'),
  sender: z.string().min(1),
  recipient: z.string().min(1),
});

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

export function resolveRoute(sourceAsset: string, destinationAsset: string): OfframpRoute | null {
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
    .addOperation(Operation.payment({ destination: anchorAccount, asset, amount }))
    .addMemo(Memo.hash(Buffer.from(quoteId, 'hex')))
    .setTimeout(300)
    .build();

  return tx.toXDR();
}

export type OfframpErrorCode = 'NO_ROUTE' | 'TX_BUILD_FAILED';

export type OfframpResult =
  | { ok: true; response: OfframpIntentResponse }
  | { ok: false; code: OfframpErrorCode; message: string; status: number };

/**
 * Resolves a validated off-ramp intent into a route + unsigned transaction, or
 * a typed error. Deterministic in the sender + intent, so the same intent
 * always yields the same `quoteId` — the basis for idempotent retries.
 */
export async function createOfframpIntent(intent: Intent): Promise<OfframpResult> {
  const route = resolveRoute(intent.sourceAsset, intent.destinationAsset);
  const anchorEntry = route ? ANCHOR_ROUTING[route.corridorId] : undefined;
  if (!route || !anchorEntry) {
    return {
      ok: false,
      code: 'NO_ROUTE',
      message: `No route found for ${intent.sourceAsset} → ${intent.destinationAsset}`,
      status: 400,
    };
  }

  const quoteId = await hashIntent(intent);
  try {
    const unsignedTx = buildUnsignedOfframpTx(
      intent.sender,
      anchorEntry.anchorAccount,
      intent.amount,
      intent.sourceAsset,
      USDC_ISSUER,
      quoteId
    );
    return { ok: true, response: { route, unsignedTx, quoteId } };
  } catch (err) {
    return {
      ok: false,
      code: 'TX_BUILD_FAILED',
      message: err instanceof Error ? err.message : 'Failed to build transaction',
      status: 500,
    };
  }
}
