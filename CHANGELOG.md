# Changelog

All notable changes to Stellar Intel are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- `docs/ROADMAP.md`: new "v6 Ecosystem Infrastructure" section covering the 7 items epic #808 parked (Rust SDK, webhooks, GraphQL, developer portal, multi-corridor oracle v2, on-chain savings oracle, versioning policy, decentralization), each linked to its now-filed child issue (#868-#875). #808 cited a "Horizon 3" section that no longer exists in the roadmap after it moved from an H1/H2/H3 structure to the current v1-v5 wave structure; this section reconciles that drift instead of leaving the epic pointing at removed content.
- `StatusTracker`: when `stellar_transaction_id` is a valid 64-char hex, render a link to `{STELLAR_EXPERT_URL}/tx/{id}` opening in a new tab (`target="_blank" rel="noopener noreferrer"`) ([#47](https://github.com/Ezedike-Evan/stellar-intel/issues/47))
- `lib/reporter`: pluggable error reporter with noop default; wire via `configureReporter()` at app startup (#184)

### Changed

- Homepage hero reframed to execution-layer positioning: badge, heading, subcopy, module heading, and off-ramp card description updated (#100)
- Consolidated duplicated helpers: single `sleep` (`lib/utils`), single `fetchWithTimeout` (`lib/stellar/http`), and shared validation patterns (`lib/patterns`) replacing scattered pubkey/amount regex literals.
- Docs re-synced with the code: `@stellar/stellar-sdk` v16, `NEXT_PUBLIC_APP_NAME` documented as required, `.env.example` completed with all read env vars, MCP install instructions corrected, anchor-onboarding path fixed to `constants/anchors.ts`, and the reputation composite formula in `docs/ANCHOR_REPUTATION.md` corrected to match `lib/reputation/composite.ts`.

### Fixed

- Stellar public-key validation now uses the correct base32 alphabet (`G[A-Z2-7]{55}`), rejecting keys containing `0`, `1`, `8`, or `9` that the previous `[A-Z0-9]` pattern wrongly accepted.
- `NEXT_PUBLIC_INTENT_FLOW` no longer had two flag accessors with opposite defaults; `lib/flags.ts` now exposes a single accessor (intent flow OFF unless explicitly `"true"`).

### Removed

- Deleted zero-reference orphan components/hooks (`Navbar`, `FreshnessPill`, `CountrySelector`, `CurrencySelector`, `TrustBar`, `useFlag`, `useToast`), the deprecated/banned `lib/stellar/estimatedRates.ts`, unwired scripts (`scripts/emit-version.ts`, `scripts/run-release-tests.js`), and unused named exports across `constants/`, `types/`, `lib/config`, `lib/logger`, and `lib/reputation`.

[Unreleased]: https://github.com/Ezedike-Evan/stellar-intel/commits/main
