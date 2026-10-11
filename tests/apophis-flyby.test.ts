import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Body, GeoVector, RotateVector, Rotation_EQJ_ECL } from 'astronomy-engine';
import { apophisGeocentricPosition } from '../lib/astronomy/apophis';
import { dateToSimulationDays } from '../lib/astronomy/time';
import { findBody } from '../lib/solar-data';
import { APOPHIS_PATH_POINT_COUNT, createApophisSceneMapper, usesFixedApophisFlybyPath } from '../lib/solar-system/apophis-path';
import { apophisVisibleAtScale } from '../lib/solar-system/apophis-display';
import { KILOMETERS_PER_AU, SCENE_AU, bodyRadius, initialOrbitalPhase, orbitalAngle, orbitalPosition } from '../lib/solar-system/orbit-math';

const closest = new Date('2029-04-13T21:46:00Z');

function earthAt(date: Date): THREE.Vector3 {
  const earth = findBody('Earth');
  return orbitalPosition(earth, orbitalAngle(earth, dateToSimulationDays(date), initialOrbitalPhase(earth, 3)));
}

describe('Apophis 2029 Earth flyby', () => {
  it('maps the heliocentric trajectory with a consistent orientation across dates', () => {
    const rotation = Rotation_EQJ_ECL();
    const reference = new Date('2028-08-01T00:00:00Z');
    const referenceSun = RotateVector(rotation, GeoVector(Body.Sun, reference, false));
    const referenceEarth = earthAt(reference);
    const angle = Math.atan2(referenceEarth.z, referenceEarth.x) - Math.atan2(-referenceSun.y, -referenceSun.x);
    const mapper = createApophisSceneMapper();
    for (const iso of ['2028-08-01', '2028-09-15', '2029-04-14']) {
      const date = new Date(`${iso}T04:00:00Z`);
      const sun = RotateVector(rotation, GeoVector(Body.Sun, date, false));
      const heliocentric = new THREE.Vector3();
      apophisGeocentricPosition(date, heliocentric);
      heliocentric.sub(new THREE.Vector3(sun.x, sun.y, sun.z));
      const expected = new THREE.Vector3(
        heliocentric.x * Math.cos(angle) - heliocentric.y * Math.sin(angle),
        heliocentric.z,
        heliocentric.x * Math.sin(angle) + heliocentric.y * Math.cos(angle),
      ).multiplyScalar(SCENE_AU);
      const actual = new THREE.Vector3();
      mapper.positionAt(date, earthAt(date), actual);
      // Allow the existing illustrative Earth orbit's small error, but no
      // date-dependent rotation/reflection of the asteroid's orbit.
      expect(actual.distanceTo(expected)).toBeLessThan(0.05);
    }
  });

  it('preserves flyby motion around April 14 at 06:00 Warsaw time', () => {
    const mapper = createApophisSceneMapper();
    for (let hour = 0; hour <= 10; hour++) {
      const start = new Date(Date.UTC(2029, 3, 14, hour));
      const end = new Date(start.getTime() + 5 * 60_000);
      const displayed = new THREE.Vector3();
      const physical = new THREE.Vector3();
      const displayedEnd = new THREE.Vector3();
      const physicalEnd = new THREE.Vector3();
      const earthStart = earthAt(start), earthEnd = earthAt(end);
      mapper.positionAt(start, earthStart, displayed);
      mapper.positionAt(end, earthEnd, displayedEnd);
      apophisGeocentricPosition(start, physical);
      apophisGeocentricPosition(end, physicalEnd);
      const actualMovement = physicalEnd.sub(physical).length() * SCENE_AU;
      const displayedMovement = displayedEnd.sub(earthEnd).sub(displayed.sub(earthStart)).length();
      expect(Math.abs(displayedMovement / actualMovement - 1)).toBeLessThan(0.01);
    }
  });

  it('interpolates the bundled Horizons vectors through the close approach', () => {
    const position = new THREE.Vector3();
    expect(apophisGeocentricPosition(closest, position)).toBe(true);
    const distanceKm = position.length() * KILOMETERS_PER_AU;
    // JPL SBDB CAD: https://ssd-api.jpl.nasa.gov/cad.api?des=99942&date-min=2029-04-13&date-max=2029-04-14
    // Closest approach: 2029-Apr-13 21:46, 0.00025409091 au from Earth's center.
    expect(Math.abs(distanceKm - 38_011.46)).toBeLessThan(50);
    const before = new THREE.Vector3(), after = new THREE.Vector3();
    apophisGeocentricPosition(new Date(closest.getTime() - 6 * 3_600_000), before);
    apophisGeocentricPosition(new Date(closest.getTime() + 6 * 3_600_000), after);
    expect(before.length()).toBeGreaterThan(position.length());
    expect(after.length()).toBeGreaterThan(position.length());
    expect(apophisGeocentricPosition(new Date('2040-01-01T00:00:00Z'), position)).toBe(false);
  });

  it('places the visible asteroid on its dated path in both scales', () => {
    const earth = findBody('Earth');
    const days = dateToSimulationDays(closest);
    const earthPosition = orbitalPosition(earth, orbitalAngle(earth, days, initialOrbitalPhase(earth, 3)));
    for (const realScale of [false, true]) {
      const mapper = createApophisSceneMapper();
      const position = new THREE.Vector3();
      expect(mapper.positionAt(closest, earthPosition, position)).toBe(true);
      const separation = position.distanceTo(earthPosition);
      expect(separation * KILOMETERS_PER_AU / SCENE_AU).toBeGreaterThan(37_000);
      expect(separation * KILOMETERS_PER_AU / SCENE_AU).toBeLessThan(39_000);
      const attribute = new THREE.Float32BufferAttribute(APOPHIS_PATH_POINT_COUNT * 3, 3);
      mapper.writePath(closest, realScale, attribute);
      const pathCenter = new THREE.Vector3().fromBufferAttribute(attribute, (attribute.count - 1) / 2);
      expect(pathCenter.distanceTo(position)).toBeLessThan(1e-5);
    }
  });

  it('keeps the path precise at physical asteroid size and stationary across scale toggles', () => {
    const mapper = createApophisSceneMapper();
    const radius = bodyRadius(findBody('Apophis'), true);
    for (const date of [closest, new Date('2026-09-27T18:45:00Z')]) {
      const actual = new THREE.Vector3();
      mapper.positionAt(date, earthAt(date), actual);
      const attribute = new THREE.Float32BufferAttribute(APOPHIS_PATH_POINT_COUNT * 3, 3);
      const origin = new THREE.Vector3();
      mapper.writePath(date, false, attribute, origin);
      const worldCenter = new THREE.Vector3().fromBufferAttribute(attribute, (attribute.count - 1) / 2).add(origin);
      expect(worldCenter.distanceTo(actual)).toBeLessThan(radius * 0.001);
      const before = Array.from(attribute.array);
      const beforeOrigin = origin.clone();
      mapper.writePath(date, true, attribute, origin);
      expect(Array.from(attribute.array)).toEqual(before);
      expect(origin.equals(beforeOrigin)).toBe(true);
    }
  });

  it('keeps a dense, stationary flyby path while the asteroid crosses Earth', () => {
    const firstDate = new Date('2029-04-13T12:00:00Z');
    const secondDate = new Date('2029-04-14T12:00:00Z');
    expect(usesFixedApophisFlybyPath(firstDate)).toBe(true);
    expect(usesFixedApophisFlybyPath(secondDate)).toBe(true);
    const mapper = createApophisSceneMapper();
    const path = new THREE.Float32BufferAttribute(APOPHIS_PATH_POINT_COUNT * 3, 3);
    mapper.writePath(firstDate, false, path);
    const initialPath = Array.from(path.array);
    mapper.writePath(secondDate, false, path);
    expect(Array.from(path.array)).toEqual(initialPath);

    const earth = findBody('Earth');
    const earthPhase = initialOrbitalPhase(earth, 3);
    const position = new THREE.Vector3();
    const start = new THREE.Vector3();
    const end = new THREE.Vector3();
    const nearest = new THREE.Vector3();
    const segment = new THREE.Line3();
    for (const offsetHours of [-12, -4, 0, 4, 12, 24]) {
      const date = new Date(closest.getTime() + offsetHours * 3_600_000);
      const days = dateToSimulationDays(date);
      const earthPosition = orbitalPosition(earth, orbitalAngle(earth, days, earthPhase));
      expect(mapper.positionAt(date, earthPosition, position)).toBe(true);
      let pathError = Infinity;
      for (let index = 1; index < path.count; index++) {
        segment.start.copy(start.fromBufferAttribute(path, index - 1));
        segment.end.copy(end.fromBufferAttribute(path, index));
        segment.closestPointToPoint(position, true, nearest);
        pathError = Math.min(pathError, nearest.distanceTo(position));
      }
      expect(pathError).toBeLessThan(0.02);
    }
  });

  it('draws the dated trajectory without large polygon corners', () => {
    const mapper = createApophisSceneMapper();
    const path = new THREE.Float32BufferAttribute(APOPHIS_PATH_POINT_COUNT * 3, 3);
    const previous = new THREE.Vector3(), point = new THREE.Vector3(), next = new THREE.Vector3();
    const incoming = new THREE.Vector3(), outgoing = new THREE.Vector3();
    for (const date of [closest, new Date('2028-09-01T00:00:00Z')]) {
      mapper.writePath(date, false, path, new THREE.Vector3());
      let largestTurn = 0;
      for (let index = 1; index < path.count - 1; index++) {
        previous.fromBufferAttribute(path, index - 1);
        point.fromBufferAttribute(path, index);
        next.fromBufferAttribute(path, index + 1);
        largestTurn = Math.max(largestTurn, incoming.subVectors(point, previous).angleTo(outgoing.subVectors(next, point)));
      }
      // Old flyby segments produced corners over 13 degrees; half a degree
      // bounds visible faceting while retaining only actual ephemeris samples.
      expect(largestTurn * 180 / Math.PI).toBeLessThan(0.5);
    }
  });

  it('does not bend the distant August–September 2028 orbit for display', () => {
    const earth = findBody('Earth');
    const earthPhase = initialOrbitalPhase(earth, 3);
    const mapper = createApophisSceneMapper();
    const displayed = new THREE.Vector3();
    const physical = new THREE.Vector3();
    for (const isoDate of ['2028-08-01', '2028-08-15', '2028-09-01', '2028-09-15', '2028-09-30']) {
      const date = new Date(`${isoDate}T00:00:00Z`);
      const days = dateToSimulationDays(date);
      const earthPosition = orbitalPosition(earth, orbitalAngle(earth, days, earthPhase));
      expect(mapper.positionAt(date, earthPosition, displayed)).toBe(true);
      expect(apophisGeocentricPosition(date, physical)).toBe(true);
      expect(displayed.distanceTo(earthPosition)).toBeCloseTo(physical.length() * SCENE_AU, 10);
    }
  });

  it('preserves the March–May distance curve and April 13 closest approach', () => {
    const mapper = createApophisSceneMapper();
    const position = new THREE.Vector3();
    const physical = new THREE.Vector3();
    const start = Date.parse('2029-03-01T00:00:00Z');
    const end = Date.parse('2029-06-01T00:00:00Z');
    let minimum = Infinity, minimumTime = 0;
    for (let time = start; time <= end; time += 5 * 60_000) {
      const date = new Date(time);
      const earth = earthAt(date);
      mapper.positionAt(date, earth, position);
      apophisGeocentricPosition(date, physical);
      const separation = position.distanceTo(earth);
      expect(separation).toBeCloseTo(physical.length() * SCENE_AU, 10);
      if (separation < minimum) { minimum = separation; minimumTime = time; }
    }
    expect(Math.abs(minimumTime - closest.getTime())).toBeLessThan(5 * 60_000);
    expect(minimum * KILOMETERS_PER_AU / SCENE_AU).toBeCloseTo(38_011, -2);
  });

  it('shows Apophis only in true-scale mode', () => {
    for (const realScale of [false, true]) {
      expect(apophisVisibleAtScale(realScale)).toBe(realScale);
    }
  });
});
