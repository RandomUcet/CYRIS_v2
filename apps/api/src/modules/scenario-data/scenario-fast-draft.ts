import type { World, Kind } from './world.js';
import type { ScenarioBlueprint } from '@cyris/contracts';
export { ScenarioBlueprintSchema } from '@cyris/contracts';

// The model only proposes a compact scene vocabulary. It never invents IDs,
// foreign keys, addresses or operational instructions for the dataset.

export function applyScenarioBlueprint(world: World, scene: ScenarioBlueprint): World {
  const choose = (items: string[], i: number) => items[i % items.length]!;
  const note = (kind: Kind, index: number, original: string): string => {
    const focus: Record<Kind, string> = {
      persons: 'Role: ' + choose(scene.roles, index) + '. Activity: ' + choose(scene.activities, index),
      organisations: 'Organisation function: ' + choose(scene.organisations, index) + '. Context: ' + choose(scene.activities, index),
      locations: 'Exercise site: ' + choose(scene.sites, index) + '. Activity: ' + choose(scene.activities, index),
      vehicles: 'Exercise use: ' + choose(scene.equipment, index) + '. Context: ' + choose(scene.activities, index),
      devices: 'Exercise use: ' + choose(scene.equipment, index) + '. Context: ' + choose(scene.activities, index),
      weapons: 'Inert inventory prop used in the fictional scenario; ' + choose(scene.sites, index),
    };
    const prefix = 'Fiktivní scénář: ' + scene.setting + '. ' + focus[kind] + '. ';
    // The registry limits descriptions to 450 characters.
    return (prefix + original).slice(0, 450);
  };
  for (const kind of ['persons', 'organisations', 'locations', 'vehicles', 'devices', 'weapons'] as const) {
    for (const [index, row] of world[kind].entries()) {
      row.description = note(kind, index, row.description);
    }
  }
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
