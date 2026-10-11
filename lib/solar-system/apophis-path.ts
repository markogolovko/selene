import * as THREE from 'three';
import { Body, GeoVector, RotateVector, Rotation_EQJ_ECL } from 'astronomy-engine';
import { APOPHIS_EPHEMERIS_END, APOPHIS_EPHEMERIS_START, apophisGeocentricPosition } from '../astronomy/apophis';
import { DAY_MS, dateToSimulationDays } from '../astronomy/time';
import { findBody } from '../solar-data';
import { SCENE_AU, initialOrbitalPhase, orbitalAngle, orbitalPosition } from './orbit-math';

const earth = findBody('Earth');
const apophis = findBody('Apophis');
const earthPhase = initialOrbitalPhase(earth, 3);
const eclipticRotation = Rotation_EQJ_ECL();
const UP = new THREE.Vector3(0, 1, 0);
const PATH_HALF_SPAN_DAYS = 160;
const FLYBY_TIME = Date.parse('2029-04-13T21:46:00Z');
const FLYBY_PATH_WINDOW_DAYS = 30;
export const APOPHIS_PATH_POINT_COUNT = 2049;

export function usesFixedApophisFlybyPath(date: Date): boolean {
  return Math.abs(date.getTime() - FLYBY_TIME) <= FLYBY_PATH_WINDOW_DAYS * DAY_MS;
}

// Keep roughly six-minute segments through closest approach, then distribute
// enough samples along the surrounding months to avoid visible polygon corners.
// The flyby trace stays fixed while simulation time passes through the encounter.
function flybyPathOffsetDays(fraction: number): number {
  const distance = Math.abs(fraction);
  let days: number;
  if (distance <= 0.125) days = 0.5 * distance / 0.125;
  else if (distance <= 0.25) days = 0.5 + 1.5 * (distance - 0.125) / 0.125;
  else days = 2 + (PATH_HALF_SPAN_DAYS - 2) * (distance - 0.25) / 0.75;
  return Math.sign(fraction) * days;
}

export function createApophisSceneMapper() {
  const geocentric = new THREE.Vector3();
  const sceneSun = new THREE.Vector3();
  const sceneTangential = new THREE.Vector3();
  const sampleEarth = new THREE.Vector3();
  const point = new THREE.Vector3();

  // Body display sizes must never change the trajectory or encounter timing.
  const positionAt = (date: Date, earthPosition: THREE.Vector3, target: THREE.Vector3): boolean => {
    if (!apophisGeocentricPosition(date, geocentric)) return false;
    const sun = RotateVector(eclipticRotation, GeoVector(Body.Sun, date, false));
    const sunLength = Math.hypot(sun.x, sun.y);
    const sunCos = sun.x / sunLength, sunSin = sun.y / sunLength;
    sceneSun.copy(earthPosition).negate().normalize();
    // orbitalPosition advances from +X toward +Z. Match that orientation;
    // reversing this cross product reflects the orbit in a moving Sun axis.
    sceneTangential.crossVectors(sceneSun, UP).normalize();
    const radial = geocentric.x * sunCos + geocentric.y * sunSin;
    const tangential = -geocentric.x * sunSin + geocentric.y * sunCos;
    target.copy(sceneSun).multiplyScalar(radial)
      .addScaledVector(sceneTangential, tangential)
      .addScaledVector(UP, geocentric.z).multiplyScalar(SCENE_AU);
    target.add(earthPosition);
    return true;
  };

  const writePath = (date: Date, realScale: boolean, attribute: THREE.BufferAttribute, origin?: THREE.Vector3) => {
    const flybyPath = usesFixedApophisFlybyPath(date);
    const time = flybyPath ? FLYBY_TIME : date.getTime();
    const before = Math.min(PATH_HALF_SPAN_DAYS, (time - APOPHIS_EPHEMERIS_START) / DAY_MS);
    const after = Math.min(PATH_HALF_SPAN_DAYS, (APOPHIS_EPHEMERIS_END - time) / DAY_MS);
    if (origin) {
      const anchorDate = new Date(time);
      const days = dateToSimulationDays(anchorDate);
      orbitalPosition(earth, orbitalAngle(earth, days, earthPhase), realScale, sampleEarth);
      if (!positionAt(anchorDate, sampleEarth, origin)) {
        orbitalPosition(apophis, orbitalAngle(apophis, days, initialOrbitalPhase(apophis, 0)), realScale, origin);
      }
    }
    for (let index = 0; index < attribute.count; index++) {
      if (before < 0 || after < 0) {
        orbitalPosition(apophis, index / (attribute.count - 1) * Math.PI * 2, realScale, point);
      } else {
        const fraction = index / (attribute.count - 1) * 2 - 1;
        const offsetDays = flybyPath
          ? flybyPathOffsetDays(fraction)
          : Math.sign(fraction) * fraction * fraction * (fraction < 0 ? before : after);
        const sampleDate = new Date(time + offsetDays * DAY_MS);
        const days = dateToSimulationDays(sampleDate);
        orbitalPosition(earth, orbitalAngle(earth, days, earthPhase), realScale, sampleEarth);
        positionAt(sampleDate, sampleEarth, point);
      }
      // Keep Float32 vertices near the asteroid. Storing heliocentric coordinates
      // directly rounds away distances larger than its physical radius.
      if (origin) point.sub(origin);
      attribute.setXYZ(index, point.x, point.y, point.z);
    }
    attribute.needsUpdate = true;
  };

  return { positionAt, writePath };
}
