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

const TRIPO_KEY = process.env.TRIPO_API_KEY;
const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
const PORT = process.env.PORT || 3000;

const TRIPO_BASE = 'https://api.tripo3d.ai/v2/openapi';
const CLAUDE_BASE = 'https://api.anthropic.com/v1/messages';

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// Cache dir for downloaded models
const cacheDir = path.join(__dirname, '.model-cache');
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);
app.use('/models', express.static(cacheDir));

// ---- Claude proxy ----
app.post('/api/claude', async (req, res) => {
  const key = req.headers["x-claude-key"] || CLAUDE_KEY;
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
      body: JSON.stringify({
        type: 'text_to_model',
        prompt
      })
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
    const status = taskData?.status?.toLowerCase();

    if (status === 'success') {
      const modelUrl = taskData.output?.pbr_model || taskData.output?.model;
      if (!modelUrl) return res.json({ status: 'success', modelUrl: null });

      // Download and cache the model
      const filename = `${req.params.id}.glb`;
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

app.post('/api/generate-world', async (req, res) => {
  const { prompt, claudeKey } = req.body;
  const key = claudeKey || CLAUDE_KEY;
  if (!key) return res.status(401).json({ error: 'No Claude API key' });

  try {
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
    const text = claudeData.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'No JSON in Claude response' });

    const worldDef = JSON.parse(jsonMatch[0]);

    // Step 2: Start Tripo generation for object and NPC (if Tripo key available)
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

// ---- NPC Chat ----
app.post('/api/chat-npc', async (req, res) => {
  const { npcDef, history, message, claudeKey } = req.body;
  const key = claudeKey || CLAUDE_KEY;
  if (!key) return res.status(401).json({ error: 'No Claude API key' });

  const system = `You are ${npcDef.name}. ${npcDef.description}
Personality: ${npcDef.personality}
Keep responses short (1-3 sentences). Stay in character. You exist in a strange AI-generated world.`;

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
        max_tokens: 256,
        system,
        messages: [...history, { role: 'user', content: message }]
      })
    });
    const data = await r.json();
    res.json({ reply: data.content?.[0]?.text || '...' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🎮 AI World Generator running at http://localhost:${PORT}`);
  console.log(`   Tripo API: ${TRIPO_KEY ? '✓ configured' : '✗ not configured'}`);
  console.log(`   Claude API: ${CLAUDE_KEY ? '✓ configured (server-side)' : '⚠ requires user key'}\n`);
});
