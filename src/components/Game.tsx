import { useEffect, useRef, useState } from "react";
import { Engine } from "../game/engine";
import { hudStore, settingsStore, useHud, useSettings, type CrosshairType } from "../game/store";

const MODEL_URL = "/__l5e/assets-v1/939a0cb9-7bfb-4b86-b6f5-72843aed44ab/male.glb";
const SOUNDS = {
  fire: "/__l5e/assets-v1/3728ba97-4d17-4aa7-917b-17e59c300a2c/fire.mp3",
  shoot: "/__l5e/assets-v1/c1da54f8-2539-4cc5-ab06-a33ae06eaf65/shoot.mp3",
  reload: "/__l5e/assets-v1/5ce8afb8-392d-437e-adb3-10825f980e27/reload.mp3",
};

export function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const hud = useHud();
  const settings = useSettings();
  const [tab, setTab] = useState<"resolution" | "crosshair" | "sensitivity">("resolution");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hitId = hud.hit?.id;
    if (hitId == null) return;
    const timer = window.setTimeout(() => {
      if (hudStore.get().hit?.id === hitId) hudStore.set({ hit: null });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [hud.hit]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("pixel-perfect-settings");
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== "object") return;
      const current = settingsStore.get();
      settingsStore.set({
        crosshair: ["dot","cross","inverted"].includes(parsed.crosshair) ? parsed.crosshair : current.crosshair,
        crossSize: Number.isFinite(parsed.crossSize) ? Math.max(2, Math.min(32, parsed.crossSize)) : current.crossSize,
        outline: Number.isFinite(parsed.outline) ? Math.max(0, Math.min(5, parsed.outline)) : current.outline,
        sensitivity: Number.isFinite(parsed.sensitivity) ? Math.max(0.1, Math.min(5, parsed.sensitivity)) : current.sensitivity,
        resolution: parsed.resolution && Number.isFinite(parsed.resolution.w) && Number.isFinite(parsed.resolution.h)
          ? { w: Math.max(320, Math.min(7680, Math.round(parsed.resolution.w))), h: Math.max(240, Math.min(4320, Math.round(parsed.resolution.h))) }
          : null,
        reshade: Boolean(parsed.reshade),
        volume: Number.isFinite(parsed.volume) ? Math.max(0, Math.min(1, parsed.volume)) : current.volume,
        aspect: parsed.aspect === "4:3" ? "4:3" : "16:9",
        customWidth: Number.isFinite(parsed.customWidth) ? Math.max(320, Math.min(7680, Math.round(parsed.customWidth))) : current.customWidth,
        customHeight: Number.isFinite(parsed.customHeight) ? Math.max(240, Math.min(4320, Math.round(parsed.customHeight))) : current.customHeight,
        centerColor: typeof parsed.centerColor === "string" ? parsed.centerColor : current.centerColor,
        borderColor: typeof parsed.borderColor === "string" ? parsed.borderColor : current.borderColor,
      });
    } catch {}
  }, []);

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

    const resize = () => {
      const s = settingsStore.get();
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      const w = s.resolution?.w ?? Math.max(1, rect.width);
      const h = s.resolution?.h ?? Math.max(1, rect.height);
      engine.resize(w, h, dpr);
    };
    const onPointerLockChange = () => hudStore.set({ locked: document.pointerLockElement === canvas });
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.preventDefault();
        hudStore.set({ settingsOpen: !hudStore.get().settingsOpen });
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        return;
      }
      if (hudStore.get().settingsOpen) return;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
      engine.onKey(e.code, true);
    };
    const onKeyUp = (e: KeyboardEvent) => engine.onKey(e.code, false);
    const onMouseDown = (e: MouseEvent) => {
      if (hudStore.get().settingsOpen) return;
      if (document.pointerLockElement !== canvas) void canvas.requestPointerLock();
      engine.sfx.resume();
      engine.onMouse(e.button, true);
    };
    const onMouseUp = (e: MouseEvent) => engine.onMouse(e.button, false);
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement === canvas && !hudStore.get().settingsOpen) engine.onLook(e.movementX, e.movementY);
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onBlur = () => engine.clearInput();

    window.addEventListener("resize", resize);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("contextmenu", onContextMenu);
    resize();

    void engine.load(MODEL_URL, SOUNDS).then(() => {
      if (disposed) return;
      resize();
      engine.start();
    }).catch((err) => {
      console.error(err);
      if (!disposed) {
        setError(err instanceof Error ? err.message : "Failed to load the game");
        hudStore.set({ loading: false });
      }
    });

    return () => {
      disposed = true;
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("contextmenu", onContextMenu);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const s = settingsStore.get();
    try { localStorage.setItem("pixel-perfect-settings", JSON.stringify(s)); } catch {}
    const engine = engineRef.current;
    if (engine) {
      engine.sfx.setVolume(s.volume);
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) engine.resize(s.resolution?.w ?? rect.width, s.resolution?.h ?? rect.height, Math.min(window.devicePixelRatio || 1, 1.25));
    }
  }, [settings]);

  const setSetting = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => settingsStore.set({ [key]: value } as any);
  const resetSettings = () => settingsStore.set({
    crosshair: "dot",
    crossSize: 6,
    outline: 1,
    color: "#ffffff",
    sensitivity: 1,
    resolution: null,
    reshade: false,
    volume: 0.5,
    aspect: "16:9",
    customWidth: 1920,
    customHeight: 1080,
    centerColor: "#ffffff",
    borderColor: "#000000",
  });
  const customW = Math.max(320, Math.min(7680, Math.round(settings.customWidth)));
  const customH = Math.max(240, Math.min(4320, Math.round(settings.customHeight)));

  return (
    <main className="game-shell">
      <canvas ref={canvasRef} className="game-canvas" />
      <div className="game-vignette" />

      <div className="game-topbar">
        <span className="game-title">PIXEL PERFECT</span>
        <span className="game-hint">CLICK TO PLAY · WASD MOVE · SHIFT RUN · LMB FIRE · RMB AIM · R RELOAD · E VEHICLE</span>
      </div>

      <div
        className={`game-crosshair ${settings.crosshair}`}
        style={{ width: settings.crosshair === "cross" ? 18 : settings.crossSize, height: settings.crosshair === "cross" ? 18 : settings.crossSize, color: settings.centerColor, border: settings.crosshair === "cross" ? "0" : `${settings.outline}px solid ${settings.borderColor}` }}
        aria-hidden="true"
      >
        <span style={{ background: settings.centerColor }} />
      </div>

      {hud.hit && <div key={hud.hit.id} className={`game-hitmarker ${hud.hit.zone === "head" ? "head" : ""}`} aria-hidden="true"><i/><i/><i/><i/></div>}

      <div className="game-fps">FPS <strong ref={(el) => { if (el && engineRef.current) engineRef.current.fpsEl = el; }}>--</strong></div>

      <button className="game-settings-button" aria-label="Open settings" onClick={() => hudStore.set({ settingsOpen: !hud.settingsOpen })}>⚙</button>

      {hud.settingsOpen && (
        <div className="game-settings-layer" role="dialog" aria-modal="true" onMouseDown={(e) => {
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
                {([
                  ["resolution","DISPLAY"],
                  ["crosshair","CROSSHAIR"],
                  ["sensitivity","INPUT"],
                ] as const).map(([id,label]) => (
                  <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
                    <span>{label}</span>
                    <small>{id === "resolution" ? "Resolution & stretch" : id === "crosshair" ? "Reticle style" : "Mouse & audio"}</small>
                  </button>
                ))}
              </nav>

              <div className="settings-content">
                {tab === "resolution" && <div className="settings-panel">
                  <div className="settings-section-title">DISPLAY</div>
                  <label>Resolution preset
                    <select value={settings.resolution ? `${settings.resolution.w}x${settings.resolution.h}` : "native"} onChange={e => {
                      const v=e.target.value;
                      if (v==="native") setSetting("resolution", null);
                      else { const [w,h]=v.split("x").map(Number); setSetting("resolution",{w,h}); }
                    }}>
                      <option value="native">Native display</option>
                      <option value="1920x1080">1920 × 1080</option>
                      <option value="1280x960">1280 × 960</option>
                    </select>
                  </label>

                  <div className="settings-grid">
                    <label>Aspect ratio
                      <select value={settings.aspect} onChange={e => setSetting("aspect", e.target.value as "16:9"|"4:3")}>
                        <option value="16:9">16:9 widescreen</option>
                        <option value="4:3">4:3 stretched</option>
                      </select>
                    </label>
                    <div className="settings-readout"><span>RENDER SIZE</span><strong>{settings.resolution ? `${settings.resolution.w}×${settings.resolution.h}` : "NATIVE"}</strong></div>
                  </div>

                  <div className="settings-grid">
                    <label>Custom width<input type="number" min="320" max="7680" value={customW} onChange={e=>setSetting("customWidth",Number(e.target.value)||320)}/></label>
                    <label>Custom height<input type="number" min="240" max="4320" value={customH} onChange={e=>setSetting("customHeight",Number(e.target.value)||240)}/></label>
                  </div>
                  <button className="settings-wide" onClick={()=>setSetting("resolution",{w:customW,h:customH})}>APPLY CUSTOM RESOLUTION</button>
                </div>}

                {tab === "crosshair" && <div className="settings-panel">
                  <div className="settings-section-title">CROSSHAIR</div>
                  <label>Style<select value={settings.crosshair} onChange={e=>setSetting("crosshair",e.target.value as CrosshairType)}>
                    <option value="dot">Dot</option><option value="cross">Cross</option><option value="inverted">Inverted Dot</option>
                  </select></label>
                  <label>Size <output>{settings.crossSize}px</output><input type="range" min="2" max="32" step="1" value={settings.crossSize} onChange={e=>setSetting("crossSize",Number(e.target.value))}/></label>
                  <label>Outline <output>{settings.outline}px</output><input type="range" min="0" max="5" step="1" value={settings.outline} onChange={e=>setSetting("outline",Number(e.target.value))}/></label>
                  <div className="settings-grid">
                    <label>Center color<input type="color" value={settings.centerColor} onChange={e=>setSetting("centerColor",e.target.value)}/></label>
                    <label>Outline color<input type="color" value={settings.borderColor} onChange={e=>setSetting("borderColor",e.target.value)}/></label>
                  </div>
                  <div className="settings-preview"><span className={`preview-crosshair ${settings.crosshair}`} style={{color:settings.centerColor,borderColor:settings.borderColor}}><i/></span><small>LIVE PREVIEW</small></div>
                </div>}

                {tab === "sensitivity" && <div className="settings-panel">
                  <div className="settings-section-title">INPUT & AUDIO</div>
                  <label>Mouse sensitivity <output>{settings.sensitivity.toFixed(1)}×</output><input type="range" min="0.1" max="5" step="0.1" value={settings.sensitivity} onChange={e=>setSetting("sensitivity",Number(e.target.value))}/></label>
                  <label>Master volume <output>{Math.round(settings.volume*100)}%</output><input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={e=>setSetting("volume",Number(e.target.value))}/></label>
                  <label className="settings-check"><span>Post FX</span><input type="checkbox" checked={settings.reshade} onChange={e=>setSetting("reshade",e.target.checked)}/></label>
                  <div className="settings-help">ESC closes this panel. Click outside the panel to close it. Changes are saved locally.</div>
                </div>}
              </div>
            </div>
          </section>
        </div>
      )}
      <div className="game-hud">
        <div className="game-status"><div className="game-hp"><span>HP</span><strong>{hud.hp}</strong></div><div className="game-armor"><span>ARMOR</span><strong>{hud.armor}</strong></div></div>
        <div className="game-ammo"><div className="game-weapon">{hud.weapon === "ar" ? "ASSAULT RIFLE" : "PISTOL"}</div><div><strong>{hud.ammo}</strong><span> / {hud.mag}</span></div>{hud.reloading && <small>RELOADING</small>}</div>
        <div className="game-score"><span>KILLS</span><strong>{hud.kills}</strong><span>DEATHS</span><strong>{hud.deaths}</strong></div>
      </div>
      {hud.prompt && <div className="game-prompt">{hud.prompt}</div>}
      {hud.dead && <div className="game-dead"><strong>YOU DIED</strong><span>RESPAWNING IN {hud.respawnIn}</span></div>}
      {hud.loading && !error && <div className="game-overlay"><div className="game-loader">LOADING GAME</div></div>}
      {error && <div className="game-overlay"><div className="game-error"><strong>GAME FAILED TO LOAD</strong><span>{error}</span><button onClick={() => window.location.reload()}>RELOAD</button></div></div>}
    </main>
  );
}
