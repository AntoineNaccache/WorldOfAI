import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const gltfLoader = new GLTFLoader();

export const ROOM_SIZE = { w: 12, h: 3, d: 12 };

function makeMat(color) {
  return new THREE.MeshLambertMaterial({ color });
}

export function buildRoom(scene, def = {}) {
  const W = def.width || ROOM_SIZE.w;
  const H = def.height || ROOM_SIZE.h;
  const D = def.depth || ROOM_SIZE.d;
  const wallColor = def.wallColor || '#c8b89a';
  const floorColor = def.floorColor || '#7a6a5a';
  const ceilColor = def.ceilColor || '#d4c9b8';

  const wallMat = makeMat(wallColor);
  const floorMat = makeMat(floorColor);
  const ceilMat = makeMat(ceilColor);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, D), floorMat);
  floor.position.set(0, -0.05, 0);
  floor.receiveShadow = true;
  scene.add(floor);

  const ceil = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, D), ceilMat);
  ceil.position.set(0, H, 0);
  scene.add(ceil);

  const wallData = [
    { size: [W, H, 0.1], pos: [0, H / 2, -D / 2] },
    { size: [W, H, 0.1], pos: [0, H / 2, D / 2] },
    { size: [0.1, H, D], pos: [-W / 2, H / 2, 0] },
    { size: [0.1, H, D], pos: [W / 2, H / 2, 0] },
  ];
  for (const w of wallData) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...w.size), wallMat);
    m.position.set(...w.pos);
    m.receiveShadow = true;
    scene.add(m);
  }
}

export function buildBedroom(scene) {
  buildRoom(scene, { wallColor: '#c8b89a', floorColor: '#7a6a5a', ceilColor: '#d4c9b8' });
  const interactables = [];

  // BED
  const bedFrame = new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 3.5), makeMat('#5a3a1a'));
  bedFrame.position.set(-3.5, 0.2, 2);
  scene.add(bedFrame);
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 3.2), makeMat('#6a4a8a'));
  mattress.position.set(-3.5, 0.55, 2);
  scene.add(mattress);
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 0.6), makeMat('#eeeeff'));
  pillow.position.set(-3.5, 0.72, 0.5);
  scene.add(pillow);
  interactables.push({
    mesh: mattress, label: '[E] Sleep', type: 'bed',
    onInteract: () => ({ type: 'bed' })
  });

  // DESK + COMPUTER
  const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 1), makeMat('#8b6914'));
  deskTop.position.set(3.5, 0.85, -4.5);
  scene.add(deskTop);
  for (const [x, z] of [[-0.85, -0.45], [0.85, -0.45], [-0.85, 0.45], [0.85, 0.45]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.85, 0.06), makeMat('#7a5900'));
    leg.position.set(3.5 + x, 0.425, -4.5 + z);
    scene.add(leg);
  }

  const { meshes: compMeshes } = addComputer(scene, 3.5, -4.5);
  for (const m of compMeshes) {
    interactables.push({
      mesh: m, label: '[E] Use computer', type: 'computer',
      onInteract: () => ({ type: 'computer' })
    });
  }

  // CHAIR
  const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.6), makeMat('#333'));
  chairSeat.position.set(3.5, 0.5, -3.6);
  scene.add(chairSeat);
  const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.06), makeMat('#333'));
  chairBack.position.set(3.5, 0.84, -3.9);
  scene.add(chairBack);

  // BOOKSHELF
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 0.3), makeMat('#8b5e3c'));
  shelf.position.set(-4.8, 1, -4.5);
  scene.add(shelf);
  for (let i = 0; i < 5; i++) {
    const book = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.35, 0.22),
      makeMat(['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6'][i])
    );
    book.position.set(-4.8 + (i - 2) * 0.22, 0.6, -4.5);
    scene.add(book);
  }

  // CEILING LIGHT
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: '#fffde0' }));
  bulb.position.set(0, ROOM_SIZE.h - 0.15, 0);
  scene.add(bulb);

  return { interactables };
}

function addComputer(scene, x, z) {
  const monitorBase = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.3), makeMat('#222'));
  monitorBase.position.set(x, 0.915, z);
  scene.add(monitorBase);
  const monitorStand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), makeMat('#333'));
  monitorStand.position.set(x, 1.065, z);
  scene.add(monitorStand);
  const monitorScreen = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.07), makeMat('#111'));
  monitorScreen.position.set(x, 1.38, z - 0.25);
  scene.add(monitorScreen);
  const screenGlow = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.62, 0.02), new THREE.MeshBasicMaterial({ color: '#002200' }));
  screenGlow.position.set(x, 1.38, z - 0.21);
  scene.add(screenGlow);
  const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.3), makeMat('#1a1a1a'));
  keyboard.position.set(x, 0.9, z + 0.2);
  scene.add(keyboard);
  return { meshes: [monitorScreen, screenGlow] };
}

function buildNPCProcedural(scene, npcDef) {
  const x = npcDef.position?.[0] ?? -3;
  const z = npcDef.position?.[2] ?? -3;

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.3), makeMat(npcDef.color || '#4466ff'));
  body.position.set(x, 0.75, z);
  scene.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), makeMat(npcDef.skinColor || '#f5c18a'));
  head.position.set(x, 1.42, z);
  scene.add(head);

  for (const [ex, ez] of [[-0.08, -0.2], [0.08, -0.2]]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), makeMat('#111'));
    eye.position.set(x + ex, 1.45, z + ez);
    scene.add(eye);
  }
  for (const lx of [-0.13, 0.13]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.22), makeMat(npcDef.pantsColor || '#2a2a5a'));
    leg.position.set(x + lx, 0.27, z);
    scene.add(leg);
  }

  // Invisible interaction sphere
  const hitbox = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 6, 6),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitbox.position.set(x, 1.0, z);
  scene.add(hitbox);

  return hitbox;
}

function buildObjectProcedural(scene, objDef) {
  const x = objDef.position?.[0] ?? 0;
  const z = objDef.position?.[2] ?? 2;
  const color = objDef.color || '#ffaa00';
  const scale = objDef.scale || [1, 1, 1];

  let geom;
  switch (objDef.shape || 'box') {
    case 'sphere': geom = new THREE.SphereGeometry(0.5 * scale[0], 12, 12); break;
    case 'cylinder': geom = new THREE.CylinderGeometry(0.4 * scale[0], 0.4 * scale[0], scale[1], 12); break;
    case 'cone': geom = new THREE.ConeGeometry(0.4 * scale[0], scale[1], 12); break;
    case 'torus': geom = new THREE.TorusGeometry(0.4 * scale[0], 0.15, 8, 16); break;
    default: geom = new THREE.BoxGeometry(scale[0], scale[1], scale[2]);
  }

  const mesh = new THREE.Mesh(geom, makeMat(color));
  mesh.position.set(x, scale[1] / 2, z);
  mesh.castShadow = true;
  mesh.userData.floatBase = mesh.position.y;
  mesh.userData.floatAnim = true;
  scene.add(mesh);
  return mesh;
}

export async function buildGeneratedRoom(scene, def, onProgress) {
  buildRoom(scene, def);
  const interactables = [];

  // COMPUTER (always present)
  const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 1), makeMat('#444'));
  deskTop.position.set(3.5, 0.85, -4.5);
  scene.add(deskTop);
  const { meshes: compMeshes } = addComputer(scene, 3.5, -4.5);
  for (const m of compMeshes) {
    interactables.push({ mesh: m, label: '[E] Use computer', type: 'computer', onInteract: () => ({ type: 'computer' }) });
  }

  // NPC
  if (def.npc) {
    let npcHitbox;
    const tripoTaskId = def._tripoTasks?.npc;

    if (tripoTaskId) {
      onProgress?.('Loading NPC 3D model...');
      const modelUrl = await pollTripoTask(tripoTaskId);
      if (modelUrl) {
        npcHitbox = await loadGLBAtPosition(scene, modelUrl, def.npc.position);
      }
    }

    if (!npcHitbox) {
      npcHitbox = buildNPCProcedural(scene, def.npc);
    }

    interactables.push({
      mesh: npcHitbox,
      label: `[E] Talk to ${def.npc.name || 'Stranger'}`,
      type: 'npc', npcDef: def.npc,
      onInteract: () => ({ type: 'npc', npcDef: def.npc })
    });
  }

  // OBJECT
  if (def.object) {
    let objMesh;
    const tripoTaskId = def._tripoTasks?.object;

    if (tripoTaskId) {
      onProgress?.('Loading object 3D model...');
      const modelUrl = await pollTripoTask(tripoTaskId);
      if (modelUrl) {
        objMesh = await loadGLBAtPosition(scene, modelUrl, def.object.position, def.object.scale);
      }
    }

    if (!objMesh) {
      objMesh = buildObjectProcedural(scene, def.object);
    } else {
      // Add float animation to GLB
      objMesh.userData.floatBase = objMesh.position.y;
      objMesh.userData.floatAnim = true;
    }

    interactables.push({
      mesh: objMesh,
      label: `[E] ${def.object.interactionText || 'Examine ' + def.object.name}`,
      type: 'object', objDef: def.object,
      onInteract: () => ({ type: 'object', objDef: def.object })
    });
  }

  return { interactables };
}

async function pollTripoTask(taskId, maxWait = 90000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await sleep(3000);
    try {
      const res = await fetch(`/api/tripo/task/${taskId}`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.status === 'success') return data.modelUrl;
      if (data.status === 'failed') return null;
    } catch { /* keep polling */ }
  }
  return null;
}

function loadGLBAtPosition(scene, url, position, scale) {
  return new Promise((resolve) => {
    gltfLoader.load(url, (gltf) => {
      const model = gltf.scene;
      const x = position?.[0] ?? 0;
      const z = position?.[2] ?? 0;

      // Auto-scale to reasonable size
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const targetSize = scale ? Math.max(...scale) : 1.5;
      if (maxDim > 0) model.scale.setScalar(targetSize / maxDim);

      // Place on floor
      const box2 = new THREE.Box3().setFromObject(model);
      const size2 = new THREE.Vector3();
      box2.getSize(size2);
      model.position.set(x, size2.y / 2, z);

      scene.add(model);

      // Invisible hitbox
      const hitbox = new THREE.Mesh(
        new THREE.BoxGeometry(size2.x, size2.y, size2.z),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitbox.position.copy(model.position);
      scene.add(hitbox);

      resolve(hitbox);
    }, undefined, (err) => {
      console.error('GLB load error:', err);
      resolve(null);
    });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export function clearScene(scene) {
  for (const child of [...scene.children]) {
    if (!(child instanceof THREE.Light)) scene.remove(child);
  }
}
