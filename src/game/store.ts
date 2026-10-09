import { useSyncExternalStore } from "react";
import type { WeaponId } from "./config";
import type { FitMode } from "./display";

export type CrosshairType = "dot" | "cross" | "inverted";
export type Quality = "low" | "medium" | "high";

export interface Settings {
  crosshair: CrosshairType;
  gameMode: "vehicle-only" | "ffa";
  crossSize: number;
  outline: number;
  color: string;
  sensitivity: number;
  resolution: { w: number; h: number } | null;
  reshade: boolean;
  volume: number;
  aspect: string;
  customWidth: number;
  customHeight: number;
  centerColor: string;
  borderColor: string;
  fitMode: FitMode;
  quality: Quality;
  fov: number;
  cameraTilt: boolean;
  hudScale: number;
  scopeGap: number;
  scopeLength: number;
  scopeThickness: number;
  scopeColor: string;
}

export interface DisplayInfo {
  requestedW: number;
  requestedH: number;
  actualW: number;
  actualH: number;
  error: string | null;
}

export interface FeedItem {
  id: number;
  killer: string;
  victim: string;
  head: boolean;
  zone: "head" | "body" | "legs";
}

export interface HudState {
  loading: boolean;
  locked: boolean;
  settingsOpen: boolean;
  hp: number;
  armor: number;
  weapon: WeaponId;
  ammo: number;
  mag: number;
  reloading: boolean;
  kills: number;
  deaths: number;
  dead: boolean;
  respawnIn: number;
  vehicle: string | null;
  prompt: string | null;
  scoping: boolean;
  hit: { id: number; head: boolean; zone: "head" | "body" | "legs" } | null;
  feed: FeedItem[];
  display: DisplayInfo;
}

function createStore<T extends object>(initial: T) {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<T>) {
      let changed = false;
      for (const k in patch) {
        if (state[k] !== patch[k]) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...patch };
      subs.forEach((s) => s());
    },
    subscribe(fn: () => void) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

export const DEFAULT_SETTINGS: Settings = {
  crosshair: "dot",
  gameMode: "vehicle-only",
  crossSize: 8,
  outline: 0,
  color: "#ffffff",
  sensitivity: 1,
  resolution: { w: 1920, h: 1080 },
  reshade: false,
  volume: 0.5,
  aspect: "16:9",
  customWidth: 1920,
  customHeight: 1080,
  centerColor: "#ffffff",
  borderColor: "#000000",
  fitMode: "stretch",
  quality: "medium",
  fov: 65,
  cameraTilt: true,
  hudScale: 1,
  scopeGap: 5,
  scopeLength: 9,
  scopeThickness: 2,
  scopeColor: "#ffffff",
};

export const settingsStore = createStore<Settings>({ ...DEFAULT_SETTINGS });

export const hudStore = createStore<HudState>({
  loading: true,
  locked: false,
  settingsOpen: false,
  hp: 100,
  armor: 100,
  weapon: "ar",
  ammo: 30,
  mag: 30,
  reloading: false,
  kills: 0,
  deaths: 0,
  dead: false,
  respawnIn: 0,
  vehicle: null,
  prompt: null,
  scoping: false,
  hit: null,
  feed: [],
  display: {
    requestedW: 1920,
    requestedH: 1080,
    actualW: 1920,
    actualH: 1080,
    error: null,
  },
});

export function useSettings() {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.get);
}
export function useHud() {
  return useSyncExternalStore(hudStore.subscribe, hudStore.get, hudStore.get);
}
