import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { findBody } from '../lib/solar-data';
import { bodyRadius, orbitalPosition, orbitPathPointCount } from '../lib/solar-system/orbit-math';
import { orbitPathNeedsRebase, writeKeplerOrbitPath } from '../lib/solar-system/orbit-path';

describe('close-view orbit geometry', () => {
  it('keeps Makemake’s true-scale path precise near the focused body', () => {
    const makemake = findBody('Makemake');
    const count = orbitPathPointCount(makemake);
    const index = Math.floor(count * 0.43);
    const origin = orbitalPosition(makemake, index / count * Math.PI * 2, true);
    const global = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    const local = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    writeKeplerOrbitPath(makemake, true, global, new THREE.Vector3());
    writeKeplerOrbitPath(makemake, true, local, origin);

    let globalError = 0;
    let localError = 0;
    for (let offset = -8; offset <= 8; offset++) {
      const sample = index + offset;
      const exact = orbitalPosition(makemake, sample / count * Math.PI * 2, true);
      globalError = Math.max(globalError, exact.distanceTo(new THREE.Vector3().fromBufferAttribute(global, sample)));
      localError = Math.max(localError, exact.distanceTo(new THREE.Vector3().fromBufferAttribute(local, sample).add(origin)));
    }
    expect(globalError).toBeGreaterThan(bodyRadius(makemake, true) * 0.05);
    expect(localError).toBeLessThan(bodyRadius(makemake, true) * 0.001);
  });

  it('rebases only when focus has moved far enough to affect true-scale detail', () => {
    const makemake = findBody('Makemake');
    const origin = orbitalPosition(makemake, 0, true);
    expect(orbitPathNeedsRebase(makemake, origin, origin)).toBe(false);
    expect(orbitPathNeedsRebase(makemake, origin, origin.clone().addScalar(bodyRadius(makemake, true)))).toBe(false);
    expect(orbitPathNeedsRebase(makemake, origin, orbitalPosition(makemake, Math.PI, true))).toBe(true);
  });

  it('preserves world-space positions when switching scales with a rebased line', () => {
    const makemake = findBody('Makemake');
    const count = orbitPathPointCount(makemake);
    const index = Math.floor(count * 0.2);
    const origin = orbitalPosition(makemake, 1.4, true);
    const attribute = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    for (const realScale of [true, false, true]) {
      writeKeplerOrbitPath(makemake, realScale, attribute, origin);
      const actual = new THREE.Vector3().fromBufferAttribute(attribute, index).add(origin);
      const expected = orbitalPosition(makemake, index / count * Math.PI * 2, realScale);
      // The next frame rebases after a scale change; even before that, the
      // retained origin must not shift the path in world space.
      expect(actual.distanceTo(expected)).toBeLessThan(0.00005);
    }
  });
});
