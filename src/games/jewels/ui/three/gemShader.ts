// A cut-stone shader. For each flat facet it traces the view ray into the stone (refraction, one internal
// bounce off the pavilion and out again), sampling a sharp studio cube map with a slightly different index
// of refraction per colour channel (dispersion: the stone's "fire"), tints it with the stone's colour, and
// adds the Fresnel reflection off the surface. No extra render passes: one draw per gem.
import * as THREE from 'three';

const vertex = /* glsl */ `
  attribute vec3 bary;
  varying vec3 vNormal;
  varying vec3 vLocal;
  varying vec3 vBary;
  void main() {
    vBary = bary;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform samplerCube envMap;
  uniform vec3 tint;
  uniform vec3 glow;
  uniform float ior;
  uniform float dispersion;
  uniform float brightness;
  uniform float fresnelBase;
  uniform float boost;
  varying vec3 vNormal;
  varying vec3 vLocal;
  varying vec3 vBary;

  vec3 envAt(vec3 d) { return textureCube(envMap, d).rgb; }

  // One channel through the stone: in through the facet, bounced off the back (pavilion), out.
  float channel(vec3 v, vec3 n, float eta, int c) {
    vec3 inside = refract(v, n, 1.0 / eta);
    // The pavilion facet it meets mirrors this one through the girdle plane.
    vec3 back = normalize(vec3(n.xy * 0.9, -abs(n.z) - 0.35));
    vec3 bounced = reflect(inside, back);
    vec3 outDir = refract(bounced, -normalize(vec3(-n.xy, n.z)), eta);
    if (dot(outDir, outDir) < 0.01) outDir = bounced; // total internal reflection
    vec3 s = envAt(outDir);
    return c == 0 ? s.r : c == 1 ? s.g : s.b;
  }

  void main() {
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    // A virtual eye close in front of the stone: the view direction changes across each facet, so the
    // refraction and reflection run in gradients over it, as in real glass.
    vec3 v = normalize(vec3(vLocal.xy * 0.9, -1.0));
    float cosT = clamp(dot(-v, n), 0.0, 1.0);
    float fres = fresnelBase + (1.0 - fresnelBase) * pow(1.0 - cosT, 4.0);

    vec3 refr = vec3(
      channel(v, n, ior - dispersion, 0),
      channel(v, n, ior, 1),
      channel(v, n, ior + dispersion, 2)
    );
    vec3 refl = envAt(reflect(v, n));

    // Body colour: the light that made it through, tinted; a floor of the stone's own glow so no facet
    // goes dead black; white-hot sparkles where a facet lines up with a light.
    // Each facet has its own tone (key light from the top left), so the cut always reads; the light
    // coming through the stone rides on top, then white-hot sparkles where a facet lines up with a light.
    float lum = dot(refr, vec3(0.299, 0.587, 0.114));
    float shade = pow(clamp(dot(n, normalize(vec3(-0.45, 0.6, 0.66))), 0.0, 1.0), 1.6);
    float rim = clamp(dot(n, normalize(vec3(0.6, -0.5, 0.6))), 0.0, 1.0);
    vec3 body = tint * (0.1 + 0.6 * shade + 0.2 * rim) + glow * 0.45 * (1.0 - shade) + tint * refr * brightness * 0.6;
    vec3 spark = vec3(smoothstep(0.55, 1.0, lum)) * 0.9;
    // Depth: the heart of the stone a little darker and richer, its rim catching more light.
    float radial = clamp(length(vLocal.xy) / 0.4, 0.0, 1.0);
    body *= 0.78 + 0.38 * radial;
    // A crisp specular glint from the key light.
    vec3 r = reflect(v, n);
    float glint = pow(max(dot(r, normalize(vec3(-0.35, 0.55, 0.76))), 0.0), 60.0) * 1.4 + pow(max(dot(r, normalize(vec3(0.5, 0.4, 0.77))), 0.0), 90.0) * 0.8;
    vec3 col = (mix(body + spark, refl, fres) + glint) * boost;
    // Facet edges: a hairline of light along the cut edges (anti-aliased, the same width at any resolution).
    vec3 e = smoothstep(vec3(0.0), fwidth(vBary) * 0.9, vBary);
    float edge = 1.0 - min(min(e.x, e.y), e.z);
    col = mix(col, col + vec3(0.3, 0.29, 0.27) * (0.3 + shade), edge * 0.18);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface GemLook {
  tint: string;
  glow: string;
  ior?: number;
  dispersion?: number;
  brightness?: number;
  fresnelBase?: number;
}

export function gemMaterial(env: THREE.CubeTexture, look: GemLook): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      envMap: { value: env },
      tint: { value: new THREE.Color(look.tint) },
      glow: { value: new THREE.Color(look.glow) },
      ior: { value: look.ior ?? 2.0 },
      dispersion: { value: look.dispersion ?? 0.06 },
      brightness: { value: look.brightness ?? 1.6 },
      fresnelBase: { value: look.fresnelBase ?? 0.12 },
      boost: { value: 1 },
    },
  });
}
