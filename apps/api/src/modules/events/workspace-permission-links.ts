import type { WorkspaceNavSection } from '@cyris/contracts';
/** Permission availability is not resource authorization. Preserve specialized
 * grouping but never let a team profile erase an independently granted module. */
export function completeWorkspaceSections(sections: WorkspaceNavSection[], eventId:string, allowed:ReadonlySet<string>): WorkspaceNavSection[] {
  const root='/events/'+eventId;
  const groups: Array<{id:string;title:string;links:Array<[string,string,string,string]>}> = [
    {id:'overview-section',title:'Overview',links:[['overview','Overview','activity','member'],['timeline','Timeline','clock','timeline'],['tasks','Tasks','check-square','tasks'],['briefings','Briefings','mail','briefings'],['documents','Documents','file-text','documents']]},
    {id:'command-section',title:'Command',links:[['command','Operational Picture','radio','command']]},
    {id:'investigation-section',title:'Investigation',links:[['cases','Cases','briefcase','cases'],['incidents','Incidents','alert-octagon','incidents'],['registry','Registry','building','registry'],['relationships','Relationships','share','registry'],['evidence','Evidence','folder','evidence']]},
    {id:'analysis-section',title:'Analysis',links:[['lab','Laboratory queue','flask','lab']]},
    {id:'forensics-section',title:'Forensics / Technical',links:[['forensics','Forensics queue','cpu','forensics'],['forensics/indicators','Indicators','hash','indicators']]},
    {id:'medical-section',title:'Medical',links:[['medical','Active Cases','heart','medical'],['medical?view=triage','Triage','tag','medical'],['medical?view=transfers','Transfers','truck','medical']]},
    {id:'court-section',title:'Court',links:[['court','Court Cases','book-open','court'],['court/filings','Filings','file-text','court']]},
    {id:'evaluation-section',title:'Evaluation',links:[['evaluation','Objectives','target','evaluation'],['evaluation/observations','Live Observation','eye','evaluation'],['evaluation/after-action','After Action','award','evaluation']]},
    {id:'scenario-section',title:'Scenario',links:[['scenario/control','Control','sliders','scenario'],['scenario-data','Scenario Data','database','scenario-manage']]},
  ];
  const required = new Map(groups.flatMap(g=>g.links.map(([path,,,permission])=>[root+'/'+path,permission] as const)));
  const seen = new Set<string>();
  const result = sections.map(section=>({...section,items:section.items.filter(item=>{
    const permission=required.get(item.href);
    if ((permission && !allowed.has(permission)) || seen.has(item.href)) return false;
    seen.add(item.href);
    return true;
  })}));
  for(const group of groups){
    let target=result.find(section=>section.id===group.id);
    for(const [path,label,iconKey,permission] of group.links){
      const href=root+'/'+path;
      if(!allowed.has(permission)||seen.has(href))continue;
      if(!target){target={id:group.id,title:group.title,items:[]};result.push(target);}
      target.items.push({id:'nav-grant-'+path.replace(/[^a-z0-9]+/g,'-'),label,href,iconKey});
      seen.add(href);
    }
  }
  return result.filter(section=>section.items.length>0);
}
