import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GeoMoon, RotateVector, Rotation_EQJ_ECL } from 'astronomy-engine';
import { apophisGeocentricPosition } from '../lib/astronomy/apophis';
import { createApophisSceneMapper } from '../lib/solar-system/apophis-path';
import { findBody } from '../lib/solar-data';
import { dateToSimulationDays } from '../lib/astronomy/time';
import { createMoonOrbitMapper, writeMoonOrbitPath } from '../lib/solar-system/moon-orbit';
import { SCENE_AU, initialOrbitalPhase, orbitalAngle, orbitalPosition, orbitRadius } from '../lib/solar-system/orbit-math';

function orbitAt(date: Date, realScale: boolean) {
  const earth = findBody('Earth');
  const days = dateToSimulationDays(date);
  const earthPosition = orbitalPosition(earth, orbitalAngle(earth, days, initialOrbitalPhase(earth, 3)), realScale);
  const mapper = createMoonOrbitMapper(earthPosition);
  const attribute = new THREE.Float32BufferAttribute(256 * 3, 3);
  const compressedRadius = realScale ? null : orbitRadius(findBody('Moon'), false);
  writeMoonOrbitPath(date, mapper, compressedRadius, attribute);
  const moon = mapper.moonPosition(date, new THREE.Vector3()).sub(earthPosition);
  if (compressedRadius !== null) moon.setLength(compressedRadius);
  return { attribute, moon };
}

describe('Moon orbit path', () => {
  it('keeps the Moon on its regular display orbit during the Apophis flyby', () => {
    const { attribute, moon } = orbitAt(new Date('2029-04-13T21:46:00Z'), false);
    expect(new THREE.Vector3().fromBufferAttribute(attribute, 128).distanceTo(moon)).toBeLessThan(1e-6);
    expect(moon.length()).toBeCloseTo(orbitRadius(findBody('Moon'), false));
  });

  it('preserves physical Moon–Apophis geometry and places the flyby inside lunar distance', () => {
    for (const iso of ['2029-04-13T21:46:00Z', '2029-04-14T14:30:00Z']) {
      const date = new Date(iso);
      const earth = findBody('Earth');
      const earthPosition = orbitalPosition(earth, orbitalAngle(earth, dateToSimulationDays(date), initialOrbitalPhase(earth, 3)));
      const moon = createMoonOrbitMapper(earthPosition).moonPosition(date, new THREE.Vector3()).sub(earthPosition);
      const asteroid = new THREE.Vector3();
      createApophisSceneMapper().positionAt(date, earthPosition, asteroid);
      asteroid.sub(earthPosition);
      const rawMoon = RotateVector(Rotation_EQJ_ECL(), GeoMoon(date));
      const physicalMoon = new THREE.Vector3(rawMoon.x, rawMoon.y, rawMoon.z);
      const physicalAsteroid = new THREE.Vector3();
      apophisGeocentricPosition(date, physicalAsteroid);
      expect(moon.angleTo(asteroid)).toBeCloseTo(physicalMoon.angleTo(physicalAsteroid), 10);
      expect(moon.distanceTo(asteroid)).toBeCloseTo(physicalMoon.distanceTo(physicalAsteroid) * SCENE_AU, 10);
      expect(orbitAt(date, false).moon.length()).toBeCloseTo(orbitRadius(findBody('Moon'), false));
      if (iso.startsWith('2029-04-13')) expect(moon.length() / asteroid.length()).toBeGreaterThan(9);
    }
  });

  it.each(['2026-08-12T17:48:37Z', '2026-09-23T12:00:00Z'])('passes through the Moon on %s at both display scales', (value) => {
    for (const realScale of [false, true]) {
      const { attribute, moon } = orbitAt(new Date(value), realScale);
      const center = new THREE.Vector3().fromBufferAttribute(attribute, 128);
      expect(center.distanceTo(moon)).toBeLessThan(1e-6);
    }
  });

  it('uses a tilted, date-dependent lunar orbital plane', () => {
    const normals = ['2026-08-12T17:48:37Z', '2035-08-12T17:48:37Z'].map((value) => {
      const { attribute } = orbitAt(new Date(value), false);
      const quarter = new THREE.Vector3().fromBufferAttribute(attribute, 64);
      const center = new THREE.Vector3().fromBufferAttribute(attribute, 128);
      const later = new THREE.Vector3().fromBufferAttribute(attribute, 192);
      return quarter.sub(center).cross(later.sub(center)).normalize();
    });
    const tilt = Math.acos(Math.abs(normals[0].dot(new THREE.Vector3(0, 1, 0)))) * 180 / Math.PI;
    expect(tilt).toBeGreaterThan(3);
    expect(tilt).toBeLessThan(7);
    expect(normals[0].angleTo(normals[1])).toBeGreaterThan(0.05);
  });
});
