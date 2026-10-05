// @ts-nocheck
import * as THREE from "three";

export const ARENA = 92;

type Ramp = "px" | "nx" | "pz" | "nz";
interface Plateau {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  ramp: Ramp;
  len: number;
}

export const PLATEAUS: Plateau[] = [
  { x: -45, z: -40, w: 30, d: 22, h: 6, ramp: "px", len: 18 },
  { x: 52, z: 38, w: 26, d: 26, h: 8, ramp: "nz", len: 24 },
  { x: 42, z: -52, w: 22, d: 28, h: 4.5, ramp: "nx", len: 14 },
  { x: -52, z: 48, w: 24, d: 18, h: 5, ramp: "pz", len: 16 },
  { x: 8, z: 4, w: 3, d: 7, h: 2.6, ramp: "nx", len: 12 },
  { x: -10, z: -60, w: 3, d: 7, h: 3, ramp: "pz", len: 13 },
];

function baseAt(x: number, z: number) {
  return Math.sin(x * 0.05) * 0.6 + Math.cos(z * 0.045) * 0.6 + Math.sin((x + z) * 0.11) * 0.25;
}

export function heightAt(x: number, z: number): number {
  const base = baseAt(x, z);
  let h = base;
  for (const p of PLATEAUS) {
    const lx = x - p.x;
    const lz = z - p.z;
    const hw = p.w / 2;
    const hd = p.d / 2;
    let v = 0;
    if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) v = p.h;
    else if (p.ramp === "px" && lx > hw && lx < hw + p.len && Math.abs(lz) <= hd) v = p.h * (1 - (lx - hw) / p.len);
    else if (p.ramp === "nx" && lx < -hw && lx > -hw - p.len && Math.abs(lz) <= hd) v = p.h * (1 - (-lx - hw) / p.len);
    else if (p.ramp === "pz" && lz > hd && lz < hd + p.len && Math.abs(lx) <= hw) v = p.h * (1 - (lz - hd) / p.len);
    else if (p.ramp === "nz" && lz < -hd && lz > -hd - p.len && Math.abs(lx) <= hw) v = p.h * (1 - (-lz - hd) / p.len);
    if (v > 0) h = Math.max(h, base + v);
  }
  const edge = Math.max(Math.abs(x), Math.abs(z)) - ARENA;
  if (edge > 0) h += Math.min(12, edge * 4);
  return h;
}

export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y0: number;
  y1: number;
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function noiseTex(draw: (ctx: CanvasRenderingContext2D, s: number) => void, size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export function buildWorld(scene: THREE.Scene) {
  const rand = rng(1337);

  // Ground
  const groundTex = noiseTex((ctx, s) => {
    ctx.fillStyle = "#bbbbbb";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) {
      const v = 150 + Math.floor(Math.random() * 105);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 3);
    }
  });
  groundTex.repeat.set(40, 40);
  const geo = new THREE.PlaneGeometry(240, 240, 100, 100);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color("#5d8a3a");
  const grass2 = new THREE.Color("#7a9a45");
  const rock = new THREE.Color("#8a7d6b");
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const slope = 1 - nrm.getY(i);
    const n = Math.sin(pos.getX(i) * 0.3) * Math.cos(pos.getZ(i) * 0.27) * 0.5 + 0.5;
    tmp.copy(grass).lerp(grass2, n);
    if (slope > 0.25) tmp.lerp(rock, Math.min(1, (slope - 0.25) * 3));
    colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: groundTex, vertexColors: true }));
  ground.receiveShadow = true;
  scene.add(ground);

  // Obstacles (crates + barriers)
  const boxes: Box[] = [];
  const crateTex = noiseTex((ctx, s) => {
    ctx.fillStyle = "#9c7a4a";
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "#5e4425";
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, s - 14, s - 14);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(s, s);
    ctx.stroke();
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = "rgba(60,40,20,0.15)";
      ctx.fillRect(0, Math.random() * s, s, 2);
    }
  });
  const concreteTex = noiseTex((ctx, s) => {
    ctx.fillStyle = "#a8a39a";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 4000; i++) {
      const v = 120 + Math.floor(Math.random() * 80);
      ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    ctx.fillStyle = "#d9b23a";
    for (let x = 0; x < s; x += 64) ctx.fillRect(x, s * 0.1, 32, 18);
  });
  const crateMat = new THREE.MeshLambertMaterial({ map: crateTex });
  const concMat = new THREE.MeshLambertMaterial({ map: concreteTex });
  const crateGeo = new THREE.BoxGeometry(1, 1, 1);
  let placed = 0;
  let guard = 0;
  while (placed < 26 && guard++ < 600) {
    const x = (rand() - 0.5) * 160;
    const z = (rand() - 0.5) * 160;
    const isBarrier = rand() < 0.4;
    const sx = isBarrier ? 4 : 1.6;
    const sz = isBarrier ? 0.6 : 1.6;
    const sy = isBarrier ? 1.1 : 1.6;
    // flat check
    const hs = [heightAt(x - 2, z - 2), heightAt(x + 2, z - 2), heightAt(x - 2, z + 2), heightAt(x + 2, z + 2)];
    if (Math.max(...hs) - Math.min(...hs) > 0.5) continue;
    if (Math.hypot(x, z) < 12) continue;
    const y = Math.min(...hs);
    const rotQ = isBarrier && rand() < 0.5;
    const w = rotQ ? sz : sx;
    const d = rotQ ? sx : sz;
    const m = new THREE.Mesh(crateGeo, isBarrier ? concMat : crateMat);
    m.scale.set(w, sy, d);
    m.position.set(x, y + sy / 2, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, y0: y - 1, y1: y + sy });
    if (!isBarrier && rand() < 0.5) {
      const m2 = m.clone();
      m2.scale.set(1.2, 1.2, 1.2);
      m2.position.set(x + 0.1, y + sy + 0.6, z);
      m2.rotation.y = 0.4;
      scene.add(m2);
      boxes[boxes.length - 1].y1 = y + sy + 1.2;
    }
    placed++;
  }

  // Pass-through grass clusters
  const grassTex = noiseTex((ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * s;
      const hgt = s * (0.45 + Math.random() * 0.55);
      const g = 90 + Math.floor(Math.random() * 80);
      ctx.strokeStyle = `rgb(${50 + Math.random() * 40},${g + 40},${30 + Math.random() * 20})`;
      ctx.lineWidth = 2 + Math.random() * 3;
      ctx.beginPath();
      ctx.moveTo(x, s);
      ctx.quadraticCurveTo(x + (Math.random() - 0.5) * 30, s - hgt * 0.6, x + (Math.random() - 0.5) * 50, s - hgt);
      ctx.stroke();
    }
  });
  grassTex.wrapS = grassTex.wrapT = THREE.ClampToEdgeWrapping;
  const p1 = new THREE.PlaneGeometry(1.4, 1.0);
  p1.translate(0, 0.5, 0);
  const p2 = p1.clone().rotateY(Math.PI / 3);
  const p3 = p1.clone().rotateY(-Math.PI / 3);
  const clumpGeo = mergeGeos([p1, p2, p3]);
  const grassMat = new THREE.MeshLambertMaterial({ map: grassTex, alphaTest: 0.45, side: THREE.DoubleSide });
  const timeU = { value: 0 };
  grassMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeU;
    sh.vertexShader = "uniform float uTime;\n" + sh.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       float ph = instanceMatrix[3].x * 0.3 + instanceMatrix[3].z * 0.2;
       transformed.x += sin(uTime * 1.7 + ph) * 0.12 * uv.y;
       transformed.z += cos(uTime * 1.3 + ph) * 0.08 * uv.y;`,
    );
  };
  const COUNT = 3200;
  const grassMesh = new THREE.InstancedMesh(clumpGeo, grassMat, COUNT);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const ps = new THREE.Vector3();
  let n = 0;
  for (let c = 0; c < 70 && n < COUNT; c++) {
    const cx = (rand() - 0.5) * 170;
    const cz = (rand() - 0.5) * 170;
    const r = 3 + rand() * 6;
    for (let i = 0; i < 46 && n < COUNT; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * r;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      ps.set(x, heightAt(x, z) - 0.05, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);
      const s = 0.8 + rand() * 0.9;
      sc.set(s, s * (0.8 + rand() * 0.6), s);
      mtx.compose(ps, q, sc);
      grassMesh.setMatrixAt(n++, mtx);
    }
  }
  grassMesh.count = n;
  grassMesh.frustumCulled = false;
  scene.add(grassMesh);

  return { boxes, grassTime: timeU };
}

function mergeGeos(geos: THREE.BufferGeometry[]) {
  const out = new THREE.BufferGeometry();
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let off = 0;
  for (const g of geos) {
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    const u = g.attributes.uv.array;
    pos.push(...p);
    nor.push(...n);
    uv.push(...u);
    const ix = g.index!.array;
    for (let i = 0; i < ix.length; i++) idx.push(ix[i] + off);
    off += g.attributes.position.count;
  }
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

/** Ray vs AABB, returns t or -1 */
export function rayBox(o: THREE.Vector3, d: THREE.Vector3, b: Box, maxT: number): number {
  let tmin = 0;
  let tmax = maxT;
  const mins = [b.minX, b.y0, b.minZ];
  const maxs = [b.maxX, b.y1, b.maxZ];
  const os = [o.x, o.y, o.z];
  const ds = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ds[i]) < 1e-8) {
      if (os[i] < mins[i] || os[i] > maxs[i]) return -1;
    } else {
      let t1 = (mins[i] - os[i]) / ds[i];
      let t2 = (maxs[i] - os[i]) / ds[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

export function rayTerrain(o: THREE.Vector3, d: THREE.Vector3, maxT: number): number {
  const step = 0.6;
  let prevT = 0;
  for (let t = step; t < maxT; t += step) {
    const y = o.y + d.y * t;
    if (y < heightAt(o.x + d.x * t, o.z + d.z * t)) {
      // refine
      let a = prevT;
      let b = t;
      for (let i = 0; i < 5; i++) {
        const m = (a + b) / 2;
        if (o.y + d.y * m < heightAt(o.x + d.x * m, o.z + d.z * m)) b = m;
        else a = m;
      }
      return b;
    }
    prevT = t;
  }
  return -1;
}
