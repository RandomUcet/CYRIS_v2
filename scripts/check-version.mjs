/**
 * CYRIS version identity checker.
 * Keep checkout, app manifests and published preview identity aligned.
 * Does not alter files, create tags, or deploy anything.
 */
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function checkVersion(base=root){
  const versionFile=join(base,'VERSION');
  if(!existsSync(versionFile))throw new Error('VERSION is missing');
  const releaseVersion=readFileSync(versionFile,'utf8').trim();
  if(!/^\d+\.\d+\.\d+(?:-(?:rc|beta|alpha)\.\d+)?$/.test(releaseVersion))throw new Error('VERSION is not a valid CYRIS release identifier');
  const packages=[join(base,'package.json')];
  for(const group of ['apps','packages']){
    const dir=join(base,group);
    for(const entry of readdirSync(dir,{withFileTypes:true})){
      if(entry.isDirectory()){
        const manifest=join(dir,entry.name,'package.json');
        if(existsSync(manifest))packages.push(manifest);
      }
    }
  }
  for(const path of packages){
    const current=JSON.parse(readFileSync(path,'utf8'));
    if(current.version!==releaseVersion)
      throw new Error('Version mismatch: '+path+' has '+current.version+' (expected '+releaseVersion+')');
  }
  return {version:releaseVersion,checked:packages.length};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=checkVersion();
  process.stdout.write('CYRIS '+result.version+' — '+result.checked+' manifests consistent\n');
}
