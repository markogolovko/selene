import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { BodyName } from '../solar-data';
import type { BodyScene } from './body-scene';

export type FocusCameraPlan = { near: number; distance: number; transitionThreshold: number; minDistance: number; offset: [number, number, number] };
export function calculateFocusCameraPlan(input: { selected: boolean; realScale: boolean; radius: number; displayRadius: number; currentDistance: number; homeVector: [number, number, number]; mobile: boolean; encounterSeparation?: number }): FocusCameraPlan {
  const { selected, realScale, radius, displayRadius, currentDistance, homeVector, mobile, encounterSeparation } = input;
  const homeDistance = Math.hypot(...homeVector);
  const near = selected && (realScale || encounterSeparation !== undefined) ? Math.max(radius * 0.08, 0.000000001) : 0.1;
  let preferredDistance = selected ? realScale ? Math.max(radius * 8, 0.000001) : Math.max(displayRadius * 7, 4) : homeDistance;
  if (selected && !realScale && encounterSeparation !== undefined) {
    preferredDistance = Math.min(preferredDistance, Math.max(encounterSeparation * 5, radius * 8));
  }
  const distance = selected ? Math.min(currentDistance, preferredDistance) : homeDistance;
  const transitionThreshold = Math.min(0.03, Math.max(distance * 0.005, 0.000000001));
  const minDistance = selected ? Math.max(radius * 1.8, near * 2.5) : 5;
  const scale = distance / Math.hypot(0.4, 0.6, 1);
  const offset: [number, number, number] = selected ? [0.4 * scale, 0.6 * scale, 1 * scale] : homeVector.map((value) => value * (mobile ? 1.4 : 1)) as [number, number, number];
  return { near, distance, transitionThreshold, minDistance, offset };
}

export type FocusCameraController = {
  focus: (name: BodyName | null, preserveView?: boolean) => void;
  update: (target: THREE.Vector3 | null, elapsed: number, now: number) => void;
  cancel: () => void;
};

export function createFocusCameraController(options: {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  bodyScene: BodyScene;
  home: THREE.Vector3;
  origin: THREE.Vector3;
  isRealScale: () => boolean;
  width: () => number;
  radiusFor: (name: BodyName) => number;
}): FocusCameraController {
  const { camera, controls, bodyScene, home, origin, isRealScale, width, radiusFor } = options;
  const offset = new THREE.Vector3();
  const lastTarget = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const destination = new THREE.Vector3();
  const delta = new THREE.Vector3();
  let transition = false;
  let transitionStartedAt = 0;
  let transitionThreshold = 0.03;
  let focusedName: BodyName | null = null;
  let preservedMinimumDistance: number | null = null;

  function focus(name: BodyName | null, preserveView = false) {
    focusedName = name;
    const item = name ? bodyScene.objectByName.get(name) : undefined;
    const radius = item ? radiusFor(item.body.name) : 0;
    let encounterSeparation: number | undefined;
    if (!isRealScale() && item && (name === 'Earth' || name === 'Moon' || name === 'Apophis') && radius < item.body.radius) {
      encounterSeparation = name === 'Moon' ? 0
        : bodyScene.earth.group.position.distanceTo(bodyScene.objectByName.get('Apophis')!.group.position);
      // Earth frames the lunar system; Apophis frames the closer Earth flyby.
      if (name === 'Earth') encounterSeparation = Math.max(encounterSeparation, bodyScene.earth.group.position.distanceTo(bodyScene.moon.group.position));
    }
    const currentDistance = camera.position.distanceTo(controls.target);
    const plan = calculateFocusCameraPlan({ selected: Boolean(item), realScale: isRealScale(), radius, displayRadius: item?.body.radius ?? 0, currentDistance, homeVector: [home.x, home.y, home.z], mobile: width() < 700, encounterSeparation });
    camera.near = plan.near;
    camera.updateProjectionMatrix();
    transitionThreshold = plan.transitionThreshold;
    const preserveNear = name === 'Apophis' ? Math.max(radius * 0.08, currentDistance * 0.001, 0.000000001) : plan.near;
    preservedMinimumDistance = preserveView
      ? Math.min(Math.max(radius * 1.8, preserveNear * 2.5), Math.max(currentDistance * 0.5, 0.000000001))
      : null;
    controls.minDistance = preservedMinimumDistance ?? plan.minDistance;
    if (preserveView) {
      // Changing display scale should keep the user's orbit view and zoom.
      const target = item ? item.group.position : origin;
      camera.position.add(delta.copy(target).sub(controls.target));
      controls.target.copy(target);
      lastTarget.copy(target);
      transition = false;
      return;
    }
    offset.set(...plan.offset);
    transition = true;
    transitionStartedAt = performance.now();
    lastTarget.copy(item ? item.group.position : origin);
  }

  function update(target: THREE.Vector3 | null, elapsed: number, now: number) {
    desired.copy(target ?? origin);
    if (transition) {
      const factor = 1 - Math.exp(-elapsed * 5);
      controls.target.lerp(desired, factor);
      destination.copy(desired).add(offset);
      camera.position.lerp(destination, factor);
      if (camera.position.distanceTo(destination) < transitionThreshold || now - transitionStartedAt > 1_500) {
        controls.target.copy(desired);
        camera.position.copy(destination);
        transition = false;
      }
    } else if (target) {
      camera.position.add(delta.copy(desired).sub(lastTarget));
      controls.target.copy(desired);
    }
    lastTarget.copy(desired);

    if (focusedName === 'Apophis' || (!isRealScale() && (focusedName === 'Earth' || focusedName === 'Moon'))) {
      const item = bodyScene.objectByName.get(focusedName)!;
      const radius = radiusFor(focusedName);
      // Recompute clipping and minimum distance after camera transitions move it.
      // Otherwise OrbitControls can apply the previous overview distance on the arrival frame.
      const viewNear = focusedName === 'Apophis' ? camera.position.distanceTo(controls.target) * 0.001 : 0;
      const near = isRealScale() || radius < item.body.radius ? Math.max(radius * 0.08, viewNear, 0.000000001) : 0.1;
      if (camera.near !== near) { camera.near = near; camera.updateProjectionMatrix(); }
      const minimumDistance = Math.max(radius * 1.8, near * 2.5);
      controls.minDistance = preservedMinimumDistance === null
        ? minimumDistance
        : Math.min(minimumDistance, preservedMinimumDistance);
    }
  }
  const cancel = () => { transition = false; };
  return { focus, update, cancel };
}
