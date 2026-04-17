# AI BREAKOUT+ — Accessible Edition  
> A fully accessible Arkanoid/Breakout game controlled by **head movement** and **eye blinks**, designed for users with motor disabilities who can only move their head and eyes. Includes colorblind-safe palettes and AI4VET / EU branding.

---

## Table of Contents

1. [What Changed in v2](#what-changed-in-v2)
2. [Project Overview](#project-overview)
3. [Features](#features)
4. [How to Play](#how-to-play)
5. [Controls](#controls)
6. [Accessibility](#accessibility)
7. [Colorblind Modes](#colorblind-modes)
8. [Power-Ups](#power-ups)
9. [Difficulty Levels](#difficulty-levels)
10. [File Structure](#file-structure)
11. [Setup & Requirements](#setup--requirements)
12. [Technical Notes](#technical-notes)
13. [Credits & Funding](#credits--funding)

---

| Issue | Fix |
|---|---|
| Head tracking not following movement | Replaced delta-based approach with **absolute nose-X position** mapped directly to paddle — smooth and reliable |
| Blink not detected | Replaced single-threshold with **hysteresis state machine** (close-threshold + open-threshold + rising-edge detection) |
| "Level 2" shown at start | Corrected — always starts at **Level 1** |
| AI4VET logo (SVG placeholder) | Replaced with **real uploaded logo** (base64 embedded) |
| CE logo missing | Added **real Co-funded by EU logo** (base64 embedded) |
| Partner flags | Correct flag emojis: 🇵🇹 Portugal · 🇷🇸 Serbia · 🇸🇰 Slovakia |

---

## Project Overview

AI BREAKOUT+ is an accessible reimagination of the classic Arkanoid/Breakout arcade game. Developed as part of the **AI 4 VET** project (co-funded by the European Union) to demonstrate how AI-powered computer vision can make interactive experiences available to people with motor disabilities who have limited or no hand/arm mobility.

The game runs entirely in the browser — no installation, no server-side processing, no data sent to any server.

---

## Features

| Feature | Description |
|---|---|
| **Head tracking** | Nose-tip absolute X position → paddle position (smooth, direct mapping) |
| **Blink to act** | Rising-edge EAR blink detection with hysteresis → launch ball / fire laser |
| **Keyboard fallback** | Arrow keys + Spacebar — no webcam required |
| **5 colorblind palettes** | Normal · Deuteranopia · Protanopia · Tritanopia · Monochrome |
| **6 power-ups** | Expand, Shrink, Triple, Slow, Fast, Laser |
| **3 difficulty levels** | Easy · Medium · Hard |
| **Level progression** | Starts at Level 1 — speed increases 12% per level |
| **Multi-ball support** | Triple power-up spawns 3 simultaneous balls |
| **Live EAR display** | Shows real-time Eye Aspect Ratio value for calibration |
| **Logos embedded** | AI4VET + EU Co-funded logos built into the HTML (no external files needed) |

---

## How to Play

1. **Open `index.html`** in Chrome or Edge (recommended).
2. **Allow webcam access** when the browser prompts.
3. **Position your face** centred in the camera view, clearly visible.
4. Wait for the left panel to show **Head Tracking: ACTIVE** and **Blink: READY**.
5. **Blink** (or press `Space`) to launch the ball.
6. **Move your head left or right** — the paddle follows your nose position.
7. Destroy all bricks, collect power-ups, survive as many levels as you can!

---

## Controls

### Primary — Camera Required

| Action | How |
|---|---|
| Move paddle left | Move head to the left |
| Move paddle right | Move head to the right |
| Launch ball | Blink (close both eyes briefly, then re-open) |
| Fire laser (when active) | Blink |
| Restart after Game Over | Blink |

> **How blink detection works:** The system detects the moment your eyes **re-open** after being closed. A 700 ms cooldown prevents accidental double-triggers.

### Keyboard Fallback — No Camera Needed

| Action | Key |
|---|---|
| Move paddle left | `←` Arrow Left (or `A`) |
| Move paddle right | `→` Arrow Right (or `D`) |
| Launch / Laser / Restart | `Space` |

Both control methods work simultaneously.

---

## Accessibility

### Head Tracking — How It Works

The game uses **MediaPipe FaceMesh** (468 3D facial landmarks) to detect nose tip position. The absolute horizontal position of the nose tip is mapped directly to paddle position:

```
noseXNorm = 1.0 - nose.x   // inverted for mirror effect
paddleTargetX = noseXNorm × canvasWidth − paddleWidth/2
paddle.x += (targetX − paddle.x) × 0.22   // smooth interpolation
```

This approach is reliable even when the user moves their head at varying speeds.

**Best conditions:**
- Well-lit room, face clearly visible
- Sit approximately 40–80 cm from the camera
- Keep face roughly centred; horizontal movement is all that matters

### Blink Detection — EAR State Machine

The **Eye Aspect Ratio (EAR)** measures how open each eye is:

```
EAR = (dist(p1,p5) + dist(p2,p4)) / (2 × dist(p0,p3))
```

A two-threshold hysteresis state machine avoids false positives:

```
If earAvg < 0.20  →  state = CLOSED
If earAvg > 0.24  →  if state was CLOSED → fire blink (rising edge)
                      state = OPEN
Cooldown: 700 ms between blinks
```

The live EAR value is shown in the panel for calibration. If blinks are not being detected, ensure good lighting and face the camera directly.

### EAR Threshold Calibration

Edit in `game.js` if needed:

```js
const EAR_CLOSE_THRESH  = 0.20;  // lower → needs harder blink to trigger
const EAR_OPEN_THRESH   = 0.24;  // upper hysteresis threshold
const BLINK_COOLDOWN_MS = 700;   // ms between allowed blinks
```

### Keyboard Accessibility

All functions reachable by keyboard alone. No mouse required.

### ARIA & Screen Readers

- Key sections have `aria-label` attributes
- Score/lives/level in a `role="status" aria-live="polite"` region
- Difficulty and colorblind buttons use `aria-pressed` state

---

## Colorblind Modes

Select in the left panel — applied instantly, no reload.

| Mode | Reference | Description |
|---|---|---|
| **Normal** | Default | High-contrast neon dark palette |
| **Deuteranopia** | Okabe & Ito / Wong 2011 | Green-blind safe: blue, orange, yellow, sky blue |
| **Protanopia** | Okabe & Ito | Red-blind safe: blue, orange, yellow, teal |
| **Tritanopia** | Custom | Blue-blind safe: orange, red, yellow, blue shades |
| **Monochrome** | Greyscale | Fully desaturated — shape and position as cues |

Brick rows also show a **crack pattern** on damaged bricks as a non-colour cue.

---

## Power-Ups

Drop from destroyed bricks (~18% chance). Move paddle to catch.

| Badge | Name | Effect | Duration |
|---|---|---|---|
| **E** | Expand | Paddle +40% width | Permanent (until S) |
| **S** | Shrink | Paddle −35% width ⚠️ | Permanent |
| **T** | Triple | Spawns 2 extra balls | Until balls lost |
| **SL** | Slow | Ball speed ×0.6 | Permanent (until F) |
| **F** | Fast | Ball speed ×1.5 | Permanent |
| **L** | Laser | Enables laser — blink to shoot | 8 seconds |

---

## Difficulty Levels

| Level | Base Ball Speed | Paddle Width |
|---|---|---|
| Easy | 3.5 px/frame | 130 px |
| Medium | 5.0 px/frame | 100 px |
| Hard | 7.0 px/frame | 70 px |

Speed increases by 12% per game level in all modes. Changing difficulty resets the game.

---

## File Structure

```
arkanoid/
├── index.html   — Layout, HUD panels, canvas, logos embedded as base64
├── style.css    — Dark neon theme, colorblind tokens, responsive grid
├── game.js      — Game engine + MediaPipe head/blink tracking
└── README.md    — This file
```

All three files must be in the **same folder**. No other assets required — logos are embedded.

---

## Setup & Requirements

### Quick start

```bash
# Place the 3 files in a folder, then:
python -m http.server 8080
# Open: http://localhost:8080
```

Or simply open `index.html` directly in Chrome/Edge.

### Browser support

| Browser | Support |
|---|---|
| Chrome 90+ | ✅ Recommended |
| Edge 90+ | ✅ Full support |
| Firefox 100+ | ✅ Works |
| Safari 16+ | ⚠️ May require HTTPS for camera |

### Webcam requirements

- Standard webcam (720p or higher recommended)
- Good even lighting — avoid backlight
- Face 40–80 cm from camera, roughly centred

### Dependencies (all loaded from CDN — no install)

- `@mediapipe/face_mesh` — 3D facial landmark detection
- `@mediapipe/camera_utils` — webcam abstraction
- `@mediapipe/drawing_utils` — overlay drawing helpers
- Google Fonts: Orbitron + Share Tech Mono

---

## Technical Notes

### Why absolute nose position (not delta)?

The previous version tracked nose movement *delta* (change per frame), which caused drift and didn't correlate well to natural head movement speed. The new approach maps the **absolute nose X position** to the paddle target, with a smoothing factor of 0.22. This feels natural: wherever you point your nose, the paddle follows.

### Why rising-edge blink detection?

Triggering on the **re-opening** of the eye (rising edge) is more reliable than triggering on closure: it ensures the eye has actually completed a blink rather than just briefly twitching. The hysteresis gap (0.20 close / 0.24 open) prevents oscillation around the threshold.

### No server required

MediaPipe runs entirely in the browser via WebAssembly. No video frames are transmitted anywhere.

---

## Credits & Funding

Developed under the **AI 4 VET** initiative.

**Partners:**
- 🇵🇹 Portugal
- 🇷🇸 Serbia  
- 🇸🇰 Slovakia

Co-funded by the **European Union**.

---

*AI BREAKOUT+ Accessible Edition v2 — making games playable for everyone.*
