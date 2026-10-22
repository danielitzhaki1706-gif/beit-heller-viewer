// Spatial lookup over source world-space triangles. No proxy walls or new geometry.
// Vertices are packed in one Float32Array; triangles wholly above maxHeight can
// never meet a walker's body rays and are not indexed.
export function createCollisionIndex(THREE,meshes,{bounds=[-10.5,-22.5,60.5,40.5],cellSize=2,maxHeight=8}={}){
 const cells=new Map(),point=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),end=new THREE.Vector3();
 const packed=[],sides=[];let triangles=0,references=0,stamp=0;
 const cell=v=>Math.floor(v/cellSize),key=(x,z)=>x+','+z;
 for(const mesh of meshes){
  const g=mesh.geometry,p=g.attributes.position,index=g.index,count=index?.count??p.count;
  const first=Math.max(0,g.drawRange.start),last=Math.min(count,first+g.drawRange.count),mirrored=mesh.matrixWorld.determinant()<0;
  for(let i=first;i+2<last;i+=3){
   a.fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(mesh.matrixWorld);
   b.fromBufferAttribute(p,index?index.getX(i+1):i+1).applyMatrix4(mesh.matrixWorld);
   c.fromBufferAttribute(p,index?index.getX(i+2):i+2).applyMatrix4(mesh.matrixWorld);
   if(mirrored){point.copy(b);b.copy(c);c.copy(point);}
   const y0=Math.min(a.y,b.y,c.y),y1=Math.max(a.y,b.y,c.y);if(y0>maxHeight)continue;
   const x0=Math.max(bounds[0],Math.min(a.x,b.x,c.x)),x1=Math.min(bounds[2],Math.max(a.x,b.x,c.x)),z0=Math.max(bounds[1],Math.min(a.z,b.z,c.z)),z1=Math.min(bounds[3],Math.max(a.z,b.z,c.z));
   if(x1<x0||z1<z0)continue;
   const material=Array.isArray(mesh.material)?mesh.material[g.groups.find(group=>i>=group.start&&i<group.start+group.count)?.materialIndex]:mesh.material;
   if(!material)continue;
   const id=triangles++;packed.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z,y0,y1);sides.push(material.side);
   for(let x=cell(x0);x<=cell(x1);x++)for(let z=cell(z0);z<=cell(z1);z++){
    const k=key(x,z);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(id);references++;
   }
  }
 }
 const data=new Float32Array(packed),seen=new Uint32Array(triangles);packed.length=0;
 for(const [k,list]of cells)cells.set(k,Uint32Array.from(list));
 function blocked(ray,distance){
  ray.at(distance,end);stamp=stamp===0xffffffff?1:stamp+1;
  for(let x=cell(Math.min(ray.origin.x,end.x));x<=cell(Math.max(ray.origin.x,end.x));x++)for(let z=cell(Math.min(ray.origin.z,end.z));z<=cell(Math.max(ray.origin.z,end.z));z++){
   const list=cells.get(key(x,z));if(!list)continue;
   for(const id of list){
    const o=id*11;if(seen[id]===stamp||ray.origin.y<data[o+9]-1e-8||ray.origin.y>data[o+10]+1e-8)continue;seen[id]=stamp;
    a.set(data[o],data[o+1],data[o+2]);b.set(data[o+3],data[o+4],data[o+5]);c.set(data[o+6],data[o+7],data[o+8]);
    const side=sides[id],hit=side===THREE.BackSide?ray.intersectTriangle(c,b,a,true,point):ray.intersectTriangle(a,b,c,side!==THREE.DoubleSide,point);
    if(hit&&point.distanceTo(ray.origin)<=distance+1e-9)return true;
   }
  }
  return false;
 }
 return {blocked,stats:{triangles,references,cells:cells.size,cellSize,bounds,maxHeight}};
}
