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
        m.frustumCulled = false;
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
    const s = Math.sin(p.phase);
    const c = Math.cos(p.phase);
    const mv = p.move;
    if (p.seated > 0.5) {
      this.rot("LeftUpLeg", -1.35, 0, -0.15);
      this.rot("RightUpLeg", -1.35, 0, 0.15);
      this.rot("LeftLeg", 1.4, 0, 0);
      this.rot("RightLeg", 1.4, 0, 0);
    } else {
      this.rot("LeftUpLeg", -s * 0.65 * mv, 0, 0);
      this.rot("RightUpLeg", s * 0.65 * mv, 0, 0);
      this.rot("LeftLeg", Math.max(0, -c) * 1.0 * mv + 0.05, 0, 0);
      this.rot("RightLeg", Math.max(0, c) * 1.0 * mv + 0.05, 0, 0);
    }
    this.rot("Spine", 0.04 * mv, s * 0.06 * mv * (1 - p.aim), 0);
    this.rot("Spine1", -p.pitch * 0.5 * p.aim, 0, 0);
    this.rot("Spine2", -p.pitch * 0.5 * p.aim, 0, 0);
    this.rot("Head", -p.pitch * 0.3, 0, 0);

    const a = p.aim;
    // Right arm: down at side (low ready) -> forward aim
    const rDown = 1.15 * (1 - a);
    const rFwd = (p.pistol ? 1.5 : 1.35) * a + 0.35 * (1 - a);
    this.rot("RightArm", c * 0.25 * mv * (1 - a), rFwd, rDown + 0.08 * a, "YXZ");
    this.rot("RightForeArm", 0, 0.25 * a + 0.5 * (1 - a), 0);

    if (p.radio > 0.01) {
      const r = p.radio;
      this.rot("LeftArm", 0, -0.45 * r - 1.2 * a * (1 - r), (-1.2 * (1 - a) * (1 - r)) - 0.2 * r, "YXZ");
      this.rot("LeftForeArm", 0, -0.2 * r, 2.55 * r);
    } else {
      const lDown = -1.2 * (1 - a);
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
