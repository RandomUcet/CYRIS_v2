import type {WorkspaceNavSection,WorkspaceNavItem} from '@cyris/contracts';
const groups=[
 {id:'work',title:'Work & overview',routes:['my-work','overview','tasks','briefings','timeline','documents','boards']},
 {id:'investigate',title:'Investigation',routes:['incidents','cases','evidence','registry','relationships']},
 {id:'laboratory',title:'Laboratory',routes:['lab']},
 {id:'digital',title:'Digital forensics',routes:['forensics','jsoc','indicators']},
 {id:'health',title:'Medical',routes:['medical']},
 {id:'legal',title:'Legal',routes:['court','prosecution','defence']},
 {id:'command',title:'Command & control',routes:['command','excon','scenario','scenario-data','evaluation']},
 {id:'support',title:'Support',routes:['service-status','support']},
] as const;
const adminGroups=[
 {id:'admin-work',title:'Exercise administration',routes:['','events','units']},
 {id:'admin-access',title:'Identity & access',routes:['users','roles','settings/identity']},
 {id:'admin-ops',title:'System & operations',routes:['health','audit','settings/modules','settings/integrations']},
] as const;
export function organizeWorkspaceNavigation(sections:readonly WorkspaceNavSection[],root:string,admin:boolean):WorkspaceNavSection[]{
 const definitions=admin?adminGroups:groups;
 const result=new Map<string,WorkspaceNavSection>();
 const seen=new Set<string>();
 const findGroup=(item:WorkspaceNavItem)=>{
  const path=item.href.split('?')[0]??'';
  if(path!==root&&!path.startsWith(root+'/'))return;
  const relative=path.slice(root.length).replace(/^\//,'');
  return definitions.find(g=>g.routes.some(route=>relative===route||!!route&&relative.startsWith(route+'/')));
 };
 for(const section of sections)for(const item of section.items){
  if(seen.has(item.href))continue;seen.add(item.href);
  const group=findGroup(item);
  const id=group?'organized-'+group.id:'other-'+section.id;
  const target=result.get(id)??{id,title:group?.title??section.title,items:[]};
  target.items.push(item);result.set(id,target);
 }
 const ordered:WorkspaceNavSection[]=[];
 for(const group of definitions){
   const target=result.get('organized-'+group.id);
   if(!target)continue;
   const rank=(item:WorkspaceNavItem)=>{
    const relative=(item.href.split('?')[0]??'').slice(root.length).replace(/^\//,'');
    return group.routes.findIndex(route=>relative===route||!!route&&relative.startsWith(route+'/'));
   };
   target.items.sort((a,b)=>rank(a)-rank(b));ordered.push(target);result.delete(target.id);
 }
 return [...ordered,...result.values()];
}
