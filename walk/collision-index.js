// Spatial lookup over source world-space triangles. No proxy walls or new geometry.
export function createCollisionIndex(THREE,meshes,{bounds=[-10.5,-22.5,60.5,40.5],cellSize=2}={}){
 const cells=new Map(),point=new THREE.Vector3();let triangles=0,references=0;
 const cell=v=>Math.floor(v/cellSize),key=(x,z)=>x+','+z;
 for(const mesh of meshes){
  const g=mesh.geometry,p=g.attributes.position,index=g.index,count=index?.count??p.count;
  const first=Math.max(0,g.drawRange.start),end=Math.min(count,first+g.drawRange.count),mirrored=mesh.matrixWorld.determinant()<0;
  for(let i=first;i+2<end;i+=3){
   const vertices=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld));
   if(mirrored)[vertices[1],vertices[2]]=[vertices[2],vertices[1]];
   const x0=Math.max(bounds[0],Math.min(...vertices.map(v=>v.x))),x1=Math.min(bounds[2],Math.max(...vertices.map(v=>v.x))),z0=Math.max(bounds[1],Math.min(...vertices.map(v=>v.z))),z1=Math.min(bounds[3],Math.max(...vertices.map(v=>v.z)));
   if(x1<x0||z1<z0)continue;
   const material=Array.isArray(mesh.material)?mesh.material[g.groups.find(group=>i>=group.start&&i<group.start+group.count)?.materialIndex]:mesh.material;
   if(!material)continue;
   const triangle={vertices,side:material.side,y0:Math.min(...vertices.map(v=>v.y)),y1:Math.max(...vertices.map(v=>v.y))};triangles++;
   for(let x=cell(x0);x<=cell(x1);x++)for(let z=cell(z0);z<=cell(z1);z++){
    const k=key(x,z);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(triangle);references++;
   }
  }
 }
 function blocked(ray,distance){
  const end=ray.at(distance,new THREE.Vector3()),seen=new Set();
  for(let x=cell(Math.min(ray.origin.x,end.x));x<=cell(Math.max(ray.origin.x,end.x));x++)for(let z=cell(Math.min(ray.origin.z,end.z));z<=cell(Math.max(ray.origin.z,end.z));z++){
   for(const triangle of cells.get(key(x,z))||[]){
    if(seen.has(triangle)||ray.origin.y<triangle.y0-1e-8||ray.origin.y>triangle.y1+1e-8)continue;seen.add(triangle);
    const [a,b,c]=triangle.vertices,hit=triangle.side===THREE.BackSide?ray.intersectTriangle(c,b,a,true,point):ray.intersectTriangle(a,b,c,triangle.side!==THREE.DoubleSide,point);
    if(hit&&point.distanceTo(ray.origin)<=distance+1e-9)return true;
   }
  }
  return false;
 }
 return {blocked,stats:{triangles,references,cells:cells.size,cellSize,bounds}};
}
