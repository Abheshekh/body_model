import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createGhost } from './scene';
import { PICK_LAYER } from './pick';

const shared = () => ({ uState: { value: null }, uLo: { value: new THREE.Vector3() }, uSize: { value: new THREE.Vector3(1, 1, 1) } });

describe('ghost', () => {
  it('is added translucent after the skin, never on the pick layer, and removed and disposed', () => {
    const scene = new THREE.Scene(), geo = new THREE.BufferGeometry(), geoDispose = vi.spyOn(geo, 'dispose');
    const g = createGhost(scene, geo, shared(), 22);
    expect(scene.children).toContain(g.mesh);
    expect(g.mesh.geometry).toBe(geo); // the skin's geometry, shared
    expect(g.mesh.layers.isEnabled(PICK_LAYER)).toBe(false);
    expect(g.material.opacity).toBe(0.18);
    expect(g.material.transparent).toBe(true);
    expect(g.material.depthWrite).toBe(false);
    expect(g.mesh.renderOrder).toBeGreaterThan(3);
    expect(g.material.uniforms.uBones.value).toBe(g.tex); // its own bone texture
    const mDispose = vi.spyOn(g.material, 'dispose'), tDispose = vi.spyOn(g.tex, 'dispose');
    g.dispose();
    expect(scene.children).not.toContain(g.mesh);
    expect(mDispose).toHaveBeenCalled();
    expect(tDispose).toHaveBeenCalled();
    expect(geoDispose).not.toHaveBeenCalled();
  });
});
