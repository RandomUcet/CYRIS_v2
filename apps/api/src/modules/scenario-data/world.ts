import { ScenarioRowSchemas as rowSchemas, type ScenarioWorld } from '@cyris/contracts';
export { rowSchemas };
import type { ScenarioDataCounts } from '@cyris/contracts';

export type Kind = keyof typeof rowSchemas;
export type World = ScenarioWorld;
export const kinds = Object.keys(rowSchemas) as Kind[];
export const emptyWorld = (): World => ({ persons: [], organisations: [], locations: [], vehicles: [], devices: [], weapons: [] });
export function nameKey(value: string) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').trim().toLowerCase().replace(/\s+/g, ' ');
}
export function fullName(person: { givenName: string; familyName: string }) {
  return person.givenName + ' ' + person.familyName;
}

// Deterministic even for seeds whose initial state is zero.
class Random {
  constructor(private state: number) { }
  next(n: number) {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let x = Math.imul(this.state ^ (this.state >>> 15), this.state | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) % n;
  }
  pick<T>(items: readonly T[]): T { return items[this.next(items.length)]!; }
}

const male = 'Adam Aleš Antonín Bedřich Boris Cyril Dalibor Daniel David Dominik Eduard Filip František Gustav Hynek Igor Jakub Jan Jaroslav Jiří Josef Julius Karel Kryštof Ladislav Leoš Libor Luboš Lukáš Marcel Marek Martin Matěj Matouš Michal Milan Miloš Miroslav Oldřich Ondřej Oskar Otakar Patrik Pavel Petr Prokop Radek Radim Radovan Robert Roman Rostislav Šimon Štěpán Tomáš Václav Viktor Vilém Vladimír Vojtěch Zbyněk Zdeněk'.split(' ');
const female = 'Adéla Alena Alice Amálie Andrea Anna Barbora Beáta Blanka Bohdana Božena Daniela Darina Denisa Diana Dita Eliška Ema Ester Eva Gabriela Hana Helena Ilona Irena Ivana Jarmila Jana Jitka Johana Josefína Julie Kamila Karla Karolína Kateřina Klára Kristýna Lada Lenka Linda Lucie Ludmila Magdalena Marcela Marie Markéta Michaela Milada Milena Monika Natálie Nina Olga Pavla Petra Radka Renata Simona Soňa Sylvie Tereza Vendula Veronika Zora Zuzana'.split(' ');
const surnames = 'Bartoš Beneš Beran Beránek Bílý Blažek Bláha Blatný Bureš Čáp Čech Čermák Černý Čížek David Dlouhý Doležal Dostál Dušek Dvořák Fiala Filip Fišer Hájek Havel Hlaváč Holub Holý Hora Horák Hošek Hrabě Hrubý Janda Janeček Jaroš Jelínek Jeřábek Karásek Kašpar Kavan Klíma Kment Kolář Konečný Kopecký Kopřiva Kos Kotek Koubek Kovář Kozák Král Kratochvíl Krejčí Kříž Kubát Kubíček Kučera Kunc Landa Liška Mach Málek Malina Malý Mareš Matoušek Matula Moravec Musil Navrátil Němec Novák Novotný Pavlík Pešek Pokorný Polák Pražák Procházka Rada Růžička Sedlák Sedláček Skála Slavík Smetana Soukup Staněk Straka Suchý Svoboda Šimek Šmíd Špaček Štěpánek Tichý Tomek Urban Vaněk Veselý Vlach Vlk Vondráček Vrána Zajíc Zeman'.split(' ');
const feminine: Record<string, string> = { Hrabě: 'Hrabětová', Krejčí: 'Krejčí', Vaněk: 'Vaňková', Staněk: 'Staňková' };
function femaleSurname(s: string) {
  return feminine[s] ?? (s.endsWith('ý') ? s.slice(0, -1) + 'á' : s.replace(/ek$/, 'k').replace(/ec$/, 'c').replace(/[ao]$/, '') + 'ová');
}
// Pair names within each language and use the corresponding surname form.
const families = [
  { nationality: 'Czech', male, female, last: surnames, femaleLast: femaleSurname },
  {
    nationality: 'Polish', male: 'Jakub Michał Piotr Paweł Łukasz Kamil Tomasz Mikołaj Wojciech Szymon Igor Karol'.split(' '),
    female: 'Alicja Agata Anna Ewa Joanna Julia Katarzyna Kinga Marta Natalia Zofia Zuzanna'.split(' '),
    last: 'Kowalski Kamiński Zieliński Nowak Lewandowski Woźniak Mazur Krawczyk Wiśniewski Zając Lis Dudek'.split(' '),
    femaleLast: (s: string) => s.replace(/ski$/, 'ska')
  },
  {
    nationality: 'Slovak', male: 'Andrej Matej Michal Pavol Peter Juraj Ľuboš Jozef Ján Marián Tomáš Štefan'.split(' '),
    female: 'Alžbeta Daniela Dorota Iveta Jana Katarína Lucia Martina Natália Petra Soňa Veronika'.split(' '),
    last: 'Kováč Hudák Baláž Krajčír Polák Urban Mráz Bílik Sýkora Švec Černý Kollár'.split(' '),
    femaleLast: femaleSurname
  },
  {
    nationality: 'German', male: 'Anton Ben Elias Felix Jonas Karl Leon Lukas Matthias Moritz Paul Simon'.split(' '),
    female: 'Amelie Anna Clara Emilia Frieda Greta Hannah Johanna Klara Lena Luise Marie'.split(' '),
    last: 'Adler Becker Fischer Frank Hoffmann Keller Klein Koch Meier Roth Schmitt Weber'.split(' '),
    femaleLast: (s: string) => s
  },
];
const identities = families.flatMap(({ nationality, male, female, last, femaleLast }) =>
  [male, female].flatMap((given, gender) => given.flatMap((first, index) => last.map(surname => ({
    first, index, given, nationality, familyName: gender === 0 ? surname : femaleLast(surname),
  })))));
const occupations = ['koordinace přeprav', 'správa budov', 'evidence zásilek', 'plánování směn', 'technická podpora', 'nákup materiálu', 'péče o zákazníky', 'správa dokumentace', 'kontrola kvality', 'účetnictví', 'dispečink', 'správa skladu'];
const notes = ['Přebírá dodávky na ranní směně.', 'Pracuje převážně mimo hlavní provozovnu.', 'Na konci týdne předává souhrn vedoucímu směny.', 'Na pobočku dojíždí vlakem.', 'Střídá kancelář a práci v terénu.', 'Zaškoluje nové členy týmu.', 'V evidenci používá služební kontakt.', 'Po poradě zajišťuje předání dokumentů.'];
const towns = ['Brno', 'Pardubice', 'Jihlava', 'Hradec Králové', 'Liberec', 'Olomouc', 'Plzeň', 'Zlín', 'Tábor', 'Písek', 'Kolín', 'Opava', 'Přerov', 'Náchod', 'Trutnov', 'Cheb'];
const brands = 'Arden Beryl Cedra Doria Efora Felis Granit Helia Irida Jantar Koruna Lumen Meridia Nerin Opál Perla Rondo Solis Tilia Vektor Zefyr'.split(' ');
const sectors = ['doprava', 'měření', 'logistika', 'archivní služby', 'servis', 'laboratoře', 'distribuce', 'projekce', 'energetika', 'správa budov'];
const sites = ['překladiště', 'sklad', 'provozovna', 'archiv', 'depo', 'dílna', 'laboratoř', 'terminál', 'ústředna'];
const streets = ['U Náhonu', 'Za Tratí', 'Na Stráni', 'U Mostu', 'Na Výsluní', 'Pod Lesem', 'U Studny', 'Na Návsi', 'U Rybníka', 'Na Pasece'];
const vehicles = [['Škoda', 'Octavia'], ['Volkswagen', 'Caddy'], ['Ford', 'Transit'], ['Dacia', 'Dokker'], ['Toyota', 'Corolla'], ['Peugeot', 'Partner'], ['Renault', 'Master'], ['Hyundai', 'i30'], ['Citroën', 'Berlingo'], ['Fiat', 'Ducato']];
const devices = [['LAPTOP', 'Lenovo', 'ThinkPad T14'], ['PHONE', 'Samsung', 'Galaxy A54'], ['TABLET', 'Apple', 'iPad Air'], ['ROUTER', 'MikroTik', 'hEX'], ['LAPTOP', 'Dell', 'Latitude 5440'], ['PRINTER', 'Brother', 'HL-L5210'], ['SCANNER', 'Zebra', 'DS2208']];
const props = ['Výuková maketa', 'Výstavní replika', 'Cvičná pomůcka'];

export function localWorld(seed: number, counts: ScenarioDataCounts, taken: Set<string>): World {
  const rng = new Random(seed);
  const world = emptyWorld();
  const used = new Set(taken);
  // Draw pairs without replacement. A second given name expands the pool when
  // thousands of people already exist; no number is ever appended to a name.
  const pool = identities.length;
  for (let round = 0; world.persons.length < counts.persons; round++) {
    const indices = Array.from({ length: pool }, (_, i) => i);
    for (let n = pool; n > 0 && world.persons.length < counts.persons; n--) {
      const slot = rng.next(n);
      const index = indices[slot]!;
      indices[slot] = indices[n - 1]!;
      const identity = identities[index]!;
      const { first, familyName, nationality, given } = identity;
      const givenName = round ? first + ' ' + given[(identity.index + round) % given.length] : first;
      const key = nameKey(fullName({ givenName, familyName }));
      if (used.has(key)) continue;
      used.add(key);
      const dateOfBirth = [1954 + rng.next(48), String(1 + rng.next(12)).padStart(2, '0'), String(1 + rng.next(28)).padStart(2, '0')].join('-');
      world.persons.push({ givenName, familyName, nationality, dateOfBirth, description: `Oblast práce: ${rng.pick(occupations)}. ${rng.pick(notes)}` });
    }
    if (round > Math.max(male.length, female.length) && world.persons.length < counts.persons) throw new Error('Name pool exhausted');
  }
  for (let i = 0; i < counts.organisations; i++) {
    const sector = rng.pick(sectors), city = rng.pick(towns);
    world.organisations.push({ name: `${rng.pick(brands)} ${sector} ${city}`, description: `Regionální pracoviště v oboru ${sector}. Kontaktní místo pro oblast ${city}.` });
  }
  for (let i = 0; i < counts.locations; i++) {
    const locationType = rng.pick(sites), city = rng.pick(towns), street = rng.pick(streets);
    world.locations.push({ name: `${city} – ${locationType} ${street}`, city, country: 'Česko', locationType, description: `Adresa ve scénáři: ${street} ${1 + rng.next(180)}, ${city}.` });
  }
  for (let i = 0; i < counts.vehicles; i++) {
    const [make, model] = rng.pick(vehicles) as [string, string];
    world.vehicles.push({ make, model, modelYear: String(2013 + rng.next(13)), colour: rng.pick(['bílá', 'modrá', 'šedá', 'černá', 'červená', 'stříbrná']), description: rng.pick(['Služební vůz sdílený mezi směnami.', 'Přiřazeno k regionálním výjezdům.', 'Používáno pro přepravu dokumentů.']) });
  }
  for (let i = 0; i < counts.devices; i++) {
    const [deviceType, manufacturer, model] = rng.pick(devices) as [string, string, string];
    world.devices.push({ deviceType, manufacturer, model, description: rng.pick(['Přiděleno vedoucímu směny.', 'V evidenci jako náhradní zařízení.', 'Součást vybavení přepážky.']) });
  }
  for (let i = 0; i < counts.weapons; i++) world.weapons.push({ category: rng.pick(props), manufacturer: rng.pick(brands), model: 'Evidenční série ' + (1 + rng.next(18)), description: 'Neaktivní rekvizita pro evidenční část cvičení.' });
  world.persons.forEach((p, i) => {
    const org = world.organisations[i % world.organisations.length];
    const place = world.locations[(i % world.organisations.length) % world.locations.length];
    if (org && i % 10 < 8) p.description += ' Pracoviště: ' + org.name + (place ? ' (' + place.name + ')' : '') + '.';
  });
  return world;
}

export function samples(w: World) {
  return {
    persons: w.persons.slice(0, 4).map(fullName), organisations: w.organisations.slice(0, 4).map(x => x.name),
    locations: w.locations.slice(0, 4).map(x => x.name), vehicles: w.vehicles.slice(0, 4).map(x => x.make + ' ' + x.model),
    devices: w.devices.slice(0, 4).map(x => x.manufacturer + ' ' + x.model), weapons: w.weapons.slice(0, 4).map(x => x.category + ' ' + x.model),
  };
}
