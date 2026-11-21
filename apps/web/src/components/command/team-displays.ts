import type { CommandReadinessSnapshot } from '@cyris/contracts';

export const levels = {
  1: { cs: 'Katastrofa', en: 'Disaster', color: '#d62d2d' },
  2: { cs: 'Krize', en: 'Crisis', color: '#ff7a18' },
  3: { cs: 'Pohotovost', en: 'Alert', color: '#f3c53b' },
  4: { cs: 'Zvýšená bdělost', en: 'Heightened vigilance', color: '#3b82f6' },
  5: { cs: 'Klid/Mír', en: 'Standby', color: '#29c76f' },
};

export type DisplayTeam = { id: string; name: string; slug: string };

type TeamBrand = {
  code: string;
  accent: string;
  emblem?: string;
  motto?: string;
  masthead?: string;
  mastheadCenter?: string;
};

const intelligence: TeamBrand = {
  code: 'JZS', accent: '#84c9a6', motto: 'Vidět – slyšet – nemluvit',
};
const specialActivities: TeamBrand = {
  code: 'ÚZC', accent: '#d6a741', emblem: 'bps.webp', masthead: 'ÚZC',
  mastheadCenter: 'Útvar zvláštních činností', motto: 'Odbor kriminalistické techniky a expertýz',
};

const teams: Record<string, TeamBrand> = {
  'bezpecnostne-pravni-sluzby': {
    code: 'BPS', accent: '#e6b66f', emblem: 'bps.webp', motto: 'Obrana – právo – odpovědnost',
  },
  'laborator-levanduloveho-oleje': { code: 'LLO', accent: '#c7a5ee' },
  'kyberneticky-forenzni-tym': { code: 'KFT', accent: '#75c8e8' },
  'juniorska-zpravodajska-sluzba': intelligence,
  jzs: intelligence,
  'juniorsky-krizovy-stab': {
    code: 'JKŠ', accent: '#f1a77a', emblem: 'jks.webp', motto: 'Analýza – rozhodnutí – odpovědnost',
  },
  'chemicky-forenzni-tym': { code: 'CHFT', accent: '#acd687' },
  'zachranna-a-zdravotni-sluzba': { code: 'ZZS', accent: '#ef9d9d' },
  'utvar-zvlastnich-cinnosti': specialActivities,
  uzc: specialActivities,
};

export function teamBrand(team: DisplayTeam): TeamBrand {
  return teams[team.slug] ?? {
    code: team.name.trim().split(/\s+/).slice(0, 4).map(word => word[0]).join('').toLocaleUpperCase(),
    accent: '#8ec7d3',
  };
}

export function teamIdentity(team: DisplayTeam): [string, string] {
  const { code, accent } = teamBrand(team);
  return [code, accent];
}

export function publicReadinessChanged(last: CommandReadinessSnapshot | null, next: CommandReadinessSnapshot | null) {
  return Boolean(last && next && next.initialized && last.eventId === next.eventId && next.revision > last.revision);
}

// Audio must react to an actual level transition, never to acknowledgement,
// a changed public message, reconnect or simply enabling the sound control.
// History is not exposed in the public readiness snapshot; intermediate
// transitions missed between polls cannot reliably be reconstructed.
export function defconLevelChanged(last: CommandReadinessSnapshot | null, next: CommandReadinessSnapshot | null): boolean {
  return Boolean(
    last && next &&
    last.eventId === next.eventId &&
    last.initialized && next.initialized &&
    last.level !== null && next.level !== null &&
    next.revision > last.revision &&
    next.level !== last.level
  );
}
