// The same identifiers drive the exercise catalog, local provisioning and login picker.
export const previewTeams = [
  { slug: 'bezpecnostne-pravni-sluzby', name: 'Bezpečnostně právní služby', login: 'bps' },
  { slug: 'laborator-levanduloveho-oleje', name: 'Laboratoř levandulového oleje', login: 'levandule' },
  { slug: 'kyberneticky-forenzni-tym', name: 'Kybernetický forenzní tým', login: 'kyber' },
  { slug: 'juniorska-zpravodajska-sluzba', name: 'Juniorská zpravodajská služba', login: 'zpravodajci' },
  { slug: 'juniorsky-krizovy-stab', name: 'Juniorský krizový štáb', login: 'stab' },
  { slug: 'chemicky-forenzni-tym', name: 'Chemický forenzní tým', login: 'chemie' },
  { slug: 'zachranna-a-zdravotni-sluzba', name: 'Záchranná a zdravotní služba', login: 'zdravotnici' },
] as const;

export const previewTeamEmail = (login: string) => `${login}@teams.cyris.test`;
