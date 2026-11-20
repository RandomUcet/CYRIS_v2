'use client';

import { useEffect, useState } from 'react';
import type { RoleResponse, UnitResponse } from '@cyris/contracts';
import { apiClient } from '@/lib/api-client';
import styles from './LdapTeams.module.css';

type Choice = Pick<UnitResponse | RoleResponse, 'id' | 'slug' | 'name'>;
type Catalog = { units: Choice[]; roles: Choice[]; error?: string };

export function useTeamCatalogs(eventIds: Array<string | undefined>) {
  const ids = [...new Set(eventIds.filter((id): id is string => Boolean(id)))].sort().join(',');
  const [catalogs, setCatalogs] = useState<Record<string, Catalog>>({});
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let current = true;
    setCatalogs({});
    for (const eventId of ids ? ids.split(',') : []) {
      void Promise.all([apiClient.getUnits(eventId), apiClient.getRoles(eventId)]).then(([units, roles]) => {
        if (!current) return;
        const result: Catalog = { units: [], roles: [] };
        if (units.ok && units.data && roles.ok && roles.data) {
          result.units = units.data.filter((unit: UnitResponse) => unit.eventId === eventId && !unit.archivedAt);
          result.roles = roles.data.filter((role: RoleResponse) => role.eventId === eventId);
          result.roles.sort((left, right) => left.name.localeCompare(right.name));
        } else {
          result.error = units.error || roles.error || 'HTTP';
        }
        setCatalogs(previous => ({ ...previous, [eventId]: result }));
      });
    }
    return () => { current = false; };
  }, [ids, revision]);

  return { catalogs, retry: () => setRevision(value => value + 1) };
}

interface Props {
  cs: boolean;
  catalog?: Catalog;
  hasEvent: boolean;
  valueKey: 'id' | 'slug';
  unit: string;
  role: string;
  onUnit: (value: string) => void;
  onRole: (value: string) => void;
  retry: () => void;
  allowEventWide?: boolean;
  disabled?: boolean;
}

export function ExerciseTeamRoles({ cs, catalog, hasEvent, valueKey, unit, role, onUnit, onRole, retry, allowEventWide, disabled }: Props) {
  const pending = disabled || !catalog || Boolean(catalog.error);
  return <>
    <label>{cs ? 'Tým' : 'Team'}
      <select value={unit} onChange={e => onUnit(e.target.value)} disabled={pending} required={!allowEventWide}>
        <option value="">{allowEventWide ? (cs ? 'Celé cvičení (stávající pravidlo)' : 'Whole exercise (existing rule)') : (cs ? 'Vyberte tým' : 'Select a team')}</option>
        {unit && !catalog?.units.some(row => row[valueKey] === unit) && <option value={unit} disabled>{unit}{catalog && (cs ? ' · nedostupný' : ' · unavailable')}</option>}
        {catalog?.units.map(row => <option key={row.id} value={row[valueKey]}>{row.name}</option>)}
      </select>
    </label>
    <label>{cs ? 'Role ve cvičení' : 'Exercise role'}
      <select value={role} onChange={e => onRole(e.target.value)} disabled={pending} required>
        <option value="">{cs ? 'Vyberte roli' : 'Select a role'}</option>
        {role && !catalog?.roles.some(row => row[valueKey] === role) && <option value={role} disabled>{role}{catalog && (cs ? ' · nedostupná' : ' · unavailable')}</option>}
        {catalog?.roles.map(row => <option key={row.id} value={row[valueKey]}>{row.name}</option>)}
      </select>
    </label>
    {hasEvent && !catalog && <p className={styles.full} role="status">{cs ? 'Načítání týmů a rolí…' : 'Loading teams and roles…'}</p>}
    {catalog?.error && <p className={styles.full} role="alert">{cs ? 'Týmy a role se nepodařilo načíst.' : 'Unable to load teams and roles.'} <button className="btn btn-secondary" type="button" onClick={retry}>{cs ? 'Zkusit znovu' : 'Retry'}</button></p>}
    {catalog && !catalog.error && ((!catalog.units.length && !allowEventWide) || !catalog.roles.length) && <p className={styles.full} role="status">{cs ? 'Pro toto cvičení nejdříve vytvořte tým a roli v administraci.' : 'Create a team and an exercise role in Administration first.'}</p>}
  </>;
}
