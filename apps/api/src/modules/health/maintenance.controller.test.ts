import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MaintenanceActionSchema,MaintenanceController} from './maintenance.controller.js';
test('maintenance accepts exact fixed action IDs, not command strings or additional arguments',()=>{
 for(const input of [{action:'API_STATUS; id'},{action:'DEPENDENCY_CHECK',args:['--help']},{command:'id'},{action:'restart'}])assert.ok(!MaintenanceActionSchema.safeParse(input).success);
 assert.ok(MaintenanceActionSchema.safeParse({action:'API_STATUS'}).success);
});
test('maintenance rejects preview before audit or checks',async()=>{
 const controller=new MaintenanceController({} as any,{record:()=>{throw Error('Unexpected audit')}} as any);
 await assert.rejects(controller.check({action:'API_STATUS'},{id:'user'} as any,{viewAs:{}} as any),/preview mode/);
});
