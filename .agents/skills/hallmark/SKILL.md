---
name: hallmark
description: Anti-AI-slop design system guidelines enforcing 1 core idea per screen, asymmetric macrostructures, high-contrast surfaces, and complete interactive states.
---

# Hallmark Design System

The Hallmark Design System eliminates generic, repetitive AI template layouts ("AI slop") and enforces distinct, purposeful UI architecture.

## Core Tenets

### 1. One Core Idea Per Screen
Each view or modal must have a single dominant visual hierarchy and functional anchor. Avoid generic grids of identical cards or competing primary actions.

### 2. Asymmetric Macrostructures
Break monotonous columnar layouts with purposeful asymmetrical rhythm—lead cards, featured hero banners, edge-to-edge horizontal rails, and differentiated list items.

### 3. High-Contrast Tactile Surfaces
Use explicit contrast boundaries between background canvases, cards, and actionable controls. Border radiuses must consistently HardClip (`clipBehavior: Clip.hardEdge`).

### 4. Complete Interactive States
Every control, input, and card must define all 5 states:
- Default
- Pressed / Active (tactile response)
- Hover / Focus (keyboard / cursor navigation)
- Disabled (clear low-contrast intent)
- Error / Empty (actionable resolution button)
