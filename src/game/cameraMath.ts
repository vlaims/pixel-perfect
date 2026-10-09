export interface Vec3Like { x: number; y: number; z: number }

export const CAMERA_MIN_PITCH = -0.72;
export const CAMERA_MAX_PITCH = 0.16;
export const CAMERA_GROUND_CLEARANCE = 0.82;

export function clampCameraPitch(pitch: number): number {
  if (!Number.isFinite(pitch)) return -0.24;
  return Math.max(CAMERA_MIN_PITCH, Math.min(CAMERA_MAX_PITCH, pitch));
}

export function cameraFollowFactor(dt: number, rate: number): number {
  if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(rate) || rate <= 0) return 0;
  return 1 - Math.exp(-rate * Math.min(dt, 0.1));
}

/** Third-person orbit position, with world-up fixed to +Y. */
export function orbitCameraPosition(
  pivot: Vec3Like,
  yaw: number,
  pitch: number,
  distance: number,
  shoulderOffset = 0,
  lookAhead = 0.12,
): Vec3Like {
  const safeYaw = Number.isFinite(yaw) ? yaw : 0;
  const safePitch = clampCameraPitch(pitch);
  const safeDistance = Number.isFinite(distance) ? Math.max(0.1, distance) : 3.8;
  const safeShoulder = Number.isFinite(shoulderOffset) ? shoulderOffset : 0;
  const cp = Math.cos(safePitch);
  return {
    x: pivot.x - Math.sin(safeYaw) * cp * safeDistance - Math.cos(safeYaw) * safeShoulder,
    y: pivot.y - Math.sin(safePitch) * safeDistance + lookAhead,
    z: pivot.z - Math.cos(safeYaw) * cp * safeDistance + Math.sin(safeYaw) * safeShoulder,
  };
}
