// Tissue materials (SPEC §1.4), ported from tools/sample/viewer.html `tissueMat`.
// Positions arrive as normalized Uint16 and are decoded here with the manifest box. The per-part
// state texture (§2b.8) collapses hidden vertices in the vertex shader; row 64+ holds the colour.
import * as THREE from 'three';
import type { Manifest } from './load';
import { SKIN_GLSL } from '../rig/skin';

export const SKIN_TONES = { light: '#e3b796', medium: '#b8876a', dark: '#7a5038' } as const;
export type SkinTone = keyof typeof SKIN_TONES;
export const LAYER_COL = ['#888888', '#c9483f', '#3f74c9', '#3aa36a', '#c99a2e', '#8a5cc9', '#2fb3b3'];
export const SYS_COL: Record<string, string> = {
  muscle: '#c9483f', tendon: '#e6d8c4', bone: '#e2d6c1', organ: '#d88a5a', vessel: '#3f74c9',
  nerve: '#e8cf6e', lymph: '#5fae5a', joint: '#9ec6d4', skin: '#b8876a',
};
export const HIGHLIGHT = '#ffd400';
export const VIS = { hidden: 0, shown: 1, ghost: 2 } as const;

type Shader = THREE.WebGLProgramParametersWithUniforms;

const VHEAD = /* glsl */`
attribute vec3 fib; attribute float mid; attribute float ao; attribute float acr;
uniform sampler2D uState; uniform vec3 uLo; uniform vec3 uSize;
varying vec3 vWPos; varying vec3 vFib; varying float vMid; varying float vAo; varying float vAcr;
ivec2 stUv(float m, int row) { int i = int(m + 0.5); return ivec2(i % 64, i / 64 + row); }
int visOf(float m) { return int(texelFetch(uState, stUv(m, 0), 0).r * 255.0 + 0.5); }
` + SKIN_GLSL;

const COMMON = /* glsl */`
varying vec3 vWPos; varying vec3 vFib; varying float vMid; varying float vAo; varying float vAcr;
uniform sampler2D uState; uniform vec3 uHighlight; uniform float uFreq; uniform float uStr; uniform vec2 uTint;
ivec2 stUv(float m, int row) { int i = int(m + 0.5); return ivec2(i % 64, i / 64 + row); }
float h31(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }
vec3 gBump; float gShade;
void striate(vec3 Nw){
  vec3 A = vFib - Nw*dot(vFib,Nw); A = length(A) < 1e-4 ? vec3(0,1,0) : normalize(A);
  vec3 U = normalize(cross(A, Nw));
  float along = dot(vWPos, A), across = vAcr;
  float n = vnoise(vec3(across*90., along*4., vMid*1.7));
  float ph = across*uFreq + n*0.55;
  float ph2 = across*uFreq*0.22 + vnoise(vec3(across*20., along*2.5, vMid))*0.9;
  float f1 = clamp(1.-fwidth(ph)*0.8,0.,1.), f2 = clamp(1.-fwidth(ph2)*0.8,0.,1.);
  gBump = U*(cos(ph*6.2831)*f1*uStr*0.7 + cos(ph2*6.2831)*f2*uStr*1.5);
  gShade = 1. + (sin(ph2*6.2831)*0.06*f2 + sin(ph*6.2831)*0.05*f1)*step(0.001,uStr);
}`;

// decode position, skin it (R5), orthogonalise the fibre tangent, collapse every vertex whose part is not in state `show`
function patchVertex(s: Shader, show: number): void {
  s.vertexShader = VHEAD + s.vertexShader
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
mat4 bSkin = bodySkin(mid); mat3 bRot = mat3(bSkin);
objectNormal = bRot * objectNormal;
#ifdef USE_TANGENT
  objectTangent = bRot * objectTangent;
  objectTangent -= objectNormal * dot(objectNormal, objectTangent);
  objectTangent = dot(objectTangent, objectTangent) > 1e-8 ? normalize(objectTangent) : vec3(0., 1., 0.);
#endif`)
    .replace('#include <begin_vertex>', 'vec3 transformed = (bSkin * vec4(uLo + position * uSize, 1.)).xyz;')
    .replace('#include <project_vertex>', `#include <project_vertex>
vWPos = (modelMatrix * vec4(transformed, 1.)).xyz; vFib = bRot * fib; vMid = mid; vAo = ao; vAcr = acr / 8000.;
if (visOf(mid) != ${show}) gl_Position = vec4(2., 2., 2., 1.);`);
}

export interface Materials {
  tissue: Record<string, THREE.MeshPhysicalMaterial>;
  skin: THREE.MeshPhysicalMaterial;
  ghost: THREE.ShaderMaterial;
}

export function createMaterials(state: THREE.DataTexture, box: Manifest['box'], bones: THREE.DataTexture): Materials {
  const lo = new THREE.Vector3().fromArray(box[0]);
  const shared = {
    uState: { value: state },
    uLo: { value: lo },
    uSize: { value: new THREE.Vector3().fromArray(box[1]).sub(lo) },
    uHighlight: { value: new THREE.Color(HIGHLIGHT) },
    uBones: { value: bones },
    uSkin: { value: 0 },
  };
  // freq/str/tint are uniforms (not inlined) so materials with equal parameters can share one program
  const tissueMat = (params: THREE.MeshPhysicalMaterialParameters, freq: number, str: number, tint: [number, number]) => {
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, ...params });
    mat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, shared, { uFreq: { value: freq }, uStr: { value: str }, uTint: { value: new THREE.Vector2(...tint) } });
      patchVertex(s, VIS.shown);
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\n' + COMMON)
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nvec4 st = texelFetch(uState, stUv(vMid, 0), 0);')
        .replace('#include <color_fragment>', `#include <color_fragment>
          striate(normalize((vec4(vNormal,0.)*viewMatrix).xyz));
          diffuseColor.rgb *= pow(texelFetch(uState, stUv(vMid, 64), 0).rgb, vec3(2.2));
          diffuseColor.rgb *= mix(0.32, 1.0, vAo) * gShade * mix(uTint.x, uTint.y, h31(vec3(vMid,3.,7.)));
          if (st.g > 0.5) diffuseColor.rgb = uHighlight;`)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal + (viewMatrix*vec4(gBump,0.)).xyz);')
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>
          reflectedLight.indirectDiffuse *= vAo; reflectedLight.indirectSpecular *= vAo*vAo;
          reflectedLight.directSpecular *= mix(0.35, 1.0, vAo); reflectedLight.directDiffuse *= mix(0.55, 1.0, vAo);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          if (st.g > 0.5) totalEmissiveRadiance += uHighlight * 0.35;`);
    };
    return mat;
  };
  const wet = { roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.3, sheen: 0.5, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xd08a80) };
  const tissue = {
    muscle: tissueMat({ roughness: 0.5, clearcoat: 0.22, clearcoatRoughness: 0.38, sheen: 0.7, sheenColor: new THREE.Color(0xc8574f), sheenRoughness: 0.5, anisotropy: 0.55, specularIntensity: 0.5 }, 300, 0.13, [0.8, 1.1]),
    tendon: tissueMat({ roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.25, sheen: 0.6, sheenColor: new THREE.Color(0xffe8d6) }, 700, 0.05, [0.95, 1.03]),
    bone: tissueMat({ roughness: 0.7, sheen: 0.3, sheenColor: new THREE.Color(0xfff4e0) }, 300, 0, [0.97, 1.02]),
    organ: tissueMat(wet, 300, 0, [0.9, 1.08]),
    vessel: tissueMat(wet, 300, 0, [0.95, 1.05]),
    nerve: tissueMat({ ...wet, sheenColor: new THREE.Color(0xfff0c0) }, 300, 0, [0.95, 1.05]),
    lymph: tissueMat(wet, 300, 0, [0.95, 1.05]),
    joint: tissueMat({ roughness: 0.35, clearcoat: 0.4, sheen: 0.4, sheenColor: new THREE.Color(0xeef6ff) }, 300, 0, [0.95, 1.05]),
  };
  // skin: soft sheen, no clearcoat; opacity (see-through) is set by the viewer
  const skin = new THREE.MeshPhysicalMaterial({
    color: SKIN_TONES.medium, roughness: 0.55, sheen: 0.8, sheenColor: new THREE.Color(0xff9a7a), sheenRoughness: 0.6,
    specularIntensity: 0.22, clearcoat: 0, transparent: true, opacity: 1,
  });
  skin.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, shared);
    patchVertex(s, VIS.shown);
  };
  // faint fresnel shell for peeled muscles (state 2)
  const ghost = new THREE.ShaderMaterial({
    uniforms: shared, transparent: true, depthWrite: false,
    vertexShader: VHEAD + `varying vec3 vN; varying vec3 vV;
void main() {
  mat4 sk = bodySkin(mid); vec3 p = (sk * vec4(uLo + position * uSize, 1.)).xyz; vN = normalize(normalMatrix * (mat3(sk) * normal));
  vec4 mv = modelViewMatrix * vec4(p, 1.); vV = -mv.xyz; gl_Position = projectionMatrix * mv;
  if (visOf(mid) != ${VIS.ghost}) gl_Position = vec4(2., 2., 2., 1.);
}`,
    fragmentShader: `varying vec3 vN; varying vec3 vV;
void main() { float f = pow(1. - abs(dot(normalize(vN), normalize(vV))), 2.); gl_FragColor = vec4(vec3(0.75, 0.92, 0.95), 0.03 + 0.2 * f); }`,
  });
  return { tissue, skin, ghost };
}
