import * as THREE from 'three';
import { groundHeight as landscapeHeight, riverCenter, riverWidth } from './terrain.js';

const CLEARANCE = 4.6;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

/** Two bounded viewpoints; owns camera pose/FOV, never aspect or DOM listeners. */
export function createCameraDirector(camera, { mobile = false, groundHeight = landscapeHeight } = {}) {
  const streamZ = 24;
  const views = {
    valley: {
      position: new THREE.Vector3(...(mobile ? [14, 18, 55] : [24, 15, 43])),
      target: new THREE.Vector3(...(mobile ? [10, 15, -65] : [-2, 10, -62])),
      fov: mobile ? 70 : 48,
    },
    stream: {
      // Stay inside the clear river corridor, away from trunks on either bank.
      position: new THREE.Vector3(riverCenter(streamZ) + riverWidth(streamZ) - 2.2, mobile ? 10 : 8.4, streamZ),
      target: new THREE.Vector3(riverCenter(-48), 5.2, -48),
      fov: mobile ? 70 : 54,
    },
  };
  const targetPosition = new THREE.Vector3();
  const targetLookAt = new THREE.Vector3();
  const lookAt = views.valley.target.clone();
  let view = 'valley';
  let drift = false;
  let disposed = false;

  function keepAboveGround(position) {
    const height = finite(groundHeight(position.x, position.z));
    position.y = Math.max(position.y, height + CLEARANCE, CLEARANCE);
  }

  function update({ time = 0, dt = 1 / 60, pointer, reducedMotion = false } = {}) {
    if (disposed) return;
    const preset = views[view];
    targetPosition.copy(preset.position);
    targetLookAt.copy(preset.target);

    if (!reducedMotion) {
      const pointerX = THREE.MathUtils.clamp(finite(pointer?.x), -1, 1);
      const pointerY = THREE.MathUtils.clamp(finite(pointer?.y), -1, 1);
      targetPosition.x += pointerX * (view === 'valley' ? 1.2 : .65);
      targetPosition.y += pointerY * (view === 'valley' ? .4 : .25);
      if (drift) {
        // Long, mismatched periods keep the motion slow without a visible loop.
        const elapsed = finite(time);
        targetPosition.x += Math.sin(elapsed * .075) * .65;
        targetPosition.y += Math.sin(elapsed * .11) * .2;
        targetPosition.z += Math.sin(elapsed * .055) * .55;
        targetLookAt.x += Math.sin(elapsed * .062) * .55;
        targetLookAt.y += Math.sin(elapsed * .085) * .12;
      }
    }
    keepAboveGround(targetPosition);

    const blend = reducedMotion ? 1 : 1 - Math.exp(-1.6 * THREE.MathUtils.clamp(finite(dt), 0, .08));
    camera.position.lerp(targetPosition, blend);
    lookAt.lerp(targetLookAt, blend);
    if (camera.position.distanceToSquared(targetPosition) < 1e-10) camera.position.copy(targetPosition);
    if (lookAt.distanceToSquared(targetLookAt) < 1e-10) lookAt.copy(targetLookAt);
    // Test the interpolated path too: a high bank can lie between two safe poses.
    keepAboveGround(camera.position);
    camera.lookAt(lookAt);

    let fov = THREE.MathUtils.lerp(camera.fov, preset.fov, blend);
    if (Math.abs(fov - preset.fov) < 1e-5) fov = preset.fov;
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  camera.position.copy(views.valley.position);
  update({ reducedMotion: true });

  return {
    setView(next) {
      if (disposed || !Object.hasOwn(views, next)) return false;
      view = next;
      return true;
    },
    setDrift(enabled) { if (!disposed) drift = Boolean(enabled); },
    setMobile(narrow) {
      if (disposed) return;
      mobile = Boolean(narrow);
      views.valley.position.set(mobile ? 14 : 24, mobile ? 18 : 15, mobile ? 55 : 43);
      views.valley.target.set(mobile ? 10 : -2, mobile ? 15 : 10, mobile ? -65 : -62);
      views.valley.fov = mobile ? 70 : 48;
      views.stream.position.y = mobile ? 10 : 8.4;
      views.stream.fov = mobile ? 70 : 54;
    },
    update,
    dispose() { disposed = true; },
  };
}
