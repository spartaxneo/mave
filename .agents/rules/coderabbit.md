# CodeRabbit 4-Pass Code Review Gate

Before any non-trivial code modification is finalized or committed, it must pass this 4-stage review:

## Pass 1: Diff & Structural Integrity
- Clean additions/removals; no stray files, accidental formatting noise, or misplaced debug logs.
- Strict directory boundaries respected.
- No deletion of required features, schemas, or security rules (LR-038).

## Pass 2: Logic, Null-Safety & Chained Guards
- Guarded chained access enforced: `(a?.b ?? '').trim()`, `(a?.list ?? const []).contains(...)` (LR-070).
- State persistence race safety: mutations queued during async fetches replayed in exact order (LR-127).
- Proper error recovery in streams and Futures; no unhandled rejections or silent drop-offs.

## Pass 3: Security, Tenant Scope & Privacy
- Tenant boundary enforcement: never combine OR paths with broad wildcards (LR-126).
- Secret suppression: zero raw tokens, credentials, or keys logged or exposed (LR-083, LR-043).
- Strict payment reconciliation: match captured ID, exact amount, and currency (LR-111).
- PII masking and statutory compliance (DPDP phone masking, IT Act) (LR-071, LR-134).

## Pass 4: Performance, Hygiene & Design Density
- WebP client-side image optimization and bounding (LR-009, LR-044).
- Infinite scroll elimination on mobile in favor of horizontal rails (LR-029, LR-037).
- Bounded flex within scrollable containers (LR-110).
- Instant UI translation `.tr()` with brand/enum protection (LR-048, LR-052).
