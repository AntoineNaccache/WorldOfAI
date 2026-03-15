import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const gltfLoader = new GLTFLoader();

// Shared clock for animation mixers
const clock = new THREE.Clock();

export const ROOM_SIZE = { w: 12, h: 3, d: 12 };

export const VIRGINIE_DEF = {
  name: 'Virginie',
  description: 'Your mother. She looks at you with a mixture of love and quiet concern.',
  personality: 'Warm, caring, slightly melancholic. She asks deep questions about purpose and life choices. She believes her child is destined for something important but can\'t quite explain why.',
  color: '#c0856a',
  skinColor: '#d4a07a',
  pantsColor: '#556b2f',
  position: [-2, 0, 1],
  emoji: '👩'
};

function makeMat(color) {
  return new THREE.MeshLambertMaterial({ color });
}

// ---- Room shell ----------------------------------------------------------------

export function buildRoom(scene, def = {}) {
  const W = def.width  || ROOM_SIZE.w;
  const H = def.height || ROOM_SIZE.h;
  const D = def.depth  || ROOM_SIZE.d;

  const wallMat  = makeMat(def.wallColor  || '#c8b89a');
  const floorMat = makeMat(def.floorColor || '#7a6a5a');
  const ceilMat  = makeMat(def.ceilColor  || '#d4c9b8');

  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, D), floorMat);
  floor.position.set(0, -0.05, 0);
  floor.receiveShadow = true;
  scene.add(floor);

  const ceil = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, D), ceilMat);
  ceil.position.set(0, H, 0);
  scene.add(ceil);

  for (const [size, pos] of [
    [[W, H, 0.1], [0, H/2, -D/2]],
    [[W, H, 0.1], [0, H/2,  D/2]],
    [[0.1, H, D], [-W/2, H/2, 0]],
    [[0.1, H, D], [ W/2, H/2, 0]],
  ]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), wallMat);
    m.position.set(...pos);
    m.receiveShadow = true;
    scene.add(m);
  }
}

// ---- Bedroom ------------------------------------------------------------------

export async function buildBedroom(scene, virginieModelUrl) {
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
  interactables.push({ mesh: mattress, label: '[E] Sleep', type: 'bed', onInteract: () => ({ type: 'bed' }) });

  // DESK
  const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 1), makeMat('#8b6914'));
  deskTop.position.set(3.5, 0.85, -4.5);
  scene.add(deskTop);
  for (const [x, z] of [[-0.85,-0.45],[0.85,-0.45],[-0.85,0.45],[0.85,0.45]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.85, 0.06), makeMat('#7a5900'));
    leg.position.set(3.5 + x, 0.425, -4.5 + z);
    scene.add(leg);
  }

  // COMPUTER
  const { meshes: compMeshes, screenGlow } = _addComputer(scene, 3.5, -4.5);
  for (const m of compMeshes) {
    interactables.push({ mesh: m, label: '[E] Use computer', type: 'computer', onInteract: () => ({ type: 'computer' }) });
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
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.22),
      makeMat(['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6'][i]));
    book.position.set(-4.8 + (i-2)*0.22, 0.6, -4.5);
    scene.add(book);
  }

  // CEILING BULB
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: '#fffde0' }));
  bulb.position.set(0, ROOM_SIZE.h - 0.15, 0);
  scene.add(bulb);

  // VIRGINIE NPC
  const mixers = [];
  let virginieHitbox;
  if (virginieModelUrl) {
    const loaded = await _loadGLB(scene, virginieModelUrl, VIRGINIE_DEF.position, [1.5, 1.5, 1.5]);
    virginieHitbox = loaded.hitbox;
    if (loaded.mixer) mixers.push(loaded.mixer);
  }
  if (!virginieHitbox) {
    virginieHitbox = _buildNPC(scene, VIRGINIE_DEF);
  }
  interactables.push({
    mesh: virginieHitbox,
    label: '[E] Talk to Maman',
    type: 'npc',
    npcDef: VIRGINIE_DEF,
    onInteract: () => ({ type: 'npc', npcDef: VIRGINIE_DEF })
  });

  return { interactables, screenGlow, mixers };
}

// ---- Generated room -----------------------------------------------------------

export async function buildGeneratedRoom(scene, def, onProgress) {
  buildRoom(scene, def);
  const interactables = [];
  const mixers = [];

  // Room-specific environment details
  if (def._isParis) _buildParisStreetDetails(scene, def);
  if (def._isMarty) _buildMartyGarageDetails(scene);
  if (def._isDumas) _buildDumasStudyDetails(scene, def);

  // DESK + COMPUTER (skip for Paris street — it has no desk)
  if (!def._isParis) {
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 1), makeMat('#444'));
    deskTop.position.set(3.5, 0.85, -4.5);
    scene.add(deskTop);
  }
  const { meshes: compMeshes, screenGlow } = _addComputer(scene, 3.5, -4.5);
  for (const m of compMeshes) {
    interactables.push({ mesh: m, label: '[E] Use computer', type: 'computer', onInteract: () => ({ type: 'computer' }) });
  }

  // NPC
  if (def.npc) {
    let hitbox = null;
    if (def.npc._pregenModelUrl) {
      onProgress?.('Loading character model…');
      const loaded = await _loadGLB(scene, def.npc._pregenModelUrl, def.npc.position, [1.6, 1.6, 1.6]);
      hitbox = loaded.hitbox;
      if (loaded.mixer) mixers.push(loaded.mixer);
    }
    if (!hitbox && def._tripoTasks?.npc) {
      onProgress?.('Loading NPC 3D model…');
      const url = await _pollTask(def._tripoTasks.npc);
      if (url) {
        const loaded = await _loadGLB(scene, url, def.npc.position, def.npc.scale);
        hitbox = loaded.hitbox;
        if (loaded.mixer) mixers.push(loaded.mixer);
      }
    }
    if (!hitbox) hitbox = _buildNPC(scene, def.npc);
    interactables.push({
      mesh: hitbox,
      label: `[E] Talk to ${def.npc.name || 'Stranger'}`,
      type: 'npc', npcDef: def.npc,
      onInteract: () => ({ type: 'npc', npcDef: def.npc })
    });
  }

  // OBJECT
  if (def.object) {
    let mesh = null;
    if (def.object._pregenModelUrl) {
      onProgress?.('Loading object model…');
      const loaded = await _loadGLB(scene, def.object._pregenModelUrl, def.object.position, def.object.scale);
      mesh = loaded.hitbox;
      if (loaded.mixer) mixers.push(loaded.mixer);
    }
    if (!mesh && def._tripoTasks?.object) {
      onProgress?.('Loading object 3D model…');
      const url = await _pollTask(def._tripoTasks.object);
      if (url) {
        const loaded = await _loadGLB(scene, url, def.object.position, def.object.scale);
        mesh = loaded.hitbox;
        if (loaded.mixer) mixers.push(loaded.mixer);
      }
    }
    if (!mesh) mesh = _buildObject(scene, def.object);
    else if (!def.object._pregenModelUrl) {
      mesh.userData.floatBase = mesh.position.y;
      mesh.userData.floatAnim = true;
    }
    interactables.push({
      mesh,
      label: `[E] ${def.object.name || 'Examine object'}`,
      type: 'object', objDef: def.object,
      onInteract: () => ({ type: 'object', objDef: def.object })
    });
  }

  return { interactables, screenGlow, mixers };
}

// ---- Paris street details -----------------------------------------------------

function _buildParisStreetDetails(scene, def) {
  const W = def.width  || 8;
  const H = def.height || 3.2;
  const D = def.depth  || 16;

  const stoneMat    = makeMat('#6e5c42');
  const darkMat     = makeMat('#3a3020');
  const woodMat     = makeMat('#5c3d1a');
  const ironMat     = makeMat('#2a2a2a');
  const glowMat     = new THREE.MeshBasicMaterial({ color: '#ffcc44' });

  // Cobblestone rows on the floor (alternating dark/light bands)
  for (let row = -7; row < 8; row++) {
    for (let col = -3; col < 4; col++) {
      const stone = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.06, 0.38),
        makeMat(((row + col) % 2 === 0) ? '#5a5040' : '#4a4030')
      );
      stone.position.set(col * 0.6, 0.01, row * 0.44);
      scene.add(stone);
    }
  }

  // Building facade left — timber-frame style
  const beams = [
    { x: -W/2 + 0.08, y: H/2, z: -4, w: 0.12, h: H, d: 0.3, c: '#3a2810' },
    { x: -W/2 + 0.08, y: 1.0,  z: -2, w: 0.12, h: 2.0, d: 0.3, c: '#3a2810' },
  ];
  for (const b of beams) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), makeMat(b.c));
    m.position.set(b.x, b.y, b.z);
    scene.add(m);
  }

  // Horizontal beam left wall
  const hBeam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, D * 0.6), makeMat('#3a2810'));
  hBeam.position.set(-W/2 + 0.08, 1.6, -2);
  scene.add(hBeam);

  // Plaster fill left wall (slightly inset)
  const plasterL = new THREE.Mesh(new THREE.BoxGeometry(0.06, H * 0.7, D * 0.55), makeMat('#c8b090'));
  plasterL.position.set(-W/2 + 0.12, H * 0.35, -2);
  scene.add(plasterL);

  // Building facade right — stone blocks
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.55, 1.0),
        makeMat(row % 2 === 0 ? '#7a6a55' : '#6a5a45')
      );
      block.position.set(W/2 - 0.08, 0.3 + row * 0.6, -6 + col * 1.2);
      scene.add(block);
    }
  }

  // Overhanging balcony left (first floor protrudes over street)
  const balcony = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 2.5), woodMat);
  balcony.position.set(-W/2 + 0.5, 2.2, -3);
  scene.add(balcony);
  const balconyRail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 2.5), ironMat);
  balconyRail.position.set(-W/2 + 0.92, 2.4, -3);
  scene.add(balconyRail);

  // Street lantern on left wall
  const poleL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8), ironMat);
  poleL.position.set(-W/2 + 0.3, 1.5, -1);
  scene.add(poleL);
  const lampHouse = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 0.25), ironMat);
  lampHouse.position.set(-W/2 + 0.3, 2.35, -1);
  scene.add(lampHouse);
  const lampGlow = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.18), glowMat);
  lampGlow.position.set(-W/2 + 0.3, 2.35, -1);
  scene.add(lampGlow);
  const lampLight = new THREE.PointLight('#ffcc44', 1.2, 6);
  lampLight.position.set(-W/2 + 0.3, 2.35, -1);
  scene.add(lampLight);

  // Street lantern right wall
  const poleR = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8), ironMat);
  poleR.position.set(W/2 - 0.3, 1.5, -4);
  scene.add(poleR);
  const lampHouseR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 0.25), ironMat);
  lampHouseR.position.set(W/2 - 0.3, 2.35, -4);
  scene.add(lampHouseR);
  const lampGlowR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.18), glowMat);
  lampGlowR.position.set(W/2 - 0.3, 2.35, -4);
  scene.add(lampGlowR);
  const lampLightR = new THREE.PointLight('#ffcc44', 1.0, 5);
  lampLightR.position.set(W/2 - 0.3, 2.35, -4);
  scene.add(lampLightR);

  // Market stall / cart near entrance (z positive, behind player spawn)
  const cartBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.7), woodMat);
  cartBase.position.set(-1.5, 0.9, 2);
  scene.add(cartBase);
  const cartLeg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), woodMat);
  cartLeg1.position.set(-2, 0.45, 2);
  scene.add(cartLeg1);
  const cartLeg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), woodMat);
  cartLeg2.position.set(-1, 0.45, 2);
  scene.add(cartLeg2);
  // Produce on cart
  for (let i = 0; i < 5; i++) {
    const veg = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), makeMat(['#cc4422','#44aa22','#ffcc00','#cc8800','#aa2244'][i]));
    veg.position.set(-2.1 + i * 0.3, 1.0, 2 + (i % 2) * 0.1);
    scene.add(veg);
  }

  // Barrels against right wall
  for (let b = 0; b < 3; b++) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 10), woodMat);
    barrel.position.set(W/2 - 0.5, 0.25, 0 + b * 0.6);
    scene.add(barrel);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.025, 6, 12), ironMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(W/2 - 0.5, 0.38 + b * 0.6, 0 + b * 0.6);
    scene.add(ring);
  }

  // Scattered hay/straw bundles
  for (let h = 0; h < 4; h++) {
    const hay = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.5), makeMat('#c8a830'));
    hay.position.set(-1 + h * 0.5, 0.04, 3 - (h % 2) * 0.3);
    hay.rotation.y = h * 0.4;
    scene.add(hay);
  }

  // Distant ambience light (warm afternoon sun shaft from above)
  const sunShaft = new THREE.PointLight('#ffdd88', 0.8, 12);
  sunShaft.position.set(0, H - 0.5, -6);
  scene.add(sunShaft);
}

// ---- Marty McFly's garage details -------------------------------------------

function _buildMartyGarageDetails(scene) {
  const woodMat  = makeMat('#5c3d1a');
  const metalMat = makeMat('#888898');
  const darkMat  = makeMat('#1a1a22');
  const glareMat = new THREE.MeshBasicMaterial({ color: '#ccddff' });
  const cableMat = makeMat('#222');
  const posterMat = makeMat('#d4b060');

  // Concrete floor overlay
  const concreteFloor = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.02, 11.8), makeMat('#6a6a72'));
  concreteFloor.position.set(0, 0.01, 0);
  scene.add(concreteFloor);

  // Fluorescent light bars on ceiling
  for (const [lx, lz] of [[-3, -2], [3, -2], [0, 2]]) {
    const tube = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.14), new THREE.MeshBasicMaterial({ color: '#ddeeff' }));
    tube.position.set(lx, 2.88, lz);
    scene.add(tube);
    const glow = new THREE.PointLight('#bbddff', 1.1, 7);
    glow.position.set(lx, 2.7, lz);
    scene.add(glow);
  }

  // Workbench along back wall
  const bench = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.1, 0.9), woodMat);
  bench.position.set(0, 0.9, -5.2);
  scene.add(bench);
  for (const bx of [-2.1, -0.7, 0.7, 2.1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), woodMat);
    leg.position.set(bx, 0.45, -5.2);
    scene.add(leg);
  }

  // Tool pegboard above workbench
  const pegboard = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.2, 0.06), makeMat('#8a7a60'));
  pegboard.position.set(0, 1.7, -5.45);
  scene.add(pegboard);
  // Tools on pegboard
  const toolColors = ['#cc4400', '#888', '#442200', '#cc8800', '#446688'];
  for (let i = 0; i < 5; i++) {
    const tool = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.04), makeMat(toolColors[i]));
    tool.position.set(-2 + i * 1.0, 1.6, -5.42);
    scene.add(tool);
  }

  // Workbench items — tools, parts
  const vise = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.2), metalMat);
  vise.position.set(-1.8, 1.02, -5.2);
  scene.add(vise);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), metalMat);
  lamp.position.set(1.5, 1.15, -5.2);
  scene.add(lamp);
  const lampHead = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.06, 0.14, 8), metalMat);
  lampHead.position.set(1.5, 1.42, -5.2);
  scene.add(lampHead);
  const lampLight = new THREE.PointLight('#ffeecc', 0.8, 3);
  lampLight.position.set(1.5, 1.55, -5.15);
  scene.add(lampLight);

  // Cables on floor
  for (let c = 0; c < 4; c++) {
    const cable = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 3.0 + c * 0.5), cableMat);
    cable.position.set(-3 + c * 1.5, 0.015, 1.5 - c * 0.3);
    cable.rotation.y = (c % 2) * 0.3;
    scene.add(cable);
  }

  // Metal shelving unit on left wall
  for (let shelf = 0; shelf < 3; shelf++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 1.5), metalMat);
    s.position.set(-5.4, 0.5 + shelf * 0.7, -3);
    scene.add(s);
    // Items on shelf
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.22, 0.22), makeMat(['#cc6600','#446688','#885500'][shelf]));
    box.position.set(-5.35, 0.63 + shelf * 0.7, -3 + (shelf - 1) * 0.3);
    scene.add(box);
  }
  const shelfPost1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.08), metalMat);
  shelfPost1.position.set(-5.45, 1.1, -2.3);
  scene.add(shelfPost1);
  const shelfPost2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.08), metalMat);
  shelfPost2.position.set(-5.45, 1.1, -3.7);
  scene.add(shelfPost2);

  // Hill Valley "Twin Pines Mall" poster on right wall
  const posterFrame = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.1, 1.8), woodMat);
  posterFrame.position.set(5.45, 1.6, -2);
  scene.add(posterFrame);
  const poster = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.9, 1.6), posterMat);
  poster.position.set(5.44, 1.6, -2);
  scene.add(poster);

  // Ambient red-orange fill (industrial feel)
  const industrialFill = new THREE.PointLight('#ff8833', 0.4, 15);
  industrialFill.position.set(0, 2.5, 0);
  scene.add(industrialFill);
}

// ---- Alexandre Dumas's study details ----------------------------------------

function _buildDumasStudyDetails(scene, def = {}) {
  // If pre-generated bookshelf model is being loaded as the room object, skip procedural ones
  const hasPregenBookshelf = !!def.object?._pregenModelUrl;
  const woodMat   = makeMat('#5c3010');
  const darkWood  = makeMat('#3a1e08');
  const paperMat  = makeMat('#e8d8a0');
  const leatherMat = makeMat('#6a3018');
  const stoneMat  = makeMat('#7a6a58');
  const goldMat   = makeMat('#c8a030');

  // Rich oak floor planks
  for (let row = -6; row < 7; row++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.025, 0.72), makeMat(row % 2 === 0 ? '#6a3e14' : '#5c3010'));
    plank.position.set(0, 0.01, row * 0.76);
    scene.add(plank);
  }

  // Bookshelf left wall — floor to ceiling (only built if no pre-gen model is available)
  if (!hasPregenBookshelf) {
    const shelfBodyL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.8, 3.5), darkWood);
    shelfBodyL.position.set(-5.7, 1.4, -2);
    scene.add(shelfBodyL);
    const bookColors = ['#8b1a1a','#1a3a8b','#1a7a2a','#8b6a1a','#5a1a8b','#7a3a1a','#1a6a7a','#8b3a5a'];
    for (let shelf = 0; shelf < 5; shelf++) {
      for (let b = 0; b < 6; b++) {
        const book = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.28 + Math.random() * 0.12, 0.18),
          makeMat(bookColors[(shelf * 6 + b) % bookColors.length])
        );
        book.position.set(-5.55, 0.4 + shelf * 0.52, -3.5 + b * 0.56);
        book.rotation.y = (Math.random() - 0.5) * 0.05;
        scene.add(book);
      }
    }

    // Bookshelf right wall
    const shelfBodyR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.8, 3.5), darkWood);
    shelfBodyR.position.set(5.7, 1.4, -2);
    scene.add(shelfBodyR);
    for (let shelf = 0; shelf < 5; shelf++) {
      for (let b = 0; b < 6; b++) {
        const book = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.28 + Math.random() * 0.1, 0.18),
          makeMat(bookColors[(shelf * 7 + b) % bookColors.length])
        );
        book.position.set(5.55, 0.4 + shelf * 0.52, -3.5 + b * 0.56);
        scene.add(book);
      }
    }
  }

  // Writing desk — ornate
  const deskSurface = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 1.1), darkWood);
  deskSurface.position.set(3, 0.9, -4);
  scene.add(deskSurface);
  for (const [ox, oz] of [[-0.9,-0.45],[0.9,-0.45],[-0.9,0.45],[0.9,0.45]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), darkWood);
    leg.position.set(3 + ox, 0.45, -4 + oz);
    scene.add(leg);
  }
  // Stacked manuscripts on desk
  for (let p = 0; p < 4; p++) {
    const page = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.015, 0.7), paperMat);
    page.position.set(3.2, 0.96 + p * 0.016, -4.1);
    page.rotation.y = (p % 2) * 0.08;
    scene.add(page);
  }
  // Quill
  const quill = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.015, 0.45, 6), makeMat('#ddd8b8'));
  quill.position.set(2.7, 0.97, -4.0);
  quill.rotation.z = 0.3;
  scene.add(quill);
  // Inkwell
  const inkwell = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.1, 10), darkWood);
  inkwell.position.set(2.6, 0.97, -3.85);
  scene.add(inkwell);

  // Fireplace on back wall
  const surround = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.5, 0.2), stoneMat);
  surround.position.set(-2, 0.75, -5.85);
  scene.add(surround);
  const mantle = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.15, 0.35), darkWood);
  mantle.position.set(-2, 1.57, -5.76);
  scene.add(mantle);
  const firebox = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.15), makeMat('#111'));
  firebox.position.set(-2, 0.55, -5.88);
  scene.add(firebox);
  // Fire glow
  const ember1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.08), new THREE.MeshBasicMaterial({ color: '#ff6600' }));
  ember1.position.set(-2, 0.14, -5.82);
  scene.add(ember1);
  const ember2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.08), new THREE.MeshBasicMaterial({ color: '#ff4400' }));
  ember2.position.set(-1.8, 0.18, -5.8);
  scene.add(ember2);
  const fireLight = new THREE.PointLight('#ff7722', 1.4, 8);
  fireLight.position.set(-2, 0.8, -5.2);
  scene.add(fireLight);

  // Mantle decorations
  const candle1 = _addCandle(scene, -2.7, 1.73, -5.72);
  const candle2 = _addCandle(scene, -1.3, 1.73, -5.72);

  // Candelabra on desk
  _addCandle(scene, 3.8, 0.92, -4.2);
  _addCandle(scene, 3.65, 0.92, -3.9);

  // Leather armchair near fireplace
  const seatCush = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.12, 0.7), leatherMat);
  seatCush.position.set(-4, 0.5, -3.5);
  scene.add(seatCush);
  const backCush = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.1), leatherMat);
  backCush.position.set(-4, 0.94, -3.85);
  scene.add(backCush);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.7), darkWood);
  armL.position.set(-4.38, 0.65, -3.5);
  scene.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.7), darkWood);
  armR.position.set(-3.62, 0.65, -3.5);
  scene.add(armR);

  // Warm amber fill light
  const amberFill = new THREE.PointLight('#ffcc66', 0.7, 14);
  amberFill.position.set(0, 2.4, 0);
  scene.add(amberFill);
}

function _addCandle(scene, x, y, z) {
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 8), new THREE.MeshLambertMaterial({ color: '#f8f0d8' }));
  stem.position.set(x, y + 0.11, z);
  scene.add(stem);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshBasicMaterial({ color: '#ffee88' }));
  flame.position.set(x, y + 0.26, z);
  scene.add(flame);
  const candleLight = new THREE.PointLight('#ffcc44', 0.5, 3.5);
  candleLight.position.set(x, y + 0.3, z);
  scene.add(candleLight);
}

// ---- Tunnel -------------------------------------------------------------------

export function buildTunnel(scene, roomDef, wallX, targetRoomName, targetRoomId) {
  const D = roomDef.depth  || ROOM_SIZE.d;
  const H = roomDef.height || ROOM_SIZE.h;

  const archH = Math.min(H - 0.15, 2.5);
  const archW = 1.4;
  const wallZ = D / 2;

  const maxX = (roomDef.width || ROOM_SIZE.w) / 2 - 1.1;
  const cx   = Math.max(-maxX, Math.min(maxX, wallX));

  const mat = new THREE.MeshBasicMaterial({ color: '#00ddff' });

  const lp = new THREE.Mesh(new THREE.BoxGeometry(0.12, archH, 0.18), mat);
  lp.position.set(cx - archW/2, archH/2, wallZ - 0.09);
  scene.add(lp);

  const rp = new THREE.Mesh(new THREE.BoxGeometry(0.12, archH, 0.18), mat);
  rp.position.set(cx + archW/2, archH/2, wallZ - 0.09);
  scene.add(rp);

  const tb = new THREE.Mesh(new THREE.BoxGeometry(archW + 0.12, 0.14, 0.18), mat);
  tb.position.set(cx, archH + 0.07, wallZ - 0.09);
  scene.add(tb);

  const portalMat = new THREE.MeshBasicMaterial({
    color: '#003344', side: THREE.DoubleSide, transparent: true, opacity: 0.88
  });
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(archW - 0.14, archH - 0.08), portalMat);
  portal.position.set(cx, archH/2, wallZ - 0.12);
  portal.rotation.y = Math.PI;
  portal.userData.portalAnim = true;
  scene.add(portal);

  const light = new THREE.PointLight('#00ddff', 0.9, 5);
  light.position.set(cx, 1.4, wallZ - 0.6);
  scene.add(light);

  const hitbox = new THREE.Mesh(
    new THREE.BoxGeometry(archW + 0.2, archH, 3.5),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitbox.position.set(cx, archH/2, wallZ - 1.85);
  scene.add(hitbox);

  return {
    mesh: hitbox,
    label: `[E] Enter → ${targetRoomName}`,
    type: 'tunnel', targetRoomId, targetRoomName,
    onInteract: () => ({ type: 'tunnel', targetRoomId, targetRoomName })
  };
}

// ---- Hallway ------------------------------------------------------------------

export const HALLWAY = { w: 3.0, h: 3.0, len: 44 };

export function buildHallway(scene, toRoomName) {
  const { w, h, len } = HALLWAY;
  const hw = w / 2;
  const hl = len / 2;

  const wallMat  = makeMat('#3a3a48');
  const floorMat = makeMat('#2e2e38');
  const ceilMat  = makeMat('#252530');

  // Floor / Ceiling
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, len), floorMat);
  floor.position.set(0, -0.05, 0);
  scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, len), ceilMat);
  ceil.position.set(0, h, 0);
  scene.add(ceil);

  // Left / Right walls
  for (const sx of [-hw, hw]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, len), wallMat);
    wall.position.set(sx, h / 2, 0);
    scene.add(wall);
  }

  // Entry wall (behind player, south end +hl)
  const entryWall = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h, 0.12), wallMat);
  entryWall.position.set(0, h / 2, hl);
  scene.add(entryWall);

  // Brick-stripe texture strips on both walls
  for (let i = 0; i < 7; i++) {
    const c = makeMat(i % 2 === 0 ? '#48404a' : '#3a3440');
    for (const sx of [-hw + 0.07, hw - 0.07]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, len), c);
      strip.position.set(sx, 0.22 + i * 0.42, 0);
      scene.add(strip);
    }
  }

  // Torches every ~7 units on both walls
  for (let z = -hl + 4; z < hl; z += 7) {
    _addTorch(scene, -hw + 0.18, 1.7, z);
    _addTorch(scene, hw - 0.18, 1.7, z);
  }

  // Exit portal frame (north end, at z = -hl)
  const frameMat = new THREE.MeshBasicMaterial({ color: '#00ddff' });
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(w - 0.08, 0.12, 0.12), frameMat);
  topBar.position.set(0, h - 0.08, -hl + 0.06);
  scene.add(topBar);
  for (const sx of [-hw + 0.1, hw - 0.1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, 0.12), frameMat);
    side.position.set(sx, h / 2, -hl + 0.06);
    scene.add(side);
  }

  // Exit portal plane (animated color)
  const portalMat = new THREE.MeshBasicMaterial({
    color: '#003344', side: THREE.DoubleSide, transparent: true, opacity: 0.88
  });
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, h - 0.1), portalMat);
  portal.position.set(0, h / 2, -hl + 0.08);
  portal.userData.portalAnim = true;
  scene.add(portal);

  // Exit glow light
  const exitLight = new THREE.PointLight('#00ccff', 1.5, 7);
  exitLight.position.set(0, 1.5, -hl + 1.2);
  scene.add(exitLight);

  return { halfLen: hl, portalMesh: portal };
}

function _addTorch(scene, x, y, z) {
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.44, 6), makeMat('#4a2a08'));
  stick.position.set(x, y, z);
  scene.add(stick);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), new THREE.MeshBasicMaterial({ color: '#ff8800' }));
  flame.position.set(x, y + 0.27, z);
  scene.add(flame);
  const light = new THREE.PointLight('#ff6600', 0.7, 5);
  light.position.set(x, y + 0.3, z);
  scene.add(light);
}

// ---- Scene clear --------------------------------------------------------------

export function clearScene(scene) {
  // Remove everything — lights too, to avoid accumulation across transitions
  for (const child of [...scene.children]) {
    scene.remove(child);
  }
}

// ---- Internal helpers ---------------------------------------------------------

function _addComputer(scene, x, z) {
  const monBase = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.3), makeMat('#222'));
  monBase.position.set(x, 0.915, z);
  scene.add(monBase);

  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), makeMat('#333'));
  stand.position.set(x, 1.065, z);
  scene.add(stand);

  const screen = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.07), makeMat('#111'));
  screen.position.set(x, 1.38, z - 0.25);
  scene.add(screen);

  const screenGlowMat = new THREE.MeshBasicMaterial({ color: '#002200' });
  const screenGlow = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.62, 0.02), screenGlowMat);
  screenGlow.position.set(x, 1.38, z - 0.21);
  scene.add(screenGlow);

  const kb = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.3), makeMat('#1a1a1a'));
  kb.position.set(x, 0.9, z + 0.2);
  scene.add(kb);

  return { meshes: [screen, screenGlow], screenGlow };
}

function _buildNPC(scene, npcDef) {
  const x = npcDef.position?.[0] ?? -3;
  const z = npcDef.position?.[2] ?? -3;

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.3), makeMat(npcDef.color || '#4466ff'));
  body.position.set(x, 0.75, z);
  scene.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), makeMat(npcDef.skinColor || '#f5c18a'));
  head.position.set(x, 1.42, z);
  scene.add(head);

  for (const [ex, ez] of [[-0.08,-0.2],[0.08,-0.2]]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), makeMat('#111'));
    eye.position.set(x + ex, 1.45, z + ez);
    scene.add(eye);
  }
  for (const lx of [-0.13, 0.13]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.22), makeMat(npcDef.pantsColor || '#2a2a5a'));
    leg.position.set(x + lx, 0.27, z);
    scene.add(leg);
  }

  const hitbox = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 6, 6),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitbox.position.set(x, 1.0, z);
  scene.add(hitbox);
  return hitbox;
}

function _buildObject(scene, objDef) {
  const x = objDef.position?.[0] ?? 0;
  const z = objDef.position?.[2] ?? 2;
  const s = objDef.scale || [1, 1, 1];

  let geom;
  switch (objDef.shape || 'box') {
    case 'sphere':   geom = new THREE.SphereGeometry(0.5 * s[0], 12, 12); break;
    case 'cylinder': geom = new THREE.CylinderGeometry(0.4*s[0], 0.4*s[0], s[1], 12); break;
    case 'cone':     geom = new THREE.ConeGeometry(0.4 * s[0], s[1], 12); break;
    case 'torus':    geom = new THREE.TorusGeometry(0.4 * s[0], 0.15, 8, 16); break;
    default:         geom = new THREE.BoxGeometry(s[0], s[1], s[2]);
  }

  const mesh = new THREE.Mesh(geom, makeMat(objDef.color || '#ffaa00'));
  mesh.position.set(x, s[1]/2, z);
  mesh.castShadow = true;
  mesh.userData.floatBase = mesh.position.y;
  mesh.userData.floatAnim = true;
  scene.add(mesh);
  return mesh;
}

async function _pollTask(taskId, maxWait = 90000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const res = await fetch(`/api/tripo/task/${taskId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') return data.modelUrl;
        if (data.status === 'failed')  return null;
      }
    } catch {}
    await _sleep(3000);
  }
  return null;
}

function _loadGLB(scene, url, position, scale) {
  return new Promise(resolve => {
    gltfLoader.load(url, gltf => {
      const model = gltf.scene;
      const x = position?.[0] ?? 0;
      const z = position?.[2] ?? 0;

      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const target = scale ? Math.max(...(Array.isArray(scale) ? scale : [scale])) : 1.5;
      if (maxDim > 0) model.scale.setScalar(target / maxDim);

      const box2 = new THREE.Box3().setFromObject(model);
      const size2 = new THREE.Vector3();
      box2.getSize(size2);
      model.position.set(x, size2.y / 2, z);
      scene.add(model);

      const hitbox = new THREE.Mesh(
        new THREE.BoxGeometry(size2.x, size2.y, size2.z),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitbox.position.copy(model.position);
      scene.add(hitbox);

      // AnimationMixer — play first clip if present, otherwise mark for procedural idle
      let mixer = null;
      if (gltf.animations && gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(model);
        mixer.clipAction(gltf.animations[0]).play();
      } else {
        model.userData.idleAnim = true;
        model.userData.idlePhase = Math.random() * Math.PI * 2;
        model.userData.idleBaseY = model.position.y;
      }

      resolve({ hitbox, mixer, modelRoot: model });
    }, undefined, err => { console.error('GLB load error:', err); resolve({ hitbox: null, mixer: null, modelRoot: null }); });
  });
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
