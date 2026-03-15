import * as THREE from 'three';

export class Player {
  constructor(camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;
    this.speed = 5;
    this.height = 1.65;

    this.keys = {};
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.locked = false;
    this.enabled = true;

    this.camera.position.set(0, this.height, 3);

    this._onKeyDown = e => { this.keys[e.code] = true; };
    this._onKeyUp = e => { this.keys[e.code] = false; };
    this._onMouseMove = e => this._handleMouseMove(e);
    this._onPointerlockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
    };

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onPointerlockChange);

    canvas.addEventListener('click', () => {
      if (this.enabled && !this.locked) canvas.requestPointerLock();
    });
  }

  _handleMouseMove(e) {
    if (!this.locked || !this.enabled) return;
    const sens = 0.002;
    this.euler.setFromQuaternion(this.camera.quaternion);
    this.euler.y -= e.movementX * sens;
    this.euler.x -= e.movementY * sens;
    this.euler.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.euler.x));
    this.camera.quaternion.setFromEuler(this.euler);
  }

  update(dt) {
    if (!this.enabled) return;
    const dir = new THREE.Vector3();
    if (this.keys['KeyW'] || this.keys['ArrowUp']) dir.z -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) dir.z += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) dir.x -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) dir.x += 1;
    if (dir.lengthSq() === 0) return;

    dir.normalize();
    dir.applyEuler(new THREE.Euler(0, this.euler.y, 0));
    this.camera.position.addScaledVector(dir, this.speed * dt);

    // Room boundary clamp (updated by setBounds on room transition)
    const hw = this._halfW ?? 5.5;
    const hd = this._halfD ?? 5.5;
    this.camera.position.x = Math.max(-hw + 0.3, Math.min(hw - 0.3, this.camera.position.x));
    this.camera.position.z = Math.max(-hd + 0.3, Math.min(hd - 0.3, this.camera.position.z));
    this.camera.position.y = this.height;
  }

  setBounds(halfW, halfD) { this._halfW = halfW; this._halfD = halfD; }

  lock() { this.canvas.requestPointerLock(); }
  unlock() { document.exitPointerLock(); }

  disable() {
    this.enabled = false;
    document.exitPointerLock();
  }
  enable() {
    this.enabled = true;
  }
}
