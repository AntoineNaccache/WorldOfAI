import * as THREE from 'three';
import { Player } from './player.js';
import { buildBedroom, buildGeneratedRoom, clearScene } from './world.js';
import { generateWorld, chatWithNPC } from './ai-client.js';

// ---- DOM refs ----
const canvas = document.getElementById('canvas');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');
const apiKeyInput = document.getElementById('api-key-input');
const interactionHint = document.getElementById('interaction-hint');
const roomLabel = document.getElementById('room-label');
const loadingScreen = document.getElementById('loading-screen');
const loadingText = document.getElementById('loading-text');

// Terminal
const terminal = document.getElementById('terminal');
const terminalMessages = document.getElementById('terminal-messages');
const terminalInput = document.getElementById('terminal-input');
const terminalSend = document.getElementById('terminal-send');
const terminalClose = document.getElementById('terminal-close');

// NPC Chat
const npcChat = document.getElementById('npc-chat');
const npcMessages = document.getElementById('npc-messages');
const npcInput = document.getElementById('npc-input');
const npcSend = document.getElementById('npc-send');
const npcClose = document.getElementById('npc-close');
const npcName = document.getElementById('npc-name');
const npcDesc = document.getElementById('npc-desc');
const npcAvatar = document.getElementById('npc-avatar');

// Object popup
const objPopup = document.getElementById('obj-popup');
const objPopupText = document.getElementById('obj-popup-text');
const objPopupClose = document.getElementById('obj-popup-close');

// ---- State ----
let claudeKey = '';
let interactables = [];
let currentNPC = null;
let npcHistory = [];
let uiOpen = false;
let currentRoomName = 'Your Bedroom';

// ---- Three.js setup ----
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a1a2e');
scene.fog = new THREE.Fog('#1a1a2e', 8, 20);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 50);
let player = null;

// ---- Lighting ----
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

// ---- Raycaster for interaction ----
const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);
let nearestInteractable = null;

function checkInteraction() {
  if (uiOpen) { interactionHint.classList.remove('visible'); return; }
  raycaster.setFromCamera(center, camera);
  const meshes = interactables.map(i => i.mesh);
  const hits = raycaster.intersectObjects(meshes);
  if (hits.length && hits[0].distance < 3.5) {
    const hit = hits[0].object;
    nearestInteractable = interactables.find(i => i.mesh === hit);
    interactionHint.textContent = nearestInteractable?.label || '';
    interactionHint.classList.add('visible');
  } else {
    nearestInteractable = null;
    interactionHint.classList.remove('visible');
  }
}

function interact() {
  if (!nearestInteractable || uiOpen) return;
  const result = nearestInteractable.onInteract();
  if (result.type === 'computer') openTerminal();
  else if (result.type === 'bed') showBedMessage();
  else if (result.type === 'npc') openNPCChat(result.npcDef);
  else if (result.type === 'object') showObjectPopup(result.objDef);
}

// ---- Start ----
startBtn.addEventListener('click', () => {
  claudeKey = apiKeyInput?.value?.trim() || '';
  if (!claudeKey) {
    apiKeyInput.style.borderColor = '#ff4444';
    apiKeyInput.placeholder = 'API key required!';
    return;
  }
  overlay.classList.add('hidden');
  initGame();
});
apiKeyInput?.addEventListener('keydown', e => { if (e.key === 'Enter') startBtn.click(); });

function initGame() {
  setupLighting();
  const result = buildBedroom(scene);
  interactables = result.interactables;
  player = new Player(camera, canvas);
  roomLabel.textContent = currentRoomName;
  requestAnimationFrame(gameLoop);
}

// ---- Game loop ----
let lastTime = 0;
function gameLoop(t) {
  requestAnimationFrame(gameLoop);
  const dt = Math.min((t - lastTime) / 1000, 0.05);
  lastTime = t;

  if (player) player.update(dt);
  animateObjects(t);
  checkInteraction();
  renderer.render(scene, camera);
}

function animateObjects(t) {
  for (const item of interactables) {
    if (item.mesh?.userData?.floatAnim) {
      item.mesh.position.y = item.mesh.userData.floatBase + Math.sin(t * 0.002) * 0.1;
      item.mesh.rotation.y = t * 0.001;
    }
  }
}

// ---- Terminal ----
function openTerminal() {
  uiOpen = true;
  player?.disable();
  terminal.classList.remove('hidden');
  terminalInput.focus();
  if (terminalMessages.children.length === 0) {
    addTerminalMsg('system', 'WORLD TERMINAL — AI World Generator');
    addTerminalMsg('system', 'Type a description of a world you want to visit.');
    addTerminalMsg('system', 'Example: "A cozy library with a mysterious librarian"');
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
  const loadingEl = addTerminalMsg('loading', 'Generating world...');

  try {
    const worldDef = await generateWorld(prompt, claudeKey);
    loadingEl.remove();
    addTerminalMsg('system', `World generated: "${worldDef.room?.name || 'Unknown'}"`);

    // Transition to new room
    closeTerminal();
    await transitionToRoom(worldDef);
  } catch (err) {
    loadingEl.remove();
    addTerminalMsg('error', 'AI was unable to execute the request.');
    addTerminalMsg('error', err.message || 'Unknown error');
    console.error(err);
  } finally {
    terminalSend.disabled = false;
  }
}

terminalSend.addEventListener('click', submitWorldPrompt);
terminalInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') submitWorldPrompt();
});
terminalClose.addEventListener('click', closeTerminal);

// ---- Room transition ----
async function transitionToRoom(worldDef) {
  loadingScreen.classList.remove('hidden');
  loadingText.textContent = `Loading: ${worldDef.room?.name || 'New World'}...`;

  await new Promise(r => setTimeout(r, 400));

  clearScene(scene);
  setupLighting();
  interactables = [];

  const hasTripo = !!(worldDef._tripoTasks?.object || worldDef._tripoTasks?.npc);
  if (hasTripo) {
    loadingText.textContent = 'AI generating 3D models... (this takes ~30-60s)';
  }

  try {
    const result = await buildGeneratedRoom(
      scene,
      { ...worldDef.room, npc: worldDef.npc, object: worldDef.object, _tripoTasks: worldDef._tripoTasks },
      (msg) => { loadingText.textContent = msg; }
    );
    interactables = result.interactables;
    currentRoomName = worldDef.room?.name || 'Generated World';
    roomLabel.textContent = currentRoomName;
    if (player) player.camera.position.set(0, player.height, 3);
  } catch (err) {
    console.error('Room build error:', err);
    const result = buildBedroom(scene);
    interactables = result.interactables;
    currentRoomName = 'Your Bedroom';
    roomLabel.textContent = currentRoomName;
  }

  loadingScreen.classList.add('hidden');
  player?.enable();
  player?.lock();
}

// ---- Bed ----
function showBedMessage() {
  uiOpen = true;
  player?.disable();
  objPopupText.innerHTML = `<strong>Your Bed</strong><br><br>You feel tired, but something compels you to use the computer instead...`;
  objPopup.classList.remove('hidden');
}

// ---- Object popup ----
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

// ---- NPC Chat ----
function openNPCChat(npcDef) {
  currentNPC = npcDef;
  npcHistory = [];
  npcMessages.innerHTML = '';

  npcName.textContent = npcDef.name || 'Stranger';
  npcDesc.textContent = npcDef.description || '';
  npcAvatar.textContent = npcDef.emoji || '?';

  uiOpen = true;
  player?.disable();
  npcChat.classList.remove('hidden');
  npcInput.focus();

  // Opening line from NPC
  addNPCMsg('from-npc', getOpeningLine(npcDef));
}

function getOpeningLine(npcDef) {
  return `Hello there. I'm ${npcDef.name}. ${npcDef.description || ''}`;
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
  const loadingEl = addNPCMsg('loading', '...');

  try {
    const reply = await chatWithNPC(currentNPC, npcHistory, text, claudeKey);
    loadingEl.remove();
    addNPCMsg('from-npc', reply);
    npcHistory.push({ role: 'user', content: text });
    npcHistory.push({ role: 'assistant', content: reply });
    // Keep history short
    if (npcHistory.length > 20) npcHistory = npcHistory.slice(-20);
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
npcInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendNPCMessage();
});
npcClose.addEventListener('click', closeNPCChat);

// ---- Keyboard interactions ----
document.addEventListener('keydown', e => {
  if (e.code === 'KeyE') interact();
  if (e.code === 'Escape') {
    if (!terminal.classList.contains('hidden')) closeTerminal();
    else if (!npcChat.classList.contains('hidden')) closeNPCChat();
    else if (!objPopup.classList.contains('hidden')) {
      objPopup.classList.add('hidden');
      uiOpen = false;
      player?.enable();
      player?.lock();
    }
  }
});

// ---- Resize ----
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
