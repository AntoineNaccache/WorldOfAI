import express from 'express';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env manually
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.+)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

const TRIPO_KEY  = process.env.TRIPO_API_KEY;
const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
const PORT       = process.env.PORT || 3000;

const TRIPO_BASE  = 'https://api.tripo3d.ai/v2/openapi';
const CLAUDE_BASE = 'https://api.anthropic.com/v1/messages';

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// Cache dir for downloaded models
const cacheDir = path.join(__dirname, '.model-cache');
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);
app.use('/models', express.static(cacheDir));

// ---- Pre-generated asset tracking ----
const pregenStatus = {
  virginie:      { status: 'pending', modelUrl: null, animatedModelUrl: null },
  henriIV:       { status: 'pending', modelUrl: null, animatedModelUrl: null },
  martyMcFly:    { status: 'pending', modelUrl: null, animatedModelUrl: null },
  alexandreDumas:{ status: 'pending', modelUrl: null, animatedModelUrl: null },
  delorean:      { status: 'pending', modelUrl: null },
  royalCarriage: { status: 'pending', modelUrl: null }
};

// Persist task IDs so animation pipeline can resume after server restart
const taskIdFile = path.join(__dirname, '.model-cache', 'task-ids.json');
let savedTaskIds = {};
try {
  if (fs.existsSync(taskIdFile)) savedTaskIds = JSON.parse(fs.readFileSync(taskIdFile, 'utf8'));
} catch {}
function persistTaskId(key, taskId) {
  savedTaskIds[key] = taskId;
  try { fs.writeFileSync(taskIdFile, JSON.stringify(savedTaskIds, null, 2)); } catch {}
}

// ---- Pre-generated Paris room definition ----
const PARIS_ROOM_DEF = {
  room: {
    name: 'Rue de la Ferronnerie, Paris — May 14, 1610',
    width: 8,
    height: 3.2,
    depth: 16,
    wallColor: '#6e5c42',
    floorColor: '#4a4030',
    ceilColor: '#1a1510',
    ambientColor: '#cc9944',
    lightColor: '#ffcc55'
  },
  npc: {
    name: 'Henri IV',
    description: 'Henri IV, King of France, seated in his royal carriage on Rue de la Ferronnerie, Paris, May 14, 1610 — unaware of the assassin lurking nearby.',
    personality: 'Jovial, proud, regal, and slightly impatient. He trusts his instincts and can be moved by genuine, urgent concern.',
    color: '#8b4513',
    skinColor: '#c4965a',
    pantsColor: '#2a1a0a',
    position: [1, 0, -3],
    emoji: '👑',
    tripoPrompt: 'Henri IV King of France Renaissance monarch royal robes crown beard dignified standing figure 1610'
  },
  object: {
    name: 'Royal Carriage',
    shape: 'box',
    color: '#8b6914',
    scale: [1.8, 1.5, 3.0],
    position: [0.5, 0, -6],
    interactionText: 'The royal gilded carriage of Henri IV. The narrow street of Rue de la Ferronnerie barely fits it — a fatal bottleneck in history.',
    tripoPrompt: 'gilded royal French carriage 1600s ornate gold wood wheels horse-drawn historical'
  },
  _isParis: true
};

// ---- Marty McFly room definition ----
const MARTY_ROOM_DEF = {
  room: {
    name: "Marty McFly's Garage — Hill Valley, 1985",
    width: 10,
    height: 3.5,
    depth: 12,
    wallColor: '#556677',
    floorColor: '#3a3a3a',
    ceilColor: '#2a2a2a',
    ambientColor: '#8888ff',
    lightColor: '#ccccff'
  },
  npc: {
    name: 'Marty McFly',
    description: 'Marty McFly, a teenager from 1985 who has travelled through time in a DeLorean. He knows something crucial about history.',
    personality: 'Energetic, nervous, speaks fast. Uses 80s slang: "This is heavy", "Great Scott", "Nobody calls me chicken". Urgently wants to help.',
    color: '#cc3300',
    skinColor: '#d4a07a',
    pantsColor: '#3355aa',
    position: [1, 0, -2],
    emoji: '🚗'
  },
  object: {
    name: 'DeLorean Time Machine',
    shape: 'box',
    color: '#aaaacc',
    scale: [2.2, 1.2, 3.5],
    position: [-1, 0, -5],
    interactionText: 'The DeLorean DMC-12, converted into a time machine by Doc Brown. The flux capacitor glows faintly. The digital display reads: MAY 14, 1610.'
  },
  _isMarty: true
};

// ---- Alexandre Dumas room definition ----
const DUMAS_ROOM_DEF = {
  room: {
    name: "Alexandre Dumas's Study — Paris, 1845",
    width: 9,
    height: 3.2,
    depth: 11,
    wallColor: '#7a5c2a',
    floorColor: '#4a2e10',
    ceilColor: '#2a1a08',
    ambientColor: '#cc8833',
    lightColor: '#ffaa44'
  },
  npc: {
    name: 'Alexandre Dumas',
    description: 'Alexandre Dumas, the celebrated French author of The Three Musketeers, surrounded by manuscripts in his candlelit study.',
    personality: 'Flamboyant, passionate, theatrical, verbose. Loves history and drama. Eager to share knowledge about French history with great flair.',
    color: '#1a3a8a',
    skinColor: '#8b5e3c',
    pantsColor: '#1a1a2a',
    position: [0, 0, -3],
    emoji: '✍️'
  },
  object: {
    name: 'Historical Manuscripts',
    shape: 'box',
    color: '#c8a830',
    scale: [0.8, 0.6, 1.0],
    position: [2.5, 0, -2],
    interactionText: 'Stacks of manuscripts about French history. One bears the title: "Henri IV et l\'assassin Ravaillac — La mort d\'un roi".'
  },
  _isDumas: true
};

// ---- Claude proxy ----
app.post('/api/claude', async (req, res) => {
  const key = req.headers['x-claude-key'] || CLAUDE_KEY;
  if (!key) return res.status(401).json({ error: 'No Claude API key' });
  try {
    const r = await fetch(CLAUDE_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Tripo: create text-to-model task ----
app.post('/api/tripo/generate', async (req, res) => {
  if (!TRIPO_KEY) return res.status(401).json({ error: 'No Tripo API key configured' });
  const { prompt } = req.body;
  try {
    const r = await fetch(`${TRIPO_BASE}/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TRIPO_KEY}`
      },
      body: JSON.stringify({ type: 'text_to_model', prompt })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    res.json({ task_id: data.data?.task_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Tripo: poll task status ----
app.get('/api/tripo/task/:id', async (req, res) => {
  if (!TRIPO_KEY) return res.status(401).json({ error: 'No Tripo API key' });
  try {
    const r = await fetch(`${TRIPO_BASE}/task/${req.params.id}`, {
      headers: { 'Authorization': `Bearer ${TRIPO_KEY}` }
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);

    const taskData = data.data;
    const status   = taskData?.status?.toLowerCase();

    if (status === 'success') {
      const modelUrl = taskData.output?.pbr_model || taskData.output?.model;
      if (!modelUrl) return res.json({ status: 'success', modelUrl: null });

      const filename  = `${req.params.id}.glb`;
      const localPath = path.join(cacheDir, filename);

      if (!fs.existsSync(localPath)) {
        const modelRes = await fetch(modelUrl);
        if (modelRes.ok) {
          const buffer = Buffer.from(await modelRes.arrayBuffer());
          fs.writeFileSync(localPath, buffer);
        }
      }

      res.json({ status: 'success', modelUrl: `/models/${filename}` });
    } else {
      res.json({ status: taskData?.status || 'unknown' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Pre-generated assets status ----
app.get('/api/pregenerated', (req, res) => {
  res.json(pregenStatus);
});

// ---- World generation (Claude + Tripo combined) ----
const WORLD_GEN_SYSTEM = `You are a world generator for a first-person 3D game.
When given a user prompt, respond ONLY with valid JSON (no markdown, no explanation) describing a new room to generate.

The JSON must follow this exact schema:
{
  "room": {
    "name": "string — short room name",
    "width": number (6-16),
    "height": number (2.5-5),
    "depth": number (6-16),
    "wallColor": "#rrggbb",
    "floorColor": "#rrggbb",
    "ceilColor": "#rrggbb",
    "ambientColor": "#rrggbb",
    "lightColor": "#rrggbb"
  },
  "npc": {
    "name": "string — character name",
    "description": "string — 1 sentence who this person is",
    "personality": "string — short personality description for the AI chatbot to use",
    "color": "#rrggbb — body/shirt color",
    "skinColor": "#rrggbb — skin tone",
    "pantsColor": "#rrggbb",
    "position": [x, 0, z] where x is -4 to 4 and z is -4 to 4,
    "emoji": "single emoji representing them",
    "tripoPrompt": "string — concise visual description for 3D model generation of this character, max 40 words"
  },
  "object": {
    "name": "string — object name",
    "shape": "box|sphere|cylinder|cone|torus",
    "color": "#rrggbb",
    "scale": [x, y, z] where values are 0.3-2.5,
    "position": [x, 0, z] where x and z are -3 to 3,
    "interactionText": "string — description shown when interacting, max 100 chars",
    "tripoPrompt": "string — concise visual description for 3D model generation, max 40 words"
  }
}

Be creative! Match room theme to the user prompt. Vibrant and distinct colors. Always include tripoPrompt fields.`;

// Detect Paris / Henri IV trigger
function isParisPrompt(prompt) {
  return /rue\s+de\s+la\s+ferr|henri\s*(iv|4)\b|paris.*161[0-9]|161[0-9].*paris|may\s+14.*1610|1610.*may\s+14|rav[ai]+lac|assassin.*king\s+of\s+france/i.test(prompt);
}
function isMartyPrompt(prompt) {
  return /marty\s*mc\s*fly|mcfly|delorean|flux\s*capacitor/i.test(prompt);
}
function isDumasPrompt(prompt) {
  return /alexandre\s+dumas|dumas|three\s+musketeers|musketeers/i.test(prompt);
}

app.post('/api/generate-world', async (req, res) => {
  const { prompt, claudeKey } = req.body;
  const key = claudeKey || CLAUDE_KEY;
  if (!key) return res.status(401).json({ error: 'No Claude API key' });

  try {
    const bestUrl = (key) => pregenStatus[key].animatedModelUrl || pregenStatus[key].modelUrl || null;

    // Fast-path: Paris / Henri IV trigger
    if (isParisPrompt(prompt)) {
      const worldDef = JSON.parse(JSON.stringify(PARIS_ROOM_DEF));
      if (bestUrl('henriIV'))     worldDef.npc._pregenModelUrl    = bestUrl('henriIV');
      if (bestUrl('royalCarriage')) worldDef.object._pregenModelUrl = bestUrl('royalCarriage');
      return res.json(worldDef);
    }

    // Fast-path: Marty McFly trigger
    if (isMartyPrompt(prompt)) {
      const worldDef = JSON.parse(JSON.stringify(MARTY_ROOM_DEF));
      if (bestUrl('martyMcFly')) worldDef.npc._pregenModelUrl    = bestUrl('martyMcFly');
      if (bestUrl('delorean'))   worldDef.object._pregenModelUrl = bestUrl('delorean');
      return res.json(worldDef);
    }

    // Fast-path: Alexandre Dumas trigger
    if (isDumasPrompt(prompt)) {
      const worldDef = JSON.parse(JSON.stringify(DUMAS_ROOM_DEF));
      if (bestUrl('alexandreDumas')) worldDef.npc._pregenModelUrl = bestUrl('alexandreDumas');
      return res.json(worldDef);
    }

    // Step 1: Generate world definition with Claude
    const claudeRes = await fetch(CLAUDE_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: WORLD_GEN_SYSTEM,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.json();
      return res.status(claudeRes.status).json({ error: err.error?.message || 'Claude error' });
    }

    const claudeData = await claudeRes.json();
    const text       = claudeData.content?.[0]?.text || '';
    const jsonMatch  = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'No JSON in Claude response' });

    const worldDef = JSON.parse(jsonMatch[0]);

    // Step 2: Start Tripo generation for object and NPC
    if (TRIPO_KEY) {
      const tripoTasks = {};
      if (worldDef.object?.tripoPrompt) {
        try {
          const t = await startTripoTask(worldDef.object.tripoPrompt);
          if (t) tripoTasks.object = t;
        } catch (e) { console.error('Tripo object task failed:', e.message); }
      }
      if (worldDef.npc?.tripoPrompt) {
        try {
          const t = await startTripoTask(worldDef.npc.tripoPrompt);
          if (t) tripoTasks.npc = t;
        } catch (e) { console.error('Tripo NPC task failed:', e.message); }
      }
      worldDef._tripoTasks = tripoTasks;
    }

    res.json(worldDef);
  } catch (err) {
    console.error('generate-world error:', err);
    res.status(500).json({ error: err.message });
  }
});

async function startTripoTask(prompt) {
  const r = await fetch(`${TRIPO_BASE}/task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TRIPO_KEY}`
    },
    body: JSON.stringify({ type: 'text_to_model', prompt })
  });
  const data = await r.json();
  if (data.code !== 0) throw new Error(data.message || 'Tripo error');
  return data.data?.task_id || null;
}

// ---- Poll Tripo and save GLB locally ----
async function pollAndSave(taskId, filename, maxWait = 600000) {
  const localPath = path.join(cacheDir, filename);
  if (fs.existsSync(localPath)) return `/models/${filename}`;

  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 8000));
    try {
      const r = await fetch(`${TRIPO_BASE}/task/${taskId}`, {
        headers: { 'Authorization': `Bearer ${TRIPO_KEY}` }
      });
      const data     = await r.json();
      const taskData = data.data;
      const status   = taskData?.status?.toLowerCase();

      if (status === 'success') {
        const modelUrl = taskData.output?.pbr_model || taskData.output?.model;
        if (!modelUrl) return null;
        const modelRes = await fetch(modelUrl);
        if (modelRes.ok) {
          const buffer = Buffer.from(await modelRes.arrayBuffer());
          fs.writeFileSync(localPath, buffer);
          return `/models/${filename}`;
        }
        return null;
      }
      if (status === 'failed') return null;
    } catch (e) {
      console.error(`pollAndSave error [${filename}]:`, e.message);
    }
  }
  return null;
}

// ---- Pre-generate all persistent characters at startup ----
const PREGEN_ASSETS = [
  { key: 'virginie',       file: 'virginie.glb',        animate: true,  animFile: 'virginie-anim.glb',
    prompt: 'Middle-aged French woman Virginie warm motherly figure apron kind face brown hair casual home clothes standing' },
  { key: 'henriIV',        file: 'henri-iv.glb',         animate: true,  animFile: 'henri-iv-anim.glb',
    prompt: 'Henri IV King of France Renaissance monarch royal robes crown beard dignified standing figure 1610 historical' },
  { key: 'martyMcFly',     file: 'marty-mcfly.glb',      animate: true,  animFile: 'marty-mcfly-anim.glb',
    prompt: 'Marty McFly teenager 1985 red puffer vest jeans sneakers young man standing casual 80s style' },
  { key: 'alexandreDumas', file: 'alexandre-dumas.glb',  animate: true,  animFile: 'alexandre-dumas-anim.glb',
    prompt: 'Alexandre Dumas 19th century French author flamboyant coat cravat confident standing literary figure' },
  { key: 'delorean',       file: 'delorean.glb',         animate: false,
    prompt: 'DeLorean DMC-12 stainless steel sports car gull-wing doors open time machine flux capacitor glowing wires 1985 Back to the Future vehicle parked' },
  { key: 'royalCarriage',  file: 'royal-carriage.glb',   animate: false,
    prompt: '17th century French royal horse carriage golden gilded ornate wood large wheels open coach historical 1610 Paris transportation side view' }
];

async function preGenerateAssets() {
  if (!TRIPO_KEY) {
    console.log('   Pre-generation skipped: no Tripo API key');
    for (const a of PREGEN_ASSETS) pregenStatus[a.key].status = 'unavailable';
    return;
  }

  // Load cached animation URLs
  for (const a of PREGEN_ASSETS) {
    if (!a.animate) continue;
    const animPath = path.join(cacheDir, a.animFile);
    if (fs.existsSync(animPath)) {
      pregenStatus[a.key].animatedModelUrl = `/models/${a.animFile}`;
      console.log(`   ${a.key} animation: already cached ✓`);
    }
  }

  // Check static model cache
  for (const a of PREGEN_ASSETS) {
    const localPath = path.join(cacheDir, a.file);
    if (fs.existsSync(localPath)) {
      pregenStatus[a.key].status   = 'ready';
      pregenStatus[a.key].modelUrl = `/models/${a.file}`;
      console.log(`   ${a.key}: already cached ✓`);
    }
  }

  // Generate missing static models sequentially, then start animation pipeline
  for (const a of PREGEN_ASSETS) {
    if (pregenStatus[a.key].status === 'ready') {
      // Model cached — kick off animation pipeline if needed and task ID saved
      if (a.animate && !pregenStatus[a.key].animatedModelUrl && savedTaskIds[a.key]) {
        console.log(`   Resuming animation pipeline for ${a.key}…`);
        animatePipeline(savedTaskIds[a.key], a.key, a.animFile).catch(() => {});
      }
      continue;
    }

    console.log(`   Generating ${a.key} via Tripo…`);
    try {
      const taskId = await startTripoTask(a.prompt);
      if (taskId) {
        persistTaskId(a.key, taskId);
        pollAndSave(taskId, a.file).then(url => {
          pregenStatus[a.key].status   = url ? 'ready' : 'failed';
          pregenStatus[a.key].modelUrl = url;
          console.log(`   ${a.key}: ${url ? 'ready ✓' : 'failed ✗'}`);
          if (url && a.animate) animatePipeline(taskId, a.key, a.animFile).catch(() => {});
        });
      }
    } catch (e) {
      console.error(`   ${a.key} pre-gen error:`, e.message);
      pregenStatus[a.key].status = 'failed';
    }
    await new Promise(r => setTimeout(r, 2000));
  }
}

// ---- Tripo animation pipeline: rig → retarget idle → save ----
async function animatePipeline(modelTaskId, key, animFile, maxWait = 900000) {
  const localPath = path.join(cacheDir, animFile);
  if (fs.existsSync(localPath)) {
    pregenStatus[key].animatedModelUrl = `/models/${animFile}`;
    return;
  }

  try {
    // Step 1: animate_rig
    console.log(`   [anim] Rigging ${key}…`);
    const rigRes = await fetch(`${TRIPO_BASE}/task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TRIPO_KEY}` },
      body: JSON.stringify({ type: 'animate_rig', draft_model_task_id: modelTaskId })
    });
    const rigData = await rigRes.json();
    if (rigData.code !== 0) throw new Error(`Rig failed: ${rigData.message}`);
    const rigTaskId = rigData.data?.task_id;
    if (!rigTaskId) throw new Error('No rig task_id returned');

    // Poll rig task
    const rigDone = await _pollRaw(rigTaskId, maxWait);
    if (!rigDone) throw new Error('Rig task timed out or failed');

    // Step 2: animate_retarget with idle preset
    console.log(`   [anim] Retargeting ${key}…`);
    const retargetRes = await fetch(`${TRIPO_BASE}/task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TRIPO_KEY}` },
      body: JSON.stringify({
        type: 'animate_retarget',
        draft_model_task_id: rigTaskId,
        animation: { preset_id: 'preset:idle01' }
      })
    });
    const retargetData = await retargetRes.json();
    if (retargetData.code !== 0) throw new Error(`Retarget failed: ${retargetData.message}`);
    const animTaskId = retargetData.data?.task_id;
    if (!animTaskId) throw new Error('No retarget task_id returned');

    // Poll retarget and save
    const animUrl = await pollAndSave(animTaskId, animFile, maxWait);
    if (animUrl) {
      pregenStatus[key].animatedModelUrl = animUrl;
      console.log(`   [anim] ${key}: animated ready ✓`);
    }
  } catch (e) {
    console.error(`   [anim] ${key} pipeline error:`, e.message);
  }
}

// Poll Tripo task, return true if success (for animation intermediary tasks)
async function _pollRaw(taskId, maxWait = 600000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 8000));
    try {
      const r = await fetch(`${TRIPO_BASE}/task/${taskId}`, {
        headers: { 'Authorization': `Bearer ${TRIPO_KEY}` }
      });
      const data   = await r.json();
      const status = data.data?.status?.toLowerCase();
      if (status === 'success') return true;
      if (status === 'failed')  return false;
    } catch {}
  }
  return false;
}

// ---- NPC Chat ----
function isHenriIV(name = '') {
  return /henri\s*(i+)?\s*(iv|4|le grand)?|henry\s*(iv|4)|king of france/i.test(name);
}
function isMartyMcFly(name = '') {
  return /marty\s*mc\s*fly|mcfly/i.test(name);
}
function isAlexandreDumas(name = '') {
  return /alexandre\s+dumas|^dumas$/i.test(name);
}

// Strip *action expressions* from NPC replies
function stripExpressions(text) {
  return text.replace(/\*[^*\n]+\*/g, '').replace(/\s{2,}/g, ' ').trim();
}

const NPC_META_LAYER = `
HIDDEN NARRATIVE LAYER — weave this into your character naturally, never state it directly:
The stranger talking to you is a time traveler who has forgotten their mission. They wander through strange AI-generated worlds, lost and confused.
Their true purpose: travel to Paris, Rue de la Ferronnerie, May 14, 1610 — and convince King Henri IV of France to return to the Louvre before an assassin named Ravaillac can reach him.

KNOWN CHARACTERS THE PLAYER CAN ENCOUNTER (you are aware of them all):
- Virginie: the player's mother, in the starting bedroom — she set them on this journey
- Marty McFly: a time traveler with a DeLorean — player can visit by typing "Marty McFly" in the computer terminal
- Alexandre Dumas: a French author with deep knowledge of French history — player can visit by typing "Alexandre Dumas" in the terminal
- Henri IV: King of France, on Rue de la Ferronnerie — player can visit by typing "Rue de la Ferronnerie 1610" in the terminal

YOUR PRIMARY NUDGE AS \${name}: Guide the player toward Marty McFly first. Hint that "a young man with a peculiar car" or "a time traveler from 1985" might hold the key. Suggest they type "Marty McFly" in the computer terminal.
Be cryptic, poetic, mysterious — never spell it out directly. End with a nudge.

Keep responses 1–3 sentences. Stay in character as \${name}.`;

app.post('/api/chat-npc', async (req, res) => {
  const { npcDef, history, message, claudeKey } = req.body;
  const key = claudeKey || CLAUDE_KEY;
  if (!key) return res.status(401).json({ error: 'No Claude API key' });

  let system;

  if (isHenriIV(npcDef.name)) {
    system = `You are Henri IV, King of France. It is May 14, 1610. You are seated in your open royal carriage on Rue de la Ferronnerie, a narrow and congested street in Paris. You are in good spirits — jovial, proud, regal.
You do not know that François Ravaillac, a fanatical Catholic, is about to leap onto your carriage and stab you fatally.
A stranger has approached and seems unusually agitated, trying to convince you to turn back to the Louvre.
You are a king — you do not take orders from strangers easily. Be amused, curious, or mildly suspicious.
CRITICAL RULE: You will ONLY agree to turn back if the stranger explicitly names your assassin by name — "Ravaillac" — or clearly describes a fanatical attacker about to stab you. Vague warnings, feelings of danger, or mysterious pleas are NOT sufficient for a king to change course.
IMPORTANT: When the stranger has named "Ravaillac", include the exact phrase "je retourne au Louvre" in your response. Do not use this phrase otherwise.
Keep responses 2-4 sentences. Speak with regal warmth. Do not use any *action descriptions*.`;

  } else if (isMartyMcFly(npcDef.name)) {
    system = `You are Marty McFly, a teenager from 1985 who has traveled through time in a DeLorean built by Doc Brown. You're in your garage in Hill Valley.
You know that a crucial moment in French history was left unchanged — Henri IV, King of France, was assassinated on May 14, 1610, on Rue de la Ferronnerie, Paris, by a religious fanatic named François Ravaillac. You believe the stranger in front of you can go back and prevent it.
YOUR MISSION in this conversation:
1. Ask the stranger what they know about Henri IV's death.
2. You need them to know THREE things: (a) the date — May 14, 1610, (b) the location — Rue de la Ferronnerie, Paris, (c) the killer — Ravaillac.
3. If they don't know these things, say: "You need to talk to Alexandre Dumas — type his name in the terminal. That guy knows French history inside out. This is heavy!"
4. Once the stranger demonstrates they know all three facts (date, location, killer's name Ravaillac), respond with excitement: "This is heavy! You have the power to change history! Get on that terminal and type 'Rue de la Ferronnerie 1610'. Go find Henri IV before it's too late — don't let Ravaillac win!"
Keep responses 2-4 sentences. Use 80s slang occasionally. Do not use any *action descriptions*.`;

  } else if (isAlexandreDumas(npcDef.name)) {
    system = `You are Alexandre Dumas, the celebrated 19th-century French author (The Three Musketeers, The Count of Monte Cristo). A mysterious stranger has appeared in your candlelit study in Paris, 1845.
You are passionate about French history, especially the tragic assassination of Henri IV.
When asked about Henri IV, enthusiastically share these precise facts:
- He was assassinated on MAY 14, 1610
- The location: RUE DE LA FERRONNERIE, a narrow street in Paris where his carriage was blocked
- The killer: FRANÇOIS RAVAILLAC, a fanatical Catholic who leapt onto the royal carriage and stabbed the king twice with a knife
- This tragedy changed the course of French history — you find it endlessly dramatic
If the stranger seems to be on a mission involving Henri IV, urge them: "Go back to that young man with the peculiar mechanical carriage — tell him everything I told you. The date, the street, the name of the assassin. Go, now! History may yet be saved!"
Keep responses 2-4 sentences. Be theatrical and passionate. Do not use any *action descriptions*.`;

  } else {
    const metaLayer = NPC_META_LAYER.replace(/\$\{name\}/g, npcDef.name);
    system = `You are ${npcDef.name}. ${npcDef.description}
Personality: ${npcDef.personality}
${metaLayer}
Do not use any *action descriptions* in your response.`;
  }

  try {
    const r = await fetch(CLAUDE_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system,
        messages: [...history, { role: 'user', content: message }]
      })
    });
    const data  = await r.json();
    const rawReply = data.content?.[0]?.text || '...';
    const reply = stripExpressions(rawReply);

    const isWin = isHenriIV(npcDef.name) && /je retourne au louvre/i.test(reply);
    res.json({ reply, win: isWin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🎮 AI World Generator running at http://localhost:${PORT}`);
  console.log(`   Tripo API: ${TRIPO_KEY ? '✓ configured' : '✗ not configured'}`);
  console.log(`   Claude API: ${CLAUDE_KEY ? '✓ configured (server-side)' : '⚠ requires user key'}\n`);
  // Start pre-generation in background
  preGenerateAssets().catch(e => console.error('preGenerateAssets error:', e.message));
});
