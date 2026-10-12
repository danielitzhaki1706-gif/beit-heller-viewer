// Decoder for the bundled, hashed Radiance RGBE asset. No remote requests.
export function decodeRGBE(buffer) {
  const bytes=new Uint8Array(buffer); let offset=0;
  function line(){let s='';while(offset<bytes.length){const c=bytes[offset++];if(c===10)return s.replace(/\r$/,'');s+=String.fromCharCode(c);if(s.length>4096)throw Error('HDR header too long');}throw Error('Incomplete HDR header');}
  if(!/^#\?(RADIANCE|RGBE)$/.test(line()))throw Error('Invalid HDR signature');
  let format=false;
  for(let i=0;i<40;i++){const s=line();if(s==='')break;if(s==='FORMAT=32-bit_rle_rgbe')format=true;if(i===39)throw Error('HDR header limit');}
  if(!format)throw Error('Unsupported HDR format');
  const dimensions=/^-Y (\d+) \+X (\d+)$/.exec(line());
  if(!dimensions)throw Error('Unsupported HDR orientation');
  const height=Number(dimensions[1]),width=Number(dimensions[2]);
  if(width<8||width>8192||height<1||height>4096)throw Error('HDR size limit');
  const result=new Float32Array(width*height*4),scan=new Uint8Array(width*4);
  function byte(){if(offset>=bytes.length)throw Error('Truncated HDR scanline');return bytes[offset++];}
  for(let y=0;y<height;y++){
    if(byte()!==2||byte()!==2||((byte()<<8)|byte())!==width)throw Error('Invalid HDR scanline');
    for(let c=0;c<4;c++){
      let x=0;
      while(x<width){const count=byte();if(!count)throw Error('Invalid HDR run');const n=count>128?count-128:count;if(x+n>width)throw Error('HDR run exceeds row');
        if(count>128){const v=byte();scan.fill(v,c*width+x,c*width+x+n);x+=n;}
        else for(let k=0;k<n;k++)scan[c*width+x++]=byte();
      }
    }
    for(let x=0;x<width;x++){const e=scan[width*3+x],s=e?2**(e-136):0,i=4*(y*width+x);result[i]=scan[x]*s;result[i+1]=scan[width+x]*s;result[i+2]=scan[2*width+x]*s;result[i+3]=1;}
  }
  if(offset!==bytes.length)throw Error('Unexpected data after HDR');
  return {width,height,data:result};
}

export async function loadLocalHDRI(THREE,url) {
  const response=await fetch(url);if(!response.ok)throw Error('Local sky asset unavailable');
  const {width,height,data}=decodeRGBE(await response.arrayBuffer());
  const half=new Uint16Array(data.length);for(let i=0;i<data.length;i++)half[i]=THREE.DataUtils.toHalfFloat(Math.min(65504,data[i]));
  const texture=new THREE.DataTexture(half,width,height,THREE.RGBAFormat,THREE.HalfFloatType);
  texture.mapping=THREE.EquirectangularReflectionMapping;texture.colorSpace=THREE.LinearSRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.flipY=true;texture.needsUpdate=true;
  texture.name='Poly Haven Kloofendal puresky CC0 · art-directed environment';
  return texture;
}
