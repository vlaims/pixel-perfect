// @ts-nocheck
import * as THREE from "three";

/**
 * Dense Brazilian-RP-inspired city arena.
 * Original procedural layout: broad avenues, narrow side streets, mixed-height
 * blocks, storefronts, utility poles, palms, parked cars and motorcycles.
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

function addMesh(
  scene: THREE.Scene,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  sx = 1,
  sy = 1,
  sz = 1,
  yaw = 0,
) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.rotation.y = yaw;
  m.scale.set(sx, sy, sz);
  m.castShadow = false;
  m.receiveShadow = false;
  scene.add(m);
  return m;
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
  yaw = 0,
  boxes?: Box[],
  collision = false,
) {
  addMesh(scene, geometry, material, x, y, z, sx, sy, sz, yaw);
  if (collision && boxes) {
    const ca = Math.abs(Math.cos(yaw));
    const sa = Math.abs(Math.sin(yaw));
    const hx = (sx * ca + sz * sa) * 0.5;
    const hz = (sx * sa + sz * ca) * 0.5;
    boxes.push({
      minX: x - hx,
      maxX: x + hx,
      minZ: z - hz,
      maxZ: z + hz,
      y0: -0.2,
      y1: y + sy * 0.5,
    });
  }
}

function makeInstanced(geometry: THREE.BufferGeometry, material: THREE.Material, count: number) {
  return new THREE.InstancedMesh(geometry, material, count);
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

  // ----- Palette -----
  const base = new THREE.MeshLambertMaterial({ color: "#686a68" });
  const asphalt = new THREE.MeshLambertMaterial({ color: "#26282c" });
  const asphaltPatch = new THREE.MeshLambertMaterial({ color: "#303237" });
  const sidewalk = new THREE.MeshLambertMaterial({ color: "#888982" });
  const curb = new THREE.MeshLambertMaterial({ color: "#b9b8ae" });
  const white = new THREE.MeshBasicMaterial({ color: "#ece9dc" });
  const yellow = new THREE.MeshBasicMaterial({ color: "#d2b04b" });
  const concrete = new THREE.MeshLambertMaterial({ color: "#6a6d70" });
  const darkConcrete = new THREE.MeshLambertMaterial({ color: "#3b3e42" });
  const glass = new THREE.MeshLambertMaterial({ color: "#385563" });
  const glassLight = new THREE.MeshBasicMaterial({ color: "#9bbac7" });
  const roof = new THREE.MeshLambertMaterial({ color: "#3a3b3c" });
  const brick = new THREE.MeshLambertMaterial({ color: "#8b6150" });
  const plaster = new THREE.MeshLambertMaterial({ color: "#7a7a72" });
  const stucco = new THREE.MeshLambertMaterial({ color: "#6c6259" });
  const treeGreen = new THREE.MeshLambertMaterial({ color: "#2f623c" });
  const treeDark = new THREE.MeshLambertMaterial({ color: "#22472c" });
  const trunk = new THREE.MeshLambertMaterial({ color: "#60462f" });
  const lamp = new THREE.MeshBasicMaterial({ color: "#ffe2a1" });
  const red = new THREE.MeshBasicMaterial({ color: "#b52d2d" });

  // ----- City base -----
  const cityBase = addMesh(scene, new THREE.PlaneGeometry(250, 250), base, 0, 0, 0);
  cityBase.rotation.x = -Math.PI / 2;
  const roadCenters = [-96, -48, 0, 48, 96];
  const roadWidth = 14;

  const roadXGeo = new THREE.PlaneGeometry(roadWidth, 250);
  const roadZGeo = new THREE.PlaneGeometry(250, roadWidth);
  for (const x of roadCenters) {
    const m = addMesh(scene, roadXGeo, asphalt, x, 0.01, 0);
    m.rotation.x = -Math.PI / 2;
    m.frustumCulled = false;
  }
  for (const z of roadCenters) {
    const m = addMesh(scene, roadZGeo, asphalt, 0, 0.012, z);
    m.rotation.x = -Math.PI / 2;
    m.frustumCulled = false;
  }

  // Sidewalk bands.
  const walkX = new THREE.BoxGeometry(2.0, 0.14, 250);
  const walkZ = new THREE.BoxGeometry(250, 0.14, 2.0);
  const curbX = new THREE.BoxGeometry(0.18, 0.22, 250);
  const curbZ = new THREE.BoxGeometry(250, 0.22, 0.18);
  for (const x of roadCenters) {
    for (const s of [-8.0, 8.0]) {
      addBox(scene, walkX, sidewalk, x + s, 0.07, 0, 1, 1, 1);
      addBox(scene, curbX, curb, x + s + (s > 0 ? -0.95 : 0.95), 0.11, 0, 1, 1, 1);
    }
  }
  for (const z of roadCenters) {
    for (const s of [-8.0, 8.0]) {
      addBox(scene, walkZ, sidewalk, 0, 0.07, z + s, 1, 1, 1);
      addBox(scene, curbZ, curb, 0, 0.11, z + s + (s > 0 ? -0.95 : 0.95), 1, 1, 1);
    }
  }

  // Lane marks.
  const dashGeo = new THREE.BoxGeometry(0.12, 0.025, 4.7);
  const dashesX = makeInstanced(dashGeo, white, 130);
  const dashesZ = makeInstanced(dashGeo, white, 130);
  const mi = new THREE.Matrix4();
  const mq = new THREE.Quaternion();
  const ms = new THREE.Vector3(1, 1, 1);
  let dix = 0;
  let diz = 0;
  mq.identity();
  for (const x of roadCenters) {
    for (let z = -115; z <= 115; z += 11) {
      if (dix >= dashesX.count) break;
      if (Math.abs(((z + 1) % 48 + 48) % 48) < 5) continue;
      mi.compose(new THREE.Vector3(x, 0.025, z), mq, ms);
      dashesX.setMatrixAt(dix++, mi);
    }
  }
  mq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  for (const z of roadCenters) {
    for (let x = -115; x <= 115; x += 11) {
      if (diz >= dashesZ.count) break;
      if (Math.abs(((x + 1) % 48 + 48) % 48) < 5) continue;
      mi.compose(new THREE.Vector3(x, 0.026, z), mq, ms);
      dashesZ.setMatrixAt(diz++, mi);
    }
  }
  dashesX.count = dix;
  dashesZ.count = diz;
  dashesX.instanceMatrix.needsUpdate = true;
  dashesZ.instanceMatrix.needsUpdate = true;
  scene.add(dashesX, dashesZ);

  // Yellow median stripes on the main roads.
  const medianGeo = new THREE.BoxGeometry(0.08, 0.027, 250);
  const medX = makeInstanced(medianGeo, yellow, 5);
  const medZ = makeInstanced(medianGeo, yellow, 5);
  let mix = 0;
  let miz = 0;
  mq.identity();
  for (const x of roadCenters) {
    if (Math.abs(x) === 96) continue;
    mi.compose(new THREE.Vector3(x - 0.18, 0.028, 0), mq, ms);
    medX.setMatrixAt(mix++, mi);
  }
  mq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  for (const z of roadCenters) {
    if (Math.abs(z) === 96) continue;
    mi.compose(new THREE.Vector3(0, 0.029, z - 0.18), mq, ms);
    medZ.setMatrixAt(miz++, mi);
  }
  medX.count = mix;
  medZ.count = miz;
  medX.instanceMatrix.needsUpdate = true;
  medZ.instanceMatrix.needsUpdate = true;
  scene.add(medX, medZ);

  // Intersections / crosswalks.
  const crossGeo = new THREE.BoxGeometry(0.75, 0.026, 3.6);
  const crossA = makeInstanced(crossGeo, white, 280);
  const crossB = makeInstanced(crossGeo, white, 280);
  let ca = 0, cb = 0;
  for (const x of roadCenters) {
    for (const z of roadCenters) {
      for (let i = -3; i <= 3; i++) {
        if (ca < crossA.count) {
          mi.compose(new THREE.Vector3(x - 4.7, 0.03, z + i * 1.0), mq, ms);
          crossA.setMatrixAt(ca++, mi);
        }
        if (cb < crossB.count) {
          mq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
          mi.compose(new THREE.Vector3(x + i * 1.0, 0.031, z - 4.7), mq, ms);
          crossB.setMatrixAt(cb++, mi);
        }
      }
    }
  }
  crossA.count = ca;
  crossB.count = cb;
  crossA.instanceMatrix.needsUpdate = true;
  crossB.instanceMatrix.needsUpdate = true;
  scene.add(crossA, crossB);

  // Small asphalt repair patches add city texture without a texture download.
  const patchGeo = new THREE.PlaneGeometry(8, 3);
  for (let i = 0; i < 34; i++) {
    const x = (rand() - 0.5) * 220;
    const z = (rand() - 0.5) * 220;
    const yaw = rand() * Math.PI;
    const m = addMesh(scene, patchGeo, asphaltPatch, x, 0.021, z, 1 + rand() * 1.5, 1, 0.6 + rand() * 0.9, yaw);
    m.rotation.x = -Math.PI / 2;
  }

  // ----- Buildings / storefronts -----
  // Four-by-four city blocks between the five main avenues.
  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.BoxGeometry(1, 0.12, 1);
  const windowGeo = new THREE.BoxGeometry(0.58, 0.34, 0.05);
  const doorGeo = new THREE.BoxGeometry(0.9, 1.8, 0.08);
  const awningGeo = new THREE.BoxGeometry(1, 0.12, 0.45);
  const signGeo = new THREE.BoxGeometry(2.8, 0.45, 0.08);
  const colors = ["#676a6d","#756d63","#5d6367","#81786f","#625d59","#747a78","#6b625c","#50585c"];

  function addBuilding(
    x:number,z:number,w:number,d:number,h:number,mat:THREE.Material,front:number
  ) {
    addBox(scene,buildingGeo,mat,x,h/2,z,w,h,d,0,boxes,true);
    addBox(scene,roofGeo,roof,x,h+0.06,z,w+0.12,1,d+0.12,0);

    // Front facade points toward the nearby street.
    if(front===0){
      const fz=z-d/2-0.04;
      const rows=Math.max(2,Math.min(6,Math.floor(h/3.6)));
      const cols=Math.max(2,Math.min(6,Math.floor(w/2.8)));
      for(let r=0;r<rows;r++) for(let col=0;col<cols;col++){
        const px=x-w/2+(col+0.55)*(w/cols);
        const py=1.9+r*3.0;
        if(py<h-1.1) addMesh(scene,windowGeo,glassLight,px,py,fz);
      }
      if(h<9){
        addMesh(scene,doorGeo,darkConcrete,x,0.9,fz-0.015);
        addMesh(scene,awningGeo,red,x,2.45,fz-0.22,w*0.65,1,1,0);
        addMesh(scene,signGeo,red,x,2.85,fz-0.03,Math.min(2.8,w*0.5),1,1,0);
      }
    } else if(front===1){
      const fz=z+d/2+0.04;
      const rows=Math.max(2,Math.min(6,Math.floor(h/3.6)));
      const cols=Math.max(2,Math.min(6,Math.floor(w/2.8)));
      for(let r=0;r<rows;r++) for(let col=0;col<cols;col++){
        const px=x-w/2+(col+0.55)*(w/cols);
        const py=1.9+r*3.0;
        if(py<h-1.1) addMesh(scene,windowGeo,glassLight,px,py,fz);
      }
      if(h<9){
        addMesh(scene,doorGeo,darkConcrete,x,0.9,fz+0.015);
        addMesh(scene,awningGeo,red,x,2.45,fz+0.22,w*0.65,1,1,0);
        addMesh(scene,signGeo,red,x,2.85,fz+0.03,Math.min(2.8,w*0.5),1,1,0);
      }
    } else if(front===2){
      const fx=x-w/2-0.04;
      const rows=Math.max(2,Math.min(6,Math.floor(h/3.6)));
      const cols=Math.max(2,Math.min(6,Math.floor(d/2.8)));
      for(let r=0;r<rows;r++) for(let col=0;col<cols;col++){
        const pz=z-d/2+(col+0.55)*(d/cols);
        const py=1.9+r*3.0;
        if(py<h-1.1) addMesh(scene,windowGeo,glassLight,fx,py,pz,1,1,1,Math.PI/2);
      }
    } else {
      const fx=x+w/2+0.04;
      const rows=Math.max(2,Math.min(6,Math.floor(h/3.6)));
      const cols=Math.max(2,Math.min(6,Math.floor(d/2.8)));
      for(let r=0;r<rows;r++) for(let col=0;col<cols;col++){
        const pz=z-d/2+(col+0.55)*(d/cols);
        const py=1.9+r*3.0;
        if(py<h-1.1) addMesh(scene,windowGeo,glassLight,fx,py,pz,1,1,1,Math.PI/2);
      }
    }
  }

  // Fill each block with a large structure + smaller attached buildings.
  const blockCenters=[-67.5,-22.5,22.5,67.5];
  let blockIndex=0;
  for(const bx0 of blockCenters){
    for(const bz0 of blockCenters){
      const variant=blockIndex++%4;
      const mainW=variant===0?15:variant===1?12:14;
      const mainD=variant===2?15:12;
      const mainH=10+rand()*15;
      const sx=bx0+(variant%2?7:-7);
      const sz=bz0+(variant%2?-7:7);
      const mainMat=new THREE.MeshLambertMaterial({color:colors[variant%colors.length]});
      addBuilding(sx,sz,mainW,mainD,mainH,mainMat,variant%4);

      const shopX=bx0-(variant%2?7:-7);
      const shopZ=bz0-(variant%2?-7:7);
      const shopW=9+rand()*3;
      const shopD=7+rand()*3;
      const shopH=4.5+rand()*2.0;
      addBuilding(shopX,shopZ,shopW,shopD,shopH,variant%2?stucco:plaster,(variant+2)%4);

      // Compact residential annex closes the remaining open side of the block.
      const annX=bx0+(variant===0||variant===3?-9:9);
      const annZ=bz0+(variant===0||variant===3?9:-9);
      const annW=6.5+rand()*2.0;
      const annD=5.5+rand()*2.0;
      const annH=5+rand()*3;
      addBuilding(annX,annZ,annW,annD,annH,variant%2?brick:stucco,(variant+1)%4);
    }
  }

  // Narrow row-houses around the outside of the playable city.
  for(let i=0;i<28;i++){
    const side=i%4;
    const along=-105+(i%7)*32+(rand()-0.5)*6;
    let x=0,z=0;
    if(side===0){x=106;z=along}
    if(side===1){x=-106;z=along}
    if(side===2){x=along;z=106}
    if(side===3){x=along;z=-106}
    addBuilding(x,z,7,7,3.5+rand()*3,rand()>0.5?brick:stucco,side%4);
  }

  // ----- Street furniture -----
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.07, 4.8, 7);
  const lampGeo = new THREE.SphereGeometry(0.13, 7, 5);
  const poleCount = 56;
  const poles = makeInstanced(poleGeo, concrete, poleCount);
  const lamps = makeInstanced(lampGeo, lamp, poleCount);
  let li = 0;
  for (const x of roadCenters) {
    for (const z of [-96, -48, 0, 48, 96]) {
      if (li >= poleCount) break;
      const px = x + (x >= 0 ? -4.8 : 4.8);
      mi.compose(new THREE.Vector3(px, 2.4, z), mq, ms);
      poles.setMatrixAt(li, mi);
      mi.compose(new THREE.Vector3(px, 4.82, z), mq, ms);
      lamps.setMatrixAt(li, mi);
      li++;
    }
  }
  poles.count = lamps.count = li;
  poles.instanceMatrix.needsUpdate = true;
  lamps.instanceMatrix.needsUpdate = true;
  scene.add(poles, lamps);

  // Trees along selected sidewalks.
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.2, 2.2, 7);
  const crownGeo = new THREE.SphereGeometry(0.9, 8, 6);
  const trunks = makeInstanced(trunkGeo, trunk, 44);
  const crowns = makeInstanced(crownGeo, treeGreen, 44);
  let ti = 0;
  for (const x of [-101, -53, -5, 43, 91]) {
    for (const z of [-102, -54, -6, 42, 90]) {
      if (ti >= 44) break;
      if ((Math.abs(x) < 10 && Math.abs(z) < 10) || rand() < 0.22) continue;
      mi.compose(new THREE.Vector3(x + (rand() - 0.5) * 2, 1.1, z), mq, ms);
      trunks.setMatrixAt(ti, mi);
      mi.compose(new THREE.Vector3(x + (rand() - 0.5) * 2, 3.0, z), mq, new THREE.Vector3(1, 0.9, 1));
      crowns.setMatrixAt(ti, mi);
      ti++;
    }
    if (ti >= 44) break;
  }
  trunks.count = crowns.count = ti;
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  scene.add(trunks, crowns);

  // ----- Parked cars -----
  const carBodyGeo = new THREE.BoxGeometry(1.9, 0.46, 3.8);
  const carCabGeo = new THREE.BoxGeometry(1.45, 0.43, 1.7);
  const carWheelGeo = new THREE.CylinderGeometry(0.30, 0.30, 0.18, 10);
  carWheelGeo.rotateZ(Math.PI / 2);
  const parkedBody = makeInstanced(carBodyGeo, new THREE.MeshLambertMaterial({ color: "#607080" }), 72);
  const parkedCab = makeInstanced(carCabGeo, glass, 72);
  const parkedWheel = makeInstanced(carWheelGeo, darkConcrete, 288);
  const parkedColors = ["#b5423b","#3d6ea8","#d2aa2b","#8d9296","#454b52","#ecebe3","#724f75","#3b715d","#7f694f"];

  let pi = 0;
  let wi = 0;
  const addParkedCar = (x: number, z: number, yaw: number) => {
    if (pi >= parkedBody.count) return;
    mq.setFromAxisAngle(new THREE.Vector3(0,1,0), yaw);
    mi.compose(new THREE.Vector3(x, 0.4, z), mq, ms);
    parkedBody.setMatrixAt(pi, mi);
    parkedBody.setColorAt(pi, new THREE.Color(parkedColors[pi % parkedColors.length]));

    const cab = localToWorld(x, z, yaw, 0, -0.25);
    mi.compose(new THREE.Vector3(cab.x, 0.82, cab.z), mq, ms);
    parkedCab.setMatrixAt(pi, mi);

    for (const [lx,lz] of [[-0.86,1.15],[0.86,1.15],[-0.86,-1.15],[0.86,-1.15]]) {
      const p = localToWorld(x, z, yaw, lx, lz);
      mi.compose(new THREE.Vector3(p.x,0.24,p.z),mq,ms);
      parkedWheel.setMatrixAt(wi++,mi);
    }
    pi++;
  };

  for (const z of [-108,-84,-60,-36,-12,12,36,60,84,108]) {
    for (const x of roadCenters) {
      if (pi >= 72) break;
      addParkedCar(x + (pi % 2 ? 3.7 : -3.7), z, pi % 2 ? 0 : Math.PI);
    }
  }
  for (const x of [-108,-84,-60,-36,-12,12,36,60,84,108]) {
    for (const z of roadCenters) {
      if (pi >= 72) break;
      addParkedCar(x, z + (pi % 2 ? 3.7 : -3.7), pi % 2 ? Math.PI/2 : -Math.PI/2);
    }
  }
  parkedBody.count = pi;
  parkedCab.count = pi;
  parkedWheel.count = wi;
  parkedBody.instanceMatrix.needsUpdate = true;
  parkedCab.instanceMatrix.needsUpdate = true;
  parkedWheel.instanceMatrix.needsUpdate = true;
  parkedBody.instanceColor.needsUpdate = true;
  scene.add(parkedBody, parkedCab, parkedWheel);

  // ----- Motorcycles everywhere -----
  const motoBodyGeo = new THREE.BoxGeometry(0.36, 0.25, 1.4);
  const motoSeatGeo = new THREE.BoxGeometry(0.40, 0.12, 0.5);
  const motoWheelGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.10, 9);
  motoWheelGeo.rotateZ(Math.PI / 2);
  const motoBarGeo = new THREE.BoxGeometry(0.58, 0.055, 0.06);
  const motoBody = makeInstanced(motoBodyGeo, new THREE.MeshLambertMaterial({ color: "#7b2d3b" }), 78);
  const motoSeat = makeInstanced(motoSeatGeo, darkConcrete, 78);
  const motoWheel = makeInstanced(motoWheelGeo, darkConcrete, 156);
  const motoBar = makeInstanced(motoBarGeo, concrete, 78);
  const motoColors = ["#c0393d","#d4a52e","#325c96","#3d745a","#45474a","#8a5d32","#7e3e68"];
  let pbi = 0;
  let pbw = 0;

  const addMoto = (x: number, z: number, yaw: number) => {
    if (pbi >= motoBody.count) return;
    mq.setFromAxisAngle(new THREE.Vector3(0,1,0), yaw);
    mi.compose(new THREE.Vector3(x,0.46,z),mq,ms);
    motoBody.setMatrixAt(pbi,mi);
    motoBody.setColorAt(pbi,new THREE.Color(motoColors[pbi % motoColors.length]));
    const seat = localToWorld(x,z,yaw,0,-0.12);
    mi.compose(new THREE.Vector3(seat.x,0.66,seat.z),mq,ms);
    motoSeat.setMatrixAt(pbi,mi);
    const bar = localToWorld(x,z,yaw,0,0.63);
    mi.compose(new THREE.Vector3(bar.x,0.92,bar.z),mq,ms);
    motoBar.setMatrixAt(pbi,mi);
    for (const lz of [-0.68,0.66]) {
      const wp = localToWorld(x,z,yaw,0,lz);
      mi.compose(new THREE.Vector3(wp.x,0.27,wp.z),mq,ms);
      motoWheel.setMatrixAt(pbw++,mi);
    }
    pbi++;
  };

  for (const z of [-102,-78,-54,-30,-6,18,42,66,90,114]) {
    for (const x of [-104,-80,-56,-32,-8,16,40,64,88,112]) {
      if (pbi >= 78) break;
      addMoto(x + (pbi % 2 ? 4.3 : -4.3), z, Math.PI/2);
    }
    if (pbi >= 78) break;
  }
  motoBody.count = pbi;
  motoSeat.count = pbi;
  motoBar.count = pbi;
  motoWheel.count = pbw;
  motoBody.instanceMatrix.needsUpdate = true;
  motoSeat.instanceMatrix.needsUpdate = true;
  motoBar.instanceMatrix.needsUpdate = true;
  motoWheel.instanceMatrix.needsUpdate = true;
  motoBody.instanceColor.needsUpdate = true;
  scene.add(motoBody,motoSeat,motoBar,motoWheel);

  // Alley clutter: dumpsters and barriers.
  const dumpGeo = new THREE.BoxGeometry(1,1,1);
  for (const [x,z] of [[-34,17],[31,-19],[-78,31],[78,-31],[31,79],[-31,-79]]) {
    addBox(scene,dumpGeo,darkConcrete,x,0.7,z,1.7,1.4,1.1,0,boxes,false);
  }

  // Small edge barriers keep the arena bounded visually.
  for (const [x,z,w,d] of [
    [-116,0,1,16],[116,0,1,16],[0,-116,16,1],[0,116,16,1],
  ]) addBox(scene,dumpGeo,concrete,x,0.55,z,w,1.1,d,0,boxes,true);

  // Compatibility time uniform for the engine.
  return { boxes, grassTime: { value: 0 } };
}

export function rayBox(o: THREE.Vector3, d: THREE.Vector3, b: Box, maxT: number): number {
  let tmin = 0;
  let tmax = maxT;
  const mins = [b.minX,b.y0,b.minZ];
  const maxs = [b.maxX,b.y1,b.maxZ];
  const os = [o.x,o.y,o.z];
  const ds = [d.x,d.y,d.z];
  for (let i=0;i<3;i++) {
    if (Math.abs(ds[i])<1e-8) {
      if (os[i]<mins[i] || os[i]>maxs[i]) return -1;
    } else {
      let t1=(mins[i]-os[i])/ds[i];
      let t2=(maxs[i]-os[i])/ds[i];
      if (t1>t2) [t1,t2]=[t2,t1];
      tmin=Math.max(tmin,t1);
      tmax=Math.min(tmax,t2);
      if (tmin>tmax) return -1;
    }
  }
  return tmin;
}

export function rayTerrain(o: THREE.Vector3, d: THREE.Vector3, maxT: number): number {
  if (Math.abs(d.y)<1e-8) return -1;
  const t=-o.y/d.y;
  return t>0 && t<maxT ? t : -1;
}
