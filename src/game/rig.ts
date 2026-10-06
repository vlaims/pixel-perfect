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
    // RP-style locomotion: compact walking, stronger sprint stride, and an
    // upright torso so the character reads like a GTA/FiveM third-person rig.
    const cadence = p.sprint ? 1.18 : 0.92;
    const s = Math.sin(p.phase * cadence);
    const c = Math.cos(p.phase * cadence);
    const mv = Math.min(1, p.move);
    const sprint = p.sprint && mv > 0.01;
    const roll = Math.max(0, Math.min(1, p.roll));

    // Held crouch is a real skeletal stance, not only a camera/height offset.
    if (p.crouch && roll <= 0.001 && p.seated <= 0.5) {
      this.rot("LeftUpLeg", -1.05, 0, 0);
      this.rot("RightUpLeg", -1.05, 0, 0);
      this.rot("LeftLeg", 1.65, 0, 0);
      this.rot("RightLeg", 1.65, 0, 0);
      this.rot("Spine", 0.16, 0, 0);
      this.rot("Spine1", -0.08, 0, 0);
      this.rot("Spine2", -0.04, 0, 0);
      this.rot("Head", -0.08, 0, 0);
      this.rot("RightArm", 0.18, 0.35, 0.92, "YXZ");
      this.rot("RightForeArm", 0, 0.45, 0);
      this.rot("LeftArm", -0.18, -0.35, -0.92, "YXZ");
      this.rot("LeftForeArm", 0, -0.45, 0);
      return;
    }

    // Compact the character before the tumble so the body visibly rolls
    // through space instead of rotating in a standing idle pose.
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
    } else {
      if (sprint) {
        // Distinct RP sprint: longer stride, higher knees and a small forward
        // body pitch instead of simply scaling the walking animation.
        this.rot("LeftUpLeg", -Math.max(0, s) * 1.32 * mv, 0, 0);
        this.rot("RightUpLeg", Math.max(0, -s) * 1.32 * mv, 0, 0);
        this.rot("LeftLeg", Math.max(0, -c) * 1.52 * mv + 0.10, 0, 0);
        this.rot("RightLeg", Math.max(0, c) * 1.52 * mv + 0.10, 0, 0);
      } else {
        // Compact walk with a softer heel/knee cycle.
        this.rot("LeftUpLeg", -s * 0.52 * mv, 0, 0);
        this.rot("RightUpLeg", s * 0.52 * mv, 0, 0);
        this.rot("LeftLeg", Math.max(0, -c) * 0.78 * mv + 0.035, 0, 0);
        this.rot("RightLeg", Math.max(0, c) * 0.78 * mv + 0.035, 0, 0);
      }
    }
    this.rot("Spine", sprint ? 0.22 + 0.08 * mv : 0.025 * mv, s * 0.045 * mv * (1 - p.aim), 0);
    this.rot("Spine1", -p.pitch * 0.5 * p.aim, 0, 0);
    this.rot("Spine2", -p.pitch * 0.5 * p.aim, 0, 0);
    this.rot("Head", -p.pitch * 0.3, 0, 0);

    const a = p.aim;
    // Right arm: down at side (low ready) -> forward aim
    const rDown = (sprint ? 0.9 : 1.15) * (1 - a);
    const rFwd = (p.pistol ? 1.5 : 1.35) * a + 0.35 * (1 - a);
    this.rot("RightArm", c * 0.25 * mv * (1 - a), rFwd, rDown + 0.08 * a, "YXZ");
    this.rot("RightForeArm", 0, 0.25 * a + 0.5 * (1 - a), 0);

    if (p.radio > 0.01) {
      const r = p.radio;
      this.rot("LeftArm", 0, -0.45 * r - 1.2 * a * (1 - r), (-1.2 * (1 - a) * (1 - r)) - 0.2 * r, "YXZ");
      this.rot("LeftForeArm", 0, -0.2 * r, 2.55 * r);
    } else {
      const lDown = (sprint ? -0.9 : -1.2) * (1 - a);
      const lFwd = -(p.pistol ? 1.45 : 1.25) * a - 0.25 * (1 - a);
      this.rot("LeftArm", -c * 0.25 * mv * (1 - a), lFwd, lDown, "YXZ");
      this.rot("LeftForeArm", 0, -(p.pistol ? 0.35 : 0.75) * a - 0.4 * (1 - a), 0);
    }
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
