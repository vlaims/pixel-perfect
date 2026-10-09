import { useEffect, useRef, useState } from "react";
import { Engine } from "../game/engine";
import {
  DEFAULT_SETTINGS,
  hudStore,
  settingsStore,
  useHud,
  useSettings,
  type CrosshairType,
  type Quality,
  type Settings,
} from "../game/store";
import {
  computeStageRect,
  parseAspect,
  parseDimension,
  pixelRatioFor,
  requestedRenderSize,
  shouldPreventKey,
  type FitMode,
} from "../game/display";

// Asset URLs are hosted by Lovable's asset store; a standalone deploy must re-host them.
const MODEL_URL = "/__l5e/assets-v1/939a0cb9-7bfb-4b86-b6f5-72843aed44ab/male.glb";
const SOUNDS = {
  fire: "/__l5e/assets-v1/3728ba97-4d17-4aa7-917b-17e59c300a2c/fire.mp3",
  shoot: "/__l5e/assets-v1/c1da54f8-2539-4cc5-ab06-a33ae06eaf65/shoot.mp3",
  reload: "/__l5e/assets-v1/5ce8afb8-392d-437e-adb3-10825f980e27/reload.mp3",
};
const STORAGE_KEY = "pixel-perfect-settings";

type Tab = "display" | "graphics" | "crosshair" | "camera" | "controls" | "accessibility" | "audio";
const TABS: [Tab, string, string][] = [
  ["display", "DISPLAY", "Resolution & fit"],
  ["graphics", "GRAPHICS", "Quality & speed"],
  ["crosshair", "CROSSHAIR", "Dot & scope reticle"],
  ["camera", "CAMERA", "FOV & sensitivity"],
  ["controls", "CONTROLS", "Key bindings"],
  ["accessibility", "ACCESSIBILITY", "Comfort options"],
  ["audio", "AUDIO", "Volume"],
];

const CONTROLS: [string, string][] = [
  ["W A S D", "Move (camera-relative)"],
  ["Left Shift", "Sprint (not while aiming/crouching/rolling)"],
  ["Left Ctrl", "Crouch (hold)"],
  ["Right mouse", "Aim (hold)"],
  ["Left mouse", "Shoot (only while aiming)"],
  ["Space", "Roll (while aiming and moving)"],
  ["T", "Swap shoulder"],
  ["C", "Zoom (hold)"],
  ["V", "Look behind (hold)"],
  ["1 / 2", "Pistol / Assault rifle"],
  ["R", "Reload"],
  ["E", "Enter / exit vehicle"],
  ["Esc", "Release mouse / open menu"],
];

function loadSettings(): Partial<Settings> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return {};
    const d = DEFAULT_SETTINGS;
    const num = (v: unknown, fb: number) => parseDimension(v) ?? fb;
    const res = parsed.resolution
      ? { w: parseDimension(parsed.resolution.w), h: parseDimension(parsed.resolution.h) }
      : null;
    return {
      crosshair: ["dot", "cross", "inverted"].includes(parsed.crosshair) ? parsed.crosshair : d.crosshair,
      gameMode: parsed.gameMode === "ffa" ? "ffa" : "vehicle-only",
      crossSize: num(parsed.crossSize, d.crossSize),
      outline: Number.isFinite(parsed.outline) && parsed.outline >= 0 ? parsed.outline : d.outline,
      sensitivity: num(parsed.sensitivity, d.sensitivity),
      resolution: res && res.w && res.h ? { w: res.w, h: res.h } : d.resolution,
      volume: Number.isFinite(parsed.volume) ? Math.max(0, Math.min(1, parsed.volume)) : d.volume,
      aspect: parseAspect(parsed.aspect) ? parsed.aspect : d.aspect,
      customWidth: num(parsed.customWidth, d.customWidth),
      customHeight: num(parsed.customHeight, d.customHeight),
      centerColor: typeof parsed.centerColor === "string" ? parsed.centerColor : d.centerColor,
      borderColor: typeof parsed.borderColor === "string" ? parsed.borderColor : d.borderColor,
      fitMode: ["stretch", "blackbars", "cover", "native"].includes(parsed.fitMode) ? parsed.fitMode : d.fitMode,
      quality: ["low", "medium", "high"].includes(parsed.quality) ? parsed.quality : d.quality,
      fov: num(parsed.fov, d.fov),
      cameraTilt: typeof parsed.cameraTilt === "boolean" ? parsed.cameraTilt : d.cameraTilt,
      hudScale: num(parsed.hudScale, d.hudScale),
      scopeGap: Number.isFinite(parsed.scopeGap) && parsed.scopeGap >= 0 ? parsed.scopeGap : d.scopeGap,
      scopeLength: num(parsed.scopeLength, d.scopeLength),
      scopeThickness: num(parsed.scopeThickness, d.scopeThickness),
      scopeColor: typeof parsed.scopeColor === "string" ? parsed.scopeColor : d.scopeColor,
    };
  } catch {
    return {};
  }
}

export function Game() {
  const shellRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const hud = useHud();
  const settings = useSettings();
  const [tab, setTab] = useState<Tab>("display");
  const [error, setError] = useState<string | null>(null);
  const [container, setContainer] = useState({ w: 1, h: 1 });
  const [draft, setDraft] = useState(() => ({
    w: String(DEFAULT_SETTINGS.customWidth),
    h: String(DEFAULT_SETTINGS.customHeight),
    aw: "16",
    ah: "9",
  }));
  const [draftError, setDraftError] = useState<string | null>(null);
  const [mouseR, setMouseR] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  const enterGame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.focus({ preventScroll: true });
    try {
      const request = canvas.requestPointerLock?.();
      Promise.resolve(request).then(() => setLockError(null)).catch(() => setLockError("Mouse capture was blocked. Click the game again to retry."));
      engineRef.current?.sfx.resume();
    } catch {
      setLockError("Mouse capture was blocked. Click the game again to retry.");
    }
  };

  const aspect = parseAspect(settings.aspect)?.ratio ?? 16 / 9;
  const stage = computeStageRect(container.w, container.h, aspect, settings.fitMode);

  // Load persisted settings once.
  useEffect(() => {
    settingsStore.set(loadSettings());
    const s = settingsStore.get();
    const a = parseAspect(s.aspect);
    setDraft({ w: String(s.customWidth), h: String(s.customHeight), aw: String(a?.w ?? 16), ah: String(a?.h ?? 9) });
  }, []);

  // Track the container size.
  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const update = () => setContainer({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const hitId = hud.hit?.id;
    if (hitId == null) return;
    const timer = window.setTimeout(() => {
      if (hudStore.get().hit?.id === hitId) hudStore.set({ hit: null });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [hud.hit]);

  // Engine lifecycle + input.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let engine: Engine;
    try {
      engine = new Engine(canvas);
    } catch (err) {
      console.error("Failed to initialize game engine", err);
      setError(err instanceof Error ? err.message : "Failed to initialize the game");
      hudStore.set({ loading: false });
      return;
    }
    engineRef.current = engine;
    hudStore.set({ loading: true });

    const playing = () => document.pointerLockElement === canvas && !hudStore.get().settingsOpen;
    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === canvas;
      hudStore.set({ locked });
      if (locked) setLockError(null);
      if (!locked) {
        engine.clearInput();
        setMouseR(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        // Browser exits pointer lock itself; we only toggle the menu.
        hudStore.set({ settingsOpen: !hudStore.get().settingsOpen });
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        return;
      }
      if (!playing()) return;
      if (shouldPreventKey(e)) e.preventDefault();
      else if (e.ctrlKey || e.metaKey || e.altKey) return;
      engine.onKey(e.code, true);
    };
    const onKeyUp = (e: KeyboardEvent) => engine.onKey(e.code, false);
    const onMouseDown = (e: MouseEvent) => {
      if (hudStore.get().settingsOpen) return;
      if (document.pointerLockElement !== canvas) {
        canvas.focus({ preventScroll: true });
        try {
          Promise.resolve(canvas.requestPointerLock?.()).then(() => setLockError(null)).catch(() => setLockError("Mouse capture was blocked. Click the game again to retry."));
        } catch {
          setLockError("Mouse capture was blocked. Click the game again to retry.");
        }
        engine.sfx.resume();
        return;
      }
      engine.onMouse(e.button, true);
      if (e.button === 2) setMouseR(true);
    };
    const onMouseUp = (e: MouseEvent) => {
      engine.onMouse(e.button, false);
      if (e.button === 2) setMouseR(false);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (playing()) engine.onLook(e.movementX, e.movementY);
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onPointerLockError = () => setLockError("Mouse capture failed. Click the game to try again.");
    const onBlur = () => {
      engine.clearInput();
      setMouseR(false);
    };
    const onVisibility = () => {
      if (document.hidden) onBlur();
    };

    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("pointerlockerror", onPointerLockError);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("contextmenu", onContextMenu);

    void engine
      .load(MODEL_URL, SOUNDS)
      .then(() => {
        if (disposed) return;
        engine.start();
      })
      .catch((err) => {
        console.error(err);
        if (!disposed) {
          setError(err instanceof Error ? err.message : "Failed to load the game");
          hudStore.set({ loading: false });
        }
      });

    return () => {
      disposed = true;
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      document.removeEventListener("pointerlockerror", onPointerLockError);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("contextmenu", onContextMenu);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Apply settings: persist, volume, renderer size.
  const stageKey = `${Math.round(stage.w)}x${Math.round(stage.h)}`;
  useEffect(() => {
    const s = settingsStore.get();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {}
    const engine = engineRef.current;
    if (!engine) return;
    engine.sfx.setVolume(s.volume);
    const req = requestedRenderSize(s.fitMode, s.resolution, stage);
    const pr = pixelRatioFor(s.quality, window.devicePixelRatio || 1, s.fitMode === "native");
    const r = engine.resize(req.w, req.h, pr, s.fitMode === "native" ? container.w / Math.max(1, container.h) : aspect);
    hudStore.set({
      display: {
        requestedW: Math.round(req.w * pr),
        requestedH: Math.round(req.h * pr),
        actualW: r.actualW,
        actualH: r.actualH,
        error: r.error ?? null,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, stageKey, hud.loading]);

  const setSetting = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    settingsStore.set({ [key]: value } as Partial<Settings>);

  const applyCustomResolution = () => {
    const w = parseDimension(draft.w);
    const h = parseDimension(draft.h);
    if (w === null || h === null) {
      setDraftError("Width and height must be positive numbers.");
      return;
    }
    setDraftError(null);
    settingsStore.set({ customWidth: w, customHeight: h, resolution: { w, h } });
  };
  const applyCustomAspect = () => {
    const a = parseAspect(`${draft.aw}:${draft.ah}`);
    if (!a) {
      setDraftError("Aspect ratio parts must be positive numbers.");
      return;
    }
    setDraftError(null);
    setSetting("aspect", `${a.w}:${a.h}`);
  };
  const resetSettings = () => {
    settingsStore.set(DEFAULT_SETTINGS);
    setDraft({ w: String(DEFAULT_SETTINGS.customWidth), h: String(DEFAULT_SETTINGS.customHeight), aw: "16", ah: "9" });
    setDraftError(null);
  };
  const toggleFullscreen = () => {
    const el = shellRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => {});
  };

  const scoped = mouseR && hud.locked && !hud.dead;
  const disp = hud.display;
  const presets = ["16:9", "4:3", "21:9", "16:10", "1:1"];

  return (
    <main ref={shellRef} className="game-shell">
      <div
        className="game-stage"
        style={{ left: stage.x, top: stage.y, width: stage.w, height: stage.h }}
      >
        <canvas ref={canvasRef} className="game-canvas" tabIndex={0} aria-label="Game view" />
        {!hud.locked && !hud.loading && !hud.settingsOpen && !error && (
          <button className="game-start-overlay" onClick={enterGame} type="button">
            <span className="game-start-brand">PIXEL PERFECT</span>
            <strong>CLICK TO PLAY</strong>
            <small>WASD MOVE · RMB AIM · SHIFT SPRINT · ESC MENU</small>
            {lockError && <em role="alert">{lockError}</em>}
          </button>
        )}
        <div className="game-ui" style={{ ["--hud-scale" as string]: String(settings.hudScale) }}>
          <div className="game-topbar">
            <span className="game-title">PIXEL PERFECT</span>
            <span className="game-hint">CLICK TO PLAY · ESC MENU</span>
          </div>

          {scoped ? (
            <div
              className="game-scope"
              aria-hidden="true"
              style={{
                ["--g" as string]: `${settings.scopeGap}px`,
                ["--l" as string]: `${settings.scopeLength}px`,
                ["--t" as string]: `${settings.scopeThickness}px`,
                color: settings.scopeColor,
              }}
            >
              <i className="u" />
              <i className="d" />
              <i className="l" />
              <i className="r" />
            </div>
          ) : (
            <div
              className="game-dot"
              aria-hidden="true"
              style={{
                width: settings.crossSize / 3,
                height: settings.crossSize / 3,
                background: settings.centerColor,
                boxShadow: settings.outline > 0 && settings.crosshair !== "dot" ? `0 0 0 ${settings.outline}px ${settings.borderColor}` : "none",
              }}
            />
          )}

          {hud.hit && (
            <div key={hud.hit.id} className={`game-hitmarker ${hud.hit.zone === "head" ? "head" : ""}`} aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
          )}

          <div className="game-fps">
            FPS{" "}
            <strong ref={(el) => { if (el && engineRef.current) engineRef.current.fpsEl = el; }}>--</strong>
          </div>

          <div className="game-hud">
            <div className="game-status">
              <div className="game-hp"><span>HP</span><strong>{hud.hp}</strong></div>
              <div className="game-armor"><span>ARMOR</span><strong>{hud.armor}</strong></div>
            </div>
            <div className="game-ammo">
              <div className="game-weapon">{hud.weapon === "ar" ? "ASSAULT RIFLE" : "PISTOL"}</div>
              <div><strong>{hud.ammo}</strong><span> / {hud.mag}</span></div>
              {hud.reloading && <small>RELOADING</small>}
            </div>
            <div className="game-score">
              <span>KILLS</span><strong>{hud.kills}</strong><span>DEATHS</span><strong>{hud.deaths}</strong>
            </div>
          </div>
          {hud.prompt && <div className="game-prompt">{hud.prompt}</div>}
          {hud.dead && <div className="game-dead"><strong>YOU DIED</strong><span>RESPAWNING IN {hud.respawnIn}</span></div>}
        </div>
      </div>

      <button className="game-settings-button" aria-label="Open settings" onClick={() => hudStore.set({ settingsOpen: !hud.settingsOpen })}>⚙</button>

      {hud.settingsOpen && (
        <div className="game-settings-layer" role="dialog" aria-modal="true" aria-label="Settings" onMouseDown={(e) => {
          if (e.target === e.currentTarget) hudStore.set({ settingsOpen: false });
        }}>
          <section className="game-settings">
            <header className="settings-header">
              <div>
                <div className="game-settings-title">SETTINGS</div>
                <small>PIXEL PERFECT · LIVE CONFIG</small>
              </div>
              <div className="settings-head-actions">
                <button className="settings-reset" onClick={resetSettings}>RESET</button>
                <button className="settings-close" aria-label="Close settings" onClick={() => hudStore.set({ settingsOpen: false })}>×</button>
              </div>
            </header>

            <div className="settings-body">
              <nav className="game-settings-tabs" aria-label="Settings sections">
                {TABS.map(([id, label, sub]) => (
                  <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
                    <span>{label}</span>
                    <small>{sub}</small>
                  </button>
                ))}
              </nav>

              <div className="settings-content">
                {tab === "display" && (
                  <div className="settings-panel">
                    <div className="settings-section-title">GAME MODE</div>
                    <label>Mode
                      <select value={settings.gameMode} onChange={(e) => setSetting("gameMode", e.target.value as Settings["gameMode"])}>
                        <option value="vehicle-only">VEHICLE ONLY — bots stay in cars</option>
                        <option value="ffa">FFA — bots drive or fight on foot</option>
                      </select>
                    </label>
                    <div className="settings-section-title">FIT</div>
                    <label>Fit mode
                      <select value={settings.fitMode} onChange={(e) => setSetting("fitMode", e.target.value as FitMode)}>
                        <option value="stretch">Stretch — fill the screen</option>
                        <option value="blackbars">Black bars — keep aspect</option>
                        <option value="cover">Cover — keep aspect, crop</option>
                        <option value="native">Native — screen resolution</option>
                      </select>
                    </label>
                    <label>Aspect ratio
                      <select value={presets.includes(settings.aspect) ? settings.aspect : "custom"} onChange={(e) => {
                        const v = e.target.value;
                        if (v === "custom") return;
                        setSetting("aspect", v);
                        const a = parseAspect(v);
                        if (a) setDraft((d) => ({ ...d, aw: String(a.w), ah: String(a.h) }));
                      }}>
                        {presets.map((p) => <option key={p} value={p}>{p}</option>)}
                        <option value="custom">Custom ({settings.aspect})</option>
                      </select>
                    </label>
                    <div className="settings-grid">
                      <label>Aspect W<input type="text" inputMode="decimal" value={draft.aw} onChange={(e) => setDraft({ ...draft, aw: e.target.value })} /></label>
                      <label>Aspect H<input type="text" inputMode="decimal" value={draft.ah} onChange={(e) => setDraft({ ...draft, ah: e.target.value })} /></label>
                    </div>
                    <button className="settings-wide" onClick={applyCustomAspect}>APPLY ASPECT</button>

                    <div className="settings-section-title">INTERNAL RESOLUTION</div>
                    <div className="settings-grid">
                      <label>Width<input type="text" inputMode="decimal" value={draft.w} onChange={(e) => setDraft({ ...draft, w: e.target.value })} /></label>
                      <label>Height<input type="text" inputMode="decimal" value={draft.h} onChange={(e) => setDraft({ ...draft, h: e.target.value })} /></label>
                    </div>
                    <button className="settings-wide" onClick={applyCustomResolution}>APPLY RESOLUTION</button>
                    {draftError && <div className="settings-error" role="alert">{draftError}</div>}
                    <div className="settings-readout"><span>REQUESTED BUFFER</span><strong>{disp.requestedW}×{disp.requestedH}</strong></div>
                    <div className="settings-readout"><span>ACTUAL BUFFER</span><strong>{disp.actualW}×{disp.actualH}</strong></div>
                    {disp.error && <div className="settings-error" role="alert">Could not use this size: {disp.error}. Restored last working size.</div>}
                    <button className="settings-wide" onClick={toggleFullscreen}>TOGGLE FULLSCREEN</button>
                  </div>
                )}

                {tab === "graphics" && (
                  <div className="settings-panel">
                    <div className="settings-section-title">GRAPHICS</div>
                    <label>Quality
                      <select value={settings.quality} onChange={(e) => setSetting("quality", e.target.value as Quality)}>
                        <option value="low">Low — fastest (Chromebooks)</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </label>
                    <div className="settings-help">Quality caps the pixel density used to draw the game. Lower it if the FPS counter drops.</div>
                  </div>
                )}

                {tab === "crosshair" && (
                  <div className="settings-panel">
                    <div className="settings-section-title">DOT (NOT AIMING)</div>
                    <label>Style
                      <select value={settings.crosshair} onChange={(e) => setSetting("crosshair", e.target.value as CrosshairType)}>
                        <option value="dot">Dot (no outline)</option>
                        <option value="cross">Outlined dot</option>
                      </select>
                    </label>
                    <label>Size <output>{settings.crossSize}</output><input type="range" min="3" max="30" step="1" value={settings.crossSize} onChange={(e) => setSetting("crossSize", Number(e.target.value))} /></label>
                    <label>Outline <output>{settings.outline}px</output><input type="range" min="0" max="4" step="1" value={settings.outline} onChange={(e) => setSetting("outline", Number(e.target.value))} /></label>
                    <div className="settings-grid">
                      <label>Dot color<input type="color" value={settings.centerColor} onChange={(e) => setSetting("centerColor", e.target.value)} /></label>
                      <label>Outline color<input type="color" value={settings.borderColor} onChange={(e) => setSetting("borderColor", e.target.value)} /></label>
                    </div>
                    <div className="settings-section-title">SCOPE (WHILE AIMING)</div>
                    <label>Gap <output>{settings.scopeGap}px</output><input type="range" min="0" max="20" step="1" value={settings.scopeGap} onChange={(e) => setSetting("scopeGap", Number(e.target.value))} /></label>
                    <label>Arm length <output>{settings.scopeLength}px</output><input type="range" min="2" max="30" step="1" value={settings.scopeLength} onChange={(e) => setSetting("scopeLength", Number(e.target.value))} /></label>
                    <label>Thickness <output>{settings.scopeThickness}px</output><input type="range" min="1" max="6" step="1" value={settings.scopeThickness} onChange={(e) => setSetting("scopeThickness", Number(e.target.value))} /></label>
                    <label>Scope color<input type="color" value={settings.scopeColor} onChange={(e) => setSetting("scopeColor", e.target.value)} /></label>
                    <div className="settings-preview">
                      <span className="game-scope preview" style={{ ["--g" as string]: `${settings.scopeGap}px`, ["--l" as string]: `${settings.scopeLength}px`, ["--t" as string]: `${settings.scopeThickness}px`, color: settings.scopeColor }}>
                        <i className="u" /><i className="d" /><i className="l" /><i className="r" />
                      </span>
                      <small>SCOPE PREVIEW</small>
                    </div>
                  </div>
                )}

                {tab === "camera" && (
                  <div className="settings-panel">
                    <div className="settings-section-title">CAMERA</div>
                    <label>Field of view <output>{settings.fov}°</output><input type="range" min="50" max="90" step="1" value={settings.fov} onChange={(e) => setSetting("fov", Number(e.target.value))} /></label>
                    <label>Mouse sensitivity <output>{settings.sensitivity.toFixed(1)}×</output><input type="range" min="0.1" max="5" step="0.1" value={settings.sensitivity} onChange={(e) => setSetting("sensitivity", Number(e.target.value))} /></label>
                  </div>
                )}

                {tab === "controls" && (
                  <div className="settings-panel">
                    <div className="settings-section-title">CONTROLS</div>
                    <dl className="settings-keys">
                      {CONTROLS.map(([k, v]) => (
                        <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                      ))}
                    </dl>
                  </div>
                )}

                {tab === "accessibility" && (
                  <div className="settings-panel">
                    <div className="settings-section-title">ACCESSIBILITY</div>
                    <label>Camera tilt on mouse swipe<input type="checkbox" checked={settings.cameraTilt} onChange={(e) => setSetting("cameraTilt", e.target.checked)} /></label>
                    <label>HUD size <output>{Math.round(settings.hudScale * 100)}%</output><input type="range" min="0.75" max="1.6" step="0.05" value={settings.hudScale} onChange={(e) => setSetting("hudScale", Number(e.target.value))} /></label>
                    <div className="settings-help">Esc always releases the mouse. Browser shortcuts (Ctrl+L, Ctrl+W, Alt+F4) are never blocked.</div>
                  </div>
                )}

                {tab === "audio" && (
                  <div className="settings-panel">
                    <div className="settings-section-title">AUDIO</div>
                    <label>Master volume <output>{Math.round(settings.volume * 100)}%</output><input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={(e) => setSetting("volume", Number(e.target.value))} /></label>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
      {hud.loading && !error && <div className="game-overlay"><div className="game-loader">LOADING GAME</div></div>}
      {error && (
        <div className="game-overlay">
          <div className="game-error">
            <strong>GAME FAILED TO LOAD</strong>
            <span>{error}</span>
            <button onClick={() => window.location.reload()}>RELOAD</button>
          </div>
        </div>
      )}
    </main>
  );
}
