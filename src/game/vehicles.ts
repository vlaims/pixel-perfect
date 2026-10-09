// @ts-nocheck
import * as THREE from "three";
import { VEHICLES, MOVE, type VehicleCfg } from "./config";
import { heightAt, type Box, ARENA } from "./world";
import type { Actor } from "./engine";

export class Vehicle {
  kind: "car" | "bike";
  cfg: VehicleCfg;
  pos = new THREE.Vector3();
  yaw = 0;
  speed = 0;
  vy = 0;
  airborne = false;
  pitch = 0;
  lean = 0;
  driver: Actor | null = null;
  entering: Actor | null = null;
  entryT = 0;
  door = new THREE.Group();
  group = new THREE.Group();
  body = new THREE.Group();
  wheels: THREE.Mesh[] = [];
  label: string;

  constructor(kind: "car" | "bike", color: string, x: number, z: number, yaw: number, label: string) {
    this.kind = kind;
    this.cfg = VEHICLES[kind];
    this.label = label;
    this.pos.set(x, heightAt(x, z), z);
    this.yaw = yaw;
    this.group.add(this.body);
    this.door.position.set(kind === "car" ? 0.98 : 0, kind === "car" ? 0.72 : 0, kind === "car" ? 0.15 : 0);
    const paint = new THREE.MeshLambertMaterial({ color });
    const paintDark = new THREE.MeshLambertMaterial({ color: "#242629" });
    const tire = new THREE.MeshLambertMaterial({ color: "#17191c" });
    const glass = new THREE.MeshLambertMaterial({ color: "#43849a" });
    const trim = new THREE.MeshLambertMaterial({ color: "#858783" });
    const light = new THREE.MeshBasicMaterial({ color: "#fff0b5" });
    const tail = new THREE.MeshBasicMaterial({ color: "#8d2b2d" });
    const indicator = new THREE.MeshBasicMaterial({ color: "#d79b45" });
    const plate = new THREE.MeshBasicMaterial({ color: "#d4d0c0" });

    const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, zz: number, parent: THREE.Object3D = this.body) => {
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, zz);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      parent.add(mesh);
      return mesh;
    };

    const wheelGeo = new THREE.CylinderGeometry(
      kind === "car" ? 0.43 : 0.35,
      kind === "car" ? 0.43 : 0.35,
      kind === "car" ? 0.34 : 0.13,
      12,
    );
    wheelGeo.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(kind === "car" ? 0.14 : 0.09, kind === "car" ? 0.14 : 0.09, kind === "car" ? 0.315 : 0.145, 10);
    hubGeo.rotateZ(Math.PI / 2);

    if (kind === "car") {
      // Trackhawk-inspired SUV silhouette: wide body, squared greenhouse, hood and high stance.
      add(new THREE.BoxGeometry(2.18, 0.62, 4.42), paint, 0, 0.62, 0);
      add(new THREE.BoxGeometry(2.02, 0.18, 1.16), paint, 0, 0.94, 1.52);
      add(new THREE.BoxGeometry(1.92, 0.18, 0.82), paintDark, 0, 0.91, -1.72);
      add(new THREE.BoxGeometry(1.78, 0.56, 1.98), glass, 0, 1.22, -0.18);
      add(new THREE.BoxGeometry(1.88, 0.10, 1.94), paint, 0, 1.53, -0.18);
      // Front grille, bumper and lower splitter.
      add(new THREE.BoxGeometry(1.18, 0.24, 0.08), paintDark, 0, 0.54, 2.22);
      add(new THREE.BoxGeometry(1.62, 0.12, 0.10), trim, 0, 0.43, 2.24);
      add(new THREE.BoxGeometry(1.74, 0.10, 0.16), paintDark, 0, 0.35, 2.18);

      add(new THREE.BoxGeometry(1.46, 0.32, 0.06), glass, 0, 1.08, 0.72).rotation.x = -0.18;
      add(new THREE.BoxGeometry(1.46, 0.29, 0.06), glass, 0, 1.08, -1.17).rotation.x = 0.18;

      for (const sx of [-0.86, 0.86]) {
        add(new THREE.BoxGeometry(0.04, 0.34, 0.70), glass, sx, 1.08, -0.58);
        add(new THREE.BoxGeometry(0.04, 0.34, 0.60), glass, sx, 1.08, 0.25);
        add(new THREE.BoxGeometry(0.05, 0.055, 1.56), trim, sx * 1.01, 0.83, -0.15);
      }

      add(new THREE.BoxGeometry(1.82, 0.16, 0.16), paintDark, 0, 0.43, 2.08);
      add(new THREE.BoxGeometry(1.68, 0.10, 0.10), trim, 0, 0.50, 2.16);
      add(new THREE.BoxGeometry(0.62, 0.14, 0.04), paintDark, 0, 0.53, 2.18);
      add(new THREE.BoxGeometry(1.82, 0.16, 0.16), paintDark, 0, 0.43, -2.08);
      add(new THREE.BoxGeometry(0.52, 0.13, 0.04), plate, 0, 0.56, -2.17);

      for (const sx of [-0.61, 0.61]) {
        add(new THREE.BoxGeometry(0.34, 0.13, 0.05), light, sx, 0.70, 2.10);
        add(new THREE.BoxGeometry(0.17, 0.10, 0.05), indicator, sx * 0.78, 0.69, 2.115);
        add(new THREE.BoxGeometry(0.34, 0.11, 0.05), tail, sx, 0.69, -2.10);
        add(new THREE.BoxGeometry(0.15, 0.08, 0.05), indicator, sx, 0.69, -2.115);
        add(new THREE.BoxGeometry(0.12, 0.10, 0.16), paintDark, sx * 1.04, 1.04, 0.74);
      }

      this.door.position.set(0.98, 0.65, 0.15);
      this.door.rotation.set(0, 0, 0);
      this.body.add(this.door);

      for (const [wx, wz] of [[1.00, 1.42], [-1.00, 1.42], [1.00, -1.42], [-1.00, -1.42]]) {
        this.wheels.push(add(wheelGeo, tire, wx, 0.38, wz, this.group));
        add(hubGeo, trim, wx, 0.38, wz, this.group);
      }
    } else {
      add(new THREE.BoxGeometry(0.30, 0.34, 1.28), paint, 0, 0.70, 0.04);
      add(new THREE.CylinderGeometry(0.19, 0.22, 0.56, 8), paint, 0, 0.90, 0.27).rotation.x = Math.PI / 2;
      add(new THREE.BoxGeometry(0.38, 0.12, 0.62), trim, 0, 0.98, -0.32);
      add(new THREE.BoxGeometry(0.25, 0.22, 0.34), trim, 0, 0.60, -0.05);
      add(new THREE.BoxGeometry(0.05, 0.58, 0.05), trim, 0, 0.82, 0.66).rotation.x = -0.35;
      add(new THREE.BoxGeometry(0.72, 0.05, 0.05), trim, 0, 1.15, 0.70);
      add(new THREE.BoxGeometry(0.10, 0.10, 0.22), paintDark, -0.17, 0.62, -0.46);
      add(new THREE.BoxGeometry(0.10, 0.10, 0.22), paintDark, 0.17, 0.62, -0.46);
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.72, 7), trim, 0.15, 0.53, -0.36).rotation.x = Math.PI / 2;
      add(new THREE.BoxGeometry(0.18, 0.13, 0.05), light, 0, 1.00, 0.83);
      add(new THREE.BoxGeometry(0.20, 0.08, 0.05), tail, 0, 0.96, -0.72);
      add(new THREE.BoxGeometry(0.44, 0.05, 0.06), trim, 0, 1.05, -0.66);

      for (const wz of [0.85, -0.75]) {
        this.wheels.push(add(wheelGeo, tire, 0, 0.36, wz, this.group));
        add(hubGeo, trim, 0, 0.36, wz, this.group);
      }
    }
    this.syncMesh(1);
  }

  seatPos(out: THREE.Vector3) {
    const back = this.kind === "car" ? 0.3 : -0.15;
    const side = this.kind === "car" ? 0.45 : 0;
    out.set(-Math.cos(this.yaw) * side + Math.sin(this.yaw) * -back, this.cfg.seatY, Math.sin(this.yaw) * side + Math.cos(this.yaw) * -back);
    out.add(this.pos);
    out.y += this.pitch * 0;
    return out;
  }

  beginEntry(actor: Actor) {
    if (this.driver || this.entering) return false;
    this.entering = actor;
    this.entryT = 0;
    return true;
  }

  updateEntry(dt: number) {
    if (!this.entering) return false;
    this.entryT += dt;
    const t = Math.min(1, this.entryT / 0.65);
    const eased = t * t * (3 - 2 * t);
    if (this.kind === "car") this.door.rotation.y = -1.15 * Math.sin(Math.min(1, t * 1.8) * Math.PI / 2);
    const side = this.kind === "car" ? 0.72 : 0;
    const back = this.kind === "car" ? 0.25 : -0.15;
    const a = this.entering;
    a.pos.x = this.pos.x - Math.cos(this.yaw) * side * (1 - eased) + Math.sin(this.yaw) * -back * eased;
    a.pos.z = this.pos.z + Math.sin(this.yaw) * side * (1 - eased) + Math.cos(this.yaw) * -back * eased;
    a.pos.y = heightAt(a.pos.x, a.pos.z) + (this.kind === "car" ? 0.05 : 0.02) + Math.sin(t * Math.PI) * 0.12;
    a.vis.copy(a.pos);
    a.yaw = this.yaw;
    if (t >= 1) {
      a.vehicle = this;
      this.driver = a;
      this.entering = null;
      this.entryT = 0;
      this.door.rotation.y = 0;
      return true;
    }
    return false;
  }

  update(input: { f: number; b: number; l: number; r: number }, dt: number, boxes: Box[], vehicles: Vehicle[]) {
    const c = this.cfg;
    const thr = this.driver ? input.f - input.b : 0;
    if (!this.airborne) {
      if (thr > 0) this.speed += c.accel * dt * (this.speed < 0 ? 2 : 1);
      else if (thr < 0) this.speed -= (this.speed > 0 ? c.brake : c.accel * 0.6) * dt;
      this.speed *= Math.exp(-(thr === 0 ? 0.9 : 0.25) * dt);
      this.speed = Math.max(-c.maxRev, Math.min(c.max, this.speed));
      const steer = this.driver ? input.l - input.r : 0;
      const grip = Math.min(1, Math.abs(this.speed) / 6) * Math.sign(this.speed);
      const turnScale = this.kind === "car" ? 1 - Math.min(0.45, Math.abs(this.speed) / c.max * 0.45) : 1 - Math.min(0.35, Math.abs(this.speed) / c.max * 0.35);
      this.yaw += steer * c.turn * grip * turnScale * dt;
      this.lean += ((this.kind === "bike" ? -steer * Math.min(1, Math.abs(this.speed) / 15) * 0.5 : steer * Math.min(1, Math.abs(this.speed) / 20) * 0.04) - this.lean) * (1 - Math.exp(-8 * dt));
    }
    const nx = this.pos.x + Math.sin(this.yaw) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.yaw) * this.speed * dt;
    const g = heightAt(nx, nz);
    if (!this.airborne && g - this.pos.y > 0.9) {
      this.speed *= -0.3; // hit a cliff wall
    } else {
      this.pos.x = Math.max(-ARENA, Math.min(ARENA, nx));
      this.pos.z = Math.max(-ARENA, Math.min(ARENA, nz));
      const gg = heightAt(this.pos.x, this.pos.z);
      if (this.airborne) {
        this.vy -= MOVE.GRAVITY * dt;
        this.pos.y += this.vy * dt;
        if (this.pos.y <= gg) {
          this.pos.y = gg;
          this.airborne = false;
          this.vy = 0;
        }
      } else if (gg < this.pos.y - 0.35 && Math.abs(this.speed) > 6) {
        this.airborne = true;
      } else {
        const rate = (gg - this.pos.y) / Math.max(dt, 1e-4);
        this.vy = Math.max(-5, Math.min(18, rate));
        this.pos.y = gg;
      }
    }
    // obstacles
    for (const b of boxes) {
      if (this.pos.y > b.y1 - 0.3) continue;
      const cx = Math.max(b.minX, Math.min(this.pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(this.pos.z, b.maxZ));
      const dx = this.pos.x - cx;
      const dz = this.pos.z - cz;
      const d = Math.hypot(dx, dz);
      const rr = c.radius * 0.8;
      if (d < rr && d > 1e-4) {
        this.pos.x += (dx / d) * (rr - d);
        this.pos.z += (dz / d) * (rr - d);
        this.speed *= 0.5;
      }
    }
    for (const o of vehicles) {
      if (o === this) continue;
      const dx = this.pos.x - o.pos.x;
      const dz = this.pos.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      const rr = (this.cfg.radius + o.cfg.radius) * 0.7;
      if (d < rr && d > 1e-4) {
        const push = (rr - d) / 2;
        this.pos.x += (dx / d) * push;
        this.pos.z += (dz / d) * push;
        o.pos.x -= (dx / d) * push;
        o.pos.z -= (dz / d) * push;
        const avg = (this.speed + o.speed) / 2;
        this.speed = avg * 0.6;
        o.speed = avg * 0.6;
      }
    }
    // pitch from terrain
    if (!this.airborne) {
      const L = this.kind === "car" ? 1.6 : 0.9;
      const fx = Math.sin(this.yaw) * L;
      const fz = Math.cos(this.yaw) * L;
      const target = Math.atan2(heightAt(this.pos.x + fx, this.pos.z + fz) - heightAt(this.pos.x - fx, this.pos.z - fz), L * 2);
      this.pitch += (target - this.pitch) * (1 - Math.exp(-12 * dt));
    } else {
      this.pitch += (Math.atan2(this.vy, Math.abs(this.speed) + 1) * 0.6 - this.pitch) * (1 - Math.exp(-3 * dt));
    }
    this.syncMesh(dt);
  }

  syncMesh(dt: number) {
    this.group.position.copy(this.pos);
    this.group.rotation.set(-this.pitch, this.yaw, 0, "YXZ");
    this.body.rotation.z = this.lean;
    for (const w of this.wheels) w.rotation.x += (this.speed * dt) / 0.37;
  }
}
