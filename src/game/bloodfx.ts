export interface BloodFxEntry {
  id: number;
  probability: number;
  spraySizeHi: number;
  spraySizeLo: number;
  mistSizeHi: number;
  mistSizeLo: number;
  velocity: number;
  gravity: number;
  scale: number;
  lifeMin: number;
  lifeMax: number;
  growthMin: number;
  growthMax: number;
  fxSystems: string[];
  damageName: string;
}

export interface BloodFxConfig {
  source: "bloodfx.dat" | "fallback";
  entries: BloodFxEntry[];
  byId: Map<number, BloodFxEntry>;
}

const fallback: BloodFxConfig = { source: "fallback", entries: [], byId: new Map() };

export function parseBloodFxDat(text: string): BloodFxConfig {
  const entries: BloodFxEntry[] = [];
  let inInfo = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "BLOODFX_ENTRY_INFO_START") { inInfo = true; continue; }
    if (line === "BLOODFX_ENTRY_INFO_END") { inInfo = false; continue; }
    if (!inInfo || !/^\d{3}\s/.test(line)) continue;
    const t = line.split(/\s+/);
    if (t.length < 34) continue;
    const nums = t.slice(0, 34).map(Number);
    if (nums.some((n) => !Number.isFinite(n))) continue;
    const fxSystems = t.slice(34).filter((x) => x !== "-" && !/^\d+(?:\.\d+)?$/.test(x));
    entries.push({
      id: nums[0], probability: nums[1],
      spraySizeHi: nums[19], spraySizeLo: nums[20],
      mistSizeHi: nums[21], mistSizeLo: nums[22],
      lifeMin: nums[23], lifeMax: nums[24],
      growthMin: nums[25], growthMax: nums[26],
      velocity: Math.max(1, (nums[25] + nums[26]) / Math.max(0.05, nums[23] + nums[24])),
      gravity: 14 + Math.max(0, nums[15]) * 0.5,
      scale: Math.max(0.25, (nums[19] + nums[20] + nums[21] + nums[22]) * 4),
      fxSystems, damageName: fxSystems.at(-1) ?? "blood",
    });
  }
  return entries.length ? { source: "bloodfx.dat", entries, byId: new Map(entries.map((e) => [e.id, e])) } : fallback;
}

export async function loadBloodFxDat(url = "/bloodfx.dat"): Promise<BloodFxConfig> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`bloodfx.dat: ${res.status}`);
    return parseBloodFxDat(await res.text());
  } catch { return fallback; }
}

export function selectBloodFx(config: BloodFxConfig, headshot: boolean): BloodFxEntry {
  return config.byId.get(headshot ? 81 : 80) ?? config.entries[0] ?? {
    id: headshot ? 81 : 80, probability: 1,
    spraySizeHi: 0.18, spraySizeLo: 0.08, mistSizeHi: 0.12, mistSizeLo: 0.05,
    lifeMin: 0.18, lifeMax: 0.4, growthMin: 0.05, growthMax: 0.1, velocity: 7, gravity: 18, scale: 1,
    fxSystems: [], damageName: "fallback",
  };
}
