// Presentation-only occupied windows. No lamp positions, geometry or source
// materials are changed. These are an artistic mood, not a lighting study.
const states = new WeakMap();
const LOOKS = Object.freeze({
  daylight: { transmission: .74, glow: 0, reflection: 1.30 },
  golden: { transmission: .69, glow: .025, reflection: 1.24 },
  twilight: { transmission: .58, glow: .28, reflection: 1.45 }
});

export function installFacadeAtmosphere(material, THREE, sharedState = null) {
  const state = sharedState || { strength: { value: 0 }, look: 'daylight' };
  states.set(material, state);
  material.userData.r5FacadeAtmosphere = true;
  material.onBeforeCompile = shader => {
    shader.uniforms.r5WindowGlow = state.strength;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 r5FacadePosition;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        // Physical facade glazing always enables USE_TRANSMISSION.
        r5FacadePosition = worldPosition.xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 r5FacadePosition;
        uniform float r5WindowGlow;
        float r5WindowHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // Fixed metre-scale variation is stable while orbiting; office floors
        // follow the model's 7.31 m datum and 4.08 m floor-to-floor spacing.
        float r5Level = floor((r5FacadePosition.y - 7.31) / 4.08);
        float r5Bay = floor((r5FacadePosition.x + r5FacadePosition.z * .41) / 4.4);
        float r5Occupancy = r5WindowHash(vec2(r5Bay, r5Level));
        float r5On = smoothstep(.30, .48, r5Occupancy);
        float r5Office = smoothstep(7.30, 7.65, r5FacadePosition.y) * (1. - smoothstep(34.50, 35.55, r5FacadePosition.y));
        float r5Height = fract((r5FacadePosition.y - 7.31) / 4.08);
        float r5Ceiling = .48 + .52 * smoothstep(.08, .75, r5Height);
        vec3 r5Warm = mix(vec3(1., .61, .30), vec3(1., .78, .49), r5Occupancy);
        totalEmissiveRadiance += r5Warm * r5WindowGlow * r5On * r5Office * r5Ceiling;`);
  };
  material.customProgramCacheKey = () => 'beit-heller-facade-atmosphere-r5.1';
  // Adaptive-cutaway clones retain both the shader and the shared look uniform.
  material.clone = function () {
    const copy = THREE.Material.prototype.clone.call(this);
    installFacadeAtmosphere(copy, THREE, state);
    return copy;
  };
  material.needsUpdate = true;
  return material;
}

export function setFacadeAtmosphere(root, look = 'daylight', enabled = true) {
  const profile = LOOKS[enabled ? look : 'daylight'] || LOOKS.daylight;
  const seen = new Set();
  let facadeMeshes = 0;
  root?.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const state = states.get(material);
      if (!state) continue;
      facadeMeshes++;
      if (seen.has(material)) continue;
      seen.add(material);
      state.strength.value = profile.glow;
      state.look = enabled ? look : 'daylight';
      material.transmission = profile.transmission;
      material.envMapIntensity = profile.reflection;
    }
  });
  return { look: enabled ? look : 'daylight', materials: seen.size, facadeMeshes, glow: profile.glow, illustrative: true };
}
