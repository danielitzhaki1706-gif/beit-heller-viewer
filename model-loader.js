// Shared GLTFLoader setup for the atlas and the walk. Meshopt-compressed assets
// decode to the same plain Float32 attributes as the uncompressed models, so
// batching, cutaways and material detail see identical geometry layouts.
import {MeshoptDecoder} from './vendor/meshopt/meshopt_decoder.mjs?v=20261022-r7';
const converted=new WeakMap();
function floatAttribute(THREE,attribute){
 if(converted.has(attribute))return converted.get(attribute);
 const count=attribute.count,size=attribute.itemSize,array=new Float32Array(count*size);
 for(let i=0;i<count;i++)for(let c=0;c<size;c++)array[i*size+c]=attribute.getComponent(i,c);
 const result=new THREE.BufferAttribute(array,size,false);result.name=attribute.name;converted.set(attribute,result);return result;
}
export function floatAttributes(THREE,root){
 root.traverse(object=>{const geometry=object.geometry;if(!geometry?.isBufferGeometry)return;
  for(const [name,attribute]of Object.entries(geometry.attributes))if(attribute.isInterleavedBufferAttribute||attribute.normalized||!(attribute.array instanceof Float32Array))geometry.setAttribute(name,floatAttribute(THREE,attribute));
 });
 return root;
}
export function configureModelLoader(THREE,loader){
 loader.setMeshoptDecoder(MeshoptDecoder);
 const loadAsync=loader.loadAsync.bind(loader);
 loader.loadAsync=(url,onProgress)=>loadAsync(url,onProgress).then(gltf=>{floatAttributes(THREE,gltf.scene);return gltf;});
 return loader;
}
