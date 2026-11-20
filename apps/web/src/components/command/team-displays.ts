import type { CommandReadinessSnapshot } from '@cyris/contracts';

export const levels = {
  1: { cs: 'Katastrofa', en: 'Disaster', color: '#ff7774' },
  2: { cs: 'Krize', en: 'Crisis', color: '#ff9b63' },
  3: { cs: 'Pohotovost', en: 'Alert', color: '#f1cf62' },
  4: { cs: 'Zvýšená bdělost', en: 'Heightened vigilance', color: '#75b6ff' },
  5: { cs: 'Klid / mír', en: 'Standby', color: '#7dd9a9' },
};
const teams: Record<string, [string, string]> = {
  'bezpecnostne-pravni-sluzby': ['BPS', '#e6b66f'],
  'laborator-levanduloveho-oleje': ['LLO', '#c7a5ee'],
  'kyberneticky-forenzni-tym': ['KFT', '#75c8e8'],
  'juniorska-zpravodajska-sluzba': ['JZS', '#84c9a6'],
  'juniorsky-krizovy-stab': ['JKŠ', '#f1a77a'],
  'chemicky-forenzni-tym': ['CHFT', '#acd687'],
  'zachranna-a-zdravotni-sluzba': ['ZZS', '#ef9d9d'],
};
export type DisplayTeam = { id: string; name: string; slug: string };
export function teamIdentity(team: DisplayTeam): [string, string] {
  return teams[team.slug] ?? [team.name.trim().split(/\s+/).map(word => word[0]).slice(0, 4).join('').toLocaleUpperCase(), '#8ec7d3'];
}
export function publicReadinessChanged(last: CommandReadinessSnapshot | null, next: CommandReadinessSnapshot | null) {
  return Boolean(last && next && next.initialized && last.eventId === next.eventId && next.revision > last.revision);
}
