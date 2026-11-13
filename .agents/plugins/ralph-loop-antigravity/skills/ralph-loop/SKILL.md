---
name: ralph-loop
description: Autonomous iterative development engine using persistent state files (PRD.md, progress.txt) for continuous self-healing verification runs.
---

# Ralph Loop Iterative Engine

Manages autonomous progress against a formal Product Requirements Document (`PRD.md`) and tracking log (`progress.txt`).

## Workflow

1. **State Initialization:**
   - Ensure `PRD.md` defines user stories, exact requirements, and completion acceptance criteria.
   - Initialize or update `progress.txt` with itemized status checklist.

2. **Autonomous Execution:**
   - Pick the highest-priority incomplete requirement.
   - Implement surgical changes.
   - Run compilation and tests.
   - Update `progress.txt` with concrete proof of completion.

3. **Self-Healing Loop:**
   - If tests fail, diagnose without blind retry.
   - Repeat until all criteria in `PRD.md` are 100% verified.
