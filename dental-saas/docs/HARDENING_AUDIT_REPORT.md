# Production Hardening Audit Report — DentalSaaS Sovereign Governance (v11.0)

## 1. AUTH HARDENING STATUS: COMPLETE
- **Strict Isolation**: `platformProtect` and `orgProtect` correctly enforce token type segregation.
- **Refresh Rotation**: `RefreshToken` rotation with reuse detection and `tokenVersion` kill-switch is fully implemented.
- **CSRF Protection**: CSRF validation is present on mutation routes (`changePassword`, `refresh`, etc.).
- **Cookie Security**: `HttpOnly`, `Secure` (in production), and `SameSite: strict` are enforced.

## 2. FINANCIAL HARDENING STATUS: PARTIAL
- **Minor Unit Precision**: Strictly enforced.
- **Idempotency**: Stripe idempotency keys used in `RefundService`.
- **OAV Protection**: Optimistic logic used to prevent stale ledger updates.
- **[RISK]**: Stripe refund is executed *before* database persistence. A crash between Stripe and DB results in data inconsistency.
- **[RISK]**: Lack of MongoDB Transaction usage for multi-document financial mutations (Invoice + Ledger + Audit).

## 3. WEBHOOK HARDENING STATUS: CRITICAL RISK
- **[BLOCKER]**: No Stripe Signature Verification. The handler accepts raw `req.body`, allowing anyone to forge payment events.
- **Idempotency**: `charge.dispute.created` is idempotent via `stripeDisputeId` check.
- **Event Delegation**: Handlers delegate correctly; however, no business logic session is used.

## 4. SLA HARDENING STATUS: COMPLETE
- **Distributed Safety**: `acquireLock` via Redis-backed `cronLockService` ensures jobs run once across nodes.
- **Idempotency**: Job filters by `slaBreached: false` and uses OAV-safe `save()`.

## 5. STATE MACHINE STATUS: PARTIAL
- **Centralization**: Transitions (e.g., `OPEN` -> `IN_PROGRESS`) are handled at the controller level rather than the model/service layer.
- **[RISK]**: No transition guards. A `CLOSED` ticket can be forcefully set to `IN_PROGRESS` through `assignTicket` or `addMessage` logic bypass.

## 6. AUDIT CHAIN STATUS: PARTIAL
- **Chaining**: Correct `previousHash` -> `currentHash` cryptographic link.
- **[RISK]**: "Chain Split" vulnerability. If two audit records are created concurrently for the same organization, they may fetch the same `prevHash`, breaking the linear chain.
- **Atomicity**: Audit append is not atomic with the business mutation (no transaction).

## 7. USER GOVERNANCE STATUS: COMPLETE
- **Superadmin Protection**: Structural guards prevent deletion/modification of the last superadmin.
- **2FA Hardening**: Failed attempt lockout and IP tracking are present.
- **Revocation**: `tokenVersion` correctly invalidates all existing sessions.

## 8. INFRASTRUCTURE STATUS: PARTIAL
- **Stripe Stub**: `stripe.adapter.js` is currently a SIMULATION. Production readiness requires full SDK integration.
- **Worker Safety**: BullMQ usage is planned but not currently visible in core support logic.

## 9. CONCURRENCY RISK ANALYSIS: PARTIAL
- **OAV Guarded**: Most mutations use version increments.
- **Locking**: Scheduler uses distributed locks.
- **[RISK]**: Webhook handlers lack local concurrency locks, relying solely on DB unique indexes for `stripeDisputeId`.

## 10. CRITICAL BLOCKERS BEFORE PRODUCTION
1. **Implement Stripe Signature Verification**: Use `stripe.webhooks.constructEvent`.
2. **Replace Stripe Adapter Stubs**: Integrate real Stripe Node SDK.
3. **Implement Ticket Transition Guards**: Prevent illegal status jumps in `Ticket.js`.
4. **Transition to MongoDB Sessions**: Bind Financial Mutations + Audit Append in a single transaction.

---

## 11. RECOMMENDED IMMEDIATE FIXES
1. **Move Audit to `pre("save")`**: (Wait, `auditService` needs contextual actor info). Use a `cls-hooked` style context or explicit transactions.
2. **Hardware-Anchored Keys**: Move `JWT_SECRET` and Stripe keys to a Secret Manager.

## 12. RECOMMENDED ARCHITECTURAL IMPROVEMENTS
1. **Domain Events for Auditing**: Use the `EventBus` to trigger audit logs asynchronously, or use a "Transactional Outbox" pattern for audit reliability.
2. **Strict State Machine (v11.5)**: Use a library or formal schema `pre` hook to strictly define allowed status transitions.
