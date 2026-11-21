import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BadRequestException} from '@nestjs/common';
import {ResourceService} from './resource.service.js';
test('self-referential registry relationships are rejected before any database write',async()=>{
  const service=Object.create(ResourceService.prototype) as ResourceService;
  const id='00000000-0000-4000-8000-000000000099';
  await assert.rejects(
    service.createRelationship({sourceResourceId:id,targetResourceId:id,relationshipType:'RELATED_TO'}),
    (error:unknown)=>error instanceof BadRequestException && error.message.includes('itself')
  );
});
