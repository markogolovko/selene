import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { bodies, findBody } from '../lib/solar-data';
import { bodyRadius, orbitRadius, orbitalAngle, orbitalPosition, orbitPathPointCount } from '../lib/solar-system/orbit-math';

describe('orbit math', () => {
  it('draws heliocentric paths smooth enough for true-scale close views', () => {
    const start = new THREE.Vector3(), end = new THREE.Vector3(), middle = new THREE.Vector3(), next = new THREE.Vector3();
    const closest = new THREE.Vector3();
    const incoming = new THREE.Vector3(), outgoing = new THREE.Vector3();
    const segment = new THREE.Line3();
    for (const body of bodies.filter((item) => item.distance && !('parent' in item) && item.name !== 'Apophis')) {
      const count = orbitPathPointCount(body);
      expect(count).toBeGreaterThanOrEqual(2048);
      expect(count).toBeLessThanOrEqual(16384);
      let maximumDeviation = 0;
      let maximumTurn = 0;
      for (let index = 0; index < count; index++) {
        orbitalPosition(body, index / count * Math.PI * 2, true, start);
        orbitalPosition(body, (index + 1) / count * Math.PI * 2, true, end);
        orbitalPosition(body, (index + 0.5) / count * Math.PI * 2, true, middle);
        orbitalPosition(body, (index + 2) / count * Math.PI * 2, true, next);
        segment.set(start, end).closestPointToPoint(middle, true, closest);
        maximumDeviation = Math.max(maximumDeviation, middle.distanceTo(closest));
        maximumTurn = Math.max(maximumTurn, incoming.subVectors(end, start).angleTo(outgoing.subVectors(next, end)));
      }
      expect(maximumDeviation / bodyRadius(body, true)).toBeLessThan(0.6);
      expect(maximumTurn * 180 / Math.PI).toBeLessThan(0.5);
    }
    expect(orbitPathPointCount(findBody('Moon'))).toBe(256);
  });
  it('converts compressed and true scale for Earth, Moon, and a dwarf planet', () => {
    expect(orbitRadius(findBody('Earth'), false)).toBe(14);
    expect(orbitRadius(findBody('Earth'), true)).toBe(14);
    expect(orbitRadius(findBody('Moon'), false)).toBe(2.3);
    expect(orbitRadius(findBody('Moon'), false)).toBeGreaterThan(2 * bodyRadius(findBody('Earth'), false));
    expect(orbitRadius(findBody('Moon'), true)).toBeCloseTo(0.03596, 4);
    expect(orbitRadius(findBody('Eris'), false)).toBe(91);
    expect(orbitRadius(findBody('Eris'), true)).toBeCloseTo(67.9 * 14, 8);
    expect(bodyRadius(findBody('Earth'), false)).toBe(0.9);
    expect(bodyRadius(findBody('Earth'), true)).toBeCloseTo(14 / 23_455);
  });
  it('solves periapsis and preserves inclined ascending node vectors', () => {
    const ceres = findBody('Ceres');
    const periapsis = orbitalPosition(ceres, 0);
    expect(periapsis.length()).toBeCloseTo(ceres.distance * (1 - ceres.eccentricity));
    const point = orbitalPosition(ceres, Math.PI / 3);
    expect(point.y).not.toBe(0);
    expect(point.length()).toBeGreaterThan(0);
  });
  it('places Apophis on its JPL epoch orbit crossing Earth’s orbital distance', () => {
    const apophis = findBody('Apophis');
    const semiMajorAxis = orbitRadius(apophis, true);
    expect(semiMajorAxis).toBeCloseTo(0.9223592206975018 * 14);
    expect(orbitalPosition(apophis, 0, true).length()).toBeCloseTo(semiMajorAxis * (1 - apophis.eccentricity));
    expect(orbitalPosition(apophis, Math.PI, true).length()).toBeCloseTo(semiMajorAxis * (1 + apophis.eccentricity));
    expect(semiMajorAxis * (1 - apophis.eccentricity)).toBeLessThan(14);
    expect(semiMajorAxis * (1 + apophis.eccentricity)).toBeGreaterThan(14);
    expect('orbitalEpochJulianDay' in apophis).toBe(true);
    if (!('orbitalEpochJulianDay' in apophis)) throw new Error('Apophis is missing its orbital epoch');
    expect(orbitalAngle(apophis, apophis.orbitalEpochJulianDay - 2451545, 0) * 180 / Math.PI).toBeCloseTo(apophis.meanAnomalyDegrees);
  });
});
