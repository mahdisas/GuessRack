import * as THREE from 'three';
import { Board } from './board.js';
import { makeWordTexture, makeBackdropTexture } from './textures.js';

const FOV = 45;
const SECRET_SCALE = 0.46;
const NARROW = 620; // matches the CSS breakpoint where the HUD stacks

/**
 * Slice of the viewport the HUD overlays, top and bottom, as fractions.
 *
 * Measured from the live DOM rather than assumed: the bars are sized in pixels,
 * so any fixed percentage is only correct at one viewport height. Falls back to
 * values matching the CSS while the HUD is still hidden (i.e. in the lobby).
 */
function hudReserve(width, height) {
  const topBar = document.querySelector('.topbar');
  const bottomBar = document.querySelector('.bottombar');
  const help = document.querySelector('#help');

  if (!bottomBar || bottomBar.offsetParent === null) {
    return width <= NARROW ? { top: 0.16, bottom: 0.25 } : { top: 0.12, bottom: 0.16 };
  }

  // The hint floats above the bar, so the reserve is whichever reaches higher.
  const hintReach =
    help && help.offsetParent !== null
      ? help.offsetHeight + (parseFloat(getComputedStyle(help).bottom) || 0)
      : 0;

  return {
    top: Math.min(0.3, (topBar.offsetHeight + 14) / height),
    bottom: Math.min(0.45, (Math.max(bottomBar.offsetHeight, hintReach) + 14) / height),
  };
}

/**
 * Owns the renderer, the camera rig and everything drawn in it. The rest of the
 * app talks to it through build/setFlipped/setSecret and the onCardClick hook.
 */
export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = makeBackdropTexture();
    this.scene.fog = new THREE.Fog(0x0a0f1c, 16, 34);

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    this.scene.add(this.camera); // the held card is parented to it

    this.rig = new THREE.Group(); // parallax target, keeps the board centred
    this.scene.add(this.rig);

    this.board = new Board(this.rig);
    this.addLights();
    this.addEnvironment();
    this.addSecretCard();

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(-2, -2);
    this.parallax = new THREE.Vector2();
    this.timer = new THREE.Timer();
    this.interactive = false;
    this.onCardClick = null;

    this.bindPointer();
    this.resize();
    addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this.frame());
  }

  addLights() {
    this.scene.add(new THREE.HemisphereLight(0xa9c3ff, 0x0a0d16, 0.55));

    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(4.5, 7.5, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0006;
    const s = key.shadow.camera;
    s.left = -12; s.right = 12; s.top = 12; s.bottom = -12; s.near = 1; s.far = 34;
    this.scene.add(key);

    const teal = new THREE.PointLight(0x5eead4, 60, 26);
    teal.position.set(-7.5, 3.5, 5.5);
    this.scene.add(teal);

    const violet = new THREE.PointLight(0xa78bfa, 55, 26);
    violet.position.set(7.5, -2.5, 5);
    this.scene.add(violet);
  }

  addEnvironment() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x101728, roughness: 0.92, metalness: 0.1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -this.board.height / 2 - 1.1;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.floor = floor;
  }

  addSecretCard() {
    this.secret = new THREE.Group();
    this.secret.rotation.set(0.06, -0.22, 0.05);
    this.camera.add(this.secret);

    this.secretMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.5,
      emissive: 0x5eead4,
      emissiveIntensity: 0.08,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.45, 0.09), this.secretMat);
    this.secret.add(body);
    this.secret.scale.setScalar(SECRET_SCALE);
    this.secret.visible = false;
    this.secretTexture = null;
  }

  setSecret(word, lang = 'en') {
    if (this.secretWord === word && this.secretLang === lang) return;
    this.secretWord = word;
    this.secretLang = lang;
    this.secretTexture?.dispose();
    if (!word) {
      this.secret.visible = false;
      return;
    }
    this.secretTexture = makeWordTexture(word, {
      accent: '#0f766e',
      big: true,
      label: true,
      lang,
    });
    this.secretMat.map = this.secretTexture;
    this.secretMat.needsUpdate = true;
    this.secret.visible = true;
  }

  buildBoard(words, lang) {
    this.board.build(words, lang);
  }

  setFlipped(indices) {
    this.board.applyFlipped(indices);
  }

  setGuessMode(on) {
    this.board.setGuessMode(on);
  }

  setInteractive(on) {
    this.interactive = on;
    this.board.locked = !on;
    if (!on) this.board.setHover(-1);
  }

  // ------------------------------------------------------------- pointer

  bindPointer() {
    const toNdc = (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.pointer.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1
      );
    };

    this.canvas.addEventListener('pointermove', toNdc);
    this.canvas.addEventListener('pointerleave', () => this.pointer.set(-2, -2));

    let downAt = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      toNdc(e);
      downAt = { x: e.clientX, y: e.clientY };
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!downAt) return;
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      downAt = null;
      if (moved > 8) return; // a drag, not a click
      toNdc(e);
      const index = this.pick();
      if (index !== -1 && this.interactive) this.onCardClick?.(index);
    });
  }

  pick() {
    if (!this.board.cards.length) return -1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.board.hitMeshes, false);
    return hits.length ? hits[0].object.userData.cardIndex : -1;
  }

  // --------------------------------------------------------------- loop

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;

    // A tall screen gets a tall rack; a wide one gets the classic wide rack.
    const portrait = this.camera.aspect < 0.9;
    this.board.setGrid(portrait ? 4 : 6, portrait ? 6 : 4);
    this.floor.position.y = -this.board.height / 2 - 1.1;

    // Fit the rack into the strip of screen the HUD does not cover, then aim
    // the camera at the middle of that strip rather than the middle of the page.
    const reserve = hudReserve(w, h);
    const strip = Math.max(0.35, 1 - reserve.top - reserve.bottom);
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
    const distV = this.board.height / (strip * 0.92) / 2 / tan;
    const distH = this.board.width / 0.86 / 2 / (tan * this.camera.aspect);
    this.baseDistance = Math.max(distV, distH);

    const halfBoard = tan * this.baseDistance;
    const targetY = (reserve.top + strip / 2 - 0.5) * 2 * halfBoard;
    // Slightly above the rack, so tiles that fall flat are still visible.
    this.camera.position.set(0, targetY + 1.7, this.baseDistance);
    this.camera.lookAt(0, targetY, 0);
    this.camera.updateProjectionMatrix();

    // Park the held card in the corner, resting on top of the HUD bar.
    const depth = Math.max(2.6, this.baseDistance * 0.3);
    const halfH = tan * depth;
    const halfW = halfH * this.camera.aspect;
    const cardH = (1.45 * SECRET_SCALE) / 2;
    const cardW = (1.05 * SECRET_SCALE) / 2;
    this.secret.position.set(
      halfW - cardW - 0.1,
      -halfH * (1 - 2 * reserve.bottom) + cardH,
      -depth
    );
  }

  frame() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    const now = this.timer.getElapsed();

    const hovered = this.interactive ? this.pick() : -1;
    this.board.setHover(hovered);
    this.canvas.style.cursor = hovered !== -1 ? 'pointer' : 'default';
    this.board.update(dt, now);

    // Gentle parallax so the scene feels three-dimensional while you think.
    const px = this.pointer.x > -1.5 ? this.pointer.x : 0;
    const py = this.pointer.y > -1.5 ? this.pointer.y : 0;
    this.parallax.x += (px * 0.5 - this.parallax.x) * 0.05;
    this.parallax.y += (py * 0.3 - this.parallax.y) * 0.05;
    this.rig.rotation.y = -this.parallax.x * 0.06;
    this.rig.rotation.x = this.parallax.y * 0.04;

    if (this.secret.visible) {
      this.secret.rotation.z = 0.05 + Math.sin(now * 0.9) * 0.02;
      this.secret.rotation.x = 0.06 + Math.sin(now * 0.7) * 0.03;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
