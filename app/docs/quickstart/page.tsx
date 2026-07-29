import { CodeBlock } from '@/components/docs/CodeBlock';

export default function QuickstartPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-primary-text">Quickstart</h1>
        <p className="mt-2 text-lg text-secondary-text">
          Make your first API call in under 5 minutes. No SDK required.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-primary-text">1. Compare rates for a corridor</h2>
        <p className="text-secondary-text">
          Fetch live quotes for <strong>USDC to NGN</strong> (Nigeria Naira) across every integrated
          anchor.
        </p>
        <CodeBlock
          language="bash"
          code={`curl -s "https://stellar-intel.vercel.app/api/rates/usdc-ngn?amount=100" | jq`}
        />
        <p className="text-sm text-secondary-text">
          Returns one row per anchor with <code>exchangeRate</code>, <code>fee</code>,{' '}
          <code>totalReceived</code>, and the quote <code>source</code>.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-primary-text">
          2. Check an anchor&apos;s reputation
        </h2>
        <p className="text-secondary-text">
          Get the composite reputation score for a specific anchor.
        </p>
        <CodeBlock
          language="bash"
          code={`curl -s "https://stellar-intel.vercel.app/api/reputation/cowrie" | jq`}
        />
        <p className="text-sm text-secondary-text">
          Returns scorecards, fill rate, settle latency, and sample counts.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-primary-text">3. View the leaderboard</h2>
        <p className="text-secondary-text">
          See how all anchors rank by composite reputation score.
        </p>
        <CodeBlock
          language="bash"
          code={`curl -s "https://stellar-intel.vercel.app/api/reputation/leaderboard?corridor=usdc-ngn" | jq`}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-primary-text">4. Submit an off-ramp intent</h2>
        <p className="text-secondary-text">
          Build, canonicalize, and sign an intent on the client, then submit it to the server.
        </p>
        <CodeBlock
          language="bash"
          code={`# Build the intent, canonicalize, SHA-256, Ed25519-sign (client-side with Freighter).
# Then POST the signed envelope:
curl -sX POST https://stellar-intel.vercel.app/api/intent/offramp \\
  -H 'content-type: application/json' \\
  -d '{
    "type": "offramp",
    "sourceAsset": "USDC",
    "destinationAsset": "NGN",
    "amount": "100",
    "sender": "GABC…",
    "recipient": "GBDEST…"
  }'`}
        />
        <p className="text-sm text-secondary-text">
          On success, returns an unsigned Stellar transaction (XDR) and a quote ID.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-primary-text">5. Read public on-chain scores</h2>
        <p className="text-secondary-text">
          Consume the public reputation scores endpoint (versioned, rate-limited).
        </p>
        <CodeBlock
          language="bash"
          code={`curl -s "https://stellar-intel.vercel.app/v1/public/scores" | jq`}
        />
      </section>

      <section className="rounded-xl border border-border bg-bg-subtle p-6">
        <h2 className="text-lg font-semibold text-primary-text">Next steps</h2>
        <ul className="mt-3 space-y-2 text-sm text-secondary-text">
          <li>
            • Read about{' '}
            <a href="/docs/auth" className="text-accent hover:underline">
              authentication and rate limits
            </a>
          </li>
          <li>
            • Explore the{' '}
            <a href="/docs/api" className="text-accent hover:underline">
              interactive API reference
            </a>
          </li>
          <li>
            • Set up{' '}
            <a href="/docs/webhooks" className="text-accent hover:underline">
              webhook notifications
            </a>
          </li>
          <li>
            • Browse the{' '}
            <a href="/docs/sdks" className="text-accent hover:underline">
              SDK documentation
            </a>
          </li>
          <li>
            • Integrate with AI agents via{' '}
            <a href="/docs/mcp" className="text-accent hover:underline">
              MCP
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}
