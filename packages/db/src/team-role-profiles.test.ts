import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalTeamRoleProfiles,canonicalUnits} from './event-templates.js';
import {canonicalTeamRoleSlugs} from '@cyris/contracts';
import {Permissions as P} from '@cyris/shared';
const bySlug=new Map(canonicalTeamRoleProfiles.map(p=>[p.slug,p]));
const has=(slug:string,key:string,scope:string)=>bySlug.get(slug)?.permissions.some(p=>p.key===key&&p.scope===scope);
test('all canonical teams have an explicit operator profile; no platform or control grants',()=>{
 assert.equal(canonicalTeamRoleProfiles.length,10);
 for(const unit of canonicalUnits)assert.ok(bySlug.has(canonicalTeamRoleSlugs[unit.slug]?.[0]??''),unit.slug);
 for(const profile of canonicalTeamRoleProfiles){
   const grants=profile.permissions.map(p=>p.key+':'+p.scope);
   assert.equal(new Set(grants).size,grants.length,profile.slug);
   assert.ok(profile.permissions.every(p=>p.scope!=='PLATFORM'&& ![P.PLATFORM_MANAGE,P.ROLE_MANAGE,P.MEMBERSHIP_MANAGE,P.SCENARIO_MANAGE,P.SCENARIO_SECRET_READ,P.LAB_CORRECT,P.COMMAND_DEFCON_CHANGE].some(key=>key===p.key)));
 }
});
test('field collection, lab, cyber, medical and judicial privileges are separated',()=>{
 assert.ok(has('team-bps-operator',P.EVIDENCE_CREATE,'EVENT'));
 assert.ok(has('team-bps-operator',P.EVIDENCE_TRANSFER,'OWN'));
 assert.ok(has('team-bps-operator',P.LAB_REQUEST,'EVENT'));
 assert.ok(has('team-bps-operator',P.FORENSICS_REQUEST,'EVENT'));
 assert.ok(has('team-cyber-forensic-operator',P.FORENSICS_READ,'UNIT'));
 assert.ok(has('team-cyber-forensic-operator',P.FORENSICS_ACCEPT,'ASSIGNED'));
 assert.ok(has('team-chemical-forensic-operator',P.LAB_WORK,'ASSIGNED'));
 assert.ok(has('team-medical-operator',P.MEDICAL_TRANSFER,'UNIT'));
 assert.ok(has('team-laboratory-lead',P.LAB_APPROVE,'UNIT'));
 assert.ok(has('team-digital-forensic-lead',P.FORENSICS_APPROVE,'UNIT'));
 for(const slug of ['team-bps-operator','team-cyber-forensic-operator','team-chemical-forensic-operator','team-court-support']){
   assert.ok(!bySlug.get(slug)?.permissions.some(p=>p.key===P.COURT_DECISION_CREATE||p.key===P.LAB_APPROVE||p.key===P.FORENSICS_APPROVE));
 }
 assert.ok(!has('team-cyber-forensic-operator',P.LAB_WORK,'ASSIGNED'));
 assert.ok(!has('team-chemical-forensic-operator',P.FORENSICS_WORK,'ASSIGNED'));
});
