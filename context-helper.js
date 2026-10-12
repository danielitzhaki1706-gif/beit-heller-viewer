// Isolated far-context candidate. No fetches, app mutations or building geometry access.
// Coordinates in JSON/exclusions use native Blender XY; output is Three.js Y-up.
const eps=1e-8;
const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
function cross(a,b,c){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
export function segmentDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
export function pointInPolygon(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(segmentDistance(p,a,b)<eps)return true;if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function edges(poly){return poly.map((a,i)=>[a,poly[(i+1)%poly.length]]);}
export function segmentsIntersect(a,b,c,d){const p=cross(a,b,c),q=cross(a,b,d),r=cross(c,d,a),s=cross(c,d,b);if(p*q<-eps&&r*s<-eps)return true;return segmentDistance(a,c,d)<eps||segmentDistance(b,c,d)<eps||segmentDistance(c,a,b)<eps||segmentDistance(d,a,b)<eps;}
export function intersectsBuffered(a,b,margin=0){
 if(a.some(p=>pointInPolygon(p,b))||b.some(p=>pointInPolygon(p,a)))return true;
 for(const [p,q]of edges(a))for(const [r,s]of edges(b))if(segmentsIntersect(p,q,r,s)||Math.min(segmentDistance(p,r,s),segmentDistance(q,r,s),segmentDistance(r,p,q),segmentDistance(s,p,q))<=margin+eps)return true;
 return false;
}
export function terrainHeight(x,y,center){let w=y>=-11?0:y<=-23?1:(-11-y)/12;w=w*w*(3-2*w);const r=Math.hypot(x-center[0],y-center[1]),fade=r<60?1:r>130?0:1-(r-60)/70;return 3.1*w*fade-.02;}
function rectangle(a,b,width){const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),nx=-dy/len*width/2,ny=dx/len*width/2;return [[a[0]+nx,a[1]+ny],[b[0]+nx,b[1]+ny],[b[0]-nx,b[1]-ny],[a[0]-nx,a[1]-ny]];}
function circle(p,r){return Array.from({length:12},(_,i)=>[p[0]+Math.cos(i*Math.PI/6)*r,p[1]+Math.sin(i*Math.PI/6)*r]);}

export function buildFarContext(THREE,data,{exclusionPolygon,bufferMetres=6,maxTriangles=25000}={}){
 if(!Array.isArray(exclusionPolygon)||exclusionPolygon.length<3||!exclusionPolygon.every(validPoint))throw Error('A root-approved native-XY nearfield exclusion polygon is required');
 if(!Number.isFinite(bufferMetres)||bufferMetres<0)throw Error('Invalid exclusion buffer');
 const masks=[exclusionPolygon,data.legacySitePolygon,data.legacyBuildingHull];
 const safe=polygon=>!masks.some(mask=>intersectsBuffered(polygon,mask,bufferMetres));
 const group=new THREE.Group();group.name='Far_context_OSM_candidate';group.visible=false;
 group.userData={scope:'illustrative_far_context_only',excludeFromBuildingBounds:true,excludeFromFloorClipping:true,hideInInterior:true,attribution:data.attribution,registrationUncertaintyMetres:data.registrationUncertaintyMetres};
 const facade=new THREE.MeshStandardMaterial({color:0xc1b9a8,roughness:.92});
 const asphalt=new THREE.MeshStandardMaterial({color:0x515354,roughness:.9});
 const paving=new THREE.MeshStandardMaterial({color:0xb3aea3,roughness:.9});
 const stats={candidateBuildings:data.buildings.length,keptBuildings:0,excludedBuildings:[],candidateRoadSegments:0,keptRoadSegments:0,excludedRoadSegments:0,triangles:0,materials:3,bufferMetres,trees:0,nearfieldMaskApplied:true,terrainIncluded:false};
 const positions={asphalt:[],paving:[]},joints=new Set(),acceptedPolygons=[];
 function addSurface(poly,kind,dz){if(!safe(poly))return false;acceptedPolygons.push(poly);const area=poly.reduce((sum,p,i)=>sum+p[0]*poly[(i+1)%poly.length][1]-poly[(i+1)%poly.length][0]*p[1],0);const oriented=area<0?[...poly].reverse():poly;const points=oriented.map(p=>[p[0],terrainHeight(...p,data.center)+dz,-p[1]]);for(let i=1;i<points.length-1;i++)positions[kind].push(...points[0],...points[i],...points[i+1]);return true;}
 for(const b of data.buildings){if(!safe(b.footprint)){stats.excludedBuildings.push(b.id);continue;}
  const shape=new THREE.Shape(b.footprint.map(p=>new THREE.Vector2(...p)));
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:b.height,bevelEnabled:false,steps:1,curveSegments:1});
  const pos=geometry.getAttribute('position');for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);pos.setXYZ(i,x,z+b.base,-y);}pos.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();
  const mesh=new THREE.Mesh(geometry,facade);mesh.name='Context_OSM_'+b.id;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={osmWay:b.id,heightBasis:b.heightBasis,sourceHeight:b.sourceHeight};group.add(mesh);acceptedPolygons.push(b.footprint);stats.keptBuildings++;
 }
 for(const road of data.roads){const walking=['footway','path','cycleway','steps','pedestrian'].includes(road.kind),kind=walking?'paving':'asphalt',dz=walking?.05:.06;
  for(const [a,b]of road.segments){stats.candidateRoadSegments++;if(Math.hypot(b[0]-a[0],b[1]-a[1])<.05)continue;
   if(!addSurface(rectangle(a,b,road.width),kind,dz)){stats.excludedRoadSegments++;continue;}stats.keptRoadSegments++;
   const layers=[{width:road.width,kind,dz}];if(road.sidewalkEachSide)layers.push({width:road.width+2*road.sidewalkEachSide,kind:'paving',dz:.045});
   for(const layer of layers){if(layer.width!==road.width)addSurface(rectangle(a,b,layer.width),layer.kind,layer.dz);
    for(const p of [a,b]){const key=[...p,layer.width,layer.kind].join(':');if(joints.has(key))continue;joints.add(key);addSurface(circle(p,layer.width/2),layer.kind,layer.dz-.002);}
   }
  }
 }
 for(const [kind,values]of Object.entries(positions)){if(!values.length)continue;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(values,3));geometry.computeVertexNormals();geometry.computeBoundingBox();const mesh=new THREE.Mesh(geometry,kind==='asphalt'?asphalt:paving);mesh.name='Context_'+kind;mesh.receiveShadow=true;group.add(mesh);}
 group.traverse(o=>{if(o.isMesh)stats.triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.getAttribute('position').count)/3;});
 if(stats.triangles>maxTriangles){group.traverse(o=>{if(o.isMesh)o.geometry.dispose();});[facade,asphalt,paving].forEach(m=>m.dispose());throw Error('Far-context triangle budget exceeded');}
 stats.meshes=group.children.length;
 return {group,stats,acceptedPolygons,setVisibility(mode,enabled=true){group.visible=enabled&&mode==='exterior';},dispose(){group.traverse(o=>{if(o.isMesh)o.geometry.dispose();});[facade,asphalt,paving].forEach(m=>m.dispose());}};
}
