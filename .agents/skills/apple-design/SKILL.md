---
name: apple-design
description: Fluid interfaces and tactile design patterns, including zero touch-down latency (scale 0.97), 1:1 continuous gesture tracking, interruptible spring physics, and hairline borders.
---

# Apple Design & Fluid Interfaces

Provides fluid, human-centric tactile behaviors and physics for interactive mobile and desktop applications.

## Principles & Mechanics

### 1. Instantaneous Touch-Down Feedback (`scale(0.97)`)
Buttons and touchable surfaces must immediately scale down on touch pointer down:
- Scale factor: `0.97` to `0.98`
- Latency: 0ms trigger on pointer down (not waiting for pointer up)
- Spring back smoothly on release or cancel

### 2. 1:1 Continuous Gesture Tracking
Gestures (pulls, swipes, dismissals) must remain anchored directly to finger coordinates without artificial lag or snapping animations until release.

### 3. Interruptible Spring Physics
All dynamic animations (sheets, drawers, modal alerts) must use interruptible spring curves (damping ratio ~0.8 to 0.85). If the user grabs or touches during transition, it immediately attaches without jarring jumps.

### 4. Hairline Borders & Layered Elevations
- Avoid fuzzy heavy box-shadows.
- Use 0.5px / hairline borders with subtle ambient diffuse elevation.
- Dark mode surfaces use distinct luminance steps rather than pure black shadows.
