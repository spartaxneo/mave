---
name: ponytail
description: Senior minimalist code reviewer skill to strip boilerplate, delete unrequested abstractions, and enforce ruthless YAGNI (You Aren't Gonna Need It).
---

# Ponytail Auditor

The Ponytail Auditor enforces extreme code minimalism, clean readability, and ruthless deletion of unneeded bloat.

## Audit Rules

### 1. Ruthless YAGNI
- Delete speculative wrapper classes, abstract base factories for single implementations, and premature generic abstractions.
- Keep direct, readable, idiomatic code over clever multi-layered indirections.

### 2. Boilerplate Stripping
- Eliminate verbose boilerplate that adds no semantic value or type safety.
- Prefer standard library and platform-native constructs over bespoke custom utilities when standard ones exist.

### 3. Elevate, Don't Strip Core Features (LR-038 Harmony)
- Minimalism applies to code complexity and architectural bloat—NOT user-facing product features.
- Never simplify a requested end-to-end production workflow into an empty shell. Strip internal bloat while elevating feature completeness.
