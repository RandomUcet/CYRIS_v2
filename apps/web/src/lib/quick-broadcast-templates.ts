import type { ExerciseBroadcastRequest } from '@cyris/contracts';

export type QuickBroadcastTemplate = {
  key: string; kind: ExerciseBroadcastRequest['kind'];
  name: string; title: string; message: string;
};

/** All templates are human-reviewed drafts, never automated deliveries. */
export function quickBroadcastTemplates(locale: string): QuickBroadcastTemplate[] {
  const tr=(cs:string,en:string)=>locale==='cs'?cs:en;
  return [
    {key:'briefing',kind:'INFO',name:tr('Briefing','Briefing'),
      title:tr('Organizační briefing','Operations briefing'),
      message:tr('Čas a místo briefingu: [DOPLŇTE]. Účastníci: [DOPLŇTE].',
        'Briefing time and location: [FILL IN]. Participants: [FILL IN].')},
    {key:'sitrep',kind:'INSTRUCTION',name:'SITREP',
      title:tr('Výzva k SITREP','SITREP requested'),
      message:tr('Zašlete aktuální SITREP do [DOPLŇTE ČAS]. Uveďte potvrzená fakta, rizika a požadavky na podporu.',
        'Submit an updated SITREP by [FILL IN TIME]. Include confirmed facts, risks and support requests.')},
    {key:'change',kind:'UPDATE',name:tr('Změna situace','Situation change'),
      title:tr('Nové informace o situaci','Situation update'),
      message:tr('Aktuální změna: [DOPLŇTE]. Dopad na váš tým: [DOPLŇTE]. Další postup: [DOPLŇTE].',
        'Latest change: [FILL IN]. Team impact: [FILL IN]. Next actions: [FILL IN].')},
    {key:'urgent',kind:'URGENT',name:tr('Urgentní pokyn','Urgent instruction'),
      title:tr('Naléhavý pokyn EXCON','Urgent EXCON instruction'),
      message:tr('Vyžadovaná akce: [DOPLŇTE]. Pro koho: [DOPLŇTE]. Termín: [DOPLŇTE].',
        'Required action: [FILL IN]. Audience: [FILL IN]. Deadline: [FILL IN].')},
    {key:'phase',kind:'INFO',name:tr('Nová fáze','New phase'),
      title:tr('Zahájení další fáze cvičení','Exercise phase starting'),
      message:tr('Fáze: [DOPLŇTE]. Zahájení: [DOPLŇTE ČAS]. Cíl: [DOPLŇTE]. Pokyny pro týmy: [DOPLŇTE].',
        'Phase: [FILL IN]. Start: [FILL IN TIME]. Goal: [FILL IN]. Team instructions: [FILL IN].')},
    {key:'inject',kind:'UPDATE',name:tr('Scénářový vstup','Scenario inject'),
      title:tr('Nový scénářový vstup EXCON','New EXCON scenario inject'),
      message:tr('Cvičná informace: [DOPLŇTE]. Pro koho platí: [DOPLŇTE]. Čas účinnosti: [DOPLŇTE ČAS].',
        'Exercise-only inject: [FILL IN]. Applies to: [FILL IN]. Effective time: [FILL IN TIME].')},
    {key:'checkin',kind:'INSTRUCTION',name:tr('Kontrola dostupnosti','Team check-in'),
      title:tr('Potvrzení dostupnosti týmu','Team availability check'),
      message:tr('Potvrďte dostupnost do [DOPLŇTE ČAS]. Uveďte stav týmu, aktuální překážky a kontakt pro koordinaci v CYRIS.',
        'Confirm availability by [FILL IN TIME]. Include team status, blockers and a CYRIS coordination contact.')},
    {key:'outage',kind:'URGENT',name:tr('Provozní omezení','Service disruption'),
      title:tr('Provozní omezení během cvičení','Exercise service disruption'),
      message:tr('Dotčená služba: [DOPLŇTE]. Projev problému: [DOPLŇTE]. Náhradní postup: [DOPLŇTE]. Další aktualizace: [DOPLŇTE ČAS].',
        'Affected service: [FILL IN]. Impact: [FILL IN]. Workaround: [FILL IN]. Next update: [FILL IN TIME].')},
    {key:'recovery',kind:'UPDATE',name:tr('Obnovení provozu','Service restored'),
      title:tr('Aktualizace obnovy služby','Service recovery update'),
      message:tr('Stav obnovy: [DOPLŇTE]. Ověření funkčnosti: [DOPLŇTE]. Další požadovaná akce: [DOPLŇTE].',
        'Recovery status: [FILL IN]. Verification: [FILL IN]. Required next action: [FILL IN].')},
    {key:'debrief',kind:'INFO',name:tr('Debriefing','Debriefing'),
      title:tr('Závěrečné vyhodnocení cvičení','Exercise debriefing'),
      message:tr('Debriefing se uskuteční [DOPLŇTE ČAS] na místě [DOPLŇTE]. Připravte hlavní poznatky, otevřené úkoly a doporučení.',
        'Debriefing takes place at [FILL IN TIME] in [FILL IN]. Bring key findings, open tasks and recommendations.')},
  ];
}
