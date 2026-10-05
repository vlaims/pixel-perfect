// @ts-nocheck
import * as THREE from "three";

/**
 * Procedural urban arena.
 *
 * The map is intentionally flat and road-heavy so the browser spends its
 * frame time on gameplay instead of terrain sampling.  It uses simple
 * primitives/instancing for a dense FiveM-inspired city look without loading
 * a huge external map pack.
 */
export const ARENA = 120;

export const PLATEAUS: never[] = [];

export function heightAt(_x: number, _z: number) {
  return 0;
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

function addBox(
  scene: THREE.Scene,
  geometry: THREE.BoxGeometry,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  boxes?: Box[],
  collision = false,
) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.matrixAutoUpdate = true;
  m.castShadow = false;
  m.receiveShadow = false;
  scene.add(m);

  if (collision && boxes) {
    boxes.push({
      minX: x - sx / 2,
      maxX: x + sx / 2,
      minZ: z - sz / 2,
      maxZ: z + sz / 2,
      y0: -0.2,
      y1: y + sy / 2,
    });
  }
  return m;
}

function makeInstanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = true;
  return mesh;
}

function localToWorld(x: number, z: number, yaw: number, lx: number, lz: number) {
  return {
    x: x + Math.cos(yaw) * lx + Math.sin(yaw) * lz,
    z: z - Math.sin(yaw) * lx + Math.cos(yaw) * lz,
  };
}

export function buildWorld(scene: THREE.Scene) {
  const rand = rng(1337);
  const boxes: Box[] = [];

  // ---------- Materials ----------
  const asphalt = new THREE.MeshLambertMaterial({ color: "#282b30" });
  const road = new THREE.MeshLambertMaterial({ color: "#202328" });
  const sidewalk = new THREE.MeshLambertMaterial({ color: "#757a80" });
  const curb = new THREE.MeshLambertMaterial({ color: "#b5b7ba" });
  const lane = new THREE.MeshBasicMaterial({ color: "#e7e4d8" });
  const lineYellow = new THREE.MeshBasicMaterial({ color: "#c8a742" });
  const glass = new THREE.MeshLambertMaterial({ color: "#375263", roughness: 0.25, metalness: 0.25 });
  const concrete = new THREE.MeshLambertMaterial({ color: "#565b61" });
  const roof = new THREE.MeshLambertMaterial({ color: "#34383e" });
  const treeGreen = new THREE.MeshLambertMaterial({ color: "#2f5f3b" });
  const trunkMat = new THREE.MeshLambertMaterial({ color: "#6a4b2d" });
  const lampMat = new THREE.MeshBasicMaterial({ color: "#f6d88a" });

  // ---------- Base city slab ----------
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), asphalt);
  slab.rotation.x = -Math.PI / 2;
  slab.frustumCulled = false;
  scene.add(slab);

  const roadCenters = [-90, -45, 0, 45, 90];
  const roadWidth = 13.5;

  // Large road corridors.
  const roadXGeo = new THREE.PlaneGeometry(roadWidth, 240);
  const roadZGeo = new THREE.PlaneGeometry(240, roadWidth);
  for (const x of roadCenters) {
    const m = new THREE.Mesh(roadXGeo, road);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.006, 0);
    scene.add(m);
  }
  for (const z of roadCenters) {
    const m = new THREE.Mesh(roadZGeo, road);
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.007, z);
    scene.add(m);
  }

  // Sidewalk + curb strips around every avenue.
  const stripGeo = new THREE.BoxGeometry(2.0, 0.16, 240);
  const stripGeoZ = new THREE.BoxGeometry(240, 0.16, 2.0);
  const curbGeo = new THREE.BoxGeometry(0.18, 0.24, 240);
  const curbGeoZ = new THREE.BoxGeometry(240, 0.24, 0.18);
  for (const x of roadCenters) {
    for (const off of [-8.2, 8.2]) {
      addBox(scene, stripGeo, sidewalk, x + off, 0.08, 0, 1, 1, 1);
      addBox(scene, curbGeo, curb, x + off + (off > 0 ? -0.96 : 0.96), 0.12, 0, 1, 1, 1);
    }
  }
  for (const z of roadCenters) {
    for (const off of [-8.2, 8.2]) {
      addBox(scene, stripGeoZ, sidewalk, 0, 0.08, z + off, 1, 1, 1);
      addBox(scene, curbGeoZ, curb, 0, 0.12, z + off + (off > 0 ? -0.96 : 0.96), 1, 1, 1);
    }
  }

  // Lane dividers and crosswalks. Instanced to keep the draw-call count low.
  const laneGeo = new THREE.BoxGeometry(0.12, 0.022, 5.5);
  const laneMarksX = makeInstanced(laneGeo, lane, 128);
  const laneMarksZ = makeInstanced(laneGeo, lane, 128);
  const mi = new THREE.Matrix4();
  const mq = new THREE.Quaternion();
  const ms = new THREE.Vector3(1, 1, 1);
  let li = 0;
  let lz = 0;
  for (const x of roadCenters) {
    for (let z = -108; z <= 108; z += 12) {
      if (Math.abs(Math.round(z / 45) * 45 - z) < 4) continue;
      if (li >= laneMarksX.count) break;
      mi.compose(new THREE.Vector3(x, 0.02, z), mq, ms);
      laneMarksX.setMatrixAt(li++, mi);
    }
  }
  for (const z of roadCenters) {
    for (let x = -108; x <= 108; x += 12) {
      if (Math.abs(Math.round(x / 45) * 45 - x) < 4) continue;
      if (lz >= laneMarksZ.count) break;
      mq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      mi.compose(new THREE.Vector3(x, 0.021, z), mq, ms);
      laneMarksZ.setMatrixAt(lz++, mi);
    }
  }
  laneMarksX.count = li;
  laneMarksZ.count = lz;
  laneMarksX.instanceMatrix.needsUpdate = true;
  laneMarksZ.instanceMatrix.needsUpdate = true;
  scene.add(laneMarksX, laneMarksZ);

  // Double yellow center lines on selected boulevards.
  const yellowGeo = new THREE.BoxGeometry(0.08, 0.023, 240);
  const yellow = makeInstanced(yellowGeo, lineYellow, roadCenters.length);
  let yi = 0;
  for (const x of roadCenters) {
    if (x === 0 || x === 90) continue;
    mi.compose(new THREE.Vector3(x - 0.18, 0.0225, 0), mq, ms);
    yellow.setMatrixAt(yi++, mi);
  }
  yellow.count = yi;
  yellow.instanceMatrix.needsUpdate = true;
  scene.add(yellow);

  const yellowZ = makeInstanced(yellowGeo, lineYellow, roadCenters.length);
  let yzi = 0;
  for (const z of roadCenters) {
    if (z === 0 || z === -90) continue;
    mq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    mi.compose(new THREE.Vector3(0, 0.023, z - 0.18), mq, ms);
    yellowZ.setMatrixAt(yzi++, mi);
  }
  yellowZ.count = yzi;
  yellowZ.instanceMatrix.needsUpdate = true;
  scene.add(yellowZ);

  // Crosswalk bars at all large intersections.
  const crossGeo = new THREE.BoxGeometry(0.75, 0.026, 3.4);
  const crossX = makeInstanced(crossGeo, lane, 280);
  const crossZ = makeInstanced(crossGeo, lane, 280);
  let cxi = 0;
  let czi = 0;
  for (const x of roadCenters) {
    for (const z of roadCenters) {
      for (let i = -3; i <= 3; i++) {
        if (cxi < crossX.count) {
          mi.compose(
            new THREE.Vector3(x - 4.5, 0.024, z + i * 1.05),
            mq,
            ms,
          );
          crossX.setMatrixAt(cxi++, mi);
        }
        if (czi < crossZ.count) {
          mq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
          mi.compose(
            new THREE.Vector3(x + i * 1.05, 0.024, z - 4.5),
            mq,
            ms,
          );
          crossZ.setMatrixAt(czi++, mi);
        }
      }
    }
  }
  crossX.count = cxi;
  crossZ.count = czi;
  crossX.instanceMatrix.needsUpdate = true;
  crossZ.instanceMatrix.needsUpdate = true;
  scene.add(crossX, crossZ);

  // ---------- Buildings ----------
  const buildingColors = [
    "#474c54",
    "#53585f",
    "#5f5b55",
    "#4a5257",
    "#6d625d",
    "#3f454b",
    "#696c70",
    "#514e57",
  ];

  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  const buildingMat = new THREE.MeshLambertMaterial({ color: "#555a60" });
  const buildings = makeInstanced(buildingGeo, buildingMat, 40);
  const roofGeo = new THREE.BoxGeometry(1, 0.1, 1);
  const roofs = makeInstanced(roofGeo, roof, 40);

  let bi = 0;
  for (let gx = -67.5; gx <= 67.5 && bi < 40; gx += 45) {
    for (let gz = -67.5; gz <= 67.5 && bi < 40; gz += 45) {
      const variant = (Math.abs(gx + gz) / 22.5) % 2 < 1;
      const w1 = variant ? 15 : 11.5;
      const d1 = variant ? 11.5 : 15;
      const h1 = 8 + rand() * 18;
      const offX = variant ? -7 : 5.5;
      const offZ = variant ? 4.5 : -5.5;
      const bx = gx + offX;
      const bz = gz + offZ;

      mi.compose(
        new THREE.Vector3(bx, h1 / 2, bz),
        mq,
        new THREE.Vector3(w1, h1, d1),
      );
      buildings.setMatrixAt(bi, mi);
      if (buildings.setColorAt) buildings.setColorAt(bi, new THREE.Color(buildingColors[bi % buildingColors.length]));
      mi.compose(
        new THREE.Vector3(bx, h1 + 0.05, bz),
        mq,
        new THREE.Vector3(w1 + 0.08, 0.1, d1 + 0.08),
      );
      roofs.setMatrixAt(bi, mi);

      boxes.push({
        minX: bx - w1 / 2,
        maxX: bx + w1 / 2,
        minZ: bz - d1 / 2,
        maxZ: bz + d1 / 2,
        y0: -0.1,
        y1: h1,
      });
      bi++;
    }
  }
  buildings.count = bi;
  roofs.count = bi;
  buildings.instanceMatrix.needsUpdate = true;
  roofs.instanceMatrix.needsUpdate = true;
  if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
  scene.add(buildings, roofs);

  // Low storefront blocks keep the streets feeling dense without creating
  // a wall of inaccessible high-rises.
  const lowGeo = new THREE.BoxGeometry(1, 1, 1);
  const lowMat = new THREE.MeshLambertMaterial({ color: "#76736d" });
  for (let gx = -67.5; gx <= 67.5; gx += 45) {
    for (let gz = -67.5; gz <= 67.5; gz += 45) {
      if (rand() < 0.35) continue;
      const x = gx + (rand() - 0.5) * 8;
      const z = gz + (rand() - 0.5) * 8;
      const w = 7 + rand() * 4;
      const d = 6 + rand() * 4;
      const h = 3.8 + rand() * 3;
      addBox(scene, lowGeo, lowMat, x, h / 2, z, w, h, d, boxes, true);
    }
  }

  // ---------- Street trees / palms ----------
  const palmCount = 24;
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 2.5, 7);
  const crownGeo = new THREE.ConeGeometry(0.9, 2.0, 8);
  const trunks = makeInstanced(trunkGeo, trunkMat, palmCount);
  const crowns = makeInstanced(crownGeo, treeGreen, palmCount);
  let ti = 0;
  for (const x of [-98, -53, -8, 37, 82, 101]) {
    for (const z of [-102, -52, -2, 48, 98]) {
      if (ti >= palmCount) break;
      // Keep the center intersection open.
      if (Math.abs(x) < 12 && Math.abs(z) < 12) continue;
      mi.compose(new THREE.Vector3(x, 1.25, z), mq, new THREE.Vector3(1, 1, 1));
      trunks.setMatrixAt(ti, mi);
      mi.compose(new THREE.Vector3(x, 3.0, z), mq, new THREE.Vector3(1, 0.9, 1));
      crowns.setMatrixAt(ti, mi);
      ti++;
    }
    if (ti >= palmCount) break;
  }
  trunks.count = ti;
  crowns.count = ti;
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  scene.add(trunks, crowns);

  // ---------- Streetlights ----------
  const lightCount = 40;
  const poleGeo = new THREE.CylinderGeometry(0.045, 0.07, 4.1, 6);
  const lampGeo = new THREE.SphereGeometry(0.12, 7, 5);
  const poles = makeInstanced(poleGeo, concrete, lightCount);
  const lamps = makeInstanced(lampGeo, lampMat, lightCount);
  let si = 0;
  for (const x of roadCenters) {
    for (const z of [-70, -25, 25, 70]) {
      if (si >= lightCount) break;
      const px = x + (x % 90 === 0 ? 4.8 : -4.8);
      mi.compose(new THREE.Vector3(px, 2.05, z), mq, ms);
      poles.setMatrixAt(si, mi);
      mi.compose(new THREE.Vector3(px, 4.18, z), mq, ms);
      lamps.setMatrixAt(si, mi);
      si++;
    }
    if (si >= lightCount) break;
  }
  poles.count = si;
  lamps.count = si;
  poles.instanceMatrix.needsUpdate = true;
  lamps.instanceMatrix.needsUpdate = true;
  scene.add(poles, lamps);

  // ---------- Parked cars ----------
  const carBodyGeo = new THREE.BoxGeometry(1.9, 0.46, 3.8);
  const carCabGeo = new THREE.BoxGeometry(1.48, 0.48, 1.75);
  const carWheelGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.18, 10);
  carWheelGeo.rotateZ(Math.PI / 2);
  const parkedBody = makeInstanced(carBodyGeo, new THREE.MeshLambertMaterial({ color: "#607080" }), 40);
  const parkedCab = makeInstanced(carCabGeo, glass, 40);
  const parkedWheel = makeInstanced(carWheelGeo, new THREE.MeshLambertMaterial({ color: "#16181c" }), 160);

  const parkedColors = ["#bd403a", "#3b6fa8", "#d1a52e", "#8a8f96", "#414950", "#f0f0ea", "#7d4f77", "#34725c"];
  let pi = 0;
  let wi = 0;

  const roadParkingZ = [-78, -54, -18, 18, 54, 78];
  for (const x of roadCenters) {
    for (const z of roadParkingZ) {
      if (Math.abs(x) < 1 && Math.abs(z) < 10) continue;
      const yaw = ((pi + 1) % 2) ? 0 : Math.PI;
      const side = pi % 2 === 0 ? -3.8 : 3.8;
      const p = { x: x + side, z };
      mi.compose(new THREE.Vector3(p.x, 0.42, p.z), mq, new THREE.Vector3(1, 1, 1));
      parkedBody.setMatrixAt(pi, mi);
      if (parkedBody.setColorAt) parkedBody.setColorAt(pi, new THREE.Color(parkedColors[pi % parkedColors.length])));
      const cab = localToWorld(p.x, p.z, yaw, 0, -0.25);
      mi.compose(new THREE.Vector3(cab.x, 0.84, cab.z), mq, new THREE.Vector3(1, 1, 1));
      parkedCab.setMatrixAt(pi, mi);
      const wheelOffsets = [[-0.86, 1.2], [0.86, 1.2], [-0.86, -1.2], [0.86, -1.2]];
      for (const [lx, lz] of wheelOffsets) {
        const wpos = localToWorld(p.x, p.z, yaw, lx, lz);
        mi.compose(new THREE.Vector3(wpos.x, 0.24, wpos.z), mq, new THREE.Vector3(1, 1, 1));
        parkedWheel.setMatrixAt(wi++, mi);
      }
      pi++;
      if (pi >= 40) break;
    }
    if (pi >= 40) break;
  }

  for (const z of [-90, -45, 0, 45, 90]) {
    for (const x of [-76, -38, 38, 76]) {
      if (pi >= 40) break;
      const yaw = Math.PI / 2;
      const side = pi % 2 === 0 ? -3.8 : 3.8;
      const p = { x, z: z + side };
      mi.compose(new THREE.Vector3(p.x, 0.42, p.z), mq, new THREE.Vector3(1, 1, 1));
      parkedBody.setMatrixAt(pi, mi);
      if (parkedBody.setColorAt) parkedBody.setColorAt(pi, new THREE.Color(parkedColors[pi % parkedColors.length])));
      const cab = localToWorld(p.x, p.z, yaw, 0, -0.25);
      mi.compose(new THREE.Vector3(cab.x, 0.84, cab.z), mq, new THREE.Vector3(1, 1, 1));
      parkedCab.setMatrixAt(pi, mi);
      const wheelOffsets = [[-0.86, 1.2], [0.86, 1.2], [-0.86, -1.2], [0.86, -1.2]];
      for (const [lx, lz] of wheelOffsets) {
        const wpos = localToWorld(p.x, p.z, yaw, lx, lz);
        mi.compose(new THREE.Vector3(wpos.x, 0.24, wpos.z), mq, new THREE.Vector3(1, 1, 1));
        parkedWheel.setMatrixAt(wi++, mi);
      }
      pi++;
    }
  }

  parkedBody.count = pi;
  parkedCab.count = pi;
  parkedWheel.count = wi;
  parkedBody.instanceMatrix.needsUpdate = true;
  parkedCab.instanceMatrix.needsUpdate = true;
  parkedWheel.instanceMatrix.needsUpdate = true;
  if (parkedBody.instanceColor) parkedBody.instanceColor.needsUpdate = true;
  scene.add(parkedBody, parkedCab, parkedWheel);

  // ---------- Parked motorcycles ----------
  const bikeBodyGeo = new THREE.BoxGeometry(0.34, 0.26, 1.45);
  const bikeSeatGeo = new THREE.BoxGeometry(0.38, 0.12, 0.5);
  const bikeWheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.1, 9);
  bikeWheelGeo.rotateZ(Math.PI / 2);
  const bikeBarGeo = new THREE.BoxGeometry(0.58, 0.06, 0.06);
  const parkedBikeBody = makeInstanced(bikeBodyGeo, new THREE.MeshLambertMaterial({ color: "#7a2734" }), 36);
  const parkedBikeSeat = makeInstanced(bikeSeatGeo, new THREE.MeshLambertMaterial({ color: "#202226" }), 36);
  const parkedBikeWheel = makeInstanced(bikeWheelGeo, new THREE.MeshLambertMaterial({ color: "#15171a" }), 72);
  const parkedBikeBar = makeInstanced(bikeBarGeo, concrete, 36);
  const bikeColors = ["#bd3746", "#d4a321", "#294e83", "#3d6d55", "#44464a", "#8b5c2b"];
  let pbi = 0;
  let pbw = 0;
  for (const z of roadCenters) {
    for (const x of [-76, -50, -24, 24, 50, 76]) {
      if (pbi >= 36) break;
      const yaw = Math.PI / 2;
      const side = pbi % 2 === 0 ? -4.8 : 4.8;
      const p = { x, z: z + side };
      mi.compose(new THREE.Vector3(p.x, 0.48, p.z), mq, new THREE.Vector3(1, 1, 1));
      parkedBikeBody.setMatrixAt(pbi, mi);
      if (parkedBikeBody.setColorAt) parkedBikeBody.setColorAt(pbi, new THREE.Color(bikeColors[pbi % bikeColors.length])));
      const seat = localToWorld(p.x, p.z, yaw, 0, -0.12);
      mi.compose(new THREE.Vector3(seat.x, 0.67, seat.z), mq, new THREE.Vector3(1, 1, 1));
      parkedBikeSeat.setMatrixAt(pbi, mi);
      const bar = localToWorld(p.x, p.z, yaw, 0, 0.65);
      mi.compose(
        new THREE.Vector3(bar.x, 0.95, bar.z),
        mq,
        new THREE.Vector3(1, 1, 1),
      );
      parkedBikeBar.setMatrixAt(pbi, mi);
      for (const lz of [-0.72, 0.68]) {
        const wpos = localToWorld(p.x, p.z, yaw, 0, lz);
        mi.compose(new THREE.Vector3(wpos.x, 0.3, wpos.z), mq, new THREE.Vector3(1, 1, 1));
        parkedBikeWheel.setMatrixAt(pbw++, mi);
      }
      pbi++;
    }
    if (pbi >= 36) break;
  }
  parkedBikeBody.count = pbi;
  parkedBikeSeat.count = pbi;
  parkedBikeBar.count = pbi;
  parkedBikeWheel.count = pbw;
  parkedBikeBody.instanceMatrix.needsUpdate = true;
  parkedBikeSeat.instanceMatrix.needsUpdate = true;
  parkedBikeBar.instanceMatrix.needsUpdate = true;
  parkedBikeWheel.instanceMatrix.needsUpdate = true;
  if (parkedBikeBody.instanceColor) parkedBikeBody.instanceColor.needsUpdate = true;
  scene.add(parkedBikeBody, parkedBikeSeat, parkedBikeBar, parkedBikeWheel);

  // A few low barriers around side alleys provide cover and visual breakup.
  const barrierGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const [x, z, w, d] of [
    [-104, 72, 6, 1.1],
    [-104, -72, 6, 1.1],
    [104, 72, 6, 1.1],
    [104, -72, 6, 1.1],
    [64, 106, 1.1, 6],
    [-64, 106, 1.1, 6],
  ]) {
    addBox(scene, barrierGeo, concrete, x, 0.55, z, w, 1.1, d, boxes, true);
  }

  // Kept for engine compatibility; the old grass animation no longer costs
  // anything on the frame because the new map has no grass layer.
  const cityTime = { value: 0 };
  return { boxes, grassTime: cityTime };
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
  if (Math.abs(d.y) < 1e-8) return -1;
  const t = -o.y / d.y;
  return t > 0 && t < maxT ? t : -1;
}
