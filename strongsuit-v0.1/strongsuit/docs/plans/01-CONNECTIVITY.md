# 01 — Connectivity: one model for localhost, self-hosted, our cloud, and P2P

> This is the doc you asked to talk through. Read §1–§3, then the decision in §6.

---

## 1. The good news: v1 already solved the hard half

The architecture built through S11–S13 got the important thing right, and it's worth being explicit about *why*, because v2 builds directly on it:

```
        ┌─────────────────────────────────────────┐
        │   ONE sealed payload shape (CWSYNC1)    │
        │   ECDH P-256 → HKDF → AES-GCM           │
        └────────────────┬────────────────────────┘
                         │
     ┌───────────┬───────┴───────┬──────────────┐
     │           │               │              │
  Relay      LAN / WiFi       File          (P2P?)
  (HTTP)     (HTTP direct)   (.cwsync)      (not built)
     │           │               │              │
     └───────────┴───────┬───────┴──────────────┘
                         │
        ┌────────────────┴────────────────────────┐
        │  ONE merge function per side            │
        │  coach:  applyPacket() + remapClientId()│
        │  client: applyCoachPacket()             │
        │  both:   seq replay-guard, id-stable    │
        └─────────────────────────────────────────┘
```

**The transport does not change the data, the crypto, or the merge.** That's why "does it matter if it's localhost or your server or ours?" already has the answer *no* — the relay is a dumb encrypted mailbox. It stores ciphertext it cannot read and forwards it. Swapping the URL from `localhost:4000` to `relay.coachwright.app` changes nothing else in the system.

### What v1 got wrong / left incomplete

Being honest about the gaps, because these are what v2 fixes:

1. **No transport abstraction in code.** The *concept* is unified; the *implementation* isn't. `doCloudSync`, `syncOverLan`, and the file import each hand-roll their own fetch/read + call the same merge. Adding a 4th transport today means a 4th copy.
2. **No discovery.** LAN sync requires the client to type `http://192.168.1.5:4000`. That is not professional software.
3. **No automatic transport selection.** The user picks. They shouldn't have to.
4. **Identity is tied to the install, not the person.** Reinstall = re-pair with every client.
5. **No connection state anywhere in the UI.** A coach cannot tell at a glance whether a client is reachable.
6. **No P2P.** Two devices on different networks need the relay, even for a one-off transfer.

---

## 2. The v2 principle

> **The user chooses a *relationship*, never a *transport*.**
>
> A coach pairs with a client once. After that, the app picks the best available path every single time, silently, and tells the user only what they'd actually want to know: *"synced 2 minutes ago"* or *"3 changes waiting — you'll both need to be online."*

Transport becomes an implementation detail the same way your email client doesn't ask you which SMTP relay to use.

---

## 3. The design: a Transport interface + a broker

### 3.1 One interface, every path

```ts
// lib/sync/transport.ts  (NEW — the core v2 abstraction)

export type TransportId = 'loopback' | 'lan' | 'relay' | 'p2p' | 'file'

export interface TransportCapabilities {
  /** Can carry a packet without user interaction. `file` cannot. */
  automatic: boolean
  /** Both parties must be online simultaneously (lan, p2p). */
  requiresSimultaneous: boolean
  /** Rough cost hint for ordering: lower is preferred. */
  cost: number
  /** Max practical payload — relays cap body size; file does not. */
  maxBytes: number
}

export interface Transport {
  id: TransportId
  capabilities: TransportCapabilities
  /** Cheap, cached, non-throwing. Drives the UI's connection dot. */
  probe(peer: Peer): Promise<Reachability>
  /** Send one sealed packet. Never sees plaintext. */
  send(peer: Peer, sealed: SealedPacket): Promise<SendResult>
  /** Collect any sealed packets waiting for us. */
  receive(peer: Peer): Promise<SealedPacket[]>
}

export type Reachability =
  | { state: 'reachable'; latencyMs: number }
  | { state: 'unreachable'; reason: string }
  | { state: 'unknown' }          // not probed yet
  | { state: 'unsupported' }      // e.g. lan outside Electron
```

Every existing path becomes an implementation of this. `applyPacket`/`applyCoachPacket` stay exactly as they are — they already take a packet and don't care where it came from.

### 3.2 The broker picks the path

```ts
// lib/sync/broker.ts (NEW)
export async function syncWith(peer: Peer, opts?: { transports?: TransportId[] }): Promise<SyncOutcome>
```

Selection order, best-first:

| Order | Transport | Chosen when | Notes |
|---|---|---|---|
| 1 | `loopback` | Same device, two profiles | Studio: front-desk + trainer on one PC |
| 2 | `lan` | Peer discovered on the same network | Fastest, zero infrastructure, never leaves the building |
| 3 | `p2p` | Both online, NAT traversable | *If we build it — see §6* |
| 4 | `relay` | A relay URL is configured and reachable | Works across any network, async |
| 5 | `file` | Nothing else available | Always works. Requires a human. |

The broker tries in order, records why each failed, and surfaces **one** honest sentence to the user. It never silently does nothing.

**Critical rule:** the broker is the *only* thing that knows about transports. Feature code calls `syncWith(peer)` and is done. That's what makes "it shouldn't matter where it's hosted" true in code and not just in a diagram.

### 3.3 Discovery — the missing professional-feel piece

| Environment | Mechanism |
|---|---|
| **Desktop (Electron)** | mDNS / Bonjour (`_coachwright._tcp`). The coach app advertises; clients on the same WiFi see "Sam's Studio" appear in a list. No IP typing, ever. |
| **Browser** | Cannot do mDNS. Falls back to QR (already built) or a relay-published LAN hint. |
| **Relay-assisted LAN hint** | On sync, each side reports its local IP to the relay *encrypted*. Peers on the same network then know where to try directly. Cheap, and it makes LAN work without mDNS. |

### 3.4 Making all four tiers genuinely identical

This is the concrete answer to *"it shouldn't matter if it's localhost, hosted by us, or hosted by them."*

| Concern | How it's made identical |
|---|---|
| **Wire format** | Already identical — one `CWSYNC1` sealed packet. No tier-specific fields. |
| **Auth** | One scheme: per-coach API key. Localhost self-host uses the same header, just with a key you generated. *(v1 wart: localhost defaults to a shared legacy key. v2 makes per-coach keys universal, with a first-run generated key for self-hosters.)* |
| **URL handling** | One normalizer. `localhost:4000`, `192.168.1.5:4000`, `https://relay.coachwright.app` all pass through the same validation + trailing-slash strip. |
| **Migration** | Changing tier **must not require re-pairing**. Pairing keys belong to the *relationship*, not the server. Already true; v2 adds a test that asserts it. |
| **Capability reporting** | The relay exposes `GET /capabilities` (version, max payload, features). The app adapts instead of assuming. Lets an old app talk to a new relay and vice versa. |
| **Health & honesty** | One connection-status component, fed by `probe()`, used everywhere. |

### 3.5 Identity portability (fixes gap #4)

Today a reinstall generates a fresh keypair, orphaning every pairing.

**v2: the identity keypair moves with the backup.** It's already in `Trainer.syncIdentity`, which the backup includes — but restore should explicitly surface it: *"Restoring will also restore your device identity, so your 14 paired clients keep working."* Plus an explicit **"Move to a new computer"** flow that does backup → restore → verify pairings, as one guided operation rather than three manual steps.

---

## 4. What the user actually sees

Professional software = the machinery is invisible until it matters.

**Coach, client list:**
```
Sam Rivera        ● Synced 2m ago
Jordan Lee        ◐ 3 changes waiting
Alex Chen         ○ Not paired
```

**Hovering "3 changes waiting":**
> Jordan's phone hasn't been online since Tuesday. Their logs will arrive
> automatically next time they open Companion. Nothing is lost.

**Settings → Connection** (one page, replaces the tier picker):
```
How your devices talk to each other

  ● Automatic  (recommended)
    Uses the fastest available: same-network first, then your relay.
    Currently: LAN available · Relay connected · 14 clients paired

  ○ This device only
    Nothing leaves this computer. Move data with files.

  Relay:  relay.coachwright.app         [Test]  ✓ 41ms
          ↳ or run your own — [Setup guide]
```

Note what's gone: the three-tier radio ("fully local / self-hosted / managed"). That was us exposing our architecture to the user. **The tier becomes a consequence of whether a relay URL is set**, and the *only* real choice is "automatic vs. this-device-only" — which is a privacy choice, and worth asking.

---

## 5. Studio topology (new in v2)

Studio has a shape v1 never modelled: **many staff, one business, shared clients.**

```
   Front desk PC ──┐
   Trainer A ──────┼── Studio Hub ──── Clients' phones
   Trainer B ──────┘   (one machine
   Trainer C ──────┘    or our cloud)
```

- The **Studio Hub** is the same relay binary, just designated authoritative for the business.
- Staff devices sync to the hub over LAN when in the building, relay when out. Same broker, same rules.
- Client pairings belong to the **business**, not the individual trainer — so a departing trainer doesn't take the pairing with them (their *client book* portability already exists via `db/portability.ts`; this is about the crypto relationship).
- Conflict policy needs to be stricter than newest-wins for shared records — see §7.

---

## 6. P2P — DECIDED: build it (WebRTC) *and* LAN discovery

**Decision (Caleb, 2026-07-27): build true WebRTC P2P in addition to LAN discovery.**

So this section is now a build plan, not a recommendation. The honest constraints below don't go away because we chose to build it — they have to be *designed around and disclosed*, which is what the rest of this section does.

### 6.1 The four-path stack

With P2P added, the broker (§3.2) has five transports and a genuinely complete story:

| Path | Servers involved | Works when |
|---|---|---|
| **LAN** | none | Same network |
| **P2P direct** | signalling only (a few KB, no payload) | Both online, NAT traversable (~85–95%) |
| **P2P relayed (TURN)** | TURN carries encrypted payload | Both online, NAT hostile |
| **Relay (store & forward)** | our/their relay holds ciphertext | Either party offline |
| **File** | none | Always |

### 6.2 What we must be honest about

These get stated in the UI and the marketing, not buried:

1. **Signalling is a server.** WebRTC needs a rendezvous to exchange SDP offers and ICE candidates. It carries *no training data* — only "here's how to reach me". We say exactly that: *"a few kilobytes of connection details, never your data."*
2. **TURN fallback carries payload.** When direct traversal fails, TURN relays the bytes. They're **still end-to-end encrypted** (our AES-GCM layer sits above DTLS, so TURN sees ciphertext even if DTLS terminated there — it doesn't). The UI must show which path is in use rather than implying "direct" when it isn't.
3. **P2P requires simultaneity.** Coaching is asynchronous. P2P is an *optimisation* for live moments (in-session, a live call, a big photo batch), never the default for routine sync. The broker treats it as such — `requiresSimultaneous: true` already exists in the interface for this reason.

### 6.3 Connection indicator (non-negotiable)

The user always knows which path they're on:

```
  Jordan Lee     ●  Direct — peer to peer         (no server involved)
  Sam Rivera     ◐  Direct via relay assist       (encrypted, routed)
  Alex Chen      ○  Waiting — will sync when Alex opens Companion
```

### 6.4 Signalling design

- **Reuse the existing relay** as the signalling server. It already has per-coach API keys, pairing knowledge, and E2EE plumbing. No new service, no new auth model, and self-hosters get P2P for free with the relay they already run.
- **A self-hoster's relay is their signalling server.** So "hosted by them" gets full P2P with zero dependency on us — which is the point.
- **Fallback chain if no relay is configured at all:** LAN → file. Honest, and stated at pairing time: *"P2P needs a rendezvous point. Use ours, run your own, or stick to same-network and file sync."*
- **ICE servers:** ship a STUN list (public STUN is free and carries no data). TURN is **opt-in and tier-gated** — it costs real bandwidth, so it belongs to the paid cloud tiers ([06](06-EDITIONS-PRICING.md)).

### 6.5 Security notes

- Our `CWSYNC1` sealed packet rides **inside** the data channel. DTLS is transport security; our envelope is the actual end-to-end guarantee. **Never** rely on DTLS alone — a compromised TURN or signalling server must still learn nothing.
- **IP address exposure is a real privacy consideration**: P2P reveals each peer's IP to the other. For a coach↔client relationship that's usually acceptable, but it must be disclosed at enable time, and P2P must be individually disableable per relationship.
- Signalling messages are authenticated with the existing pairing key — an attacker who compromises the signalling server cannot inject a fake peer.

### 6.6 Build cost (honest)

This is the largest single engineering item in the connectivity plan: ICE/STUN/TURN handling, connection state machine, reconnection, data-channel chunking for large payloads, and a genuinely hard testing matrix (symmetric NAT, CGNAT, corporate firewalls, mobile networks). Budget accordingly, and treat §8 step 8 as its own phase rather than a bullet.

---

## 7. Conflict policy

v1 uses newest-`updatedAt`-wins everywhere. Fine for one coach + one client. Not fine for Studio.

| Record type | Policy | Why |
|---|---|---|
| Client profile, programs | Newest-wins | Single logical author |
| **Session logs** | **Union by id, never overwrite** | Two trainers logging the same client must not clobber each other |
| Check-ins, metrics | Union by (clientId, date, key) | Same |
| Messages | Union by id (already) | Proven in v1 |
| Invoices / payments | **Hub authoritative** | Money needs one source of truth |
| Settings | Per-device, never synced | Theme etc. are local preferences |

Anything that can't be auto-resolved surfaces in a **Conflicts** view. It should be nearly always empty — but silently picking a winner with money or training history is not acceptable.

---

## 8. Build order

| Step | Deliverable | Risk |
|---|---|---|
| 1 | ✅ **DONE (S15)** — `lib/sync/transport.ts` + `features/sync/transports/relayTransport.ts`; `SyncCenterPage` rewired to the broker | Low — pure refactor, tests stayed green |
| 2 | ✅ **DONE (S15)** — `lib/sync/broker.ts`, 16 tests, verified live on both success and dead-relay paths | Low |
| 3 | `probe()` + connection-status UI everywhere | Low |
| 4 | mDNS discovery (Electron) + relay-assisted LAN hint | Medium — needs real two-device testing |
| 5 | Per-coach keys universal; `GET /capabilities`; URL normalizer | Low |
| 6 | Identity portability + "Move to a new computer" flow | Medium — data-loss adjacent, needs care |
| 7 | Studio hub topology + conflict policy + Conflicts view | High — most new logic |
| 8 | **WebRTC P2P** — signalling on the existing relay, STUN, connection state machine, path indicator | High — treat as its own phase (§6.6) |
| 9 | TURN fallback (tier-gated, paid cloud only) | Medium — mostly ops/cost, not code |

**Testing note carried from v1:** none of this is "done" until it's been run on two real machines. The v1 LAN loop was silently broken for a whole session because it was only ever verified against a stub. Step 4 needs real hardware, and that's also the T2 pass that's still outstanding.
