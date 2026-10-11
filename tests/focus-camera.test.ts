import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { findBody } from '../lib/solar-data';
import { bodyRadius } from '../lib/solar-system/orbit-math';
import type { BodyScene, SceneBody } from '../lib/solar-system/body-scene';
import { calculateFocusCameraPlan, createFocusCameraController } from '../lib/solar-system/camera-controller';

describe('focus camera planning', () => {
  it('keeps closer distances and computes desktop/mobile overview plans', () => {
    const body = calculateFocusCameraPlan({ selected: true, realScale: false, radius: 0.9, displayRadius: 0.9, currentDistance: 2, homeVector: [0, 64, 89], mobile: false });
    expect(body.distance).toBe(2);
    expect(body.offset[0]).toBeCloseTo(0.4 * 2 / Math.hypot(0.4, 0.6, 1));
    const desktop = calculateFocusCameraPlan({ selected: false, realScale: false, radius: 0, displayRadius: 0, currentDistance: 100, homeVector: [0, 64, 89], mobile: false });
    const mobile = calculateFocusCameraPlan({ selected: false, realScale: false, radius: 0, displayRadius: 0, currentDistance: 100, homeVector: [0, 64, 89], mobile: true });
    expect(desktop.offset).toEqual([0, 64, 89]);
    expect(mobile.offset).toEqual([0, 89.6, 124.6]);
  });
  it('uses true-scale near plane, distance, and transition formulas', () => {
    const plan = calculateFocusCameraPlan({ selected: true, realScale: true, radius: 0.0004, displayRadius: 0.9, currentDistance: 1, homeVector: [0, 64, 89], mobile: false });
    expect(plan.near).toBeCloseTo(0.000032);
    expect(plan.distance).toBeCloseTo(0.0032);
    expect(plan.transitionThreshold).toBeCloseTo(0.000016);
  });
  it('frames reduced encounter meshes while preserving a closer user zoom', () => {
    const input = { selected: true, realScale: false, radius: 0.00006, displayRadius: 0.13, currentDistance: 4, homeVector: [0, 64, 89] as [number, number, number], mobile: false, encounterSeparation: 0.00356 };
    const framed = calculateFocusCameraPlan(input);
    expect(framed.distance).toBeGreaterThan(input.encounterSeparation * 4.5);
    expect(framed.distance).toBeLessThan(input.encounterSeparation * 5.5);
    expect(framed.near).toBeLessThan(input.radius);
    expect(calculateFocusCameraPlan({ ...input, currentDistance: 0.005 }).distance).toBe(0.005);
  });
  it('allows a close-up of the reduced Moon without clipping it', () => {
    const input = { selected: true, realScale: false, radius: 0.000163, displayRadius: 0.245, currentDistance: 4, homeVector: [0, 64, 89] as [number, number, number], mobile: false, encounterSeparation: 0 };
    const plan = calculateFocusCameraPlan(input);
    expect(plan.distance).toBeCloseTo(input.radius * 8);
    expect(plan.near).toBeLessThan(input.radius);
    expect(plan.minDistance).toBeCloseTo(input.radius * 1.8);
    expect(calculateFocusCameraPlan({ ...input, currentDistance: 0.0005 }).distance).toBe(0.0005);
  });
  it('keeps the Apophis camera view and following through scale toggles', () => {
    const earth = { body: findBody('Earth'), group: new THREE.Group() } as SceneBody;
    const moon = { body: findBody('Moon'), group: new THREE.Group() } as SceneBody;
    const apophis = { body: findBody('Apophis'), group: new THREE.Group() } as SceneBody;
    earth.group.position.set(14, 0, 0);
    apophis.group.position.set(14.00356, 0, 0);
    const bodyScene = { earth, moon, objectByName: new Map([earth, moon, apophis].map(item => [item.body.name, item])) } as BodyScene;
    const camera = new THREE.PerspectiveCamera();
    const viewOffset = new THREE.Vector3(0.006, 0.003, -0.012);
    camera.position.copy(apophis.group.position).add(viewOffset);
    const controls = { target: apophis.group.position.clone(), minDistance: 0 } as OrbitControls;
    let realScale = false;
    const controller = createFocusCameraController({ camera, controls, bodyScene, home: new THREE.Vector3(0, 64, 89), origin: new THREE.Vector3(), isRealScale: () => realScale, width: () => 1280, radiusFor: name => bodyRadius(findBody(name), realScale) });
    const before = camera.position.clone();
    for (const scale of [true, false]) {
      realScale = scale;
      controller.focus('Apophis', true);
      controller.update(apophis.group.position, 0.016, performance.now() + 2000);
      expect(camera.position.equals(before)).toBe(true);
      expect(controls.target.equals(apophis.group.position)).toBe(true);
      expect(camera.near).toBeCloseTo(scale ? viewOffset.length() * 0.001 : 0.1);
      expect(controls.minDistance).toBeLessThan(viewOffset.length());
    }
    apophis.group.position.add(new THREE.Vector3(0.001, -0.002, 0.003));
    controller.update(apophis.group.position, 0.016, performance.now() + 2000);
    expect(camera.position.clone().sub(controls.target).distanceTo(viewOffset)).toBeLessThan(1e-12);
  });
});
