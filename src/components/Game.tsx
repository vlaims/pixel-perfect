import { useEffect, useRef, useState } from "react";
import { Engine } from "../game/engine";
import { hudStore, useHud } from "../game/store";

const MODEL_URL =
  "/__l5e/assets-v1/939a0cb9-7bfb-4b86-b6f5-72843aed44ab/male.glb";

const SOUNDS = {
  fire: "/__l5e/assets-v1/9f6d5c50-0a70-4e1e-9d18-0a2e5a8f6a41/fire.mp3",
  shoot: "/__l5e/assets-v1/c1da54f8-2539-4cc5-ab06-a33ae06eaf65/shoot.mp3",
  reload: "/__l5e/assets-v1/ccd9637b-7fe3-4a16-26f0-e3e2eb123d1adb62262/reload.mp3",
};

export function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const hud = useHud();
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

    const onKeyDown = (e: KeyboardEvent) => {
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

      <div className="game-crosshair" aria-hidden="true">
        <span />
      </div>

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
