# 03/15 Arcade AI Gamejam 1st Place project

![1st_place](1st_place.jpeg)

# Temporal Drift — AI-Generated First-Person Adventure

> *A browser-based first-person game where AI generates the world around you, and every NPC is a living chatbot with a secret to share.*

Built for the **GameDev Hackathon** — March 15, 2025 · Tool Track.

---

## Concept

You wake up in your bedroom. Your mother Virginie is there. Something feels off.

------------------------------------------------------------SPOILER WARNING------------------------------------------------------

Through a series of AI-powered conversations and AI-generated worlds, you slowly uncover your true identity: **a time traveler**. Your mission — prevent the assassination of King Henri IV of France on May 14, 1610, on Rue de la Ferronnerie, Paris.

To win, you must convince Henri IV to turn his carriage back to the Louvre — before François Ravaillac strikes.

---

## Requirements

- **ANTHROPIC_API_KEY** — entered in-game at startup (or set in `.env`). For hackathon judging purposes, contact me if you need a temporary key.
- **TRIPO_API_KEY** — set in `.env` for 3D model generation. Without it, characters and objects render as procedural geometry.

Create a `.env` file in the project root:

```env
TRIPO_API_KEY=your_tripo_key_here
ANTHROPIC_API_KEY=your_claude_key_here
PORT=3000
```

---

## Setup & Run

```bash
npm install
node server.js
```

Open [http://localhost:3000](http://localhost:3000).

Pre-generation of 3D characters and assets begins automatically at server startup. Static models cache to `.model-cache/` — subsequent restarts are instant. Animated idle variants generate in the background via Tripo's rig → retarget pipeline (~10–15 min).

Check asset status: `http://localhost:3000/api/pregenerated/status`

---

## How to Play

| Input | Action |
|---|---|
| Click canvas | Capture mouse (pointer lock) |
| `W A S D` / Arrows | Move |
| Mouse | Look around |
| `E` | Interact with objects, NPCs, portals |
| `Escape` | Close any panel |

**Game loop:**

1. Start in your bedroom. Talk to **Virginie** (your mother) — she'll nudge you toward your destiny.
2. Use the **computer** (`E`) to generate a new world by describing it in plain text.
3. Walk through the glowing **cyan portal** to enter a hallway leading to your new room. The room loads during the walk.
4. Every generated room has an **NPC chatbot** and an **interactable object**.
5. All NPCs hint toward **Marty McFly** — type `Marty McFly` in the computer to visit him.
6. Marty quizzes you on Henri IV's death. If you don't know, he'll send you to **Alexandre Dumas** — type `Alexandre Dumas`.
7. Dumas knows everything: **May 14, 1610 · Rue de la Ferronnerie · Ravaillac**.
8. Return to Marty with all three facts — he'll tell you to find Henri IV.
9. Type `Rue de la Ferronnerie 1610` in the computer to reach the Paris street.
10. Name Ravaillac to Henri IV and convince him to return to the Louvre. **You win.**

---

## Architecture

```
index.html          — Single-page app shell + UI panels
server.js           — Express: Claude proxy, Tripo proxy, world gen, NPC chat, pre-generation
src/
  main.js           — Game loop, scene management, hallway transitions, UI logic
  world.js          — Three.js scene builders (bedroom, rooms, hallway, tunnels, detail sets)
  player.js         — First-person camera + pointer lock controller
  ai-client.js      — Client → /api/generate-world and /api/chat-npc
  room-manager.js   — Persistent room graph; NPC chat histories survive transitions
.model-cache/       — Cached GLB models (served at /models/)
```

### World Generation

The computer terminal sends a plain-text prompt to `/api/generate-world`. Claude generates a structured JSON room definition (dimensions, colors, NPC personality, object description). Tripo3D simultaneously generates GLB models for the NPC and object. The room is built in a staging Three.js scene while the player walks the hallway, then transferred to the main scene on arrival.

### NPC Chat

Each NPC is backed by Claude (`claude-haiku-4-5-20251001`). Conversation history persists per NPC per room for the full session. All generic NPCs share a hidden narrative layer nudging the player toward Marty McFly. Action descriptions (`*like this*`) are stripped server-side before delivery.

### Pre-Generated Assets

Seven characters and objects are generated via Tripo at server startup and cached:

| Asset | File | Animated |
|---|---|---|
| Virginie (mother) | `virginie.glb` | yes — idle |
| Henri IV | `henri-iv.glb` | yes — idle |
| Marty McFly | `marty-mcfly.glb` | yes — idle |
| Alexandre Dumas | `alexandre-dumas.glb` | yes — idle |
| DeLorean Time Machine | `delorean.glb` | — |
| Royal Carriage | `royal-carriage.glb` | — |
| Dumas's Bookshelves | `dumas-bookshelf.glb` | — |

Animated models use Tripo's `animate_rig` → `animate_retarget` (IDLE) pipeline. Task IDs persist in `.model-cache/task-ids.json` so the pipeline resumes after a restart. The game always prefers the animated version when available.

### Hallway Transitions

Rooms connect through walkable stone corridors with torch lighting. The target room builds in a staging scene during the walk. If loading isn't complete when the player reaches the exit, they are held at the portal until ready.

### Special Rooms

Fast-path triggers skip AI generation for story-critical rooms:

| Trigger keyword | Room |
|---|---|
| `Marty McFly` | Garage — DeLorean, Hill Valley atmosphere, fluorescent lights |
| `Alexandre Dumas` | Candlelit study — bookshelves, writing desk, fireplace |
| `Rue de la Ferronnerie 1610` | Paris street — cobblestones, timber facades, Royal Carriage, Henri IV |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Rendering | Three.js 0.158 — ES modules via CDN import map, no bundler |
| Server | Node.js + Express — ESM (`"type": "module"`) |
| AI world gen | Anthropic Claude API (`claude-haiku-4-5-20251001`) |
| 3D asset gen | Tripo3D — `text_to_model`, `animate_rig`, `animate_retarget` |
| Model loading | Three.js `GLTFLoader` + `AnimationMixer` for GLB animations |
| Input | Pointer Lock API + keyboard events |

