import * as THREE from 'three';
import { makeWordTexture, makeBackTexture } from './textures.js';

const CARD_W = 1.05;
const CARD_H = 1.45;
const CARD_D = 0.09;
const GAP_X = 0.16;
const GAP_Y = 0.2;
const DOWN_ANGLE = 1.5; // radians the card tips toward the viewer when knocked down

const damp = (current, target, lambda, dt) =>
  THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));

/**
 * The 24-card rack. Each card hangs off a pivot placed at its bottom edge so
 * knocking it down rotates it forward like a real tile.
 */
export class Board {
  constructor(parent) {
    this.group = new THREE.Group();
    this.group.rotation.x = -0.16; // leans away from the camera
    parent.add(this.group);

    this.cards = [];
    this.backTexture = makeBackTexture();
    this.hovered = -1;
    this.guessMode = false;
    this.locked = false;
    this.cols = 6;
    this.rows = 4;
    this.rails = [];
    this.measure();
    this.makeRails();
  }

  measure() {
    this.width = this.cols * CARD_W + (this.cols - 1) * GAP_X;
    this.height = this.rows * CARD_H + (this.rows - 1) * GAP_Y;
  }

  /** Portrait screens get a tall 4x6 rack instead of the wide 6x4 one. */
  setGrid(cols, rows) {
    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols;
    this.rows = rows;
    this.measure();
    for (const card of this.cards) {
      const { x, y } = this.slotFor(card.index);
      card.pivot.position.set(x, y, card.pivot.position.z);
    }
    this.makeRails();
  }

  slotFor(index) {
    const col = index % this.cols;
    const row = Math.floor(index / this.cols);
    return {
      x: (col - (this.cols - 1) / 2) * (CARD_W + GAP_X),
      y: ((this.rows - 1) / 2 - row) * (CARD_H + GAP_Y) - CARD_H / 2,
    };
  }

  /** Thin rails top and bottom, so the rack reads as a physical object. */
  makeRails() {
    for (const rail of this.rails) {
      this.group.remove(rail);
      rail.geometry.dispose();
    }
    this.rails = [];
    const material = new THREE.MeshStandardMaterial({
      color: 0x1c2540,
      roughness: 0.45,
      metalness: 0.5,
    });
    for (const y of [this.height / 2 + 0.42, -this.height / 2 - 0.42]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(this.width + 1.1, 0.16, 0.5),
        material
      );
      rail.position.set(0, y, -0.12);
      rail.castShadow = true;
      rail.receiveShadow = true;
      this.group.add(rail);
      this.rails.push(rail);
    }
  }

  /** Rebuild the rack for a new match. */
  build(words) {
    this.clearCards();
    this.startTime = null; // set on the next frame so the deal animation replays
    words.forEach((word, i) => this.cards.push(this.makeCard(word, i)));
  }

  makeCard(word, index) {
    const slot = this.slotFor(index);

    const pivot = new THREE.Group();
    pivot.position.set(slot.x, slot.y, 0);
    this.group.add(pivot);

    const lift = new THREE.Group(); // hover offset lives here
    lift.position.y = CARD_H / 2;
    pivot.add(lift);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x2a3352,
      roughness: 0.65,
      metalness: 0.08,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(CARD_W, CARD_H, CARD_D), bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    lift.add(body);

    const faceGeo = new THREE.PlaneGeometry(CARD_W, CARD_H);
    const faceTexture = makeWordTexture(word);
    const faceMat = new THREE.MeshStandardMaterial({
      map: faceTexture,
      roughness: 0.55,
      metalness: 0,
    });
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.position.z = CARD_D / 2 + 0.002;
    lift.add(face);

    const backMat = new THREE.MeshStandardMaterial({
      map: this.backTexture,
      roughness: 0.7,
      metalness: 0.05,
    });
    const back = new THREE.Mesh(faceGeo, backMat);
    back.position.z = -CARD_D / 2 - 0.002;
    back.rotation.y = Math.PI;
    lift.add(back);

    // One invisible slab is a far cheaper raycast target than three meshes.
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(CARD_W, CARD_H, CARD_D * 3),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.userData.cardIndex = index;
    lift.add(hit);

    return {
      index,
      word,
      pivot,
      lift,
      hit,
      materials: [bodyMat, faceMat],
      faceTexture,
      down: false,
      angle: 0,
      hoverAmount: 0,
      glow: 0,
      delay: 0.03 * index + 0.05 * Math.random(),
    };
  }

  /** Server is the source of truth for which cards are knocked down. */
  applyFlipped(indices) {
    const set = new Set(indices);
    for (const card of this.cards) card.down = set.has(card.index);
  }

  setHover(index) {
    this.hovered = index ?? -1;
  }

  setGuessMode(on) {
    this.guessMode = on;
  }

  cardAt(index) {
    return this.cards[index] ?? null;
  }

  get hitMeshes() {
    return this.cards.map((c) => c.hit);
  }

  /** Cards a final guess may target — anything still standing. */
  isSelectable(index) {
    const card = this.cards[index];
    return !!card && !card.down;
  }

  update(dt, now) {
    if (this.startTime === null || this.startTime === undefined) this.startTime = now;
    const elapsed = now - this.startTime;
    for (const card of this.cards) {
      const entered = Math.min(1, Math.max(0, (elapsed - card.delay) / 0.5));
      const ease = 1 - Math.pow(1 - entered, 3);
      card.pivot.scale.setScalar(0.001 + 0.999 * ease);
      card.pivot.position.z = (1 - ease) * 3.5;

      card.angle = damp(card.angle, card.down ? DOWN_ANGLE : 0, 9, dt);
      card.pivot.rotation.x = card.angle;

      const wantsHover = this.hovered === card.index && !this.locked ? 1 : 0;
      card.hoverAmount = damp(card.hoverAmount, wantsHover, 14, dt);
      card.lift.position.z = card.hoverAmount * 0.16;
      card.lift.position.y = CARD_H / 2 + card.hoverAmount * 0.05;

      let glowTarget = card.hoverAmount * 0.5;
      let color = 0x5eead4;
      if (this.guessMode && !card.down) {
        glowTarget = Math.max(glowTarget, 0.22 + 0.14 * Math.sin(elapsed * 3 + card.index * 0.4));
        color = 0xfb7185;
      }
      if (card.down) glowTarget = 0;
      card.glow = damp(card.glow, glowTarget, 12, dt);
      for (const mat of card.materials) {
        mat.emissive.setHex(color);
        mat.emissiveIntensity = card.glow;
      }
      // Knocked-down cards read as "ruled out": drained of colour.
      const dim = 1 - 0.55 * (card.angle / DOWN_ANGLE);
      card.materials[1].color.setScalar(dim);
    }
  }

  clearCards() {
    for (const card of this.cards) {
      this.group.remove(card.pivot);
      card.pivot.traverse((obj) => {
        if (obj.isMesh) {
          obj.geometry.dispose();
          obj.material.dispose();
        }
      });
      card.faceTexture.dispose();
    }
    this.cards = [];
  }

  dispose() {
    this.clearCards();
    for (const rail of this.rails) rail.geometry.dispose();
    this.backTexture.dispose();
    this.group.parent?.remove(this.group);
  }
}
