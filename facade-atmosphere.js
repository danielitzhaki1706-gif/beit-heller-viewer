// Presentation-only occupied windows. No lamp positions, geometry or source
// materials are changed. These are an artistic mood, not a lighting study.
const states = new WeakMap();
const LOOKS = Object.freeze({
  daylight: { transmission: .74, glow: 0, reflection: 1.45, neighbours: 0 },
  golden: { transmission: .69, glow: .025, reflection: 1.36, neighbours: 0 },
  twilight: { transmission: .58, glow: .28, reflection: 1.45, neighbours: .42 }
});
// The surroundings load independently of the building root, so every
// neighbour pane shares one uniform that follows the current look.
const neighbourGlow = { value: 0 };

// A silent no-op replace would drop the effect without any error.
function inject(source, marker, code, label) {
  if (!source.includes(marker)) { console.warn(`[facade-atmosphere] ${label}: shader marker missing: ${marker}`); return source; }
  return source.replace(marker, code);
}

export function installFacadeAtmosphere(material, THREE, sharedState = null) {
  const state = sharedState || { strength: { value: 0 }, look: 'daylight' };
  states.set(material, state);
  material.userData.r5FacadeAtmosphere = true;
  material.onBeforeCompile = shader => {
    shader.uniforms.r5WindowGlow = state.strength;
    shader.vertexShader = inject(shader.vertexShader, '#include <common>', '#include <common>\nvarying vec3 r5FacadePosition;', 'facade');
    shader.vertexShader = inject(shader.vertexShader, '#include <worldpos_vertex>', `#include <worldpos_vertex>
        // Physical facade glazing always enables USE_TRANSMISSION.
        r5FacadePosition = worldPosition.xyz;`, 'facade');
    shader.fragmentShader = inject(shader.fragmentShader, '#include <common>', `#include <common>
        varying vec3 r5FacadePosition;
        uniform float r5WindowGlow;
        float r5WindowHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }`, 'facade');
    shader.fragmentShader = inject(shader.fragmentShader, '#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // Fixed metre-scale variation is stable while orbiting; office floors
        // follow the model's 7.31 m datum and 4.08 m floor-to-floor spacing.
        float r5Level = floor((r5FacadePosition.y - 7.31) / 4.08);
        float r5Run = r5FacadePosition.x + r5FacadePosition.z * .41;
        float r5Bay = floor(r5Run / 4.4);
        float r5Occupancy = r5WindowHash(vec2(r5Bay, r5Level));
        float r5On = smoothstep(.30, .48, r5Occupancy);
        // Inside an occupied 4.4 m bay each ~1.47 m module varies, and a few
        // modules in empty bays stay on, so a lit floor reads as rooms rather
        // than solid bands.
        float r8Module = floor(r5Run / 1.4667);
        float r8Desk = r5WindowHash(vec2(r8Module * 1.73 + 11., r5Level * 3.1 + 5.));
        float r8Dim = mix(.24, 1., smoothstep(.22, .36, r8Desk)) * (.66 + .34 * r5WindowHash(vec2(r8Module, r5Level + 17.)));
        float r8Late = step(.92, r8Desk) * (1. - r5On) * .75;
        float r5Office = smoothstep(7.30, 7.65, r5FacadePosition.y) * (1. - smoothstep(34.50, 35.55, r5FacadePosition.y));
        float r5Height = fract((r5FacadePosition.y - 7.31) / 4.08);
        float r5Ceiling = .48 + .52 * smoothstep(.08, .75, r5Height);
        vec3 r5Warm = mix(vec3(1., .61, .30), vec3(1., .78, .49), r5Occupancy);
        totalEmissiveRadiance += r5Warm * r5WindowGlow * (r5On * r8Dim + r8Late) * r5Office * r5Ceiling;
        // The two-level entrance podium (±0.00 and +3.74) below the office
        // floors is a lobby: evenly lit, brighter under each ceiling.
        float r8Lobby = smoothstep(.10, .40, r5FacadePosition.y) * (1. - smoothstep(6.75, 7.05, r5FacadePosition.y));
        float r8LobbyHeight = r5FacadePosition.y < 3.74 ? r5FacadePosition.y / 3.74 : (r5FacadePosition.y - 3.74) / 3.57;
        float r8LobbyCeiling = .30 + .70 * smoothstep(.30, .95, r8LobbyHeight);
        float r8LobbyModule = .70 + .30 * r5WindowHash(vec2(floor(r5Run / 1.4667), r5FacadePosition.y < 3.74 ? 41. : 43.));
        totalEmissiveRadiance += vec3(1., .76, .50) * r5WindowGlow * .50 * r8Lobby * r8LobbyCeiling * r8LobbyModule;`, 'facade');
  };
  material.customProgramCacheKey = () => 'beit-heller-facade-atmosphere-r8';
  // Adaptive-cutaway clones retain both the shader and the shared look uniform.
  material.clone = function () {
    const copy = THREE.Material.prototype.clone.call(this);
    installFacadeAtmosphere(copy, THREE, state);
    return copy;
  };
  material.needsUpdate = true;
  return material;
}

// Neighbour proxy windows: each pane is lit or dark as a whole, from a seed
// stored per pane (see seedNeighbourWindows). Illustrative occupancy only.
export function installNeighbourWindows(material, THREE) {
  material.userData.r8NeighbourWindows = true;
  material.onBeforeCompile = shader => {
    shader.uniforms.r8NeighbourGlow = neighbourGlow;
    shader.vertexShader = inject(shader.vertexShader, '#include <common>', '#include <common>\nattribute vec3 r8WindowSeed;\nvarying float vR8WindowSeed;\nvarying float vR8PaneHeight;', 'neighbour');
    // r8WindowSeed = (seed, pane bottom, pane top), both heights in world metres.
    shader.vertexShader = inject(shader.vertexShader, '#include <begin_vertex>', `#include <begin_vertex>
        vR8WindowSeed = r8WindowSeed.x;
        float r8WorldY = (modelMatrix * vec4(transformed, 1.)).y;
        vR8PaneHeight = r8WindowSeed.z > r8WindowSeed.y + .01 ? clamp((r8WorldY - r8WindowSeed.y) / (r8WindowSeed.z - r8WindowSeed.y), 0., 1.) : .5;`, 'neighbour');
    shader.fragmentShader = inject(shader.fragmentShader, '#include <common>', '#include <common>\nvarying float vR8WindowSeed;\nvarying float vR8PaneHeight;\nuniform float r8NeighbourGlow;', 'neighbour');
    shader.fragmentShader = inject(shader.fragmentShader, '#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // About four in ten panes lit; mostly warm, some cool office LED.
        float r8On = step(.60, vR8WindowSeed);
        float r8Level = fract(vR8WindowSeed * 7.31);
        vec3 r8Tone = mix(vec3(1., .72, .46), vec3(.84, .91, 1.), step(.74, fract(vR8WindowSeed * 3.17)));
        // Brighter toward the ceiling, as a lit room seen through a window.
        float r8Ceiling = .55 + .45 * smoothstep(.05, .95, vR8PaneHeight);
        totalEmissiveRadiance += r8Tone * r8NeighbourGlow * r8On * (.45 + .55 * r8Level) * r8Ceiling;`, 'neighbour');
  };
  material.customProgramCacheKey = () => 'beit-heller-neighbour-windows-r8';
  material.clone = function () {
    const copy = THREE.Material.prototype.clone.call(this);
    installNeighbourWindows(copy, THREE);
    return copy;
  };
  material.needsUpdate = true;
  return material;
}

// One stable value per pane: connected triangles share a seed hashed from
// the pane's world-space centre, stored with the pane's world-space bottom and
// top. Adds an attribute; positions stay untouched.
export function seedNeighbourWindows(mesh, THREE) {
  const geometry = mesh.geometry;
  if (geometry.getAttribute('r8WindowSeed')) return 0;
  const position = geometry.getAttribute('position'), count = position.count;
  const parent = new Int32Array(count).map((_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  const index = geometry.index;
  if (index) for (let i = 0; i < index.count; i += 3) { join(index.getX(i), index.getX(i + 1)); join(index.getX(i), index.getX(i + 2)); }
  else for (let i = 0; i < count; i += 3) { join(i, i + 1); join(i, i + 2); }
  // Split vertices of one pane (duplicated for flat normals) share a position.
  const byPosition = new Map();
  for (let i = 0; i < count; i++) {
    const key = position.getX(i).toFixed(3) + '/' + position.getY(i).toFixed(3) + '/' + position.getZ(i).toFixed(3);
    if (byPosition.has(key)) join(byPosition.get(key), i); else byPosition.set(key, i);
  }
  const sums = new Map(), v = new THREE.Vector3();
  mesh.updateWorldMatrix(true, false);
  for (let i = 0; i < count; i++) {
    const root = find(i);
    v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    const s = sums.get(root) || [0, 0, 0, 0, Infinity, -Infinity];
    s[0] += v.x; s[1] += v.y; s[2] += v.z; s[3]++; s[4] = Math.min(s[4], v.y); s[5] = Math.max(s[5], v.y); sums.set(root, s);
  }
  const seeds = new Map();
  for (const [root, s] of sums) {
    const x = s[0] / s[3], y = s[1] / s[3], z = s[2] / s[3];
    const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    seeds.set(root, [h - Math.floor(h), s[4], s[5]]);
  }
  const array = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) array.set(seeds.get(find(i)), i * 3);
  geometry.setAttribute('r8WindowSeed', new THREE.BufferAttribute(array, 3));
  return seeds.size;
}

export function setFacadeAtmosphere(root, look = 'daylight', enabled = true) {
  const profile = LOOKS[enabled ? look : 'daylight'] || LOOKS.daylight;
  neighbourGlow.value = profile.neighbours;
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
  return { look: enabled ? look : 'daylight', materials: seen.size, facadeMeshes, glow: profile.glow, neighbourGlow: profile.neighbours, illustrative: true };
}
