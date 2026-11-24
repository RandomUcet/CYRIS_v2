import {test} from 'node:test';import assert from 'node:assert/strict';import {networkPositions} from './relationship-layout';
test('large star uses radial space instead of two rows and stays deterministic',()=>{
 const nodes=Array.from({length:100},(_,i)=>({id:'n'+i})),edges=nodes.slice(1).map(n=>({source:'n0',target:n.id}));
 const result=networkPositions(nodes,edges,'n0');
 assert.equal(result.size,100);assert.ok(new Set([...result.values()].map(p=>Math.round(p.y))).size>10);
 assert.deepEqual(networkPositions([...nodes].reverse(),[...edges].reverse(),'n0'),result);
 const points=[...result.values()];for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)assert.ok(Math.hypot(points[i]!.x-points[j]!.x,points[i]!.y-points[j]!.y)>100);
});
test('cycles, disconnected records and invalid edges are handled without overlaps',()=>{
 const nodes=['a','b','c','d','e','f'].map(id=>({id}));const edges=[{source:'a',target:'b'},{source:'b',target:'c'},{source:'c',target:'a'},{source:'d',target:'e'},{source:'a',target:'missing'}];
 const result=networkPositions(nodes,edges,'c');assert.equal(result.size,6);assert.ok(!result.has('missing'));
 assert.equal(new Set([...result.values()].map(p=>p.x+','+p.y)).size,6);
});
