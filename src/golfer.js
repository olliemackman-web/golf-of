// First-person golfer: torso, legs, arms, gloved hands and a modelled club,
// with a procedural swing (hands arc on a tilted plane, wrist hinge that lags
// on the downswing, forearm roll). The camera sits at the eyes.
import * as THREE from 'three';
import { BALL_R } from './physics.js';

const COL = { shirt: 0x24466f, skin: 0xd8a781, glove: 0xf3f3f1, trouser: 0xd6cfbd, shoe: 0xf4f4f4, sole: 0x2a2a2a };
const DEG = Math.PI / 180;

function cylBetween(r1, r2, mat) {
  const g = new THREE.CylinderGeometry(r1, r2, 1, 10, 1);
  g.translate(0, 0.5, 0);
  const m = new THREE.Mesh(g, mat); m.castShadow = true;
  return m;
}
const _dir = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();
function placeCyl(mesh, a, b) {
  mesh.position.copy(a);
  _dir.subVectors(b, a); const len = _dir.length(); _dir.normalize();
  mesh.quaternion.setFromUnitVectors(_up, _dir);
  mesh.scale.set(1, len, 1);
}

export function stanceFor(club) {
  if (club.putter) return { pivotY: 1.2, ballZ: -0.05, Rh: 0.56, eye: [0.24, 1.38, 0.0], phiTop: 0.5, phiFinish: 0.42, tBack: 0.9, tThrough: 0.55, wristMax: 0, rollMax: 0 };
  if (club.wood) return { pivotY: 1.36, ballZ: club.id === 'DR' ? -0.22 : -0.15, Rh: 0.62, eye: [0.31, 1.52, 0.02], phiTop: 170 * DEG, phiFinish: 175 * DEG, tBack: 1.0, tThrough: 0.75, wristMax: 92 * DEG, rollMax: 75 * DEG };
  return { pivotY: 1.33, ballZ: club.sand ? 0.0 : -0.06, Rh: 0.62, eye: [0.32, 1.48, 0.02], phiTop: 160 * DEG, phiFinish: 165 * DEG, tBack: 0.95, tThrough: 0.7, wristMax: 90 * DEG, rollMax: 70 * DEG };
}

function buildClub(club) {
  const g = new THREE.Group();
  const L = club.len;
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.92, roughness: 0.28 });
  const graphite = new THREE.MeshStandardMaterial({ color: 0x1b1b21, metalness: 0.55, roughness: 0.45 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0082, L - 0.03, 12), club.wood ? graphite : steel);
  shaft.position.y = -(L - 0.03) / 2 - 0.015; shaft.castShadow = true; g.add(shaft);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0105, 0.27, 12), rubber);
  grip.position.y = -0.135; g.add(grip);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 12, 8), rubber); cap.scale.y = 0.4; g.add(cap);
  const head = new THREE.Group(); head.position.y = -L; g.add(head);
  const loft = club.loft * DEG;
  if (club.putter) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.024, 0.02), new THREE.MeshStandardMaterial({ color: 0x8e9398, metalness: 0.85, roughness: 0.35 }));
    body.position.set(0.045, 0.014, 0.0); body.castShadow = true; head.add(body);
    const flange = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.011, 0.04), new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.7, roughness: 0.4 }));
    flange.position.set(0.045, 0.008, 0.028); head.add(flange);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.0005, 0.036), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    line.position.set(0.045, 0.0145, 0.028); head.add(line);
    const hosel = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.05, 10), steel); hosel.position.set(0.0, 0.03, 0.0); head.add(hosel);
    head.userData.sweet = new THREE.Vector3(0.045, 0.014, -0.034);
  } else if (club.wood) {
    const crown = new THREE.MeshPhysicalMaterial({ color: 0x0e0e10, metalness: 0.2, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 });
    const big = club.id === 'DR';
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), crown);
    body.scale.set(big ? 0.06 : 0.05, big ? 0.03 : 0.024, big ? 0.052 : 0.042);
    body.position.set(big ? 0.052 : 0.045, big ? 0.03 : 0.024, big ? 0.036 : 0.03); body.castShadow = true; head.add(body);
    const face = new THREE.Mesh(new THREE.BoxGeometry(big ? 0.1 : 0.085, big ? 0.052 : 0.042, 0.008), new THREE.MeshStandardMaterial({ color: 0xa4a9ae, metalness: 0.85, roughness: 0.4 }));
    face.position.set(body.position.x, body.position.y, body.position.z - (big ? 0.05 : 0.04)); face.rotation.x = loft; head.add(face);
    const hosel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.045, 10), crown); hosel.position.set(0.004, 0.02, 0.012); head.add(hosel);
    head.userData.sweet = new THREE.Vector3(body.position.x, body.position.y * 0.8, face.position.z - 0.026);
  } else {
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd2d6da, metalness: 0.95, roughness: 0.22 });
    const blade = new THREE.Group(); blade.rotation.x = loft; head.add(blade);
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.046, 0.011), chrome); face.position.set(0.041, 0.023, 0.0); face.castShadow = true; blade.add(face);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.013, 0.024), chrome); sole.position.set(0.041, 0.006, 0.007); blade.add(sole);
    const cavity = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.028, 0.006), new THREE.MeshStandardMaterial({ color: 0x3b3f44, metalness: 0.6, roughness: 0.5 })); cavity.position.set(0.041, 0.026, 0.008); blade.add(cavity);
    for (let i = 0; i < 7; i++) { const gr = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.0012, 0.002), new THREE.MeshStandardMaterial({ color: 0x777b80, metalness: 0.9, roughness: 0.4 })); gr.position.set(0.041, 0.01 + i * 0.005, -0.0057); blade.add(gr); }
    const hosel = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.009, 0.06, 10), chrome); hosel.position.set(0.004, 0.028, 0.0); head.add(hosel);
    head.userData.sweet = new THREE.Vector3(0.041, 0.02, -0.03);
  }
  g.userData.head = head;
  return g;
}

export class Golfer {
  constructor() {
    this.group = new THREE.Group();
    this.clubMeshes = new Map();
    const shirt = new THREE.MeshStandardMaterial({ color: COL.shirt, roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: COL.skin, roughness: 0.7 });
    const glove = new THREE.MeshStandardMaterial({ color: COL.glove, roughness: 0.6 });
    const trouser = new THREE.MeshStandardMaterial({ color: COL.trouser, roughness: 0.9 });
    // torso
    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.42, 6, 14), shirt);
    this.torso.position.set(0.04, 1.06, 0); this.torso.rotation.z = -0.28; this.torso.castShadow = true; this.group.add(this.torso);
    this.bodyParts = [this.torso];
    // legs + shoes
    this.legs = [];
    for (const side of [-1, 1]) {
      const leg = cylBetween(0.075, 0.06, trouser); this.group.add(leg); this.bodyParts.push(leg);
      placeCyl(leg, new THREE.Vector3(-0.02, 0.92, side * 0.17), new THREE.Vector3(0.02, 0.06, side * 0.24));
      const shoe = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.1), new THREE.MeshStandardMaterial({ color: COL.shoe, roughness: 0.55 })); upper.position.y = 0.055; shoe.add(upper);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.025, 0.105), new THREE.MeshStandardMaterial({ color: COL.sole, roughness: 0.8 })); sole.position.y = 0.012; shoe.add(sole);
      shoe.position.set(0.09, 0, side * 0.25); shoe.rotation.y = side * -0.15; shoe.castShadow = true; this.group.add(shoe); this.bodyParts.push(shoe);
    }
    // arms
    this.upperL = cylBetween(0.052, 0.045, shirt); this.upperR = cylBetween(0.052, 0.045, shirt);
    this.foreL = cylBetween(0.045, 0.036, skin); this.foreR = cylBetween(0.045, 0.036, skin);
    this.elbowL = new THREE.Mesh(new THREE.SphereGeometry(0.046, 12, 8), shirt); this.elbowR = this.elbowL.clone();
    this.handL = new THREE.Mesh(new THREE.SphereGeometry(0.048, 14, 10), glove); this.handL.scale.set(0.8, 1.1, 0.75);
    this.handR = new THREE.Mesh(new THREE.SphereGeometry(0.048, 14, 10), skin); this.handR.scale.set(0.8, 1.1, 0.75);
    for (const m of [this.upperL, this.upperR, this.foreL, this.foreR, this.elbowL, this.elbowR, this.handL, this.handR]) { m.castShadow = true; this.group.add(m); }
    this.clubHolder = new THREE.Group(); this.group.add(this.clubHolder);
    this.club = null; this.stance = null;
    this.phase = 'idle'; this.phi = 0; this.phiTarget = 0; this.phiHeld = 0; this.t = 0; this.tDown = 0.6;
    this.onImpact = null; this.impactDone = false;
    this.pivot = new THREE.Vector3(); this.e1 = new THREE.Vector3(); this.e2 = new THREE.Vector3(); this.n = new THREE.Vector3();
    this.ballLocal = new THREE.Vector3();
    this.shoulderL = new THREE.Vector3(); this.shoulderR = new THREE.Vector3();
    this.addressQuat = new THREE.Quaternion();
    this.headTilt = 0;
    this.right = new THREE.Vector3(); this.dir = new THREE.Vector3();
  }

  /** Put the golfer at address next to the ball, aiming along dir (unit, horizontal). */
  setup(ballWorld, dir, club) {
    this.club = club;
    const st = this.stance = stanceFor(club);
    this.dir.copy(dir).setY(0).normalize();
    this.right.crossVectors(this.dir, _up).normalize();
    const bz = -this.right.clone().cross(_up); // unused, kept explicit
    // frame: X = right (toward the ball), Y = up, Z = -dir
    const zAxis = this.dir.clone().negate();
    const m = new THREE.Matrix4().makeBasis(this.right, _up, zAxis);
    this.group.quaternion.setFromRotationMatrix(m);
    const reach = st.Rh + club.len;
    const dy = st.pivotY - BALL_R;
    const ballX = 0.12 + Math.sqrt(Math.max(0.05, reach * reach - dy * dy - st.ballZ * st.ballZ));
    this.ballLocal.set(ballX, BALL_R, st.ballZ);
    // world origin so the local ball lands on the real ball
    this.group.position.copy(ballWorld).addScaledVector(this.right, -ballX).addScaledVector(zAxis, -st.ballZ);
    this.group.position.y = ballWorld.y - BALL_R;
    this.pivot.set(0.12, st.pivotY, 0);
    this.shoulderL.set(0.1, st.pivotY + 0.03, -0.19); this.shoulderR.set(0.1, st.pivotY + 0.03, 0.19);
    this.e1.subVectors(this.ballLocal, this.pivot).normalize();
    this.n.crossVectors(new THREE.Vector3(0, 0, 1), this.e1).normalize();
    this.e2.crossVectors(this.e1, this.n).normalize();
    // club mesh
    if (!this.clubMeshes.has(club.id)) this.clubMeshes.set(club.id, buildClub(club));
    this.clubHolder.clear();
    this.clubMesh = this.clubMeshes.get(club.id);
    this.clubHolder.add(this.clubMesh);
    // address orientation: -Y along e1, X along n
    const y = this.e1.clone().negate(), x = this.n.clone(), z = new THREE.Vector3().crossVectors(x, y);
    this.addressQuat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    this.headTilt = Math.atan2(this.e1.x, -this.e1.y);
    this.clubMesh.userData.head.rotation.z = -this.headTilt;
    // torso lean follows how bent over the stance is
    this.torso.rotation.z = club.putter ? -0.5 : -0.28;
    this.phase = 'idle'; this.phi = 0; this.phiTarget = 0; this.t = 0; this.impactDone = false;
    this.group.updateMatrixWorld(true);
    this.pose();
    // shift the whole stance so the club's sweet spot, not the hosel, sits behind the ball
    this.group.updateMatrixWorld(true);
    const head = this.clubMesh.userData.head;
    const sweetW = head.localToWorld(head.userData.sweet.clone());
    const delta = ballWorld.clone().sub(sweetW); delta.y = 0;
    this.group.position.add(delta);
    // the ball is 1 radius in front of the face: back the head off by one ball radius along the target line
    this.group.position.addScaledVector(this.dir, -BALL_R * 1.1);
    this.group.updateMatrixWorld(true);
  }

  setBodyVisible(v) { for (const m of this.bodyParts) m.visible = v; for (const m of [this.upperL, this.upperR, this.elbowL, this.elbowR]) m.visible = v; }
  eyeWorld(out) { const e = this.stance.eye; return out.set(e[0], e[1], e[2]).applyMatrix4(this.group.matrixWorld); }
  ballWorld(out) { return out.copy(this.ballLocal).applyMatrix4(this.group.matrixWorld); }
  clubHeadWorld(out) { return this.clubMesh.userData.head.getWorldPosition(out); }
  targetDirWorld(out) { return out.copy(this.dir); }

  beginBackswing() { this.phase = 'back'; this.t = 0; this.phiTarget = 0; }
  setBackswing(p) { this.phiTarget = this.stance.phiTop * (0.15 + 0.85 * p); }
  holdTop() { this.phase = 'top'; this.phiHeld = this.phi; }
  beginDownswing(duration, onImpact) { this.phase = 'down'; this.phiHeld = this.phi; this.tDown = duration; this.t = 0; this.onImpact = onImpact; this.impactDone = false; }
  isSwinging() { return this.phase === 'back' || this.phase === 'top' || this.phase === 'down' || this.phase === 'through'; }

  update(dt) {
    const st = this.stance; if (!st) return;
    switch (this.phase) {
      case 'back': { const k = 1 - Math.exp(-dt * 7); this.phi += (this.phiTarget - this.phi) * k; break; }
      case 'top': { const k = 1 - Math.exp(-dt * 7); this.phi += (this.phiTarget - this.phi) * k; break; }
      case 'down': {
        this.t += dt; const u = Math.min(1, this.t / this.tDown);
        this.phi = this.phiHeld * (1 - Math.pow(u, 2.3));
        if (u >= 1 && !this.impactDone) { this.impactDone = true; this.phase = 'through'; this.t = 0; if (this.onImpact) this.onImpact(); }
        break;
      }
      case 'through': {
        this.t += dt; const u = Math.min(1, this.t / st.tThrough);
        this.phi = -st.phiFinish * (1 - Math.pow(1 - u, 2.6)) * Math.min(1, this.phiHeld / (st.phiTop * 0.6) + 0.25);
        if (u >= 1) this.phase = 'finish';
        break;
      }
    }
    this.pose();
  }

  pose() {
    const st = this.stance, phi = this.phi, back = phi > 0;
    // wrist hinge & forearm roll as functions of the swing angle
    const s = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    let wrist, roll;
    if (this.phase === 'down') { wrist = st.wristMax * s(12 * DEG, 100 * DEG, phi); roll = st.rollMax * s(0, 120 * DEG, phi); }
    else if (back || this.phase === 'idle' || this.phase === 'back' || this.phase === 'top') { wrist = st.wristMax * s(0, 110 * DEG, phi); roll = st.rollMax * s(0, 120 * DEG, phi); }
    else { wrist = st.wristMax * 0.8 * s(0, 90 * DEG, -phi); roll = -st.rollMax * s(0, 120 * DEG, -phi); }
    if (this.club.putter) { wrist = 0; roll = 0; }
    const hands = new THREE.Vector3().copy(this.pivot).addScaledVector(this.e1, st.Rh * Math.cos(phi)).addScaledVector(this.e2, st.Rh * Math.sin(phi));
    // Slight body turn: the pivot itself shifts back on the backswing, forward through
    const turn = back ? Math.min(1, phi / (120 * DEG)) : -Math.min(1, -phi / (120 * DEG));
    hands.z += turn * 0.06; hands.x -= Math.abs(turn) * 0.04;
    const theta = phi + wrist;
    const shaftDir = new THREE.Vector3().addScaledVector(this.e1, Math.cos(theta)).addScaledVector(this.e2, Math.sin(theta));
    const qRot = new THREE.Quaternion().setFromAxisAngle(this.n, -theta);
    const q = qRot.multiply(this.addressQuat);
    const shaftAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const qRoll = new THREE.Quaternion().setFromAxisAngle(shaftAxis, roll);
    this.clubMesh.quaternion.copy(qRoll.multiply(q));
    this.clubMesh.position.copy(hands);
    // hands on the grip
    const gL = hands.clone().addScaledVector(shaftDir, 0.035), gR = hands.clone().addScaledVector(shaftDir, 0.115);
    this.handL.position.copy(gL); this.handR.position.copy(gR);
    this.handL.quaternion.copy(this.clubMesh.quaternion); this.handR.quaternion.copy(this.clubMesh.quaternion);
    // arms with a bowed elbow
    const elbow = (sh, hand, side) => {
      const mid = new THREE.Vector3().lerpVectors(sh, hand, 0.5);
      const d = new THREE.Vector3().subVectors(hand, sh).normalize();
      const out = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(0.05 * side);
      return mid.add(out).add(new THREE.Vector3(0, -0.03, 0));
    };
    const eL = elbow(this.shoulderL, gL, 1), eR = elbow(this.shoulderR, gR, -1);
    placeCyl(this.upperL, this.shoulderL, eL); placeCyl(this.foreL, eL, gL);
    placeCyl(this.upperR, this.shoulderR, eR); placeCyl(this.foreR, eR, gR);
    this.elbowL.position.copy(eL); this.elbowR.position.copy(eR);
    // torso rotates with the swing
    this.torso.rotation.y = turn * 0.55;
    this.torso.rotation.z = (this.club.putter ? -0.5 : -0.28) + Math.abs(turn) * 0.05;
  }

  /** Small head motion during the swing: yaw away at the top, then toward the target. */
  headOffset(out) {
    const phi = this.phi;
    const back = phi > 0 ? Math.min(1, phi / this.stance.phiTop) : 0;
    const through = phi < 0 ? Math.min(1, -phi / this.stance.phiFinish) : 0;
    out.yaw = back * 0.12 - through * 0.9;   // radians, toward the target is negative in this rig
    out.pitch = -back * 0.03 + through * 0.5;
    out.dip = back * 0.02 - through * 0.03;
    return out;
  }
}
