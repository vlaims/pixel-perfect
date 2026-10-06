import * as THREE from "three";
import { clone as skClone } from "three/examples/jsm/utils/SkeletonUtils.js";

const BONES = [
  "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
  "LeftArm", "LeftForeArm", "RightArm", "RightForeArm", "LeftHand", "RightHand",
  "LeftUpLeg", "LeftLeg", "RightUpLeg", "RightLeg",
] as const;
type BoneName = (typeof BONES)[number];

interface BoneData {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
  w: THREE.Quaternion;
  wInv: THREE.Quaternion;
}

export interface PoseInput {
  phase: number;
  move: number;
  aim: number; // 0..1 arms raised
  pitch: number;
  radio: number;
  seated: number;
  pistol: boolean;
  dead: boolean;
  sprint: boolean;
  crouch: boolean;
  roll: number;
}

const tq = new THREE.Quaternion();
const te = new THREE.Euler();

export class Rig {
  holder = new THREE.Group();
  bones = new Map<BoneName, BoneData>();

  constructor(source: THREE.Object3D, norm: { scale: number; offset: THREE.Vector3 }, tint: THREE.Color | null) {
    const model = skClone(source);
    model.scale.setScalar(norm.scale);
    model.position.copy(norm.offset);
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.frustumCulled = true;
        if (tint && m.material) {
          const mat = (m.material as THREE.MeshStandardMaterial).clone();
          if (mat.color) mat.color.multiply(tint);
          m.material = mat;
        }
      }
    });
    this.holder.add(model);
    this.holder.updateMatrixWorld(true);

    model.traverse((o) => {
      const b = o as THREE.Bone;
      if (!b.isBone) return;
      const key = b.name.replace(/_\d+$/, "").replace(/^mixamorig:?/, "") as BoneName;
      if ((BONES as readonly string[]).includes(key) && !this.bones.has(key)) {
        const w = new THREE.Quaternion();
        b.getWorldQuaternion(w);
        this.bones.set(key, { bone: b, rest: b.quaternion.clone(), w, wInv: w.clone().invert() });
      }
    });

    // Auto-fix facing: model must face +Z (its left hand at +X)
    const la = this.bones.get("LeftArm");
    if (la) {
      const p = new THREE.Vector3();
      la.bone.getWorldPosition(p);
      if (p.x < 0) {
        model.rotation.y += Math.PI;
        this.holder.updateMatrixWorld(true);
        for (const d of this.bones.values()) {
          d.bone.getWorldQuaternion(d.w);
          d.wInv.copy(d.w).invert();
        }
      }
    }
  }

  /** rotate a bone by a model-space euler (applied at its rest frame) */
  private rot(name: BoneName, x: number, y: number, z: number, order: THREE.EulerOrder = "XYZ") {
    const d = this.bones.get(name);
    if (!d) return;
    te.set(x, y, z, order);
    tq.setFromEuler(te);
    d.bone.quaternion.copy(d.rest).multiply(d.wInv).multiply(tq).multiply(d.w);
  }

  getBone(name: BoneName) {
    return this.bones.get(name)?.bone;
  }

  pose(p: PoseInput) {
    // Match the supplied FiveM controller's simple procedural animation:
    // walk/sprint/crouch use the same compact gait, with cadence driven by
    // the movement speed selected in Engine.moveActor().
    const s = Math.sin(p.phase);
    const c = Math.cos(p.phase);
    const mv = Math.min(1, Math.max(0, p.move));
    const moving = mv > 0.01;
    const a = p.aim;
    const roll = Math.max(0, Math.min(1, p.roll));

    // Roll keeps the existing full-body tuck/rotation used by Pixel Perfect.
    if (roll > 0.001) {
      const tuck = Math.sin(Math.PI * Math.min(1, roll) * 0.9);
      this.rot("LeftUpLeg", -1.05 - 0.65 * tuck, 0, -0.14 * tuck);
      this.rot("RightUpLeg", -1.05 - 0.65 * tuck, 0, 0.14 * tuck);
      this.rot("LeftLeg", 1.55 + 0.35 * tuck, 0, 0);
      this.rot("RightLeg", 1.55 + 0.35 * tuck, 0, 0);
      this.rot("Spine", 0.18, 0, 0);
      this.rot("Spine1", -0.08, 0, 0);
      this.rot("Spine2", -0.06, 0, 0);
      this.rot("Head", -0.12, 0, 0);
      this.rot("LeftArm", -0.65 - 0.25 * tuck, -0.4, -0.55, "YXZ");
      this.rot("RightArm", -0.65 - 0.25 * tuck, 0.4, 0.55, "YXZ");
      this.rot("LeftForeArm", 0.8, -0.2, 0);
      this.rot("RightForeArm", 0.8, 0.2, 0);
      return;
    }

    if (p.seated > 0.5) {
      this.rot("LeftUpLeg", -1.35, 0, -0.15);
      this.rot("RightUpLeg", -1.35, 0, 0.15);
      this.rot("LeftLeg", 1.4, 0, 0);
      this.rot("RightLeg", 1.4, 0, 0);
    } else if (moving) {
      // Directly mirrors the pasted demo's 0.6 leg swing and 0.3 arm swing.
      this.rot("LeftUpLeg", -s * 0.3 * mv, 0, 0);
      this.rot("RightUpLeg", s * 0.3 * mv, 0, 0);
      this.rot("LeftLeg", s * 0.6 * mv, 0, 0);
      this.rot("RightLeg", -s * 0.6 * mv, 0, 0);
    } else {
      this.rot("LeftUpLeg", 0, 0, 0);
      this.rot("RightUpLeg", 0, 0, 0);
      this.rot("LeftLeg", 0, 0, 0);
      this.rot("RightLeg", 0, 0, 0);
    }

    // Upright FiveM-style torso/head with a small aim pitch.
    this.rot("Spine", 0.025 * mv, 0, 0);
    this.rot("Spine1", -p.pitch * 0.5 * a, 0, 0);
    this.rot("Spine2", -p.pitch * 0.5 * a, 0, 0);
    this.rot("Head", -p.pitch * 0.3, 0, 0);

    // Supplied controller keeps the weapon arm in a stable ready pose and
    // lets the opposite arm provide the visible locomotion swing.
    const rightReadyX = 0.8;
    const rightReadyZ = -0.3;
    this.rot("RightArm", rightReadyX - 0.35 * a, 0.18 * a, rightReadyZ, "YXZ");
    this.rot("RightForeArm", 0, 0.25 * a + 0.5 * (1 - a), 0);

    if (p.radio > 0.01) {
      const q = p.radio;
      this.rot("LeftArm", 0, -0.45 * q - 1.2 * a * (1 - q), -0.2 * q, "YXZ");
      this.rot("LeftForeArm", 0, -0.2 * q, 2.55 * q);
    } else if (moving) {
      this.rot("LeftArm", -s * 0.3 * mv, -0.12 * a, -0.08 * a, "YXZ");
      this.rot("LeftForeArm", 0, -(p.pistol ? 0.35 : 0.75) * a - 0.4 * (1 - a), 0);
    } else {
      this.rot("LeftArm", 0.2 * (1 - a), -0.12 * a, -0.08 * a, "YXZ");
      this.rot("LeftForeArm", 0, -(p.pistol ? 0.35 : 0.75) * a - 0.4 * (1 - a), 0);
    }

    // Held crouch is represented by Engine's lowered pivot (0.5 vs 0.9),
    // while keeping the same gait/cadence as the supplied controller.
  }
}

export function computeNorm(scene: THREE.Object3D) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const h = box.max.y - box.min.y || 1;
  const scale = 1.8 / h;
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  return { scale, offset: new THREE.Vector3(-cx * scale, -box.min.y * scale, -cz * scale) };
}
