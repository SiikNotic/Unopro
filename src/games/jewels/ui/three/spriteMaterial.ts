// The material of a painted piece: the artwork, a band of light that sweeps across it now and then (masked by
// the artwork's own shape, so only the stone shines), and a flash used when it is matched or created.
import * as THREE from 'three';

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D map;
  uniform float shine;   // position of the light band, -1..2 (off the stone outside 0..1)
  uniform float flash;   // 0..1 white-hot flash
  uniform float opacity;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(map, vUv);
    if (c.a < 0.01) discard;
    float d = (vUv.x + (1.0 - vUv.y)) * 0.5;
    float band = smoothstep(0.1, 0.0, abs(d - shine)) * 0.6 + smoothstep(0.03, 0.0, abs(d - shine + 0.07)) * 0.35;
    vec3 col = c.rgb + band * c.a * vec3(1.0, 0.98, 0.92);
    col = mix(col, vec3(1.0, 0.97, 0.88), flash * 0.75);
    gl_FragColor = vec4(col, c.a * opacity);
    #include <colorspace_fragment>
  }
`;

export type SpriteMat = THREE.ShaderMaterial & { uniforms: { map: { value: THREE.Texture }; shine: { value: number }; flash: { value: number }; opacity: { value: number } } };

export function spriteMaterial(map: THREE.Texture): SpriteMat {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    uniforms: { map: { value: map }, shine: { value: -1 }, flash: { value: 0 }, opacity: { value: 1 } },
  }) as SpriteMat;
}
