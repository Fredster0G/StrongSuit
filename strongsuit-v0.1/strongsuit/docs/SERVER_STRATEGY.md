# SERVER, PAYMENTS & MONETIZATION STRATEGY
Companion to `STRONGSUIT_MASTER_SPEC.md` §0 (zero-backend doctrine) and `BRANDING_PLAN.md`. Written 2026-07-17 (S10) in response to a feature list modeled on full gym-management suites (TrueCoach/Trainerize/Mindbody/PT Distinction). This document draws the line honestly: what Coachwright can do without a server, what genuinely needs one, and — for the pieces that do — the specific, minimal-liability way to add them without breaking the "you own it, zero recurring cost" promise that *is* the product.

**Read this before building any of the "needs infrastructure" rows below.** Do not silently fake a feature (a "Send email" button with no email actually sending, a "Push notification" toggle with no push service behind it). Either build it for real with a bring-your-own-account pattern, or don't build it and point the coach at a real tool. Half-built infrastructure features are worse than an honest gap — they cost the buyer trust the moment they try to use one.

---

## 1. The line, drawn plainly

Coachwright's moat is: **no server, no monthly bill, no one but you holding your client list.** Every feature that needs a server to function *for real* (not a demo) puts that promise at risk. So the rule is:

| If a feature needs… | Verdict |
|---|---|
| Only local computation on data already in IndexedDB | **Build it.** This is 90% of the "enterprise suite" list — see §2. |
| A one-time, coach-initiated, coach-owned external link (a payment link, a mailto:, a scheduling link) | **Build the integration point**, not the service itself. The coach brings their own free/cheap account; Coachwright never touches the credentials or the money. See §3. |
| A standing service that runs while the app is closed (bulk email/SMS sends, push notifications, webhooks, a payment processor's server-side webhook handling) | **Do not fake it.** Document the honest options in §4 and let the coach pick a real tool for that one job. |
| Hosting content for the public internet (landing pages, on-demand video, livestreaming) | **Out of scope for this product.** It's a website/media hosting business, not a coaching workstation. §5 gives the recommended external stack. |

---

## 2. Built without a server (already shipped, S9–S10)

Everything below runs entirely on the coach's device, exactly like the rest of Coachwright:

- **Team & locations** — staff roster, per-staff commission math, multi-location tagging (`/team`).
- **CRM / leads pipeline** — inquiry → contacted → trial → won/lost, convert-to-client (`/leads`).
- **Leaderboards & challenges** — opt-in cross-client ranking on volume/sessions/bodyweight-loss, computed from data already logged (`/leaderboard`).
- **Progress photos & habit tracking** — resized-before-storage photos, daily habit streaks (Metrics/Check-ins tabs).
- **TV Workout mode** — a full-screen, no-chrome display route (`/tv/:clientId`) for a gym-floor screen/monitor. This is *screen mirroring*, not a casting SDK — plug the coach's laptop into the TV or use the OS's built-in screen-mirroring (AirPlay/Miracast/Chromecast's "cast this tab" browser feature all work with a normal web page; none of that requires Coachwright to integrate anything).
- **Automations rule engine** (`Settings → Automations`) — configurable local rules ("no session in N days," "package down to N sessions," "payment overdue," "screening missing") re-evaluated on every dashboard load. This is the honest ceiling for "automation" without a server: instant, on-demand, zero cost — not a background job that fires while the laptop is asleep. Say this plainly to buyers; it's a feature, not an apology (a coach's phone isn't a server room either).
- **Invoicing, coupons, account balances** — numbered invoices with line items, coupon codes (percent/flat), and a real "balance owed" (Billing tab).
- **E-sign waivers, PAR-Q+ screening** — typed-signature acknowledgement with a SHA-256 hash of the exact text signed (tamper-evident, not a notarized e-signature service — see §3 if a coach needs court-grade e-signatures).
- **Secure WiFi/LAN sync** — ECDH P-256 pairing + AES-GCM sealed packets between the coach's device and a client's device on the same network (Studio Link, Electron build only for the live server; file-based export/import works everywhere). No cloud relay required for this to work.

## 3. Bring-your-own-account integrations (build the link, not the plumbing)

These are real, working features — Coachwright just never becomes the payment processor, the SMS carrier, or the mail server. The coach already has (or can get for free/cheap) the underlying account; we give them a clean place to paste the resulting link or address.

### Payments & e-commerce
**Don't build a checkout.** Taking cards directly means PCI compliance, chargebacks, and a "zero backend" company suddenly running financial infrastructure — the single fastest way to turn a $79 one-time tool into a support and liability nightmare.

**Do build:** a field on each Invoice/client for a **payment link** (Stripe Payment Links, Square, PayPal.me, or Venmo/CashApp handles — all free to create, no code, no API key, the coach's own merchant account). Coachwright renders it as a clickable "Pay now" button/QR on the invoice and printed statement. The Ledger already records payments manually; nothing stops a coach from pasting the Stripe receipt total in after the fact — same workflow trainers already use today, just faster to send.

*Comparison:* TrueCoach/Trainerize/Mindbody take a cut of processed payments (typically 2.9%+30¢ passed through a partner processor, sometimes with an added platform fee) — on top of the monthly fee. A Stripe Payment Link charges the same ~2.9%+30¢ **directly to Stripe**, with **no platform markup**, because there's no platform in the middle. For a $1,000/month coach, that's the difference between paying one processor once and paying a processor *and* a SaaS company both.

### Trainer commissions
Already built locally (§2) — no server needed since it's just math over payments already in the Ledger.

### Email (1:1)
**Don't build a mail server or bulk sender** — deliverability, SPF/DKIM, spam compliance (CAN-SPAM/CASL/GDPR) is a real specialty, not a side feature.
**Do build:** `mailto:` deep links pre-filled with subject/body (e.g., a "Email this client" button on the client page, a "Email invoice" button on Invoices) — opens the coach's own email client, sends from their own address, zero infrastructure. This covers the 1:1 case that's 95% of a solo trainer's actual email use.

### SMS (1:1)
Same pattern: `sms:` deep links open the coach's own phone's Messages app pre-filled with a draft — works when the coach is on their phone (which, for a gym-floor trainer, is most of the time). No Twilio number, no per-message cost, no carrier compliance to worry about.

### E-signatures for real contracts
The built-in typed-signature + hash (§2) is a legitimate lightweight audit trail for waivers/PAR-Q — it is **not** a substitute for DocuSign/HelloSign-grade legal e-signature when a contract actually needs one (some jurisdictions/insurers require it for liability waivers). Recommend a coach use a free-tier DocuSign/HelloSign account for anything they'd need to enforce in court; Coachwright's version is for day-to-day operational documentation, and the Guide says so.

## 4. Genuinely needs a standing service — documented, not faked

| Feature requested | Why it needs a real backend | Recommended path | Est. cost to the coach |
|---|---|---|---|
| Bulk/marketing email | Deliverability infra, unsubscribe/compliance, sending reputation | Mailchimp/Brevo free tier (up to 500–2,500 contacts free as of most providers' 2025–26 plans) | $0–20/mo, only if list > free tier |
| SMS marketing/reminders at scale | Needs a carrier-registered number + compliance (10DLC in the US) | Twilio or SimpleTexting pay-as-you-go | ~$0.01–0.03/message, no platform fee from us |
| Push notifications | Needs a push service (FCM/APNs) + a server to trigger sends + HTTPS hosting for a PWA's service worker | Skip it. A local automation rule (§2) that surfaces the moment the coach opens the app is the honest zero-cost equivalent; a true push needs infrastructure this product deliberately doesn't have | — |
| Sales funnels / landing pages | Needs public web hosting, a domain, form-to-database plumbing | Carrd ($19/yr) or a free Notion/Google Sites page linking to the coach's Gumroad/Stripe link | $0–20/yr |
| Online groups / on-demand video / livestreaming | Needs video hosting/CDN and, for groups, real-time infra | Keep coaching delivery in the Companion file (already built, free, offline); for video content, YouTube (unlisted) or Vimeo for hosting, linked from the Exercise Library's existing `videoUrl` field — already wired up | $0–20/mo if Vimeo Pro wanted |
| Sell workout plans / digital products / memberships-as-a-storefront | Needs a storefront, cart, and payment processing at scale | Gumroad (2.9%+30¢+10% platform fee, zero setup) or Stripe Checkout linked from a Carrd page; deliver the purchased program as a Companion export | Gumroad's cut only — no separate subscription |

**The throughline:** every row above has a **free-or-nearly-free, no-code, coach-owned** answer already on the market. Coachwright's job is to interoperate with those (a pasted link, a `videoUrl` field, an exported file) — not to rebuild Mailchimp, Twilio, and Shopify inside a desktop app. Rebuilding them would also reintroduce the exact recurring-cost, third-party-dependency problem the product exists to eliminate.

## 5. Monetization guidance for the *buyer* (surfaced via Profit Planner + Guide)

Directly answers "help them save and make as much money as possible" — this is coaching-business advice the product should keep surfacing, not just a one-time doc:

1. **Undercut the category on price, not on capability.** BRANDING_PLAN.md's math still holds: TrueCoach Pro-tier runs roughly $130–160/mo at 40+ clients; Coachwright is a flat one-time fee. Show this comparison inside the app (Profit Planner already computes real monthly profit — a future small addition: a "you'd be paying $X/mo elsewhere" ambient reminder is cheap to add and reinforces the purchase decision every session).
2. **Use the Gym's Cut + Commissions math honestly with clients.** A coach who knows their real take-home (after facility cut and staff commission) prices sessions correctly instead of guessing — this is already live in the Profit Planner and Billing tabs.
3. **Turn Leaderboards/Challenges into retention, not just fun.** Time-boxed challenges are a proven low-cost way small studios reduce cancellations — it's now a checkbox away (§2), not a $50/mo add-on tier like some competitors sell it as.
4. **Session packages + Invoicing reduce billing leakage.** Untracked "I'll pay you later" sessions are the single biggest silent revenue leak solo trainers report; the new Invoice/Balance-owed view makes the leak visible before it becomes a bad debt.
5. **The Companion footer is a real, zero-cost referral channel.** Every client who opens a Companion file sees "Built with Coachwright" (toggleable) — worth leaving on for trainers actively trying to grow.
6. **Don't recreate a subscription business by accident.** If a coach asks for hosted email/SMS/payments *from us*, the honest answer is: that would require us to run servers and charge recurring fees, which erases the reason they bought a one-time tool in the first place. Point them at §3/§4's bring-your-own-account options instead — their cost stays usage-based and provider-direct, not marked up by a platform in the middle.

---

## 6. What to build next if this list keeps growing

If a future request reintroduces something from §4 as a "must have," the right question isn't "can we build a mini version" — it's **"does the buyer actually need a hosted product, and would they be better served by us selling this as a genuinely separate, clearly-recurring companion service (e.g., an optional paid cloud relay, priced and marketed as such — see the existing `sync-server/` prototype and §4.23 of the spec)?"** That's a legitimate business model (many "own it" products sell an optional hosted convenience layer), but it must be sold honestly as recurring, never smuggled in as if the core zero-cost promise still applies to it.
