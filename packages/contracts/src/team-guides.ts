import {z} from 'zod';
export const TeamGuideSchema=z.object({unitId:z.string().uuid(),unitName:z.string(),version:z.string(),items:z.array(z.object({cs:z.string(),en:z.string()}))});
export type TeamGuide=z.infer<typeof TeamGuideSchema>;
type GuideItem={cs:string;en:string};
const pairs=(...items:[string,string][]):GuideItem[]=>items.map(([cs,en])=>({cs,en}));
// Exercise starter prompts, not approved professional procedures. Keep v1
// immutable; future instructor-approved content belongs in a separate catalog.
export const teamGuideV1:Readonly<Record<string,readonly GuideItem[]>>={
 'bezpecnostne-pravni-sluzby':pairs(
 ['Ověřit zadání, místo a vlastní pravomoc.','Check task, location and your authority.'],
 ['Zaznamenat nález a stav důkazu; použít pokyny instruktora pro jeho typ.','Record discovery and evidence condition; follow instructor guidance for its type.'],
 ['Vyplnit checklist při založení důkazu a uvést výjimky.','Complete the collection checklist and record exceptions.'],
 ['Předat důkaz s identifikátorem, žádankou a historií předání.','Dispatch evidence with identifier, request and custody history.'],
 ['Zkontrolovat vrácený report a zaznamenat návazné kroky.','Review the returned report and record follow-up actions.']),
 'laborator-levanduloveho-oleje':pairs(
 ['Ověřit označení vzorku, zadání a oprávnění k práci.','Verify sample label, request and authority.'],
 ['Zaznamenat stav přijetí a nesrovnalosti; postup konzultovat s instruktorem.','Record intake condition and discrepancies; consult the instructor on procedure.'],
 ['Popsat schválenou metodu, zjištění a omezení výsledku.','Document the approved method, findings and limitations.'],
 ['Předat report ke kontrole a vrátit výsledek žadateli.','Submit the report for review and return the result.']),
 'kyberneticky-forenzni-tym':pairs(
 ['Ověřit rozsah žádanky, identifikátor zdroje a přidělení analytika.','Verify request scope, source identifier and examiner assignment.'],
 ['Zaznamenat stav zařízení a podmínky předání; řídit se pokyny instruktora.','Record device condition and handoff conditions; follow instructor instructions.'],
 ['Propojit záznamy o analýze s konkrétním zdrojem a dokumentovat změny.','Link analysis records to the exact source and document changes.'],
 ['Oddělit ověřená zjištění od hypotéz a uvést omezení.','Separate verified findings from hypotheses and record limitations.'],
 ['Předat report vedoucímu; ověřit návrat výsledku.','Submit to the lead and verify report return.']),
 'juniorska-zpravodajska-sluzba':pairs(
 ['Upřesnit informační požadavek a rozsah zadání.','Clarify the information requirement and scope.'],
 ['Zaznamenat původ a čas informací a jejich omezení.','Record information origin, time and limitations.'],
 ['Rozlišit ověřené skutečnosti, předpoklady a rozpory.','Distinguish verified facts, assumptions and contradictions.'],
 ['Předat srozumitelný výstup oprávněnému příjemci.','Deliver a clear output to the authorized recipient.']),
 'juniorsky-krizovy-stab':pairs(
 ['Zkontrolovat aktuální operační situaci a platné pokyny.','Check the current operational picture and active instructions.'],
 ['Pojmenovat odpovědnosti, priority a otevřené problémy.','Identify responsibilities, priorities and open issues.'],
 ['Přiřadit úkoly, termíny a očekávané výstupy.','Assign tasks, deadlines and expected outputs.'],
 ['Ověřit splnění a zaznamenat důvod případné změny rozhodnutí.','Verify completion and record reasons for changed decisions.']),
 'chemicky-forenzni-tym':pairs(
 ['Ověřit žádanku, vzorek, označení a odpovědnou laboratoř.','Verify request, sample, label and responsible lab.'],
 ['Potvrdit skutečné fyzické převzetí; zaznamenat poškození nebo nesrovnalost.','Confirm actual physical receipt; record damage or discrepancies.'],
 ['Při odmítnutí uvést důvod a informovat žadatele.','State the reason for rejection and inform the requester.'],
 ['Použít výhradně postup schválený instruktorem a uvést omezení výsledku.','Use only the instructor-approved procedure and record limitations.'],
 ['Předat report vedoucímu a ověřit návrat výsledku.','Submit the report for review and verify result return.']),
 'zachranna-a-zdravotni-sluzba':pairs(
 ['Ověřit identifikaci simulovaného pacienta a přidělený případ.','Verify simulated patient identity and assigned encounter.'],
 ['Postupovat podle instruktorem určeného cvičebního protokolu.','Follow the instructor-designated exercise protocol.'],
 ['Zaznamenat pozorování, provedené úkony a jejich čas.','Record observations, actions and their time.'],
 ['Při předání uvést stav, odpovědnost a otevřené požadavky.','Communicate condition, responsibility and pending needs at handoff.']),
 'soudni-senat':pairs(
 ['Ověřit spis, roli a rozsah přístupu.','Verify case file, role and access scope.'],
 ['Zkontrolovat identifikátory podání, důkazů a jejich návaznost.','Check identifiers and links between filings and evidence.'],
 ['Oddělit tvrzení stran, doložené skutečnosti a otevřené otázky.','Separate parties’ claims, documented facts and unresolved questions.'],
 ['Zaznamenat procesní rozhodnutí pouze v rámci přidělené role.','Record procedural decisions only within the assigned role.']),
};
export function resolveTeamGuides(units:readonly {unitId:string;unitName:string;unitSlug:string}[]):TeamGuide[]{
 return units.flatMap(unit=>{
  const items=Object.prototype.hasOwnProperty.call(teamGuideV1,unit.unitSlug)?teamGuideV1[unit.unitSlug]:undefined;
  return items?[{unitId:unit.unitId,unitName:unit.unitName,version:'team-guide-v1',items:[...items]}]:[];
 });
}
