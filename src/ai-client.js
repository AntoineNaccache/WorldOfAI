export async function generateWorld(prompt, claudeKey) {
  const res = await fetch('/api/generate-world', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, claudeKey })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${res.status}`);
  }
  return res.json();
}

export async function chatWithNPC(npcDef, history, message, claudeKey) {
  const res = await fetch('/api/chat-npc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ npcDef, history, message, claudeKey })
  });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const data = await res.json();
  return data.reply || '...';
}

export async function pollTripoTask(taskId, maxWaitMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await sleep(3000);
    const res = await fetch(`/api/tripo/task/${taskId}`);
    if (!res.ok) continue;
    const data = await res.json();
    if (data.status === 'success') return data.modelUrl;
    if (data.status === 'failed') return null;
    // else keep polling (queued, processing, etc.)
  }
  return null; // timeout
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
