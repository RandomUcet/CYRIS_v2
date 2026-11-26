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
}
