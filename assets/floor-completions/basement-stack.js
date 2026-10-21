import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// All meshes retain their registered world coordinates. Exploding the stack is
// a reversible display transform; it is never written into a source asset.
const category = name => /SOURCE PLAN|underlay/i.test(name) ? 'reference'
  : /wall|lintel|enclosure|column|pier/i.test(name) ? 'wall'
  : /stair|step|riser|handrail|guardrail/i.test(name) ? 'stair'
  : /floor|grade|slab|ramp|landing|threshold|paving/i.test(name) ? 'floor'
  : /parking|stripe|marking|stall/i.test(name) ? 'parking'
  : /door|portal|frame/i.test(name) ? 'door' : 'equipment';
const triangles = geometry => (geometry.index?.count || geometry.attributes.position?.count || 0) / 3;
const comparableName = name => name.toLowerCase().replace(/[_\s]+/g, ' ');
const signature = geometry => JSON.stringify({
  index: !!geometry.index,
  attributes: Object.entries(geometry.attributes).sort(([a], [b]) => a.localeCompare(b))
    .map(([name, a]) => [name, a.itemSize, a.normalized, a.array?.constructor.name]),
});
const abort = signal => { if (signal?.aborted) throw new DOMException('Basement loading aborted', 'AbortError'); };

function horizontalHull(points) {
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const unique = points.filter((p, i) => !i || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
  if (unique.length <= 2) return unique;
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const lower = [], upper = [];
  for (const p of unique) { while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p); }
  for (let i = unique.length - 1; i >= 0; i--) { const p = unique[i]; while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop(); upper.push(p); }
  lower.pop(); upper.pop(); return lower.concat(upper);
}

function cacheFramingHull(layer) {
  layer.updateMatrixWorld(true);
  const points = [], point = new THREE.Vector3(); let minY = Infinity, maxY = -Infinity, sourceVertexCount = 0;
  layer.traverse(mesh => {
    if (!mesh.isMesh) return;
    const position = mesh.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      points.push([point.x, point.z]); minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y); sourceVertexCount++;
    }
  });
  const exact = horizontalHull(points); let hull = exact;
  // Sampling hull vertices would shrink the silhouette and could clip source
  // geometry. If needed, use an OUTER polygon from support lines instead.
  // 72 directions produce <=144 extruded frame points per floor.
  if (exact.length > 75) {
    const supports = Array.from({ length: 72 }, (_, i) => {
      const angle = i * Math.PI * 2 / 72, x = Math.cos(angle), z = Math.sin(angle);
      return { x, z, h: Math.max(...exact.map(p => p[0] * x + p[1] * z)) + 1e-7 };
    });
    hull = supports.map((a, i) => {
      const b = supports[(i + 1) % supports.length], determinant = a.x * b.z - a.z * b.x;
      return [(a.h * b.z - a.z * b.h) / determinant, (a.x * b.h - a.h * b.x) / determinant];
    });
  }
  return { hull, minY, maxY, sourceVertexCount, exactHullVertices: exact.length, outerEnvelope: exact.length > 75 };
}

/**
 * loadGLB(url) must resolve to a GLTF object or Object3D. Source cache ownership
 * stays with the caller. The returned stack owns only its cloned materials and
 * derived geometries. Textures are shared and are never disposed here.
 */
export async function createBasementStack({ loadGLB, blueprint, onProgress, signal } = {}) {
  if (typeof loadGLB !== 'function' || !Array.isArray(blueprint?.layers)) {
    throw new TypeError('createBasementStack needs loadGLB and a basement stack blueprint');
  }
  const group = new THREE.Group();
  group.name = 'R6 basement family | registered source coordinates';
  group.userData = { sourceBasis: blueprint.schema, presentationOnly: true, sourceModels: blueprint.layers.flatMap(layer => layer.assets.map(asset => ({ floorId: layer.id, ...asset }))) };
  const layers = new Map(), framingHulls = new Map(), ownedGeometries = new Set(), ownedMaterials = new Set();
  const stats = { sourceMeshes: 0, derivedMeshes: 0, sourceTriangles: 0, derivedTriangles: 0, hiddenReferences: [], layers: {} };
  let disposed = false, layout = 'assembled', focused = null;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    ownedGeometries.forEach(g => g.dispose());
    ownedMaterials.forEach(m => m.dispose());
    ownedGeometries.clear(); ownedMaterials.clear(); group.clear(); layers.clear(); framingHulls.clear();
  };
  try {
    let completed = 0;
    const total = blueprint.layers.reduce((sum, layer) => sum + layer.assets.length, 0);
    // Sequential loading bounds peak parser memory on mobile hardware.
    for (const spec of blueprint.layers) {
      abort(signal);
      const layer = new THREE.Group();
      layer.name = `${spec.id} | registered source assembly`;
      layer.userData = { floorId: spec.id, sourceStatus: spec.status, displayRank: spec.displayRank, originalOffset: [0, 0, 0], sourceModels: spec.assets };
      const buckets = new Map(), materialMap = new Map(), sourceNames = [];
      const layerStats = { sourceMeshes: 0, derivedMeshes: 0, sourceTriangles: 0, derivedTriangles: 0, hiddenReferences: 0 };
      const materialFor = source => {
        if (!materialMap.has(source)) {
          const clone = source.clone();
          clone.userData = { ...clone.userData, r6BaseOpacity: source.opacity, r6BaseTransparent: source.transparent, r6BaseDepthWrite: source.depthWrite };
          materialMap.set(source, clone); ownedMaterials.add(clone);
        }
        return materialMap.get(source);
      };
      for (const asset of spec.assets) {
        abort(signal);
        const loaded = await loadGLB(asset.href);
        abort(signal);
        const source = (loaded.scene || loaded).clone(true);
        source.updateMatrixWorld(true);
        source.traverse(mesh => {
          if (!mesh.isMesh) return;
          if ((spec.omitNamesContaining || []).some(s => comparableName(mesh.name).includes(comparableName(s)))) {
            stats.hiddenReferences.push({ floorId: spec.id, name: mesh.name, reason: 'Display underlay is a source reference, not a physical floor.' });
            layerStats.hiddenReferences++; return;
          }
          const count = triangles(mesh.geometry), kind = category(mesh.name);
          sourceNames.push(mesh.name); layerStats.sourceMeshes++; layerStats.sourceTriangles += count;
          const geometry = mesh.geometry.clone(); ownedGeometries.add(geometry);
          const materials = Array.isArray(mesh.material) ? mesh.material.map(materialFor) : materialFor(mesh.material);
          // Transparent surfaces stay separate so Three can sort individual
          // source water/glass surfaces, rather than one merged alpha bucket.
          const unsupported = mesh.isSkinnedMesh || Array.isArray(materials) || materials.transparent || materials.opacity < 1 || materials.transmission > .05 || mesh.matrixWorld.determinant() < 0
            || Object.keys(geometry.morphAttributes).length || Object.values(geometry.attributes).some(a => a.isInterleavedBufferAttribute);
          const provenance = { sourceAsset: asset.href, sourceNode: mesh.name, sourceStatus: asset.role, ...mesh.userData };
          if (unsupported) {
            const copy = mesh.clone(false); copy.geometry = geometry; copy.material = materials;
            copy.matrixAutoUpdate = false; copy.matrix.copy(mesh.matrixWorld);
            copy.userData = { ...provenance, r6Category: kind, r6SourceNodes: [mesh.name], r6BaseCastShadow: copy.castShadow, r6FocusShadowManaged: false };
            layer.add(copy); return;
          }
          geometry.applyMatrix4(mesh.matrixWorld);
          const key = [materials.uuid, kind, signature(geometry), mesh.layers.mask, mesh.castShadow, mesh.receiveShadow, mesh.renderOrder].join('|');
          if (!buckets.has(key)) buckets.set(key, { geometries: [], material: materials, kind, sourceNodes: [], sourceAssets: new Set(), mask: mesh.layers.mask, cast: mesh.castShadow, receive: mesh.receiveShadow, order: mesh.renderOrder });
          const bucket = buckets.get(key); bucket.geometries.push(geometry); bucket.sourceNodes.push(mesh.name); bucket.sourceAssets.add(asset.href);
        });
        onProgress?.({ completed: ++completed, total, floorId: spec.id, asset: asset.href });
      }
      for (const bucket of buckets.values()) {
        const merged = bucket.geometries.length === 1 ? bucket.geometries[0] : mergeGeometries(bucket.geometries, false);
        const geometries = merged ? [merged] : bucket.geometries;
        if (merged && bucket.geometries.length > 1) {
          ownedGeometries.add(merged);
          for (const geometry of bucket.geometries) { geometry.dispose(); ownedGeometries.delete(geometry); }
        }
        for (const [i, geometry] of geometries.entries()) {
          geometry.computeBoundingBox(); geometry.computeBoundingSphere();
          const mesh = new THREE.Mesh(geometry, bucket.material);
          mesh.name = `R6 ${spec.id} | ${bucket.kind} | source batch ${layer.children.length + 1}`;
          mesh.layers.mask = bucket.mask; mesh.castShadow = bucket.cast; mesh.receiveShadow = bucket.receive; mesh.renderOrder = bucket.order;
          mesh.userData = { floorId: spec.id, r6Category: bucket.kind, r6SourceNodes: merged ? bucket.sourceNodes : [bucket.sourceNodes[i]], sourceAssets: [...bucket.sourceAssets], sourceStatus: 'original source-derived meshes; positions and triangles preserved', r6BaseCastShadow: mesh.castShadow, r6FocusShadowManaged: false };
          layer.add(mesh);
        }
      }
      layer.userData.sourceNodeCount = sourceNames.length;
      layer.traverse(mesh => { if (mesh.isMesh) { layerStats.derivedMeshes++; layerStats.derivedTriangles += triangles(mesh.geometry); } });
      const hull = cacheFramingHull(layer); framingHulls.set(spec.id, hull);
      layer.userData.r6Framing = { sourceVertexCount: hull.sourceVertexCount, exactHullVertices: hull.exactHullVertices, framePointCount: hull.hull.length * 2, outerEnvelope: hull.outerEnvelope };
      for (const key of ['sourceMeshes', 'derivedMeshes', 'sourceTriangles', 'derivedTriangles']) stats[key] += layerStats[key];
      stats.layers[spec.id] = layerStats;
      layers.set(spec.id, layer); group.add(layer);
    }
    group.updateMatrixWorld(true);
  } catch (error) { dispose(); throw error; }

  const setLayout = (next = 'assembled', gap = blueprint.presentation?.explodeGapM ?? 4) => {
    if (!['assembled', 'exploded'].includes(next)) throw new TypeError('Unknown basement layout');
    if (!Number.isFinite(gap) || gap < 0 || gap > 30) throw new RangeError('Display gap must be between 0 and 30 metres');
    layout = next;
    layers.forEach(layer => { layer.position.y = next === 'exploded' ? layer.userData.displayRank * gap : 0; });
    group.updateMatrixWorld(true);
    return group;
  };
  const setFocus = (floorId = null, { othersOpacity = 0.15, isolate = false } = {}) => {
    if (floorId !== null && !layers.has(floorId)) throw new TypeError('Unknown basement floor');
    if (!Number.isFinite(othersOpacity) || othersOpacity < 0 || othersOpacity > 1) throw new RangeError('Opacity must be in [0, 1]');
    focused = floorId;
    layers.forEach((layer, id) => {
      const muted = floorId !== null && floorId !== id;
      layer.visible = !(isolate && muted);
      layer.traverse(mesh => {
        if (!mesh.isMesh) return;
        // The host may configure shadows after the stack has loaded. Capture
        // that prepared display state once, before applying focus opacity.
        if (!mesh.userData.r6FocusShadowManaged) {
          mesh.userData.r6BaseCastShadow = mesh.castShadow;
          mesh.userData.r6FocusShadowManaged = true;
        }
        mesh.castShadow = muted ? false : mesh.userData.r6BaseCastShadow;
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const base = material.userData;
          material.opacity = base.r6BaseOpacity * (muted ? othersOpacity : 1);
          material.transparent = base.r6BaseTransparent || (muted && othersOpacity < 1);
          material.depthWrite = muted && othersOpacity < 1 ? false : base.r6BaseDepthWrite;
          material.needsUpdate = true;
        }
      });
    });
    return group;
  };
  const bounds = ({ visibleOnly = false } = {}) => {
    group.updateMatrixWorld(true);
    const box = new THREE.Box3();
    layers.forEach(layer => { if (!visibleOnly || layer.visible) box.union(new THREE.Box3().setFromObject(layer)); });
    return box;
  };
  const framingBounds = ({ visibleOnly = false } = {}) => {
    group.updateMatrixWorld(true);
    const box = new THREE.Box3(), framePoints = [];
    layers.forEach((layer, id) => {
      if (visibleOnly && !layer.visible) return;
      const cached = framingHulls.get(id);
      for (const [x, z] of cached.hull) for (const y of [cached.minY, cached.maxY]) {
        const point = new THREE.Vector3(x, y, z).applyMatrix4(layer.matrixWorld);
        framePoints.push(point); box.expandByPoint(point);
      }
    });
    box.framePoints = framePoints;
    return box;
  };
  const snapshot = () => {
    group.updateMatrixWorld(true);
    const serialize = box => ({ min: box.min.toArray(), max: box.max.toArray() });
    return {
      layout, focused, stats,
      layers: [...layers].map(([id, layer]) => ({ id, offset: layer.position.toArray(), visible: layer.visible, bounds: serialize(new THREE.Box3().setFromObject(layer)), framing: layer.userData.r6Framing })),
      bounds: serialize(bounds()),
    };
  };
  return { group, layers, stats, blueprint, setLayout, setFocus, bounds, framingBounds, snapshot, dispose, get layout() { return layout; }, get focused() { return focused; } };
}
