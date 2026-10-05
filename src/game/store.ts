import { useSyncExternalStore } from "react";
import type { WeaponId } from "./config";

export type CrosshairType = "dot" | "cross" | "inverted";

export interface Settings {
  crosshair: CrosshairType;
  crossSize: number;
  outline: number;
  color: string;
  sensitivity: number;
  resolution: { w: number; h: number } | null;
  reshade: boolean;
  volume: number;
}

export interface FeedItem {
  id: number;
  killer: string;
  victim: string;
  head: boolean;
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
  hit: { id: number; head: boolean } | null;
  feed: FeedItem[];
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

export const settingsStore = createStore<Settings>({
  crosshair: "dot",
  crossSize: 6,
  outline: 1,
  color: "#ffffff",
  sensitivity: 1,
  resolution: null,
  reshade: true,
  volume: 0.5,
});

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
});

export function useSettings() {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.get);
}
export function useHud() {
  return useSyncExternalStore(hudStore.subscribe, hudStore.get, hudStore.get);
}
