import type { ScenarioWorld, ScenarioQualityReport, ScenarioDataCounts } from '@cyris/contracts';
type Kind = keyof ScenarioWorld;
type Link = { source: Kind; index: number; target: Kind; targetIndex: number };
const kinds: Kind[] = ['persons','organisations','locations','vehicles','devices','weapons'];
const normalized = (text: string) => text.trim().toLocaleLowerCase().normalize('NFKC').replace(/\s+/g,' ');
export function inspectScenarioDraft(input: {
  eventId: string; batchId: string; expected: ScenarioDataCounts;
  rows: ScenarioWorld; links: readonly Link[]; images: number;
}): ScenarioQualityReport {
  const prepared = kinds.reduce((n,k)=>n+input.rows[k].length,0);
  const target = kinds.reduce((n,k)=>n+input.expected[k],0);
  const complete = kinds.every(k=>input.rows[k].length === input.expected[k]);
  const names = input.rows.persons.map(p=>normalized(p.givenName+' '+p.familyName));
  const repeats = names.length-new Set(names).size;
  const badLinks = input.links.filter(link=>
    !Number.isInteger(link.index)||!Number.isInteger(link.targetIndex)||
    link.index<0||link.targetIndex<0||
    !input.rows[link.source]?.[link.index]||!input.rows[link.target]?.[link.targetIndex]).length;
  const allRows = kinds.flatMap(k=>input.rows[k]);
  const weak = allRows.filter(row=>typeof row.description==='string'&&row.description.trim().length<30).length;
  const checks: ScenarioQualityReport['checks'] = [
    {code:'COUNTS',status:complete?'PASS':'FAIL',message:complete? 'All requested records are prepared.': 'Draft is incomplete or exceeds requested counts.'},
    {code:'DUPLICATE_PEOPLE',status:repeats?'FAIL':'PASS',message:repeats? repeats+' repeated person names require attention.':'No duplicate full names inside this draft.'},
    {code:'RELATIONSHIPS',status:badLinks?'FAIL':input.links.length?'PASS':'WARN',
      message:badLinks?badLinks+' links point to nonexistent records.':input.links.length?input.links.length+' valid links.':'No cross-record relationships are present.'},
    {code:'DESCRIPTIONS',status:weak?'WARN':'PASS',message:weak?weak+' descriptions have fewer than 30 characters.':'Descriptions have sufficient length for a first review.'},
    {code:'IMAGES',status:'INFO',message:input.images+' draft images attached (optional).'},
  ];
  const ready = complete && repeats===0 && badLinks===0;
  const score = Math.max(0,Math.min(100,100-(complete?0:45)-(repeats?30:0)-(badLinks?30:0)-
    (input.links.length?0:10)-(weak?Math.min(15,weak):0)));
  return {batchId:input.batchId,eventId:input.eventId,ready,score,
    generatedAt:new Date().toISOString(),checks,preparedRecords:prepared,expectedRecords:target,
    relationships:input.links.length,images:input.images};
}
