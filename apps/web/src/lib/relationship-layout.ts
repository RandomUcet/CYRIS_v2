type Node={id:string};
type Edge={source:string;target:string};
type Point={x:number;y:number};
/** Stable graph layout: connected components are packed into separate tiles;
 * breadth-first distance from a chosen hub determines radial rings, not rows. */
export function networkPositions(nodes:readonly Node[],edges:readonly Edge[],focus?:string):Map<string,Point>{
 const ids=[...new Set(nodes.map(n=>n.id))].sort(),adj=new Map(ids.map(id=>[id,new Set<string>()]));
 for(const e of edges){if(e.source!==e.target&&adj.has(e.source)&&adj.has(e.target)){adj.get(e.source)!.add(e.target);adj.get(e.target)!.add(e.source);}}
 const visited=new Set<string>(),components:string[][]=[];
 for(const id of ids){if(visited.has(id))continue;const queue=[id];visited.add(id);for(let i=0;i<queue.length;i++)for(const neighbor of adj.get(queue[i]!)!){if(!visited.has(neighbor)){visited.add(neighbor);queue.push(neighbor);}}components.push(queue.sort());}
 components.sort((a,b)=>Number(b.includes(focus??''))-Number(a.includes(focus??''))||b.length-a.length||a[0]!.localeCompare(b[0]!));
 const tiles=components.map(component=>{
  const hub=focus&&component.includes(focus)?focus:[...component].sort((a,b)=>adj.get(b)!.size-adj.get(a)!.size||a.localeCompare(b))[0]!;
  const queue=[hub],distance=new Map([[hub,0]]),rings=new Map<number,string[]>();
  for(let i=0;i<queue.length;i++){const id=queue[i]!,depth=distance.get(id)!;const ring=rings.get(depth)??[];ring.push(id);rings.set(depth,ring);for(const neighbor of [...adj.get(id)!].sort())if(!distance.has(neighbor)){distance.set(neighbor,depth+1);queue.push(neighbor);}}
  const points=new Map<string,Point>([[hub,{x:0,y:0}]]);let radius=0;
  for(const [depth,ring] of rings){if(!depth)continue;radius=Math.max(radius+160,ring.length*150/(2*Math.PI));ring.sort();ring.forEach((id,i)=>{const angle=2*Math.PI*i/ring.length-Math.PI/2+depth*.17;points.set(id,{x:radius*Math.cos(angle),y:radius*Math.sin(angle)});});}
  return {points,size:Math.max(200,2*radius+180)};
 });
 const width=Math.max(...tiles.map(t=>t.size),Math.sqrt(tiles.reduce((sum,t)=>sum+t.size*t.size,0))*1.25,200);
 const result=new Map<string,Point>();let x=0,y=0,rowHeight=0;
 for(const tile of tiles){if(x>0&&x+tile.size>width){x=0;y+=rowHeight+60;rowHeight=0;}for(const [id,p] of tile.points)result.set(id,{x:x+tile.size/2+p.x,y:y+tile.size/2+p.y});x+=tile.size+60;rowHeight=Math.max(rowHeight,tile.size);}
 return result;
}
