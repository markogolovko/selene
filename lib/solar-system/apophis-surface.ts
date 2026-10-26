import * as THREE from 'three';
import type { ResourceRegistry } from './resources';

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function createApophisGeometry(): THREE.SphereGeometry {
  const geometry = new THREE.SphereGeometry(1, 64, 48);
  const positions = geometry.getAttribute('position');
  const direction = new THREE.Vector3();
  for (let index = 0; index < positions.count; index++) {
    direction.fromBufferAttribute(positions, index).normalize();
    const broadRidge = Math.sin(direction.x * 4.1 + direction.z * 2.2) * 0.035;
    const crossRidge = Math.sin(direction.y * 5.3 - direction.x * 2.7) * 0.025;
    const fineRoughness = Math.sin(direction.x * 13 + direction.y * 9 + direction.z * 11) * 0.018;
    const surface = 1 + broadRidge + crossRidge + fineRoughness;
    positions.setXYZ(index, direction.x * 1.18 * surface, direction.y * 0.82 * surface, direction.z * 0.94 * surface);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createApophisTexture(renderer: THREE.WebGLRenderer, resources: ResourceRegistry): THREE.Texture | null {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const random = seededRandom(99942);
  const image = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const u = x / canvas.width;
      const v = y / canvas.height;
      const broad = Math.sin(u * 24 + Math.sin(v * 17) * 2.1) * 11 + Math.sin(v * 31 + u * 8) * 7;
      const grain = (random() - 0.5) * 23;
      const shade = 137 + broad + grain;
      const offset = (y * canvas.width + x) * 4;
      image.data[offset] = Math.max(0, Math.min(255, shade * 1.04));
      image.data[offset + 1] = Math.max(0, Math.min(255, shade * 0.96));
      image.data[offset + 2] = Math.max(0, Math.min(255, shade * 0.84));
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  for (let index = 0; index < 48; index++) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const radius = 3 + random() ** 2 * 28;
    const crater = context.createRadialGradient(x - radius * 0.18, y - radius * 0.2, radius * 0.08, x, y, radius);
    crater.addColorStop(0, 'rgba(48, 40, 33, 0.5)');
    crater.addColorStop(0.58, 'rgba(75, 63, 51, 0.32)');
    crater.addColorStop(0.78, 'rgba(210, 190, 162, 0.28)');
    crater.addColorStop(1, 'rgba(96, 79, 61, 0)');
    context.fillStyle = crater;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  return resources.texture(texture);
}
