# MEMBERSHIP — the $29/mo tier, what it changes, and how to run it

Written S15 (2026-08-14), the day the pricing model changed from a one-time purchase to a subscription
alongside a free tier. This file is three things: the honest reasoning for the change, what it actually
costs the "buy once, own forever" promise, and the operator runbook for standing up billing for real.
`PRODUCT_OVERVIEW.md` §8 and `docs/plans/06-EDITIONS-PRICING.md` §4 both point here rather than repeating
this.

## 1. What changed, and what didn't

**Changed:** the paid coach tier is now $29/mo (Coachwright Membership) instead of a one-time licence
purchase. A new free tier exists alongside it, capped at 3 active clients.

**Did not change:**
- The local-first architecture. Every feature works fully offline on both tiers. Client data never leaves
  the coach's machine on either tier — membership billing is metadata (a subscription status and an
  expiry date), never a reason to phone home with actual coaching data.
- Any *already-issued* one-time licence key (`lib/licence.ts`). Those keys have no expiry, never will, and
  this change touches zero bits of that file's claim shape or signing scheme — see that file's own header
  for why a new claims shape lives in `lib/membership.ts` instead of extending the old one.
- The "no activation server to *verify*" promise. A membership token is still checked with the exact same
  offline ECDSA signature check as a one-time key. What's new is that a token now needs periodic **refresh**
  (see §3) — verification itself never touches the network.

## 2. Why this is a real reversal, not a tweak — said plainly

The original pricing doc (`docs/plans/06-EDITIONS-PRICING.md` §4.5) called "buy once, updates forever" a
**decision**, dated and reasoned through in detail — the honest accounting of what funds ongoing
development without a recurring line. That reasoning doesn't disappear because the number changed; it's
worth rereading before touching pricing copy again. The membership model trades that funding uncertainty
for a predictable one, at the real cost of the cleanest differentiator this product had ("you own it, we
can vanish and it still works"). That promise now only fully applies to the free tier and to anyone who
already owns a one-time licence.

## 3. The free tier: why 3, not a bigger or smaller number

QuickCoach's own free tier is 20 clients — genuinely generous, and worth knowing before claiming
"best-priced on the market" anywhere, because a straight per-client comparison does not favor a 3-client
cap. The reasoning for 3 here is different: **enough to genuinely try coaching real clients with the app,
not enough to run a practice on.** A coach who's serious quickly hits the ceiling and has a real, felt
reason to pay; a coach only curious never has to. Revisit this number with real conversion data once there
is any — it was chosen, not measured.

`FREE_TIER_CLIENT_LIMIT` lives in `src/lib/membership.ts`. It's enforced locally (`canAddClient()`),
checked in `NewClientDialog` and `ImportCsvDialog` — same honest-not-unbreakable philosophy as
`lib/licence.ts`'s own header: a determined user could edit their own IndexedDB to raise their stored
client count. The point is a clear, correctly-explained limit for someone acting in good faith, not a wall
against someone who isn't. A local-first app cannot do better than that without becoming a different kind
of product (server-authoritative accounts), which was never on the table here.

## 4. How a membership token actually works

- Coach checks out via Stripe Checkout (hosted by Stripe — the app never sees a card number).
- The sync server's webhook records the subscription in a `memberships` table (`sync-server/server.ts`).
- The app polls `GET /membership/status?coachId=<device id>` — on launch, and roughly daily. If the
  subscription is active (or `past_due`, a grace period — see below), the server mints a freshly signed
  `CWM1.…` token good for `MEMBERSHIP_TOKEN_LIFETIME_DAYS` (default 35) and hands it back.
- The app verifies that token **entirely offline**, exactly like a one-time licence key, against the same
  embedded public key (`RELEASE_PUBLIC_JWK` in `lib/licence.ts`, reused by `lib/membership.ts`).
- A coach without internet for a stretch keeps full access until the token's own `expiresAt` — real
  headroom past the 30-day billing cycle, never an instant cutoff on a missed check. Past expiry with no
  successful refresh, the account quietly reverts to free-tier limits. Never a hard lockout, never data
  loss — every client, program, and log stays exactly where it was.
- `past_due` (a failed card charge Stripe is still retrying) counts as active. Cutting access on the first
  failed charge is the kind of coercive billing experience this product is explicitly trying not to be.

## 5. Operator runbook — going live for real

Nothing below is optional if you want real coaches to actually be able to pay. In order:

1. **Create the Stripe product & price** (Stripe Dashboard → Product catalog): one recurring product,
   $29.00/mo, USD. Copy the **Price ID** (`price_...`).
2. **Create a restricted API key** (Stripe Dashboard → Developers → API keys) with Checkout Sessions,
   Subscriptions, Customers, and Billing Portal write access. Copy the **secret key** (`sk_...`).
3. **Generate the licence-signing keypair**, if `StrongSuit-release-keys/` (sibling of this repo, per
   `lib/licence.ts`'s own comment) doesn't already have one:
   ```bash
   node -e "
   const { webcrypto } = require('crypto');
   (async () => {
     const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign','verify']);
     const pub = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
     const priv = await webcrypto.subtle.exportKey('jwk', pair.privateKey);
     console.log('PUBLIC (goes in src/lib/licence.ts RELEASE_PUBLIC_JWK):');
     console.log(JSON.stringify(pub));
     console.log('PRIVATE (goes ONLY in the sync server env, never this repo):');
     console.log(JSON.stringify(priv));
   })();
   "
   ```
   The public half replaces `RELEASE_PUBLIC_JWK` in `src/lib/licence.ts` and ships in the app. The private
   half is the single most sensitive secret in this whole system — anyone who has it can mint a valid
   membership (or, if reused, a one-time licence) for free. Store it in a secrets manager, never in git,
   never in chat, never anywhere this repo's history could pick it up.
4. **Set the sync server's environment** (`sync-server/.env`, alongside the existing `ADMIN_KEY`/`VAPID_*`
   vars documented in `MANAGED_HOSTING.md`):
   ```
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_PRICE_ID=price_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_SUCCESS_URL=https://coachwright.app/membership/success
   STRIPE_CANCEL_URL=https://coachwright.app/membership/cancelled
   LICENCE_SIGNING_PRIVATE_JWK={"kty":"EC","crv":"P-256","d":"...","x":"...","y":"..."}
   MEMBERSHIP_TOKEN_LIFETIME_DAYS=35
   ```
5. **Register the webhook** in the Stripe Dashboard pointing at
   `https://<your-relay-domain>/membership/webhook`, subscribed to `checkout.session.completed`,
   `customer.subscription.updated`, and `customer.subscription.deleted`. Copy the **signing secret**
   (`whsec_...`) into `STRIPE_WEBHOOK_SECRET` above — this is how the server tells a real Stripe event
   apart from anyone who POSTs to that URL claiming to be Stripe.
6. **Point the app at the real server.** `src/lib/membershipApi.ts`'s `MEMBERSHIP_SERVER_URL` currently
   reads `https://relay.coachwright.app` — update it once the domain is live, and confirm
   `MANAGED_HOSTING.md`'s existing reference deployment (Caddy + Let's Encrypt in front of the same
   `sync-server/` process) is what's actually running there.
7. **Test in Stripe test mode first.** Use a `sk_test_...` key and Stripe's documented test card
   (`4242 4242 4242 4242`, any future expiry, any CVC) to run one real checkout → webhook → `/membership/status`
   → verified-token loop before switching to live keys. Nothing above requires a live key to test.

A sync-server instance with none of these env vars set still runs fine for sync/relay/reminders — every
`/membership/*` route refuses cleanly with a 503 rather than crashing the process, so a self-hoster who
isn't selling memberships doesn't need a Stripe account at all.

## 6. What this deliberately does not do

- **No card details ever touch our servers or this app.** Stripe Checkout and the Stripe billing portal
  are both fully hosted by Stripe — this is the same "don't build a checkout" doctrine from
  `SERVER_STRATEGY.md`, applied to a now-real payment flow instead of avoiding one.
- **No customer portal was built.** Cancel, update-card, view-invoices all go through Stripe's own hosted
  portal (`openMembershipBillingPortal()` just creates a session and redirects).
- **No hard lockout.** Losing a card, going offline, or letting a subscription lapse never deletes data or
  blocks the app from opening — it reverts to free-tier limits, same UI, same data, still yours.
