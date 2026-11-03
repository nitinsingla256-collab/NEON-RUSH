# NEON RUSH

A browser-first, canvas-rendered arcade highway racer built with vanilla HTML, CSS and JavaScript. No build step or external game engine is required.

## Run

Open `index.html` in a modern browser, or serve this folder locally:

```sh
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Controls

- **← / A** — steer one lane left
- **→ / D** — steer one lane right
- **Space** — pause or resume
- **Escape** — pause a run, or return to the main menu
- **Touch** — use the left and right on-screen steering buttons

Avoid traffic, collect the glowing coins, build a clean-run multiplier, and spend banked coins on new cars in the garage. Scores, preferences, milestones and unlocks are stored in this browser's LocalStorage. Audio effects and a quiet synthesized night-drive bed are generated with Web Audio; sound is optional.
