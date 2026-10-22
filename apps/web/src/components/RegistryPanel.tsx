'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';

interface RegistryPanelProps {
  eventId: string;
}

export function RegistryPanel({ eventId }: RegistryPanelProps) {
  const [tab, setTab] = useState<'persons' | 'organisations' | 'vehicles' | 'relationships'>('persons');
  const [persons, setPersons] = useState<any[]>([]);
  const [organisations, setOrganisations] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [personForm, setPersonForm] = useState({ displayName: '', givenName: '', familyName: '', nationality: '' });
  const [orgForm, setOrgForm] = useState({ name: '', legalName: '', registrationNumber: '' });
  const [vehicleForm, setVehicleForm] = useState({ label: '', registrationPlate: '', make: '', model: '', colour: '' });
  const [relForm, setRelForm] = useState({ sourceId: '', targetId: '', relationshipType: 'member_of' });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, oRes, vRes] = await Promise.all([
        apiClient.getPersons(eventId),
        apiClient.getOrganisations(eventId),
        apiClient.getVehicles(eventId),
      ]);
      if (pRes.ok && pRes.data) setPersons(pRes.data);
      if (oRes.ok && oRes.data) setOrganisations(oRes.data);
      if (vRes.ok && vRes.data) setVehicles(vRes.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [eventId]);

  const handleCreatePerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!personForm.displayName) return;
    const res = await apiClient.createPerson(eventId, personForm);
    if (res.ok) {
      setPersonForm({ displayName: '', givenName: '', familyName: '', nationality: '' });
      await loadData();
    } else {
      setError(res.error || 'Failed to create person');
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgForm.name) return;
    const res = await apiClient.createOrganisation(eventId, orgForm);
    if (res.ok) {
      setOrgForm({ name: '', legalName: '', registrationNumber: '' });
      await loadData();
    } else {
      setError(res.error || 'Failed to create organisation');
    }
  };

  const handleCreateVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleForm.label) return;
    const res = await apiClient.createVehicle(eventId, vehicleForm);
    if (res.ok) {
      setVehicleForm({ label: '', registrationPlate: '', make: '', model: '', colour: '' });
      await loadData();
    } else {
      setError(res.error || 'Failed to create vehicle');
    }
  };

  const handleCreateRelationship = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!relForm.sourceId || !relForm.targetId) return;
    const res = await apiClient.createRelationship(relForm.sourceId, {
      targetResourceId: relForm.targetId,
      relationshipType: relForm.relationshipType,
    });
    if (res.ok) {
      setRelForm({ sourceId: '', targetId: '', relationshipType: 'member_of' });
      alert('Relationship created successfully');
    } else {
      setError(res.error || 'Failed to create relationship');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)' }}>
        <button
          className={`tab-btn ${tab === 'persons' ? 'active' : ''}`}
          onClick={() => setTab('persons')}
          style={{ padding: '0.5rem 1rem', background: tab === 'persons' ? 'var(--card-hover)' : 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
        >
          Persons ({persons.length})
        </button>
        <button
          className={`tab-btn ${tab === 'organisations' ? 'active' : ''}`}
          onClick={() => setTab('organisations')}
          style={{ padding: '0.5rem 1rem', background: tab === 'organisations' ? 'var(--card-hover)' : 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
        >
          Organisations ({organisations.length})
        </button>
        <button
          className={`tab-btn ${tab === 'vehicles' ? 'active' : ''}`}
          onClick={() => setTab('vehicles')}
          style={{ padding: '0.5rem 1rem', background: tab === 'vehicles' ? 'var(--card-hover)' : 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
        >
          Vehicles ({vehicles.length})
        </button>
        <button
          className={`tab-btn ${tab === 'relationships' ? 'active' : ''}`}
          onClick={() => setTab('relationships')}
          style={{ padding: '0.5rem 1rem', background: tab === 'relationships' ? 'var(--card-hover)' : 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
        >
          Link Resources
        </button>
      </div>

      {error && <div style={{ color: '#ef4444', padding: '0.5rem', background: '#fee2e2', borderRadius: '4px' }}>{error}</div>}

      {tab === 'persons' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
          <form onSubmit={handleCreatePerson} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h4>Add Person</h4>
            <input
              placeholder="Display Name *"
              value={personForm.displayName}
              onChange={(e) => setPersonForm({ ...personForm, displayName: e.target.value })}
              required
            />
            <input
              placeholder="Given Name"
              value={personForm.givenName}
              onChange={(e) => setPersonForm({ ...personForm, givenName: e.target.value })}
            />
            <input
              placeholder="Family Name"
              value={personForm.familyName}
              onChange={(e) => setPersonForm({ ...personForm, familyName: e.target.value })}
            />
            <input
              placeholder="Nationality"
              value={personForm.nationality}
              onChange={(e) => setPersonForm({ ...personForm, nationality: e.target.value })}
            />
            <button type="submit">Create Person</button>
          </form>

          <div>
            <h4>Persons List</h4>
            {loading ? <p>Loading...</p> : persons.length === 0 ? <p>No persons registered.</p> : (
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {persons.map((p) => (
                  <li key={p.id} style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '4px' }}>
                    <strong>{p.displayName}</strong> {p.nationality && <span>({p.nationality})</span>}
                    <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>ID: {p.id} · Status: {p.status}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'organisations' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
          <form onSubmit={handleCreateOrg} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h4>Add Organisation</h4>
            <input
              placeholder="Organisation Name *"
              value={orgForm.name}
              onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
              required
            />
            <input
              placeholder="Legal Name"
              value={orgForm.legalName}
              onChange={(e) => setOrgForm({ ...orgForm, legalName: e.target.value })}
            />
            <input
              placeholder="Registration Number"
              value={orgForm.registrationNumber}
              onChange={(e) => setOrgForm({ ...orgForm, registrationNumber: e.target.value })}
            />
            <button type="submit">Create Organisation</button>
          </form>

          <div>
            <h4>Organisations List</h4>
            {loading ? <p>Loading...</p> : organisations.length === 0 ? <p>No organisations registered.</p> : (
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {organisations.map((o) => (
                  <li key={o.id} style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '4px' }}>
                    <strong>{o.name}</strong> {o.registrationNumber && <span>(Reg: {o.registrationNumber})</span>}
                    <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>ID: {o.id} · Status: {o.status}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'vehicles' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
          <form onSubmit={handleCreateVehicle} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h4>Add Vehicle</h4>
            <input
              placeholder="Label *"
              value={vehicleForm.label}
              onChange={(e) => setVehicleForm({ ...vehicleForm, label: e.target.value })}
              required
            />
            <input
              placeholder="Plate Number"
              value={vehicleForm.registrationPlate}
              onChange={(e) => setVehicleForm({ ...vehicleForm, registrationPlate: e.target.value })}
            />
            <input
              placeholder="Make"
              value={vehicleForm.make}
              onChange={(e) => setVehicleForm({ ...vehicleForm, make: e.target.value })}
            />
            <input
              placeholder="Model"
              value={vehicleForm.model}
              onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
            />
            <input
              placeholder="Colour"
              value={vehicleForm.colour}
              onChange={(e) => setVehicleForm({ ...vehicleForm, colour: e.target.value })}
            />
            <button type="submit">Create Vehicle</button>
          </form>

          <div>
            <h4>Vehicles List</h4>
            {loading ? <p>Loading...</p> : vehicles.length === 0 ? <p>No vehicles registered.</p> : (
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {vehicles.map((v) => (
                  <li key={v.id} style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '4px' }}>
                    <strong>{v.label}</strong> {v.registrationPlate && <span>[{v.registrationPlate}]</span>}
                    <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                      {v.make} {v.model} ({v.colour}) · ID: {v.id}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'relationships' && (
        <form onSubmit={handleCreateRelationship} style={{ maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h4>Link Two Resources</h4>
          <input
            placeholder="Source Resource UUID *"
            value={relForm.sourceId}
            onChange={(e) => setRelForm({ ...relForm, sourceId: e.target.value })}
            required
          />
          <select
            value={relForm.relationshipType}
            onChange={(e) => setRelForm({ ...relForm, relationshipType: e.target.value })}
          >
            <option value="member_of">member_of</option>
            <option value="owns">owns</option>
            <option value="observed_at">observed_at</option>
            <option value="uses">uses</option>
            <option value="associated_with">associated_with</option>
            <option value="related_to">related_to</option>
          </select>
          <input
            placeholder="Target Resource UUID *"
            value={relForm.targetId}
            onChange={(e) => setRelForm({ ...relForm, targetId: e.target.value })}
            required
          />
          <button type="submit">Establish Relationship</button>
        </form>
      )}
    </div>
  );
}
