export type WeaponId = "ar" | "pistol";
export type HitZone = "head" | "body" | "legs";

export interface WeaponDef {
  id: WeaponId;
  name: string;
  mag: number;
  cooldown: number;
  auto: boolean;
  reload: number;
  dmg: Record<HitZone, number>;
  sound: "fire" | "shoot";
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  ar: {
    id: "ar",
    name: "Assault Rifle",
    mag: 30,
    cooldown: 0.1,
    auto: true,
    reload: 1.8,
    dmg: { head: 200, body: 26, legs: 12 },
    sound: "shoot",
  },
  pistol: {
    id: "pistol",
    name: "Pistol",
    mag: 13,
    cooldown: 0.3,
    auto: false,
    reload: 1.3,
    dmg: { head: 200, body: 26, legs: 12 },
    sound: "shoot",
  },
};

export const MOVE = {
  RUN: 6.2,
  SPRINT: 8.5,
  AIM_WALK: 3.6,
  STUTTER_MULT: 1.15,
  STUTTER_WINDOW: 0.3,
  ROLL_TIME: 0.6,
  ROLL_SPEED: 9.2,
  LAG: 0.05,
  GRAVITY: 25,
  STEP: 0.6,
  RADIUS: 0.4,
  HEIGHT: 1.8,
};

export interface VehicleCfg {
  accel: number;
  brake: number;
  max: number;
  maxRev: number;
  turn: number;
  radius: number;
  seatY: number;
  camBack: number;
}

export const VEHICLES: Record<"car" | "bike", VehicleCfg> = {
  car: { accel: 13, brake: 26, max: 30, maxRev: 9, turn: 1.7, radius: 2.1, seatY: 0.55, camBack: 7 },
  bike: { accel: 22, brake: 30, max: 40, maxRev: 5, turn: 2.8, radius: 1.0, seatY: 0.75, camBack: 4.6 },
};

export const BOT_NAMES = ["Vex", "Kilo", "Rook", "Nova", "Dusk", "Jinx", "Bram", "Tako"];
