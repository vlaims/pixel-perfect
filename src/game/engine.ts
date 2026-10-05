// @ts-nocheck
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { WEAPONS, MOVE, BOT_NAMES, type WeaponId, type HitZone } from "./config";
import { buildWorld, heightAt, rayBox, rayTerrain, ARENA, type Box } from "./world";
import { Rig, computeNorm } from "./rig";
import { Vehicle } from "./vehicles";
import { PostPass } from "./post";
import { Sfx } from "./audio";
import { hudStore, settingsStore } from "./store";
import { loadBloodFxDat, selectBloodFx, type BloodFxConfig } from "./bloodfx";

export interface Input {
  f: number;
  b: number;
  l: number;
  r: number;
  scope: boolean;
  shoot: boolean;
  shootPressed: boolean;
  rollPressed: boolean;
  radio: boolean;
  sprint: boolean;
}

const emptyInput = (): Input => ({ f: 0, b: 0, l: 0, r: 0, scope: false, shoot: false, shootPressed: false, rollPressed: false, radio: false, sprint: false });

interface Brain {
  target: Actor | null;
  thinkT: number;
  strafeT: number;
  strafeKey: "l" | "r";
  wander: THREE.Vector3;
  react: number;
  hurtT: number;
  driveT: number;
  goVehicle: Vehicle | null;
  aimErr: number;
}

export class Actor {
  id: number;
  name: string;
  isPlayer: boolean;
  pos = new THREE.Vector3();
  vis = new THREE.Vector3();
  vy = 0;
  grounded = true;
  yaw = 0;
  aimYaw = 0;
  aimPitch = 0;
  hp = 100;
  armor = 100;
  alive = true;
  respawnT = 0;
  weapon: WeaponId = "ar";
  ammo: Record<WeaponId, number> = { ar: 30, pistol: 13 };
  cooldown = 0;
  reloadT = 0;
  rolling = 0;
  rollDir = new THREE.Vector3(0, 0, 1);
  scoping = false;
  radio = 0;
  vehicle: Vehicle | null = null;
  moving = 0;
  phase = 0;
  lastStrafe: "l" | "r" | null = null;
  lastStrafeT = -10;
  boostT = 0;
  prevKeys = { l: 0, r: 0 };
  kills = 0;
  deaths = 0;
  deadT = 0;
  aimBlend = 0;
  root = new THREE.Group();
  pivot = new THREE.Group();
  rig: Rig;
  guns: Record<WeaponId, THREE.Group>;
  flash: THREE.Sprite;
  flashT = 0;
  brain: Brain | null = null;
  input: Input = emptyInput();
  entering = 0;
  rollAngle = 0;
  rollYaw = 0;
  lastAttacker: Actor | null = null;

  constructor(id: number, name: string, isPlayer: boolean, rig: Rig, flashMat: THREE.SpriteMaterial) {
    this.id = id;
    this.name = name;
    this.isPlayer = isPlayer;
    this.rig = rig;
    this.root.add(this.pivot);
    this.pivot.position.y = 0.95;
    rig.holder.position.y = -0.95;
    this.pivot.add(rig.holder);
    this.guns = { ar: makeGun("ar"), pistol: makeGun("pistol") };
    this.flash = new THREE.Sprite(flashMat);
    this.flash.scale.setScalar(0.45);
    this.flash.visible = false;
  }

  get height() {
    return this.rolling > 0 ? MOVE.HEIGHT * 0.5 : this.vehicle ? 1.4 : MOVE.HEIGHT;
  }
}

function makeGun(kind: WeaponId) {
  const g = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({ color: "#1d1e22" });
  const m2 = new THREE.MeshLambertMaterial({ color: "#4a4436" });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat = m) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
  };
  if (kind === "ar") {
    box(0.06, 0.1, 0.55, 0, 0, 0.15);
    box(0.03, 0.03, 0.3, 0, 0.02, 0.55);
    box(0.05, 0.16, 0.06, 0, -0.1, 0.12, m2);
    box(0.05, 0.1, 0.2, 0, -0.03, -0.18, m2);
    box(0.04, 0.12, 0.05, 0, -0.08, -0.02);
  } else {
    box(0.04, 0.07, 0.2, 0, 0, 0.07);
    box(0.035, 0.11, 0.05, 0, -0.07, 0);
  }
  return g;
}

const UP = new THREE.Vector3(0, 1, 0);
const tv = new THREE.Vector3();
const tv2 = new THREE.Vector3();
const tq = new THREE.Quaternion();

interface Tracer {
  line: THREE.Line;
  t: number;
}
interface LegacyConfetti {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  life: number;
}

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
  post: PostPass;
  sfx = new Sfx();
  actors: Actor[] = [];
  vehicles: Vehicle[] = [];
  boxes: Box[] = [];
  player!: Actor;
  camYaw = 0;
  camPitch = 0;
  shoulder = 1;
  keys = new Set<string>();
  mouseL = false;
  mouseR = false;
  shootEdge = false;
  rollEdge = false;
  time = 0;
  sun: THREE.DirectionalLight;
  grassTime: { value: number } = { value: 0 };
  tracers: Tracer[] = [];
  bloodFx!: BloodFxConfig;
  bloodPoints: THREE.Points[] = [];
  fpsEl: HTMLElement | null = null;
  fpsFrames = 0;
  fpsT = 0;
  hudT = 0;
  feedId = 0;
  hitId = 0;
  width = 1;
  height = 1;
  disposed = false;
  last = performance.now();
  canvas: HTMLCanvasElement;
  flashMat: THREE.SpriteMaterial;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.autoUpdate = false;
    this.post = new PostPass(16, 16);

    const sky = new THREE.Color("#9cc4e4");
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog("#b9d3e6", 60, 220);
    this.scene.add(new THREE.HemisphereLight("#cfe6ff", "#5a6b3a", 1.1));
    this.sun = new THREE.DirectionalLight("#fff1d6", 2.4);
    this.sun.castShadow = false;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -45;
    sc.right = sc.top = 45;
    sc.near = 1;
    sc.far = 160;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);

    const w = buildWorld(this.scene);
    this.boxes = w.boxes;
    this.grassTime = w.grassTime;

    const fc = document.createElement("canvas");
    fc.width = fc.height = 64;
    const fx = fc.getContext("2d")!;
    const grad = fx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,250,220,1)");
    grad.addColorStop(0.3, "rgba(255,190,80,0.9)");
    grad.addColorStop(1, "rgba(255,120,20,0)");
    fx.fillStyle = grad;
    fx.fillRect(0, 0, 64, 64);
    this.flashMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(fc), blending: THREE.AdditiveBlending, depthWrite: false });

    // vehicles
    this.vehicles.push(
      new Vehicle("car", "#c23b22", 14, 10, 0.6, "Sedan"),
      new Vehicle("car", "#1f5fa8", -22, 26, 2.2, "Coupe"),
      new Vehicle("bike", "#e0a400", 18, -14, -0.8, "Bati"),
      new Vehicle("bike", "#2a2a2a", -6, -28, 1.4, "Akuma"),
    );
    for (const v of this.vehicles) this.scene.add(v.group);
  }

  async load(modelUrl: string, sounds: Record<string, string>) {
    const loader = new GLTFLoader();
    let model: THREE.Object3D;

    // Lovable previews do not always expose project-local asset URLs.
    // A missing model must not prevent the playable scene from booting.
    try {
      const gltf = await loader.loadAsync(modelUrl);
      model = gltf.scene;
    } catch (error) {
      console.warn("Character asset unavailable; using preview mannequin.", error);
      model = makePreviewMannequin();
    }

    // Audio is already best-effort in Sfx.load, so these can load independently.
    await Promise.all(Object.entries(sounds).map(([k, u]) => this.sfx.load(k, u)));
    this.bloodFx = await loadBloodFxDat();

    const norm = computeNorm(model);
    const tints = [null, "#ff9a9a", "#9ab8ff", "#b8ff9a", "#ffe29a", "#e19aff", "#9affef", "#ffc29a", "#cccccc"];
    for (let i = 0; i < 9; i++) {
      const rig = new Rig(model, norm, tints[i] ? new THREE.Color(tints[i]!) : null);
      const a = new Actor(i, i === 0 ? "You" : BOT_NAMES[i - 1], i === 0, rig, this.flashMat);
      this.scene.add(a.root, a.guns.ar, a.guns.pistol, a.flash);
      if (i > 0) {
        a.brain = { target: null, thinkT: Math.random(), strafeT: 0, strafeKey: "l", wander: new THREE.Vector3(), react: 0.4, hurtT: 0, driveT: 0, goVehicle: null, aimErr: 0.3 };
        this.pickWander(a);
      }
      this.spawn(a, i === 0 ? new THREE.Vector3(0, 0, -6) : undefined);
      this.actors.push(a);
    }
    this.player = this.actors[0];
    this.camYaw = 0;
    hudStore.set({ loading: false });
  }

  start() {
    this.renderer.setAnimationLoop(() => this.frame());
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
    void this.sfx.ctx.close();
  }

  resize(w: number, h: number, pr: number) {
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(Math.min(pr, 1.25));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.setSize(Math.floor(w * pr), Math.floor(h * pr));
  }

  // ---------- input ----------
  onKey(code: string, down: boolean) {
    if (down) {
      if (this.keys.has(code)) return;
      this.keys.add(code);
      const p = this.player;
      if (!p || !p.alive) return;
      if (code === "Digit1" && !p.vehicle) this.switchWeapon(p, "ar");
      if (code === "Digit2") this.switchWeapon(p, "pistol");
      if (code === "KeyR") this.reload(p);
      if (code === "KeyE") this.toggleVehicle(p);
      if (code === "Space") this.rollEdge = true;
      if (code === "KeyT" && this.mouseR) this.shoulder *= -1;
    } else this.keys.delete(code);
  }
  onMouse(button: number, down: boolean) {
    if (button === 0) {
      if (down && !this.mouseL) this.shootEdge = true;
      this.mouseL = down;
    }
    if (button === 2) this.mouseR = down;
  }
  onLook(dx: number, dy: number) {
    const s = 0.0022 * settingsStore.get().sensitivity * (this.mouseR ? 0.7 : 1);
    this.camYaw -= dx * s;
    this.camPitch = Math.max(-1.2, Math.min(1.1, this.camPitch - dy * s));
  }
  clearInput() {
    this.keys.clear();
    this.mouseL = this.mouseR = false;
  }

  // ---------- actions ----------
  switchWeapon(a: Actor, w: WeaponId) {
    if (a.weapon === w) return;
    a.weapon = w;
    a.reloadT = 0;
    a.cooldown = 0.15;
  }
  reload(a: Actor) {
    const w = WEAPONS[a.weapon];
    if (a.reloadT > 0 || a.ammo[a.weapon] >= w.mag || !a.alive) return;
    a.reloadT = w.reload;
    this.playAt("reload", a, 0.9);
  }
  toggleVehicle(a: Actor) {
    if (a.vehicle) {
      const v = a.vehicle;
      v.driver = null;
      a.vehicle = null;
      const side = v.kind === "car" ? 1.8 : 1.1;
      a.pos.set(v.pos.x + Math.cos(v.yaw) * side, 0, v.pos.z - Math.sin(v.yaw) * side);
      a.pos.y = heightAt(a.pos.x, a.pos.z);
      a.vis.copy(a.pos);
      a.yaw = v.yaw;
      return;
    }
    let best: Vehicle | null = null;
    let bd = 3.8;
    for (const v of this.vehicles) {
      const d = v.pos.distanceTo(a.pos);
      if (!v.driver && d < bd) {
        bd = d;
        best = v;
      }
    }
    if (best) {
      if (best.beginEntry(a)) {
        a.entering = 0.65;
        a.rolling = 0;
      }
    }
  }

  spawn(a: Actor, at?: THREE.Vector3) {
    let p = at;
    if (!p) {
      for (let i = 0; i < 30; i++) {
        const c = new THREE.Vector3((Math.random() - 0.5) * 160, 0, (Math.random() - 0.5) * 160);
        if (this.boxes.some((b) => c.x > b.minX - 1 && c.x < b.maxX + 1 && c.z > b.minZ - 1 && c.z < b.maxZ + 1)) continue;
        if (this.actors.some((o) => o !== a && o.alive && o.pos.distanceTo(c) < 25)) continue;
        p = c;
        break;
      }
      p ??= new THREE.Vector3(0, 0, 0);
    }
    a.pos.set(p.x, heightAt(p.x, p.z), p.z);
    a.vis.copy(a.pos);
    a.hp = 100;
    a.armor = 100;
    a.alive = true;
    a.ammo = { ar: 30, pistol: 13 };
    a.weapon = "ar";
    a.reloadT = 0;
    a.rolling = 0;
    a.rollAngle = 0;
    a.rollYaw = a.yaw;
    a.vy = 0;
    a.pivot.rotation.set(0, 0, 0);
    a.pivot.position.y = 0.95;
    a.yaw = Math.random() * Math.PI * 2;
    a.aimYaw = a.yaw;
  }

  playAt(name: string, a: Actor, vol: number) {
    const d = this.player ? a.pos.distanceTo(this.player.pos) : 0;
    const v = a.isPlayer ? vol : vol * Math.max(0, 1 - d / 120) * 0.8;
    this.sfx.play(name, v, 0.97 + Math.random() * 0.06);
  }

  // ---------- shooting ----------
  fire(a: Actor, origin: THREE.Vector3, dir: THREE.Vector3, minT: number) {
    const w = WEAPONS[a.weapon];
    a.ammo[a.weapon]--;
    a.cooldown = w.cooldown;
    a.flashT = 0.04;
    this.playAt("shoot", a, 0.7);

    let bestT = 220;
    let hitActor: Actor | null = null;
    let zone: HitZone = "body";
    for (const o of this.actors) {
      if (o === a || !o.alive) continue;
      const r = this.rayActor(origin, dir, o, bestT);
      if (r && r.t > minT && r.t < bestT) {
        bestT = r.t;
        hitActor = o;
        zone = r.zone;
      }
    }
    for (const b of this.boxes) {
      const t = rayBox(origin, dir, b, bestT);
      if (t > minT && t < bestT) {
        bestT = t;
        hitActor = null;
      }
    }
    const tt = rayTerrain(origin, dir, bestT);
    if (tt > 0 && tt < bestT) {
      bestT = tt;
      hitActor = null;
    }
    const end = tv.copy(origin).addScaledVector(dir, bestT);
    const muzzle = a.guns[a.weapon].getWorldPosition(tv2);
    this.addTracer(muzzle, end);
    if (hitActor) {
      this.damage(hitActor, w.dmg[zone], a, zone === "head", zone);
    }
  }

  rayActor(o: THREE.Vector3, d: THREE.Vector3, act: Actor, maxT: number): { t: number; zone: HitZone } | null {
    const R = MOVE.RADIUS;
    const base = act.vehicle ? act.vehicle.seatPos(tv2).y - 0.25 : act.pos.y;
    const cx = act.vehicle ? tv2.x : act.pos.x;
    const cz = act.vehicle ? tv2.z : act.pos.z;
    const h = act.height;
    const ox = o.x - cx;
    const oz = o.z - cz;
    const A = d.x * d.x + d.z * d.z;
    const B = 2 * (ox * d.x + oz * d.z);
    const C = ox * ox + oz * oz - R * R;
    const disc = B * B - 4 * A * C;
    if (disc < 0 || A < 1e-8) return null;
    const sq = Math.sqrt(disc);
    const t0 = (-B - sq) / (2 * A);
    const t1 = (-B + sq) / (2 * A);
    let t = -1;
    for (const tc of [t0, t1]) {
      const y = o.y + d.y * tc;
      if (tc > 0 && tc < maxT && y >= base && y <= base + h) {
        t = tc;
        break;
      }
    }
    // top cap
    if (t < 0 && Math.abs(d.y) > 1e-6) {
      const tc = (base + h - o.y) / d.y;
      if (tc > Math.max(0, t0) && tc < Math.min(maxT, t1)) t = tc;
    }
    if (t < 0) return null;
    const frac = (o.y + d.y * t - base) / h;
    const zone: HitZone = act.vehicle ? (frac > 0.8 ? "head" : "body") : frac > 0.84 ? "head" : frac > 0.5 ? "body" : "legs";
    return { t, zone };
  }

  damage(target: Actor, dmg: number, attacker: Actor | null, head: boolean, zone: HitZone = head ? "head" : "body") {
    if (!target.alive) return;
    let d = dmg;
    const absorbed = Math.min(target.armor, d);
    target.armor -= absorbed;
    d -= absorbed;
    target.hp = Math.max(0, target.hp - d);
    target.lastAttacker = attacker;
    if (target.brain) {
      target.brain.hurtT = 1.2;
      if (attacker && attacker !== target) target.brain.target = attacker;
    }
    if (attacker?.isPlayer && target !== attacker) {
      hudStore.set({ hit: { id: ++this.hitId, head, zone } });
    }
    if (target.hp <= 0) this.kill(target, attacker, head);
  }

  kill(target: Actor, attacker: Actor | null, head: boolean) {
    target.alive = false;
    target.deaths++;
    target.deadT = 0;
    target.respawnT = target.isPlayer ? 3.5 : 4.5;
    if (target.vehicle) {
      target.vehicle.driver = null;
      target.vehicle = null;
    }
    if (attacker && attacker !== target) attacker.kills++;
    if (attacker?.isPlayer && target !== attacker) {
      this.sfx.play("fire", 0.9);
      this.burstBlood(target.pos, head);
    }
    const feed = [{ id: ++this.feedId, killer: attacker?.name ?? "World", victim: target.name, head }, ...hudStore.get().feed].slice(0, 5);
    hudStore.set({ feed });
  }

  addTracer(a: THREE.Vector3, b: THREE.Vector3) {
    let tr = this.tracers.find((t) => t.t <= 0);
    if (!tr) {
      const g = new THREE.BufferGeometry().setFromPoints([a, b]);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: "#ffe9a8", transparent: true, opacity: 0.8 }));
      line.frustumCulled = false;
      this.scene.add(line);
      tr = { line, t: 0 };
      this.tracers.push(tr);
    }
    const pa = tr.line.geometry.attributes.position as THREE.BufferAttribute;
    pa.setXYZ(0, a.x, a.y, a.z);
    pa.setXYZ(1, b.x, b.y, b.z);
    pa.needsUpdate = true;
    tr.t = 0.06;
    tr.line.visible = true;
  }

  burstBlood(at: THREE.Vector3, headshot: boolean) {
    const entry = selectBloodFx(this.bloodFx, headshot);
    const n = Math.min(90, Math.max(28, Math.round(45 + entry.spraySizeHi * 180)));
    const positions = new Float32Array(n * 3);
    const velocities: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3(Math.random()*2-1, Math.random()*1.4+0.1, Math.random()*2-1).normalize();
      velocities.push(dir.multiplyScalar(entry.velocity * (0.55 + Math.random()*0.75)));
      positions[i*3] = at.x; positions[i*3+1] = at.y + 0.95; positions[i*3+2] = at.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({color:0x8f1820,size:Math.max(0.025,Math.min(0.11,entry.spraySizeHi*entry.scale)),transparent:true,opacity:0.8,depthWrite:false});
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    (points as any).userData = {velocities,life:Math.max(0.2,Math.min(0.55,entry.lifeMax)),maxLife:Math.max(0.2,Math.min(0.55,entry.lifeMax)),gravity:entry.gravity};
    this.scene.add(points);
    this.bloodPoints.push(points);
  }

  // ---------- simulation ----------
  readPlayerInput(): Input {
    const k = this.keys;
    const inp: Input = {
      f: k.has("KeyW") ? 1 : 0,
      b: k.has("KeyS") ? 1 : 0,
      l: k.has("KeyA") ? 1 : 0,
      r: k.has("KeyD") ? 1 : 0,
      scope: this.mouseR,
      shoot: this.mouseL,
      shootPressed: this.shootEdge,
      rollPressed: this.rollEdge,
      radio: k.has("KeyQ"),
      sprint: k.has("ShiftLeft") || k.has("ShiftRight"),
    };
    this.shootEdge = false;
    this.rollEdge = false;
    return inp;
  }

  moveActor(a: Actor, inp: Input, dt: number) {
    // weapon timers
    a.cooldown -= dt;
    if (a.reloadT > 0) {
      a.reloadT -= dt;
      if (a.reloadT <= 0) a.ammo[a.weapon] = WEAPONS[a.weapon].mag;
    }
    a.radio += ((inp.radio ? 1 : 0) - a.radio) * (1 - Math.exp(-14 * dt));
    a.scoping = inp.scope && !inp.radio;

    if (a.vehicle) return;

    // Roll state is a real travelling tumble, not an in-place spin.
    // Keep the roll direction stable enough to show a coherent body rotation
    // while still allowing WASD steering.
    if (a.rolling <= 0) a.rollAngle = 0;

    // stutter-step: alternating A/D taps while W released
    const now = this.time;
    for (const key of ["l", "r"] as const) {
      if (inp[key] && !a.prevKeys[key]) {
        if (!inp.f && a.lastStrafe && a.lastStrafe !== key && now - a.lastStrafeT < MOVE.STUTTER_WINDOW) a.boostT = 0.35;
        a.lastStrafe = key;
        a.lastStrafeT = now;
      }
    }
    a.prevKeys.l = inp.l;
    a.prevKeys.r = inp.r;
    a.boostT -= dt;

    const fwdX = Math.sin(a.aimYaw);
    const fwdZ = Math.cos(a.aimYaw);
    const rightX = -fwdZ;
    const rightZ = fwdX;
    const mf = inp.f - inp.b;
    const ms = inp.r - inp.l;
    let dx = fwdX * mf + rightX * ms;
    let dz = fwdZ * mf + rightZ * ms;
    const len = Math.hypot(dx, dz);
    if (len > 0) {
      dx /= len;
      dz /= len;
    }

    // roll trigger: only while scoping
    if (inp.rollPressed && a.scoping && a.rolling <= 0 && a.grounded && a.radio < 0.5) {
      a.rolling = MOVE.ROLL_TIME;
      if (len > 0) a.rollDir.set(dx, 0, dz);
      else a.rollDir.set(fwdX, 0, fwdZ);
      a.rollYaw = Math.atan2(a.rollDir.x, a.rollDir.z);
      a.yaw = a.rollYaw;
      a.rollAngle = 0;
    }

    let vx = 0;
    let vz = 0;
    if (a.rolling > 0) {
      a.rolling -= dt;
      if (len > 0) {
        const wantedYaw = Math.atan2(dx, dz);
        a.rollYaw = lerpAngle(a.rollYaw, wantedYaw, 1 - Math.exp(-9 * dt));
        a.rollDir.set(Math.sin(a.rollYaw), 0, Math.cos(a.rollYaw));
      }
      const rollProgress = 1 - Math.max(0, a.rolling) / MOVE.ROLL_TIME;
      a.rollAngle = Math.min(1, Math.max(0, rollProgress)) * Math.PI * 2;
      a.yaw = a.rollYaw;
      vx = a.rollDir.x * MOVE.ROLL_SPEED;
      vz = a.rollDir.z * MOVE.ROLL_SPEED;
      if (a.rolling <= 0) {
        a.rolling = 0;
        a.rollAngle = Math.PI * 2;
        a.yaw = a.rollYaw;
        a.pivot.rotation.set(0, 0, 0);
        a.pivot.position.y = 0.95;
      }
    } else if (len > 0) {
      let sp = a.scoping ? MOVE.AIM_WALK : (inp.sprint && inp.f && !inp.b ? MOVE.RUN * 1.28 : MOVE.RUN);
      if (a.boostT > 0) sp *= MOVE.STUTTER_MULT;
      vx = dx * sp;
      vz = dz * sp;
    }
    a.moving = len > 0 || a.rolling > 0 ? Math.hypot(vx, vz) : 0;

    // facing
    if (a.rolling <= 0) {
      let target = a.yaw;
      const onlyBack = inp.b && !inp.f && !inp.l && !inp.r;
      if (a.scoping) target = a.aimYaw;
      else if (onlyBack) target = a.aimYaw;
      else if (len > 0) target = Math.atan2(dx, dz);
      if (a.scoping) a.yaw = target;
      else a.yaw = lerpAngle(a.yaw, target, 1 - Math.exp(-22 * dt));
    }

    // translate with step + obstacle checks
    const nx = a.pos.x + vx * dt;
    const nz = a.pos.z + vz * dt;
    const ng = heightAt(nx, nz);
    if (ng - a.pos.y <= MOVE.STEP) {
      a.pos.x = nx;
      a.pos.z = nz;
    } else {
      // try sliding
      if (heightAt(nx, a.pos.z) - a.pos.y <= MOVE.STEP) a.pos.x = nx;
      else if (heightAt(a.pos.x, nz) - a.pos.y <= MOVE.STEP) a.pos.z = nz;
    }
    a.pos.x = Math.max(-ARENA, Math.min(ARENA, a.pos.x));
    a.pos.z = Math.max(-ARENA, Math.min(ARENA, a.pos.z));
    for (const b of this.boxes) {
      if (a.pos.y >= b.y1 - 0.2) continue;
      const cx = Math.max(b.minX, Math.min(a.pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(a.pos.z, b.maxZ));
      const ddx = a.pos.x - cx;
      const ddz = a.pos.z - cz;
      const d = Math.hypot(ddx, ddz);
      if (d < MOVE.RADIUS) {
        if (d < 1e-5) {
          a.pos.x += MOVE.RADIUS;
        } else {
          a.pos.x += (ddx / d) * (MOVE.RADIUS - d);
          a.pos.z += (ddz / d) * (MOVE.RADIUS - d);
        }
      }
    }
    // gravity
    const g = heightAt(a.pos.x, a.pos.z);
    if (a.pos.y > g + 0.08) {
      a.grounded = false;
      a.vy -= MOVE.GRAVITY * dt;
      a.pos.y += a.vy * dt;
      if (a.pos.y <= g) {
        a.pos.y = g;
        a.vy = 0;
        a.grounded = true;
      }
    } else {
      a.pos.y = g;
      a.vy = 0;
      a.grounded = true;
    }
  }

  tryShoot(a: Actor, inp: Input, origin: THREE.Vector3, dir: THREE.Vector3, minT: number) {
    // The player can only fire while holding the scope/aim button.
    if (a.isPlayer && !inp.scope) return;
    if (!a.alive || inp.radio || a.radio > 0.5 || a.rolling > 0 || a.reloadT > 0) return;
    const w = WEAPONS[a.weapon];
    const want = w.auto ? inp.shoot : inp.shootPressed;
    if (!want || a.cooldown > 0) return;
    if (a.ammo[a.weapon] <= 0) {
      if (inp.shootPressed) this.sfx.play("shoot", 0); // dry
      return;
    }
    this.fire(a, origin, dir, minT);
  }

  updateBot(a: Actor, dt: number) {
    const br = a.brain!;
    const inp = emptyInput();
    br.thinkT -= dt;
    br.hurtT -= dt;
    if (br.thinkT <= 0) {
      br.thinkT = 0.4 + Math.random() * 0.3;
      let best: Actor | null = null;
      let bd = 75;
      for (const o of this.actors) {
        if (o === a || !o.alive) continue;
        const d = o.pos.distanceTo(a.pos);
        if (d < bd && this.los(a, o)) {
          bd = d;
          best = o;
        }
      }
      if (best !== br.target) {
        br.react = 0.35 + Math.random() * 0.4;
        br.aimErr = 0.25;
      }
      br.target = best;
      if (!best && !a.vehicle && !br.goVehicle && Math.random() < 0.08) {
        const free = this.vehicles.filter((v) => !v.driver && v.pos.distanceTo(a.pos) < 30);
        if (free.length) br.goVehicle = free[0];
      }
    }
    const t = br.target && br.target.alive ? br.target : null;
    br.react -= dt;
    br.aimErr = Math.max(0.02, br.aimErr - dt * 0.25);

    // desired aim
    let goal: THREE.Vector3;
    if (t) {
      goal = tv.set(t.vis.x, t.vis.y + (t.vehicle ? 1.0 : t.rolling > 0 ? 0.5 : 1.2), t.vis.z);
    } else if (br.goVehicle) {
      goal = tv.copy(br.goVehicle.pos);
    } else goal = tv.copy(br.wander);
    const eye = tv2.set(a.pos.x, a.pos.y + 1.55, a.pos.z);
    if (a.vehicle) eye.y = a.vehicle.pos.y + 1.6;
    const gx = goal.x - (a.vehicle ? a.vehicle.pos.x : a.pos.x);
    const gz = goal.z - (a.vehicle ? a.vehicle.pos.z : a.pos.z);
    const dist = Math.hypot(gx, gz);
    const wantYaw = Math.atan2(gx, gz);
    const wantPitch = Math.atan2(goal.y - eye.y, dist);
    a.aimYaw = lerpAngle(a.aimYaw, wantYaw, 1 - Math.exp(-7 * dt));
    a.aimPitch += (wantPitch - a.aimPitch) * (1 - Math.exp(-7 * dt));

    if (a.vehicle) {
      const v = a.vehicle;
      br.driveT -= dt;
      const dyaw = angleDiff(v.yaw, wantYaw);
      inp.f = dist > 12 ? 1 : 0;
      inp.b = dist < 5 ? 1 : 0;
      inp.l = dyaw > 0.12 ? 1 : 0;
      inp.r = dyaw < -0.12 ? 1 : 0;
      if (!t && dist < 8) this.pickWander(a);
      if (br.driveT <= 0 || (t && dist < 10 && Math.abs(v.speed) < 3)) {
        this.toggleVehicle(a);
        br.goVehicle = null;
      }
      a.input = inp;
      if (t && br.react <= 0 && dist < 45) {
        inp.shoot = true;
        inp.shootPressed = a.cooldown <= 0 && Math.random() < 0.5;
      }
    } else {
      if (t) {
        inp.scope = true;
        if (dist > 26) inp.f = 1;
        else if (dist < 10) inp.b = 1;
        br.strafeT -= dt;
        if (br.strafeT <= 0) {
          br.strafeT = 0.18 + Math.random() * 0.35;
          br.strafeKey = br.strafeKey === "l" ? "r" : "l";
        }
        inp[br.strafeKey] = 1;
        if (br.hurtT > 0 && Math.random() < dt * 1.5) inp.rollPressed = true;
        if (br.react <= 0 && Math.abs(angleDiff(a.aimYaw, wantYaw)) < 0.12) {
          inp.shoot = true;
          inp.shootPressed = true;
        }
        if (a.weapon !== "ar") this.switchWeapon(a, "ar");
      } else if (br.goVehicle) {
        inp.f = 1;
        if (br.goVehicle.driver) br.goVehicle = null;
        else if (dist < 3) {
          this.toggleVehicle(a);
          br.driveT = 10 + Math.random() * 12;
          this.pickWander(a);
        }
      } else {
        inp.f = 1;
        if (dist < 4) this.pickWander(a);
      }
      if (a.ammo[a.weapon] <= 0) this.reload(a);
    }
    a.input = inp;
    this.moveActor(a, inp, dt);

    if (inp.shoot && t && !(a.weapon === "pistol" && !inp.shootPressed)) {
      const dir = new THREE.Vector3(Math.sin(a.aimYaw) * Math.cos(a.aimPitch), Math.sin(a.aimPitch), Math.cos(a.aimYaw) * Math.cos(a.aimPitch));
      const spread = br.aimErr * 0.25 + 0.022 + (t.rolling > 0 ? 0.04 : 0) + (a.vehicle ? 0.03 : 0) + (a.moving > 0 ? 0.008 : 0);
      dir.x += (Math.random() - 0.5) * spread * 2;
      dir.y += (Math.random() - 0.5) * spread * 1.4 - 0.004;
      dir.z += (Math.random() - 0.5) * spread * 2;
      dir.normalize();
      this.tryShoot(a, inp, eye.clone(), dir, 0.5);
    }
  }

  pickWander(a: Actor) {
    a.brain!.wander.set((Math.random() - 0.5) * 150, 0, (Math.random() - 0.5) * 150);
  }

  los(a: Actor, b: Actor) {
    const o = new THREE.Vector3(a.pos.x, a.pos.y + 1.55, a.pos.z);
    const t = new THREE.Vector3(b.pos.x, b.pos.y + 1.2, b.pos.z);
    const d = t.clone().sub(o);
    const len = d.length();
    d.divideScalar(len);
    for (const bx of this.boxes) {
      const tt = rayBox(o, d, bx, len);
      if (tt >= 0 && tt < len) return false;
    }
    const tt = rayTerrain(o, d, len);
    return !(tt > 0 && tt < len);
  }

  frame() {
    if (this.disposed) return;
    const now = performance.now();
    const raw = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(raw, 0.033);
    this.time += dt;

    // fps
    this.fpsFrames++;
    this.fpsT += raw;
    if (this.fpsT >= 0.25) {
      if (this.fpsEl) this.fpsEl.textContent = String(Math.round(this.fpsFrames / this.fpsT));
      this.fpsFrames = 0;
      this.fpsT = 0;
    }

    if (!this.player) {
      this.render();
      return;
    }
    const p = this.player;
    const settings = settingsStore.get();
    this.sfx.setVolume(settings.volume);

    // player
    const locked = hudStore.get().locked;
    const pin = locked && p.alive ? this.readPlayerInput() : emptyInput();
    if (!locked) {
      this.shootEdge = false;
      this.rollEdge = false;
    }
    p.aimYaw = this.camYaw;
    p.aimPitch = this.camPitch;
    p.input = pin;
    if (p.alive) this.moveActor(p, pin, dt);

    // bots
    for (const a of this.actors) {
      if (a.isPlayer) continue;
      if (a.alive) this.updateBot(a, dt);
    }

    // vehicles
    for (const v of this.vehicles) {
      const wasDriver = v.driver;
      v.updateEntry(dt);
      if (v.driver && v.driver.weapon === "ar" && v.driver !== wasDriver) this.switchWeapon(v.driver, "pistol");
      const inp = v.driver ? v.driver.input : emptyInput();
      v.update(inp, dt, this.boxes, this.vehicles);
      if (v.driver) {
        v.driver.pos.copy(v.seatPos(tv));
        v.driver.yaw = v.yaw;
      }
      // run-over
      if (Math.abs(v.speed) > 9 && v.driver) {
        for (const a of this.actors) {
          if (!a.alive || a.vehicle) continue;
          if (Math.hypot(a.pos.x - v.pos.x, a.pos.z - v.pos.z) < v.cfg.radius * 0.75 && Math.abs(a.pos.y - v.pos.y) < 1.5) {
            this.damage(a, Math.abs(v.speed) * 5, v.driver, false);
            v.speed *= 0.7;
          }
        }
      }
    }

    // actor separation
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i];
      if (!a.alive || a.vehicle) continue;
      for (let j = i + 1; j < this.actors.length; j++) {
        const b = this.actors[j];
        if (!b.alive || b.vehicle) continue;
        const dx = a.pos.x - b.pos.x;
        const dz = a.pos.z - b.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.8 && d > 1e-4) {
          const push = (0.8 - d) / 2;
          a.pos.x += (dx / d) * push;
          a.pos.z += (dz / d) * push;
          b.pos.x -= (dx / d) * push;
          b.pos.z -= (dz / d) * push;
        }
      }
    }

    // camera
    this.updateCamera(dt);

    // player shooting (screen-center ray)
    if (p.alive) {
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      const origin = this.camera.position.clone();
      const pivot = new THREE.Vector3(p.vis.x, p.vis.y + 1.4, p.vis.z);
      const minT = Math.max(0.5, pivot.sub(origin).dot(dir));
      if (p.ammo[p.weapon] <= 0 && pin.shootPressed && p.reloadT <= 0) {
        // empty click - manual reload required
      }
      this.tryShoot(p, pin, origin, dir, minT);
    }

    // deaths / respawn
    for (const a of this.actors) {
      if (!a.alive) {
        a.deadT += dt;
        a.respawnT -= dt;
        if (a.respawnT <= 0) this.spawn(a);
      }
    }

    this.updateVisuals(dt);
    this.updateEffects(dt);
    this.syncHud(dt);
    this.render();
  }

  updateCamera(dt: number) {
    const p = this.player;
    const cam = this.camera;
    const yaw = this.camYaw;
    const pitch = this.camPitch;
    const fx = Math.sin(yaw) * Math.cos(pitch);
    const fy = Math.sin(pitch);
    const fz = Math.cos(yaw) * Math.cos(pitch);
    const rx = -Math.cos(yaw);
    const rz = Math.sin(yaw);
    let pivot: THREE.Vector3;
    let back: number;
    let side: number;
    const scoping = this.mouseR && p.alive;
    if (p.vehicle) {
      pivot = tv.set(p.vehicle.pos.x, p.vehicle.pos.y + (p.vehicle.kind === "car" ? 2.0 : 1.7), p.vehicle.pos.z);
      back = scoping ? p.vehicle.cfg.camBack * 0.7 : p.vehicle.cfg.camBack;
      side = scoping ? 0.6 * this.shoulder : 0;
    } else {
      pivot = tv.set(p.vis.x, p.vis.y + (p.rolling > 0 ? 1.2 : 1.6), p.vis.z);
      back = scoping ? 1.5 : 3.0;
      side = (scoping ? 0.55 : 0.5) * this.shoulder;
    }
    const target = tv2.set(pivot.x - fx * back + rx * side, pivot.y - fy * back + 0.15, pivot.z - fz * back + rz * side);
    const gh = heightAt(target.x, target.z) + 0.3;
    if (target.y < gh) target.y = gh;
    cam.position.lerp(target, 1 - Math.exp(-30 * dt));
    cam.lookAt(cam.position.x + fx, cam.position.y + fy, cam.position.z + fz);
    const fov = scoping ? 52 : 70;
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov += (fov - cam.fov) * (1 - Math.exp(-18 * dt));
      cam.updateProjectionMatrix();
    }
    // sun follows player
    this.sun.position.set(p.pos.x + 30, p.pos.y + 60, p.pos.z + 20);
    this.sun.target.position.set(p.pos.x, p.pos.y, p.pos.z);
  }

  updateVisuals(dt: number) {
    const lagK = 1 - Math.exp(-dt / MOVE.LAG);
    for (const a of this.actors) {
      // network lag buffer interpolation
      if (a.vehicle || a.rolling > 0) a.vis.copy(a.pos);
      else a.vis.lerp(a.pos, lagK);
      a.root.position.copy(a.vis);
      a.root.rotation.y = a.vehicle ? a.vehicle.yaw : a.yaw;
      // Cars fully occlude the seated character to prevent mesh/roof clipping.
      a.rig.holder.visible = !(a.vehicle && a.vehicle.kind === "car");
      a.phase += dt * (a.moving > 0 ? 2 + a.moving * 1.45 : 0);
      const aimTarget = a.alive && (a.scoping || a.input.shoot || a.cooldown > -0.6) && a.radio < 0.5 ? 1 : 0;
      a.aimBlend += (aimTarget - a.aimBlend) * (1 - Math.exp(-80 * dt));

      if (!a.alive) {
        const k = Math.min(1, a.deadT / 0.35);
        a.pivot.rotation.set(-Math.PI / 2 * k, 0, 0);
        a.pivot.position.y = 0.95 - 0.75 * k;
      } else if (a.rolling > 0) {
        const t = 1 - a.rolling / MOVE.ROLL_TIME;
        const rollEase = t * t * (3 - 2 * t);
        a.root.rotation.y = a.rollYaw;
        a.pivot.rotation.set(rollEase * Math.PI * 2, 0, 0);
        // Lower the center of mass during the tuck.
        a.pivot.position.y = 0.58 + Math.sin(rollEase * Math.PI) * 0.12;
      } else {
        a.pivot.rotation.set(0, 0, 0);
        a.pivot.position.y = 0.95;
        a.rollAngle = 0;
      }
      if (a.vehicle && a.vehicle.kind === "bike") a.pivot.rotation.z = a.vehicle.lean;

      const pitch = a.aimPitch;
      a.rig.pose({
        phase: a.phase,
        move: a.vehicle || !a.alive ? 0 : Math.min(1, a.moving / MOVE.RUN) * (a.rolling > 0 ? 0 : 1),
         sprint: !a.vehicle && a.input.sprint && a.input.f && !a.input.b && a.moving > MOVE.RUN * 0.9,
        aim: a.rolling > 0 ? 0.2 : a.aimBlend,
        pitch: a.vehicle ? pitch * 0.5 : pitch,
        radio: a.radio,
        seated: a.vehicle ? 1 : 0,
        pistol: a.weapon === "pistol",
        dead: !a.alive,
        roll: a.rolling > 0 ? 1 - a.rolling / MOVE.ROLL_TIME : 0,
      });

      // guns
      a.root.updateMatrixWorld(true);
      const hand = a.rig.getBone("RightHand");
      for (const w of ["ar", "pistol"] as const) {
        const g = a.guns[w];
        g.visible = a.weapon === w && a.alive && !(a.vehicle && a.vehicle.kind === "car");
        if (!g.visible || !hand) continue;
        hand.getWorldPosition(g.position);
        const gy = a.aimBlend > 0.5 ? a.aimYaw : a.root.rotation.y;
        const gp = a.aimBlend > 0.5 ? a.aimPitch : -0.6;
        g.rotation.set(-gp, gy, 0, "YXZ");
        if (w === "ar") g.position.addScaledVector(tq.setFromEuler(g.rotation) && tv.set(0, 0, 1).applyEuler(g.rotation), -0.05);
      }
      a.flashT -= dt;
      a.flash.visible = a.flashT > 0;
      if (a.flash.visible) {
        const g = a.guns[a.weapon];
        const off = a.weapon === "ar" ? 0.72 : 0.22;
        a.flash.position.copy(g.position).add(tv.set(0, 0.02, off).applyEuler(g.rotation));
        a.flash.material.rotation = Math.random() * 6;
      }
      a.root.visible = !(a.isPlayer && this.camera.position.distanceTo(tv2.set(a.vis.x, a.vis.y + 1.5, a.vis.z)) < 0.6);
    }
    void UP;
  }

  updateEffects(dt: number) {
    this.grassTime.value = this.time;
    for (const t of this.tracers) {
      if (t.t > 0) {
        t.t -= dt;
        if (t.t <= 0) t.line.visible = false;
      }
    }
    for (let i = this.bloodPoints.length - 1; i >= 0; i--) {
      const o = this.bloodPoints[i];
      const d = (o as any).userData;
      d.life -= dt;
      const p = o.geometry.attributes.position as THREE.BufferAttribute;
      for (let j = 0; j < d.velocities.length; j++) {
        const v = d.velocities[j] as THREE.Vector3;
        v.y -= d.gravity * dt;
        p.setXYZ(j, p.getX(j) + v.x * dt, p.getY(j) + v.y * dt, p.getZ(j) + v.z * dt);
      }
      p.needsUpdate = true;
      (o.material as THREE.PointsMaterial).opacity = Math.max(0, d.life / d.maxLife) * 0.72;
      if (d.life <= 0) {
        this.scene.remove(o);
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
        this.bloodPoints.splice(i, 1);
      }
    }
  }

  syncHud(dt: number) {
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 0.05;
    const p = this.player;
    let prompt: string | null = null;
    if (p.alive && !p.vehicle) {
      const v = this.vehicles.find((v) => !v.driver && v.pos.distanceTo(p.pos) < 3.8);
      if (v) prompt = `Press E to ${v.kind === "bike" ? "ride" : "drive"} ${v.label}`;
    } else if (p.vehicle) prompt = "Press E to exit";
    hudStore.set({
      hp: Math.ceil(p.hp),
      armor: Math.ceil(p.armor),
      weapon: p.weapon,
      ammo: p.ammo[p.weapon],
      mag: WEAPONS[p.weapon].mag,
      reloading: p.reloadT > 0,
      kills: p.kills,
      deaths: p.deaths,
      dead: !p.alive,
      respawnIn: Math.max(0, Math.ceil(p.respawnT)),
      vehicle: p.vehicle ? p.vehicle.label : null,
      prompt,
      scoping: this.mouseR,
    });
  }

  render() {
    if (settingsStore.get().reshade) this.post.render(this.renderer, this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
  }
}

function lerpAngle(a: number, b: number, t: number) {
  return a + angleDiff(a, b) * t;
}
function angleDiff(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function makePreviewMannequin() {
  const root = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: "#b8a18c" });
  const shirt = new THREE.MeshLambertMaterial({ color: "#46586f" });
  const pants = new THREE.MeshLambertMaterial({ color: "#24282e" });

  const part = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx=1, sy=1, sz=1) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x,y,z);
    mesh.scale.set(sx,sy,sz);
    mesh.castShadow=false;
    root.add(mesh);
  };

  part(new THREE.CapsuleGeometry(0.23,0.65,5,8), shirt, 0, 1.08, 0);
  part(new THREE.SphereGeometry(0.22,10,8), skin, 0, 1.72, 0);
  part(new THREE.CapsuleGeometry(0.10,0.68,4,7), pants, -0.13, 0.55, 0);
  part(new THREE.CapsuleGeometry(0.10,0.68,4,7), pants, 0.13, 0.55, 0);
  part(new THREE.CapsuleGeometry(0.07,0.50,4,7), skin, -0.31, 1.12, 0);
  part(new THREE.CapsuleGeometry(0.07,0.50,4,7), skin, 0.31, 1.12, 0);
  return root;
}
