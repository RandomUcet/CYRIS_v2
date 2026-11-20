import type { SupportedLocale } from './i18n';
const cs: Record<string,string> = {
  "Overview": "Přehled",
  "Command": "Velení",
  "Operational Picture": "Operační situace",
  "Operations": "Operativa",
  "Tasking": "Úkoly",
  "Tasks": "Úkoly",
  "My Work": "Moje práce",
  "Briefings": "Brífinky",
  "Timeline": "Časová osa",
  "Documents": "Dokumenty",
  "Documents & Files": "Dokumenty a soubory",
  "Incidents": "Incidenty",
  "Investigation": "Vyšetřování",
  "Cases": "Případy",
  "Registry": "Registr",
  "Relationships": "Vztahy",
  "Evidence": "Důkazy",
  "Analysis": "Laboratoř",
  "Chemical Analysis": "Chemické analýzy",
  "Forensics / Technical": "Digitální forenzní analýza",
  "Analyses": "Analýzy",
  "Indicators": "Indikátory",
  "Medical": "Zdravotnictví",
  "Active Cases": "Aktivní pacienti",
  "Triage": "Třídění",
  "Transfers": "Předání",
  "Legal": "Právní agenda",
  "Court": "Soud",
  "Docket": "Soudní spisy",
  "Court Cases": "Soudní případy",
  "Assigned Cases": "Přidělené případy",
  "Case Preparation": "Příprava případu",
  "Evidence Access": "Přístup k důkazům",
  "Filings": "Podání",
  "Hearings": "Jednání",
  "Exhibits": "Soudní důkazy",
  "Decisions": "Rozhodnutí",
  "Scenario": "Scénář",
  "Control": "Řízení scénáře",
  "Scenario Control": "Řízení scénáře",
  "Scenario Data": "Data scénáře",
  "Evaluation": "Evaluace",
  "Objectives": "Cíle",
  "Live Observation": "Průběžná pozorování",
  "After Action": "Závěrečné vyhodnocení",
  "Administration": "Administrace",
  "Platform overview": "Přehled platformy",
  "Events": "Události",
  "Units & Teams": "Jednotky a týmy",
  "Users & Access": "Uživatelé a přístupy",
  "Roles & Perms": "Role a oprávnění",
  "Roles & Permissions": "Role a oprávnění",
  "Audit Log": "Auditní záznamy",
  "Identity Providers": "Poskytovatelé identity",
  "Integrations & AI": "Integrace a AI",
  "Settings": "Nastavení",
  "Event": "Událost",
  "Platform Administration": "Správa platformy",
  "Operational Tasking": "Úkoly",
  "Operational Briefings": "Brífinky",
  "Exercise Evaluation": "Evaluace cvičení",
  "Work Queue": "Fronta práce",
  "No operational event context selected.": "Pro zahájení práce vyberte událost.",
  "Expand Sidebar": "Rozbalit navigaci",
  "Collapse Sidebar": "Sbalit navigaci",
  "Exercise workspace": "Pracovní prostředí cvičení",
  "Laboratory queue": "Laboratorní požadavky",
  "Forensics queue": "Forenzní požadavky"
};
// Static product vocabulary; never pass user-generated content here.
export const workspaceLabel = (locale: SupportedLocale, label: string) => locale === 'cs' ? cs[label] ?? label : label;
export function activeWorkspaceHref(hrefs: readonly string[], pathname: string, search: string): string | undefined {
  const current = new URLSearchParams(search);
  return hrefs.map(href => {
    const [path, query] = href.split('?');
    if (!path || !(pathname === path || (path !== '/admin' && pathname.startsWith(path + '/')))) return {href, score:-1};
    const params = new URLSearchParams(query);
    for (const [key, value] of params) if (current.get(key) !== value) return {href, score:-1};
    return {href, score:path.length * 100 + (pathname === path ? 10 : 0) + Array.from(params).length};
  }).filter(x => x.score >= 0).sort((a,b) => b.score-a.score)[0]?.href;
}
