import {z} from 'zod';
/** Canonical role suggestions are not authorization or automatic assignment. */
export const canonicalTeamRoleSlugs:Readonly<Record<string,readonly string[]>>={
  'bezpecnostne-pravni-sluzby':['team-bps-operator'],
  'laborator-levanduloveho-oleje':['team-lavender-operator','team-laboratory-lead'],
  'kyberneticky-forenzni-tym':['team-cyber-forensic-operator','team-digital-forensic-lead'],
  'juniorska-zpravodajska-sluzba':['team-intelligence-operator'],
  'juniorsky-krizovy-stab':['team-crisis-operator','exercise-command'],
  'chemicky-forenzni-tym':['team-chemical-forensic-operator','team-laboratory-lead'],
  'zachranna-a-zdravotni-sluzba':['team-medical-operator'],
  'soudni-senat':['team-court-support','soudce'],
};
export interface TeamRoleReviewItem {
  unitId:string;unitSlug:string;unitName:string;
  roleSlug:string;roleName:string;rolePresent:boolean;
  memberCount:number;unitBoundCount:number;
  missing:string[];additional:string[];
  primary:boolean;
  eligibleMembers:Array<{membershipId:string;displayName:string}>;
}

/** Only explicitly selected members; the server derives the primary role from the team. */
export const AssignTeamOperatorProfileSchema=z.object({
  unitId:z.string().uuid(),
  roleSlug:z.string().min(1).max(128),
  membershipIds:z.array(z.string().uuid()).min(1).max(100),
}).strict().refine(v=>new Set(v.membershipIds).size===v.membershipIds.length,'Duplicate members');
export type AssignTeamOperatorProfile=z.infer<typeof AssignTeamOperatorProfileSchema>;
