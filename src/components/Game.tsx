import { useEffect, useRef, useState } from "react";
import { Engine } from "../game/engine";
import { hudStore, settingsStore, useHud, useSettings } from "../game/store";

const MODEL_URL =
  "/__l5e/assets-v1/939a0cb9-7bfb-4b86-b6f5-72843aed44ab/male.glb";

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    const engine = new Engine(canvas);
    engineRef.current = engine;
    hudStore.set({ loading: true });

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      engine.resize(Math.max(1, rect.width), Math.max(1, rect.height), dpr);
    };

    const onPointerLockChange = () => {
      hudStore.set({ locked: document.pointerLockElement === canvas });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.preventDefault();
        hudStore.set({ settingsOpen: !hudStore.get().settingsOpen });
        return;
      }
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
      }
      engine.onKey(e.code, true);
    };

    const onKeyUp = (e: KeyboardEvent) => engine.onKey(e.code, false);

    const onMouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) {
        void canvas.requestPointerLock();
      }
      engine.sfx.resume();
      engine.onMouse(e.button, true);
    };

    const onMouseUp = (e: MouseEvent) => engine.onMouse(e.button, false);

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement === canvas) {
        engine.onLook(e.movementX, e.movementY);
      }
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

    void engine
      .load(MODEL_URL, SOUNDS)
      .then(() => {
        if (disposed) return;
        resize();
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

  return (
    <main className="game-shell">
      <canvas ref={canvasRef} className="game-canvas" />

      <div className="game-vignette" />

      <div className="game-topbar">
        <span className="game-title">PIXEL PERFECT</span>
        <span className="game-hint">CLICK TO PLAY · WASD MOVE · LMB FIRE · RMB AIM · R RELOAD · E VEHICLE</span>
      </div>

      <div className="game-crosshair" style={{ width: settings.crossSize, height: settings.crossSize, color: settings.color, border: `${settings.outline}px solid #000` }} aria-hidden="true">
        <span style={{ background: settings.color }} />
      </div>

      {hud.hit && <div key={hud.hit.id} className={`game-hitmarker ${hud.hit.zone === "head" ? "head" : ""}`}>X</div>}

      <div className="game-fps">FPS <strong ref={(el) => { if (el && engineRef.current) engineRef.current.fpsEl = el; }}>--</strong></div>

      {hud.settingsOpen && <div className="game-settings">
        <div className="game-settings-title">SETTINGS</div>
        <label>Crosshair <select value={settings.crosshair} onChange={e => settingsStore.set({ crosshair: e.target.value as any })}>
          <option value="dot">Dot</option><option value="cross">Cross</option><option value="inverted">Inverted Dot</option>
        </select></label>
        <label>Outline Size <input type="range" min="0" max="5" step="1" value={settings.outline} onChange={e => settingsStore.set({ outline: Number(e.target.value) })}/><span>{settings.outline}px</span></label>
        <label>Resolution <select value={settings.resolution ? `${settings.resolution.w}x${settings.resolution.h}` : "native"} onChange={e => { const v=e.target.value; settingsStore.set({ resolution: v==="native" ? null : {w:Number(v.split("x")[0]),h:Number(v.split("x")[1])} }); }}>
          <option value="native">Native</option><option value="1920x1080">1920×1080</option><option value="1280x960">1280×960</option>
        </select></label>
        <label>Post FX <input type="checkbox" checked={settings.reshade} onChange={e => settingsStore.set({ reshade: e.target.checked })}/></label>
        <label>Volume <input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={e => settingsStore.set({ volume: Number(e.target.value) })}/></label>
      </div>}

      <div className="game-hud">
        <div className="game-status">
          <div className="game-hp">
            <span>HP</span>
            <strong>{hud.hp}</strong>
          </div>
          <div className="game-armor">
            <span>ARMOR</span>
            <strong>{hud.armor}</strong>
          </div>
        </div>

        <div className="game-ammo">
          <div className="game-weapon">{hud.weapon === "ar" ? "ASSAULT RIFLE" : "PISTOL"}</div>
          <div>
            <strong>{hud.ammo}</strong>
            <span> / {hud.mag}</span>
          </div>
          {hud.reloading && <small>RELOADING</small>}
        </div>

        <div className="game-score">
          <span>KILLS</span>
          <strong>{hud.kills}</strong>
          <span>DEATHS</span>
          <strong>{hud.deaths}</strong>
        </div>
      </div>

      {hud.prompt && <div className="game-prompt">{hud.prompt}</div>}

      {hud.dead && (
        <div className="game-dead">
          <strong>YOU DIED</strong>
          <span>RESPAWNING IN {hud.respawnIn}</span>
        </div>
      )}

      {hud.loading && !error && (
        <div className="game-overlay">
          <div className="game-loader">LOADING GAME</div>
        </div>
      )}

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
