import * as THREE from 'three';
import { Player } from './player.js';
import { buildBedroom, buildGeneratedRoom, buildTunnel, buildHallway, clearScene, ROOM_SIZE, HALLWAY, VIRGINIE_DEF } from './world.js';
import { generateWorld, chatWithNPC } from './ai-client.js';
import { RoomManager } from './room-manager.js';

// ---- DOM refs ----------------------------------------------------------------
const genLogEl         = document.getElementById('gen-log');
const victoryScreen    = document.getElementById('victory-screen');
const canvas           = document.getElementById('canvas');
const overlay          = document.getElementById('overlay');
const startBtn         = document.getElementById('start-btn');
const apiKeyInput      = document.getElementById('api-key-input');
const interactionHint  = document.getElementById('interaction-hint');
const roomLabel        = document.getElementById('room-label');
const loadingScreen    = document.getElementById('loading-screen');
const loadingText      = document.getElementById('loading-text');

const terminal         = document.getElementById('terminal');
const terminalMessages = document.getElementById('terminal-messages');
const terminalInput    = document.getElementById('terminal-input');
const terminalSend     = document.getElementById('terminal-send');
const terminalClose    = document.getElementById('terminal-close');

const npcChat          = document.getElementById('npc-chat');
const npcMessages      = document.getElementById('npc-messages');
const npcInput         = document.getElementById('npc-input');
const npcSend          = document.getElementById('npc-send');
const npcClose         = document.getElementById('npc-close');
const npcName          = document.getElementById('npc-name');
const npcDesc          = document.getElementById('npc-desc');
const npcAvatar        = document.getElementById('npc-avatar');

const objPopup         = document.getElementById('obj-popup');
const objPopupText     = document.getElementById('obj-popup-text');
const objPopupClose    = document.getElementById('obj-popup-close');

// ---- Game state --------------------------------------------------------------
let claudeKey        = '';
let interactables    = [];
let currentNPC       = null;
let uiOpen           = false;
let pregenData       = {};

const generatingRooms = new Set();
let screenGlowMesh = null;
let animationMixers = [];

const roomManager = new RoomManager();
const portals = [];

// ---- Hallway state -----------------------------------------------------------
let isInHallway       = false;
let hallwayTargetId   = null;
let hallwayRoomData   = null; // null = loading, { result, stagingScene, roomId, ... } = ready, { error } = failed

// ---- Three.js setup ----------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;

const scene  = new THREE.Scene();
scene.background = new THREE.Color('#1a1a2e');
scene.fog = new THREE.Fog('#1a1a2e', 8, 20);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 50);
let player = null;

// ---- Lighting ----------------------------------------------------------------
function setupLighting() {
  scene.add(new THREE.AmbientLight('#ffffff', 0.6));
  const main = new THREE.DirectionalLight('#fffde0', 0.8);
  main.position.set(2, 4, 2);
  main.castShadow = true;
  scene.add(main);
  const fill = new THREE.PointLight('#4466ff', 0.4, 15);
  fill.position.set(-3, 2.5, -3);
  scene.add(fill);
}

// ---- Raycaster ---------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const center    = new THREE.Vector2(0, 0);
let nearestInteractable = null;

function checkInteraction() {
  if (uiOpen) { interactionHint.classList.remove('visible'); return; }
  raycaster.setFromCamera(center, camera);
  const hits = raycaster.intersectObjects(interactables.map(i => i.mesh));
  if (hits.length && hits[0].distance < 4.5) {
    nearestInteractable = interactables.find(i => i.mesh === hits[0].object);
    let label = nearestInteractable?.label || '';
    if (nearestInteractable?.type === 'computer' && generatingRooms.has(roomManager.currentRoomId)) {
      label = '⏳ Generating world…';
    }
    interactionHint.textContent = label;
    interactionHint.classList.add('visible');
  } else {
    nearestInteractable = null;
    interactionHint.classList.remove('visible');
  }
}

function interact() {
  if (!nearestInteractable || uiOpen) return;
  const result = nearestInteractable.onInteract();

  if (result.type === 'computer') {
    if (generatingRooms.has(roomManager.currentRoomId)) {
      showObjectPopup({ name: 'World Terminal', interactionText: 'Generating your world… please wait.' });
    } else {
      openTerminal();
    }
  } else if (result.type === 'bed')    { showBedMessage(); }
  else if (result.type === 'npc')    { openNPCChat(result.npcDef); }
  else if (result.type === 'object') { showObjectPopup(result.objDef); }
  else if (result.type === 'tunnel') { enterHallway(result.targetRoomId, result.targetRoomName); }
}

// ---- Start -------------------------------------------------------------------
startBtn.addEventListener('click', async () => {
  claudeKey = apiKeyInput?.value?.trim() || '';
  if (!claudeKey) {
    apiKeyInput.style.borderColor = '#ff4444';
    apiKeyInput.placeholder = 'API key required!';
    return;
  }
  overlay.classList.add('hidden');

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch('/api/pregenerated', { signal: ctrl.signal });
    clearTimeout(timeout);
    pregenData = await res.json();
  } catch {
    pregenData = {};
  }

  await initGame();
});
apiKeyInput?.addEventListener('keydown', e => { if (e.key === 'Enter') startBtn.click(); });

async function initGame() {
  setupLighting();
  roomManager.initStartRoom();

  loadingScreen.classList.remove('hidden');
  loadingText.textContent = 'Setting up your room…';

  const virginieUrl = pregenData.virginie?.animatedModelUrl || pregenData.virginie?.modelUrl || null;
  const result = await buildBedroom(scene, virginieUrl);
  interactables = result.interactables;
  screenGlowMesh = result.screenGlow;
  animationMixers = result.mixers || [];

  player = new Player(camera, canvas);
  player.setBounds(ROOM_SIZE.w / 2, ROOM_SIZE.d / 2);
  player.camera.position.set(0, player.height, 2);
  roomLabel.textContent = 'Your Bedroom';

  loadingScreen.classList.add('hidden');
  requestAnimationFrame(gameLoop);
}

// ---- Game loop ---------------------------------------------------------------
let lastTime = 0;
function gameLoop(t) {
  requestAnimationFrame(gameLoop);
  const dt = Math.min((t - lastTime) / 1000, 0.05);
  lastTime = t;
  if (player) player.update(dt);
  if (isInHallway) checkHallwayEnd();
  animateObjects(t, dt);
  checkInteraction();
  renderer.render(scene, camera);
}

function animateObjects(t, dt) {
  // Update GLB AnimationMixers
  for (const mixer of animationMixers) {
    mixer.update(dt);
  }
  // Procedural idle for GLB models without embedded animations
  scene.traverse(obj => {
    if (obj.userData.idleAnim) {
      const phase = obj.userData.idlePhase || 0;
      const baseY = obj.userData.idleBaseY ?? obj.position.y;
      obj.position.y = baseY + Math.sin(t * 0.0015 + phase) * 0.015;
      obj.rotation.y += dt * 0.12;
    }
  });
  // Float animation for procedural object meshes
  for (const item of interactables) {
    if (item.mesh?.userData?.floatAnim) {
      item.mesh.position.y = item.mesh.userData.floatBase + Math.sin(t * 0.002) * 0.1;
      item.mesh.rotation.y = t * 0.001;
    }
  }
  for (const p of portals) {
    const h = ((t * 0.0004) % 1) * 0.2 + 0.45;
    p.material.color.setHSL(h, 1, 0.12);
  }
}

// ---- Hallway transition ------------------------------------------------------
function enterHallway(targetRoomId, targetRoomName) {
  isInHallway     = true;
  hallwayTargetId = targetRoomId;
  hallwayRoomData = null;

  player?.disable();
  clearScene(scene);
  setupLighting();
  interactables = [];
  portals.length = 0;
  screenGlowMesh = null;
  animationMixers = [];

  const { halfLen, portalMesh } = buildHallway(scene, targetRoomName || 'Unknown');
  if (portalMesh) portals.push(portalMesh);

  // Player starts at south end (z = +halfLen - 2), facing north (toward exit at -halfLen)
  player.setBounds(HALLWAY.w / 2 - 0.15, halfLen);
  player.camera.position.set(0, player.height, halfLen - 2);
  player.euler.set(0, 0, 0);
  player.camera.quaternion.setFromEuler(player.euler);

  roomLabel.textContent = `→ ${targetRoomName || 'Unknown'}`;

  player?.enable();
  player?.lock();

  _loadRoomDuringHallway(targetRoomId);
}

async function _loadRoomDuringHallway(roomId) {
  const stagingScene = new THREE.Scene();
  const room = roomManager.getRoom(roomId);

  try {
    let result;
    if (room.def.isStart) {
      const virginieUrl = pregenData.virginie?.animatedModelUrl || pregenData.virginie?.modelUrl || null;
      result = await buildBedroom(stagingScene, virginieUrl);
    } else {
      const def = room.def;
      result = await buildGeneratedRoom(
        stagingScene,
        { ...def.room, npc: def.npc, object: def.object,
          _tripoTasks: def._tripoTasks, _isParis: def._isParis,
          _isMarty: def._isMarty, _isDumas: def._isDumas }
      );
    }

    // Build tunnels into the staging scene too
    const connections = roomManager.getConnections(roomId);
    const roomDef = room.def.isStart
      ? { width: ROOM_SIZE.w, height: ROOM_SIZE.h, depth: ROOM_SIZE.d }
      : (room.def.room || {});
    const tunnelItems = [];
    for (const conn of connections) {
      const neighbor = roomManager.getRoom(conn.neighborId);
      const neighborName = neighbor.def.room?.name || neighbor.def.name || 'Unknown';
      const item = buildTunnel(stagingScene, roomDef, conn.wallX, neighborName, conn.neighborId);
      tunnelItems.push(item);
    }

    hallwayRoomData = { result, stagingScene, roomId, tunnelItems, roomDef };
  } catch (err) {
    console.error('Hallway room load error:', err);
    hallwayRoomData = { error: err.message };
  }
}

function checkHallwayEnd() {
  if (!player) return;
  const exitZ = -(HALLWAY.len / 2) + 1.5;

  if (player.camera.position.z > exitZ) return; // Not at end yet

  if (!hallwayRoomData) {
    // Still loading — gently hold player back
    player.camera.position.z = exitZ;
    return;
  }

  if (hallwayRoomData.error) {
    isInHallway = false;
    genLog(`Room failed to load: ${hallwayRoomData.error}`, 'error');
    _buildCurrentRoom(0); // fallback to bedroom
    return;
  }

  finalizeRoomFromHallway();
}

function finalizeRoomFromHallway() {
  isInHallway = false;
  const { result, stagingScene, roomId, tunnelItems, roomDef } = hallwayRoomData;
  hallwayRoomData = null;

  player?.disable();

  // Clear hallway, add fresh base lighting
  clearScene(scene);
  setupLighting();
  portals.length = 0;
  animationMixers = [];

  // Transfer all objects from staging scene into main scene
  for (const child of [...stagingScene.children]) {
    stagingScene.remove(child);
    scene.add(child);
  }

  // Collect portals from transferred objects
  scene.traverse(obj => { if (obj.userData.portalAnim) portals.push(obj); });

  interactables = [...result.interactables, ...tunnelItems];
  screenGlowMesh = result.screenGlow;
  animationMixers = result.mixers || [];

  // Set room bounds and label
  const room = roomManager.getRoom(roomId);
  if (room.def.isStart) {
    player?.setBounds(ROOM_SIZE.w / 2, ROOM_SIZE.d / 2);
    roomLabel.textContent = 'Your Bedroom';
  } else {
    const def = room.def;
    const W = def.room?.width  || ROOM_SIZE.w;
    const D = def.room?.depth  || ROOM_SIZE.d;
    player?.setBounds(W / 2, D / 2);
    roomLabel.textContent = def.room?.name || 'Unknown World';
  }

  roomManager.currentRoomId = roomId;
  _refreshScreenGlow();

  // Spawn near south wall, facing into room (toward north)
  const D = roomDef.depth || ROOM_SIZE.d;
  player?.camera.position.set(0, player.height, D / 2 - 2);
  if (player) {
    player.euler.set(0, 0, 0);
    player.camera.quaternion.setFromEuler(player.euler);
  }

  player?.enable();
  player?.lock();
}

// Fallback direct build (for error recovery)
async function _buildCurrentRoom(roomId) {
  clearScene(scene);
  setupLighting();
  interactables = [];
  portals.length = 0;
  screenGlowMesh = null;

  const room = roomManager.getRoom(roomId);
  let result;
  try {
    if (!room || room.def.isStart) {
      result = await buildBedroom(scene, pregenData.virginie?.modelUrl || null);
      player?.setBounds(ROOM_SIZE.w / 2, ROOM_SIZE.d / 2);
      roomLabel.textContent = 'Your Bedroom';
    }
  } catch {}

  if (result) {
    interactables = result.interactables;
    screenGlowMesh = result.screenGlow;
  }
  roomManager.currentRoomId = roomId;
  player?.camera.position.set(0, player.height, 2);
  player?.enable();
  player?.lock();
}

// ---- Screen glow -------------------------------------------------------------
function _refreshScreenGlow() {
  if (!screenGlowMesh) return;
  const busy = generatingRooms.has(roomManager.currentRoomId);
  screenGlowMesh.material.color.set(busy ? '#332200' : '#002200');
}

// ---- Terminal ----------------------------------------------------------------
function openTerminal() {
  uiOpen = true;
  player?.disable();
  terminal.classList.remove('hidden');
  terminalInput.focus();
  if (terminalMessages.children.length === 0) {
    addTerminalMsg('system', 'WORLD TERMINAL — AI World Generator');
    addTerminalMsg('system', 'Describe a world you want to visit. Talk to your Maman first — she might know where you need to go.');
    addTerminalMsg('system', 'Example: "A neon cyberpunk bar with a hacker"');
  }
}

function closeTerminal() {
  terminal.classList.add('hidden');
  uiOpen = false;
  player?.enable();
  player?.lock();
}

function addTerminalMsg(type, text) {
  const div = document.createElement('div');
  div.className = `msg ${type}`;
  div.textContent = text;
  terminalMessages.appendChild(div);
  terminalMessages.scrollTop = terminalMessages.scrollHeight;
  return div;
}

async function submitWorldPrompt() {
  const prompt = terminalInput.value.trim();
  if (!prompt) return;
  terminalInput.value = '';
  terminalSend.disabled = true;

  addTerminalMsg('user', prompt);
  addTerminalMsg('system', 'Request received. Generating in background…');

  const fromRoomId = roomManager.currentRoomId;
  generatingRooms.add(fromRoomId);
  _refreshScreenGlow();
  terminalSend.disabled = false;
  genLog(`▶ "${prompt.slice(0, 40)}${prompt.length > 40 ? '…' : ''}"`, 'step');
  closeTerminal();

  backgroundGenerate(prompt, fromRoomId).catch(err => {
    console.error('Background generation error:', err);
  });
}

terminalSend.addEventListener('click', submitWorldPrompt);
terminalInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitWorldPrompt(); });
terminalClose.addEventListener('click', closeTerminal);

// ---- Victory -----------------------------------------------------------------
function triggerVictory() {
  player?.disable();
  closeNPCChat();
  victoryScreen.classList.remove('hidden');
}

// ---- Generation log HUD ------------------------------------------------------
function genLog(text, type = 'step') {
  const el = document.createElement('div');
  el.className = `gen-entry ${type}`;
  el.textContent = text;
  genLogEl.appendChild(el);
  const delay = (type === 'done' || type === 'error') ? 6000 : 20000;
  setTimeout(() => {
    el.classList.add('fade');
    setTimeout(() => el.remove(), 500);
  }, delay);
  return el;
}

// ---- Background world generation ---------------------------------------------
async function backgroundGenerate(prompt, fromRoomId) {
  const logGenerating = genLog('⚙ Generating world layout…', 'step');
  try {
    const worldDef = await generateWorld(prompt, claudeKey);
    const roomName = worldDef.room?.name || 'New World';
    logGenerating.textContent = `✓ Layout ready: "${roomName}"`;
    logGenerating.className = 'gen-entry done';

    const tripoJobs = [];
    if (worldDef._tripoTasks?.object && !worldDef.object?._pregenModelUrl) {
      const objLog = genLog(`⚙ Sculpting: ${worldDef.object?.name || 'object'}…`, 'step');
      tripoJobs.push(
        pollTaskUntilDone(worldDef._tripoTasks.object).then(url => {
          objLog.textContent = url ? `✓ Model ready: ${worldDef.object?.name}` : `⚠ Model skipped: ${worldDef.object?.name}`;
          objLog.className = `gen-entry ${url ? 'done' : 'error'}`;
        })
      );
    }
    if (worldDef._tripoTasks?.npc && !worldDef.npc?._pregenModelUrl) {
      const npcLog = genLog(`⚙ Sculpting: ${worldDef.npc?.name || 'NPC'}…`, 'step');
      tripoJobs.push(
        pollTaskUntilDone(worldDef._tripoTasks.npc).then(url => {
          npcLog.textContent = url ? `✓ Model ready: ${worldDef.npc?.name}` : `⚠ Model skipped: ${worldDef.npc?.name}`;
          npcLog.className = `gen-entry ${url ? 'done' : 'error'}`;
        })
      );
    }
    if (worldDef.npc?._pregenModelUrl) genLog(`✓ Using pre-generated: ${worldDef.npc?.name}`, 'done');
    await Promise.all(tripoJobs);

    const newRoomId = roomManager.addRoom(worldDef, fromRoomId);

    // Add tunnel to live scene if player is still in the source room
    if (roomManager.currentRoomId === fromRoomId && !isInHallway) {
      const fromRoom = roomManager.getRoom(fromRoomId);
      const fromDef  = fromRoom.def.isStart
        ? { width: ROOM_SIZE.w, height: ROOM_SIZE.h, depth: ROOM_SIZE.d }
        : (fromRoom.def.room || {});
      const conn = roomManager.getConnections(fromRoomId).find(c => c.neighborId === newRoomId);
      const tunnelItem = buildTunnel(scene, fromDef, conn.wallX, roomName, newRoomId);
      interactables.push(tunnelItem);
      scene.traverse(obj => { if (obj.userData.portalAnim && !portals.includes(obj)) portals.push(obj); });
    }

    genLog(`🌀 "${roomName}" — portal open!`, 'done');
    addTerminalMsg('system', `✓ "${roomName}" is ready — walk to the tunnel!`);

  } catch (err) {
    genLog(`✗ ${err.message || 'Generation failed'}`, 'error');
    addTerminalMsg('error', 'AI was unable to execute the request.');
    addTerminalMsg('error', err.message || 'Unknown error');
  } finally {
    generatingRooms.delete(fromRoomId);
    if (roomManager.currentRoomId === fromRoomId && !isInHallway) _refreshScreenGlow();
  }
}

async function pollTaskUntilDone(taskId, maxWait = 90000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const res  = await fetch(`/api/tripo/task/${taskId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') return data.modelUrl;
        if (data.status === 'failed')  return null;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 3000));
  }
  return null;
}

// ---- Bed message -------------------------------------------------------------
function showBedMessage() {
  showObjectPopup({ name: 'Your Bed', interactionText: "You feel tired, but something compels you to use the computer instead… or talk to Maman." });
}

// ---- Object popup ------------------------------------------------------------
function showObjectPopup(objDef) {
  uiOpen = true;
  player?.disable();
  objPopupText.innerHTML = `<strong>${objDef.name}</strong><br><br>${objDef.interactionText || ''}`;
  objPopup.classList.remove('hidden');
}

objPopupClose.addEventListener('click', () => {
  objPopup.classList.add('hidden');
  uiOpen = false;
  player?.enable();
  player?.lock();
});

// ---- NPC chat ----------------------------------------------------------------
function openNPCChat(npcDef) {
  currentNPC = npcDef;
  npcMessages.innerHTML = '';
  npcName.textContent   = npcDef.name || 'Stranger';
  npcDesc.textContent   = npcDef.description || '';
  npcAvatar.textContent = npcDef.emoji || '?';

  uiOpen = true;
  player?.disable();
  npcChat.classList.remove('hidden');
  npcInput.focus();

  const history = roomManager.getNPCHistory(roomManager.currentRoomId, npcDef.name);
  for (const msg of history) {
    addNPCMsg(msg.role === 'user' ? 'from-player' : 'from-npc', msg.content);
  }
  if (history.length === 0) {
    const greeting = npcDef.name === VIRGINIE_DEF.name
      ? "Mon chéri… you look lost. Come, sit. What is it you're searching for in this life?"
      : `Hello. I'm ${npcDef.name}. ${npcDef.description || ''}`;
    addNPCMsg('from-npc', greeting);
  }
}

function closeNPCChat() {
  npcChat.classList.add('hidden');
  uiOpen = false;
  currentNPC = null;
  player?.enable();
  player?.lock();
}

function addNPCMsg(cls, text) {
  const div = document.createElement('div');
  div.className = `npc-msg ${cls}`;
  div.textContent = text;
  npcMessages.appendChild(div);
  npcMessages.scrollTop = npcMessages.scrollHeight;
  return div;
}

async function sendNPCMessage() {
  const text = npcInput.value.trim();
  if (!text || !currentNPC) return;
  npcInput.value = '';
  npcSend.disabled = true;

  addNPCMsg('from-player', text);
  const loadingEl = addNPCMsg('loading', '…');

  const roomId = roomManager.currentRoomId;
  const history = roomManager.getNPCHistory(roomId, currentNPC.name);

  try {
    const { reply, win } = await chatWithNPC(currentNPC, history, text, claudeKey);
    loadingEl.remove();
    addNPCMsg('from-npc', reply);

    const updated = [...history, { role: 'user', content: text }, { role: 'assistant', content: reply }];
    roomManager.setNPCHistory(roomId, currentNPC.name, updated.slice(-30));

    if (win) setTimeout(() => triggerVictory(), 2500);
  } catch (err) {
    loadingEl.remove();
    addNPCMsg('from-npc', '[unable to respond]');
    console.error(err);
  } finally {
    npcSend.disabled = false;
    npcInput.focus();
  }
}

npcSend.addEventListener('click', sendNPCMessage);
npcInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendNPCMessage(); });
npcClose.addEventListener('click', closeNPCChat);

// ---- Global keyboard ---------------------------------------------------------
document.addEventListener('keydown', e => {
  if (e.code === 'KeyE') interact();
  if (e.code === 'Escape') {
    if (!terminal.classList.contains('hidden'))  closeTerminal();
    else if (!npcChat.classList.contains('hidden')) closeNPCChat();
    else if (!objPopup.classList.contains('hidden')) objPopupClose.click();
  }
});

// ---- Resize ------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
