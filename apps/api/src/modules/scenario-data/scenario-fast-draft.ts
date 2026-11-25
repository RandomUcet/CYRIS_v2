import type { World, Kind } from './world.js';
import type { ScenarioBlueprint } from '@cyris/contracts';
export { ScenarioBlueprintSchema } from '@cyris/contracts';

// The model only proposes a compact scene vocabulary. It never invents IDs,
// foreign keys, addresses or operational instructions for the dataset.

export function applyScenarioBlueprint(world: World, scene: ScenarioBlueprint, locale='cs'): World {
  const choose = (items: string[], i: number) => items[i % items.length]!;
  const cs=locale!=='en';
  const label=(cz:string,en:string)=>cs?cz:en;
  // Keep stable identity/index slots but use the actual scenario vocabulary
  // for workplace names and sites instead of unrelated random industries.
  world.organisations.forEach((org,i)=>{
    org.name=choose(scene.organisations,i).slice(0,110)+' · '+(i+1);
    org.description=label('Fiktivní organizace: ','Fictional organisation: ')+choose(scene.organisations,i)+'. '+choose(scene.activities,i)+'.';
  });
  world.locations.forEach((site,i)=>{
    site.locationType=choose(scene.sites,i).slice(0,64);
    site.name=(site.city+' – '+choose(scene.sites,i)).slice(0,110)+' · '+(i+1);
    site.description=label('Místo ve cvičení: ','Exercise location: ')+site.name+'. '+choose(scene.activities,i)+'.';
  });
  const note=(kind:Kind,index:number):string=>{
    const org=world.organisations[index%world.organisations.length];
    const workplace=index%10<8&&org?label(' Pracoviště: ',' Workplace: ')+org.name+'.':'';
    const focus:Record<Kind,string>={
      persons:label('Role: ','Role: ')+choose(scene.roles,index)+'. '+label('Činnost: ','Activity: ')+choose(scene.activities,index)+'.'+workplace,
      organisations:world.organisations[index]?.description??'',
      locations:world.locations[index]?.description??'',
      vehicles:label('Účel vozidla: ','Vehicle use: ')+choose(scene.equipment,index)+'.',
      devices:label('Účel zařízení: ','Device use: ')+choose(scene.equipment,index)+'.',
      weapons:label('Neaktivní evidenční rekvizita.','Inert inventory prop.'),
    };
    return (label('Fiktivní scénář: ','Fictional scenario: ')+scene.setting+'. '+focus[kind]).slice(0,450);
  };
  for(const kind of ['persons','organisations','locations','vehicles','devices','weapons'] as const)
    world[kind].forEach((row,i)=>{row.description=note(kind,i);});
  return world;
}

/** Exact indexed relationships, equivalent to the deterministic LOCAL generator. */
export function fastDraftLinks(world: World): Array<{
  source: Kind; index: number; target: Kind; targetIndex: number; relation: string;
}> {
  const links: Array<{ source: Kind; index: number; target: Kind; targetIndex: number; relation: string }> = [];
  const add = (source: Kind, index: number, target: Kind, targetIndex: number, relation: string) => {
    if (world[source][index] && world[target][targetIndex]) {
      links.push({ source, index, target, targetIndex, relation });
    }
  };
  world.persons.forEach((_, i) => {
    if (world.organisations.length && i % 10 < 8) add('persons', i, 'organisations', i % world.organisations.length, 'EMPLOYED_BY');
    if (world.vehicles.length && i % 3 === 0) add('persons', i, 'vehicles', i % world.vehicles.length, 'OWNER_OF');
    if (world.devices.length && i % 2 === 0) add('persons', i, 'devices', i % world.devices.length, 'USES');
  });
  world.organisations.forEach((_, i) => {
    if (world.locations.length) add('organisations', i, 'locations', i % world.locations.length, 'LOCATED_AT');
  });
  world.vehicles.forEach((_, i) => {
    if (world.locations.length && i % 2 === 0) add('vehicles', i, 'locations', i % world.locations.length, 'LOCATED_AT');
  });
  world.devices.forEach((_, i) => {
    if (world.locations.length && i % 3 === 0) add('devices', i, 'locations', i % world.locations.length, 'LOCATED_AT');
  });
  world.weapons.forEach((_, i) => {
    if (world.persons.length && i % 2 === 0) add('weapons', i, 'persons', i % world.persons.length, 'RELATED_TO');
  });
  return links;
}
