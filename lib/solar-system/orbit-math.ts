import * as THREE from 'three';
import { type BodyName, type SolarBody, isSatellite } from '../solar-data';

export const SCENE_AU = 14;
export const KILOMETERS_PER_AU = 149_597_870.7;
const earthRadiiPerAU = 23_455;
const semiMajorAxisAU: Partial<Record<BodyName, number>> = { Sun: 0, Mercury: 0.387, Venus: 0.723, Earth: 1, Mars: 1.524, Jupiter: 5.203, Saturn: 9.537, Uranus: 19.191, Neptune: 30.07 };
const degrees = Math.PI / 180;
const orbitUp = new THREE.Vector3(0, 1, 0);
const orbitRight = new THREE.Vector3(1, 0, 0);

export function orbitRadius(body: SolarBody, realScale: boolean): number {
  return realScale
    ? isSatellite(body) ? body.orbitRadiusKm / KILOMETERS_PER_AU * SCENE_AU
      : ('semiMajorAxisAU' in body ? body.semiMajorAxisAU : semiMajorAxisAU[body.name] ?? 0) * SCENE_AU
    : body.distance;
}

export function bodyRadius(body: SolarBody, realScale: boolean): number {
  return realScale ? body.physicalRadiusKm / 6_378.137 * SCENE_AU / earthRadiiPerAU : body.radius;
}

export function solveEccentricAnomaly(mean: number, eccentricity: number): number {
  let eccentricAnomaly = mean;
  for (let i = 0; i < 6; i++) eccentricAnomaly -= (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - mean) / (1 - eccentricity * Math.cos(eccentricAnomaly));
  return eccentricAnomaly;
}

export function orbitalPosition(body: SolarBody, meanAnomaly: number, realScale = false, target = new THREE.Vector3()): THREE.Vector3 {
  const eccentricAnomaly = solveEccentricAnomaly(meanAnomaly, body.eccentricity);
  const radius = orbitRadius(body, realScale);
  const x = radius * (Math.cos(eccentricAnomaly) - body.eccentricity);
  const z = radius * Math.sqrt(1 - body.eccentricity ** 2) * Math.sin(eccentricAnomaly);
  target.set(x, 0, z).applyAxisAngle(orbitUp, body.periapsis * degrees).applyAxisAngle(orbitRight, body.inclination * degrees);
  if ('ascendingNode' in body) target.applyAxisAngle(orbitUp, body.ascendingNode * degrees);
  return target;
}

// Full heliocentric orbits cover vastly different distances. Keep each chord's
// deviation below roughly half the body's true-scale radius, so a close view
// still shows a curve passing through the body rather than a polygon edge.
export function orbitPathPointCount(body: SolarBody): number {
  if (isSatellite(body)) return 256;
  const first = new THREE.Vector3();
  const second = new THREE.Vector3();
  const midpoint = new THREE.Vector3();
  const chord = new THREE.Vector3();
  const difference = new THREE.Vector3();
  let maximumDeviation = 0;
  for (let index = 0; index < 256; index++) {
    orbitalPosition(body, index / 256 * Math.PI * 2, true, first);
    orbitalPosition(body, (index + 1) / 256 * Math.PI * 2, true, second);
    orbitalPosition(body, (index + 0.5) / 256 * Math.PI * 2, true, midpoint);
    chord.subVectors(second, first);
    const fraction = THREE.MathUtils.clamp(difference.subVectors(midpoint, first).dot(chord) / chord.lengthSq(), 0, 1);
    maximumDeviation = Math.max(maximumDeviation, difference.addScaledVector(chord, -fraction).length());
  }
  const needed = 256 * Math.sqrt(maximumDeviation / (bodyRadius(body, true) * 0.5));
  let count = 2048;
  while (count < needed && count < 16384) count *= 2;
  return count;
}

export function initialOrbitalPhase(body: SolarBody, index: number): number {
  return isSatellite(body) ? body.phaseDegrees * degrees : body.name === 'Earth' ? 357.529 * degrees : index * 2.399 + 0.6;
}

export function orbitalAngle(body: SolarBody, days: number, phase: number): number {
  return body.period
    ? 'orbitalEpochJulianDay' in body
      ? (days + 2451545 - body.orbitalEpochJulianDay) / body.period * Math.PI * 2 + body.meanAnomalyDegrees * degrees
      : days / body.period * Math.PI * 2 + phase
    : 0;
}
