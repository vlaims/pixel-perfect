import { describe, expect, it } from "vitest";
import {
  CAMERA_GROUND_CLEARANCE,
  CAMERA_MAX_PITCH,
  CAMERA_MIN_PITCH,
  cameraFollowFactor,
  clampCameraPitch,
  orbitCameraPosition,
} from "@/game/cameraMath";

describe("third-person camera math", () => {
  it("clamps pitch to a safe orbit range", () => {
    expect(clampCameraPitch(-100)).toBe(CAMERA_MIN_PITCH);
    expect(clampCameraPitch(100)).toBe(CAMERA_MAX_PITCH);
    expect(clampCameraPitch(Number.NaN)).toBeCloseTo(-0.24);
  });

  it("keeps the default camera behind and above the torso pivot", () => {
    const pivot = { x: 0, y: 1.45, z: -6 };
    const camera = orbitCameraPosition(pivot, 0, -0.24, 3.8, 0.42);
    expect(camera.z).toBeLessThan(pivot.z);
    expect(camera.y).toBeGreaterThan(pivot.y);
    expect(camera.x).toBeCloseTo(-0.42);
  });

  it("keeps camera distance finite for invalid input", () => {
    const camera = orbitCameraPosition({ x: 1, y: 1, z: 1 }, Number.NaN, Number.NaN, Number.NaN);
    expect(Object.values(camera).every(Number.isFinite)).toBe(true);
  });

  it("uses frame-rate independent smoothing and rejects invalid deltas", () => {
    expect(cameraFollowFactor(1 / 60, 15)).toBeGreaterThan(0);
    expect(cameraFollowFactor(1 / 60, 15)).toBeLessThan(1);
    expect(cameraFollowFactor(0, 15)).toBe(0);
    expect(cameraFollowFactor(-1, 15)).toBe(0);
  });

  it("exports a positive ground-clearance invariant", () => {
    expect(CAMERA_GROUND_CLEARANCE).toBeGreaterThan(0);
  });
});
