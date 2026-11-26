import type {MyWorkView} from '@cyris/contracts';
const copy:Record<MyWorkView,{cs:[string,string,string];en:[string,string,string]}>={
 personal:{cs:['Moje práce','Záznamy přidělené přímo vám. Otevřete položku a pokračujte dostupnou akcí.','Nemáte žádnou přidělenou práci.'],en:['My work','Records assigned directly to you. Open an item to see its available actions.','No work assigned to you.']},
 requested:{cs:['Moje žádanky a výsledky','Sledujte stav odeslaných žádanek a otevřete schválené výsledky.','Nemáte žádné odeslané žádanky.'],en:['My requests and results','Follow outgoing requests and open approved results.','No outgoing requests.']},
 unit:{cs:['Práce týmu','Dostupné záznamy vybraného týmu; vlastní přístup závisí na oprávnění.','Žádná dostupná práce pro tento tým.'],en:['Unit queue','Accessible records for the selected team; your access depends on permissions.','No accessible work for this team.']},
 event:{cs:['Přehled cvičení','Záznamy cvičení, které smíte zobrazit.','Žádné dostupné záznamy cvičení.'],en:['Event overview','Exercise records you are allowed to view.','No accessible exercise records.']},
 approval:{cs:['Ke schválení','Dokončené protokoly, které smíte schválit.','Žádné protokoly ke schválení.'],en:['Awaiting approval','Completed reports you may approve.','No reports awaiting approval.']},
};
export function workViewCopy(view:MyWorkView,cs:boolean){const [label,description,empty]=copy[view][cs?'cs':'en'];return {label,description,empty};}
