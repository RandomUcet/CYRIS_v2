/** Accept only inert, browser-renderable raster image formats for registry photos. */
export const REGISTRY_IMAGE_BYTES_MAX=5*1024*1024;
const allowed=new Set(['image/png','image/jpeg','image/webp','image/gif']);
export function validRegistryImage(mimeType:string,bytes:Uint8Array):boolean {
  if(!allowed.has(mimeType)||bytes.length===0||bytes.length>REGISTRY_IMAGE_BYTES_MAX)return false;
  const starts=(...magic:number[])=>magic.every((v,i)=>bytes[i]===v);
  switch(mimeType){
    case 'image/png':return bytes.length>=8&&starts(137,80,78,71,13,10,26,10);
    case 'image/jpeg':return bytes.length>=3&&starts(255,216,255);
    case 'image/gif':return bytes.length>=6&&String.fromCharCode(...bytes.slice(0,6)).match(/^GIF8[79]a$/)!==null;
    case 'image/webp':return bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&
      String.fromCharCode(...bytes.slice(8,12))==='WEBP';
    default:return false;
  }
}
