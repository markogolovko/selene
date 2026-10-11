import * as THREE from 'three';
import type { SolarBody } from '../solar-data';
import { bodyRadius, orbitalPosition } from './orbit-math';

const point = new THREE.Vector3();

// Float32 orbit vertices lose close-view precision when their coordinates are
// hundreds of scene units from the Sun. Store them relative to the line's
// double-precision transform, which can be rebased near the focused body.
export function writeKeplerOrbitPath(body: SolarBody, realScale: boolean, attribute: THREE.BufferAttribute, origin: THREE.Vector3): void {
  for (let index = 0; index < attribute.count; index++) {
    orbitalPosition(body, index / attribute.count * Math.PI * 2, realScale, point);
    attribute.setXYZ(index, point.x - origin.x, point.y - origin.y, point.z - origin.z);
  }
  attribute.needsUpdate = true;
}

export function orbitPathNeedsRebase(body: SolarBody, origin: THREE.Vector3, position: THREE.Vector3): boolean {
  // At this distance Float32 rounding is under ~1% of the true-scale radius.
  const maximumOffset = bodyRadius(body, true) * 100_000;
  return origin.distanceToSquared(position) > maximumOffset * maximumOffset;
}
