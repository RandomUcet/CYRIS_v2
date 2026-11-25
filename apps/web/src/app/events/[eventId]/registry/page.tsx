'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { useDialogAccessibility } from '@/hooks/useDialogAccessibility';
import { DataTable, Column } from '@/components/common/DataTable';
import { FilterBar } from '@/components/common/FilterBar';
import { RecordIdentifier } from '@/components/common/Badges';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  Database,
  Users,
  Building2,
  Car,
  Cpu,
  MapPin,
  Plus,
  RefreshCw,
  X,
  ArrowRight,
} from 'lucide-react';

type RegistryTab = 'persons' | 'organisations' | 'vehicles' | 'devices' | 'locations' | 'weapons' | 'licences';

export default function RegistryPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const { hasPermission, viewAs,currentUser } = useAuth();
  const { formatDate, t } = usePreferences();

  const [activeTab, setActiveTab] = useState<RegistryTab>('persons');
  const [dataList, setDataList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [provenanceFilter, setProvenanceFilter] = useState('');

  // Creation Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  useDialogAccessibility(showCreateModal, () => { if (!submitting) setShowCreateModal(false); });
  const [formError, setFormError] = useState<string | null>(null);

  // Dynamic form state
  const [formData, setFormData] = useState<Record<string, any>>({});

  const canManage = !viewAs && hasPermission('registry.create', eventId) && (activeTab !== 'licences' || hasPermission('registry.relationship.manage', eventId));
  const [licenceParties,setLicenceParties] = useState<{persons:any[];organisations:any[]}>({persons:[],organisations:[]});
  const [partiesError,setPartiesError] = useState('');
  useEffect(() => {
    if (!showCreateModal || activeTab !== 'licences') return;
    let cancelled = false;
    setLicenceParties({persons:[],organisations:[]});
    setPartiesError('');
    Promise.all([apiClient.getPersons(eventId),apiClient.getOrganisations(eventId)]).then(([p,o]) => {
      if (cancelled) return;
      if (!p.ok || !o.ok) setPartiesError('Unable to load eligible registry records');
      else setLicenceParties({persons:p.data || [],organisations:o.data || []});
    }).catch(() => {if (!cancelled) setPartiesError('Unable to load registry records');});
    return () => {cancelled = true;};
  },[showCreateModal,activeTab,eventId]);

  const requestId = React.useRef(0);
  const [loadedScope,setLoadedScope] = useState('');
  const scope = JSON.stringify([eventId,activeTab,currentUser?.user.id,viewAs?.targetUserId,hasPermission('registry.read',eventId),canManage]);
  const currentScope = React.useRef(scope);
  currentScope.current = scope;
  const fetchData = async () => {
    if (scope !== currentScope.current) return;
    const request = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      let res;
      if (activeTab === 'persons') res = await apiClient.getPersons(eventId);
      else if (activeTab === 'organisations') res = await apiClient.getOrganisations(eventId);
      else if (activeTab === 'vehicles') res = await apiClient.getVehicles(eventId);
      else if (activeTab === 'devices') res = await apiClient.getDevices(eventId);
      else if (activeTab === 'locations') res = await apiClient.getLocations(eventId);
      else if (activeTab === 'weapons') res = await apiClient.getWeapons(eventId);
      else if (activeTab === 'licences') res = await apiClient.getLicences(eventId);

      if (request !== requestId.current || scope !== currentScope.current) return;
      if (res?.ok && res.data) {
        setDataList(res.data);
        setLoadedScope(scope);
      } else {
        setError(res?.error || `Failed to load ${activeTab}`);
      }
    } catch (err: any) {
      if (request === requestId.current && scope === currentScope.current) setError(err.message || 'Network error');
    } finally {
      if (request === requestId.current && scope === currentScope.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchData();
    }
    return () => {++requestId.current;};
  }, [scope]);

  const filteredData = useMemo(() => {
    if (loadedScope !== scope) return [];
    return dataList.filter((item) => {
      if (provenanceFilter && item.provenance !== provenanceFilter) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        item.id?.toLowerCase().includes(s) ||
        item.identifier?.toLowerCase().includes(s) ||
        item.displayName?.toLowerCase().includes(s) ||
        item.firstName?.toLowerCase().includes(s) ||
        item.lastName?.toLowerCase().includes(s) ||
        item.name?.toLowerCase().includes(s) ||
        item.title?.toLowerCase().includes(s) ||
        item.registrationPlate?.toLowerCase().includes(s) ||
        item.licensePlate?.toLowerCase().includes(s) ||
        item.serialNumber?.toLowerCase().includes(s) ||
        item.assetTag?.toLowerCase().includes(s) ||
        item.hostname?.toLowerCase().includes(s) ||
        item.city?.toLowerCase().includes(s) ||
        item.country?.toLowerCase().includes(s) ||
        item.address?.toLowerCase().includes(s)
        || item.category?.toLowerCase().includes(s)
        || item.manufacturer?.toLowerCase().includes(s)
        || item.licenceNumber?.toLowerCase().includes(s)
      );
    });
  }, [dataList, search, provenanceFilter, loadedScope, scope]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!canManage||submitting||scope!==currentScope.current)return;
    setSubmitting(true);
    setFormError(null);
    try {
      let res;
      if (activeTab === 'persons') {
        const givenName = formData.firstName?.trim() || undefined;
        const familyName = formData.lastName?.trim() || undefined;
        res = await apiClient.createPerson(eventId, {
          displayName: [givenName, familyName].filter(Boolean).join(' '),
          givenName,
          middleName: formData.middleName?.trim() || undefined,
          familyName,
          dateOfBirth: formData.dateOfBirth || undefined,
          description: formData.notes?.trim() || undefined,
          aliases: formData.alias ? [formData.alias.trim()] : [],
          emails: formData.email ? [{ value: formData.email.trim(), label: 'Primary', primary: true }] : [],
          phones: formData.phone ? [{ value: formData.phone.trim(), label: 'Primary', primary: true }] : [],
        });
      } else if (activeTab === 'organisations') {
        res = await apiClient.createOrganisation(eventId, {
          name: formData.name?.trim(),
          shortName: formData.shortName?.trim() || undefined,
          email: formData.email?.trim() || undefined,
          phone: formData.phone?.trim() || undefined,
          website: formData.website?.trim() || undefined,
          registrationNumber: formData.registrationNumber?.trim() || undefined,
          description: formData.notes?.trim() || undefined,
        });
      } else if (activeTab === 'vehicles') {
        res = await apiClient.createVehicle(eventId, {
          label: [formData.make, formData.model].filter(Boolean).join(' ').trim() || formData.licensePlate?.trim(),
          make: formData.make?.trim(),
          model: formData.model?.trim(),
          registrationPlate: formData.licensePlate?.trim(),
          vin: formData.vin?.trim() || undefined,
          colour: formData.color?.trim() || undefined,
          variant: formData.variant?.trim() || undefined,
          modelYear: formData.modelYear?.trim() || undefined,
        });
      } else if (activeTab === 'devices') {
        res = await apiClient.createDevice(eventId, {
          label: [formData.make, formData.model].filter(Boolean).join(' ').trim() || formData.deviceType || 'Device',
          deviceType: formData.deviceType || 'LAPTOP',
          manufacturer: formData.make?.trim() || undefined,
          model: formData.model?.trim() || undefined,
          serialNumber: formData.serialNumber?.trim() || undefined,
          macAddress: formData.macAddress?.trim() || undefined,
          ipAddress: formData.ipAddress?.trim() || undefined,
          assetTag: formData.assetTag?.trim() || undefined,
          hostname: formData.hostname?.trim() || undefined,
          operatingSystem: formData.operatingSystem?.trim() || undefined,
        });
      } else if (activeTab === 'locations') {
        res = await apiClient.createLocation(eventId, {
          name: formData.name?.trim(),
          addressText: formData.address?.trim() || undefined,
          city: formData.city?.trim() || undefined,
          postalCode: formData.postalCode?.trim() || undefined,
          latitude: formData.latitude ? Number(formData.latitude) : undefined,
          longitude: formData.longitude ? Number(formData.longitude) : undefined,
        });
      } else if (activeTab === 'licences') {
        res = await apiClient.createLicence(eventId,{
          title:formData.title?.trim(),category:formData.category || 'OTHER',
          holderId:formData.holderId,issuerId:formData.issuerId,
          licenceNumber:formData.licenceNumber?.trim() || undefined,
          validFrom:formData.validFrom,validUntil:formData.validUntil || null,
          status:formData.status || 'ISSUED',description:formData.notes?.trim() || undefined,
        });
      } else if (activeTab === 'weapons') {
        res = await apiClient.createWeapon(eventId, {
          category: formData.category?.trim(),
          manufacturer: formData.manufacturer?.trim() || undefined,
          model: formData.model?.trim() || undefined,
          serialNumber: formData.serialNumber?.trim() || undefined,
          calibre: formData.calibre?.trim() || undefined,
          description: formData.notes?.trim() || undefined,
        });
      }

      if (res?.ok) {
        setShowCreateModal(false);
        setFormData({});
        fetchData();
      } else {
        setFormError(res?.error || 'Registration failed');
      }
    } catch (err: any) {
      setFormError(err.message || 'Error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const getColumns = (): Column<any>[] => {
    if (activeTab === 'persons') {
      return [
        {
          header: 'Identifier',
          accessor: (item) => <RecordIdentifier id={item.identifier || item.id} prefix={item.identifier ? '' : 'PER'} />,
          width: '120px',
        },
        {
          header: 'Full Name',
          accessor: (item) => (
            <span style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>
              {item.displayName}
            </span>
          ),
          sortKey: 'lastName',
        },
        {
          header: 'National ID / Passport',
          accessor: (item) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{item.emails?.[0]?.value || '—'}</span>,
          width: '180px',
        },
        {
          header: 'Date of Birth',
          accessor: (item) => (
            <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>
              {item.dateOfBirth ? formatDate(item.dateOfBirth) : '—'}
            </span>
          ),
          width: '120px',
        },
        {
          header: 'Notes / Aliases',
          accessor: (item) => (
            <span style={{ fontSize: '12px', color: 'var(--color-text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>
              {item.aliases?.join(', ') || '—'}
            </span>
          ),
        },
      ];
    }

    if (activeTab === 'organisations') {
      return [
        {
          header: 'Identifier',
          accessor: (item) => <RecordIdentifier id={item.identifier || item.id} prefix={item.identifier ? '' : 'ORG'} />,
          width: '120px',
        },
        {
          header: 'Organisation Name',
          accessor: (item) => <span style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>{item.name}</span>,
          sortKey: 'name',
        },
        {
          header: 'Reg Number / IČO',
          accessor: (item) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{item.registrationNumber || '—'}</span>,
          width: '160px',
        },
        {
          header: 'Entity Type',
          accessor: (item) => <span className="badge badge-neutral">{item.type || 'COMMERCIAL'}</span>,
          width: '130px',
        },
        {
          header: 'Notes',
          accessor: (item) => <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>{item.notes || '—'}</span>,
        },
      ];
    }

    if (activeTab === 'licences') {
      return [
        {header:'Identifier',accessor:item=><RecordIdentifier id={item.identifier || item.id} />,width:'130px'},
        {header:'Licence / permit',accessor:item=><span style={{fontWeight:600}}>{item.title}</span>},
        {header:'Category',accessor:item=>item.category},
        {header:'Number',accessor:item=>item.licenceNumber || '—'},
        {header:'Valid from',accessor:item=>item.validFrom},
        {header:'Valid until',accessor:item=>item.validUntil || '—'},
        {header:'Exercise validity',accessor:item=><span title={item.asOfDate||''}>{item.effectiveStatus??'—'}</span>},
        {header:'Status',accessor:item=>item.status},
      ];
    }
    if (activeTab === 'weapons') {
      return [
        { header: 'Identifier', accessor: (item) => <RecordIdentifier value={item.identifier} id={item.id} prefix={item.identifier ? '' : 'WPN'} />, width: '130px' },
        { header: 'Category', accessor: (item) => <span style={{ fontWeight: 600 }}>{item.category}</span> },
        { header: 'Manufacturer / Model', accessor: (item) => <span>{[item.manufacturer, item.model].filter(Boolean).join(' ') || '—'}</span> },
        { header: 'Serial', accessor: (item) => <span>{item.serialNumber || '—'}</span> },
        { header: 'Status', accessor: (item) => <span>{item.status}</span> },
      ];
    }

    if (activeTab === 'vehicles') {
      return [
        {
          header: 'Identifier',
          accessor: (item) => <RecordIdentifier id={item.identifier || item.id} prefix={item.identifier ? '' : 'VEH'} />,
          width: '120px',
        },
        {
          header: 'License Plate (SPZ)',
          accessor: (item) => (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                fontSize: '13px',
                padding: '2px 6px',
                background: 'var(--color-bg-subtle)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '3px',
                color: 'var(--color-text-main)',
              }}
            >
              {item.registrationPlate || 'NO PLATE'}
            </span>
          ),
          sortKey: 'registrationPlate',
          width: '160px',
        },
        {
          header: 'Make & Model',
          accessor: (item) => (
            <span style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>
              {item.make} {item.model}
            </span>
          ),
        },
        {
          header: 'Color',
          accessor: (item) => <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>{item.colour || '—'}</span>,
          width: '110px',
        },
        {
          header: 'VIN',
          accessor: (item) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-dim)' }}>{item.vin || '—'}</span>,
          width: '180px',
        },
      ];
    }

    if (activeTab === 'devices') {
      return [
        {
          header: 'Identifier',
          accessor: (item) => <RecordIdentifier id={item.identifier || item.id} prefix={item.identifier ? '' : 'DEV'} />,
          width: '120px',
        },
        {
          header: 'Device Type',
          accessor: (item) => <span className="badge badge-neutral">{item.deviceType || 'DEVICE'}</span>,
          width: '130px',
        },
        {
          header: 'Hardware Specs',
          accessor: (item) => (
            <span style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>
              {item.manufacturer || ''} {item.model || ''}
            </span>
          ),
        },
        {
          header: 'Serial Number',
          accessor: (item) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{item.serialNumber || '—'}</span>,
          width: '160px',
        },
        {
          header: 'IP / MAC Address',
          accessor: (item) => (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-dim)' }}>
              {item.ipAddress || item.macAddress || '—'}
            </span>
          ),
          width: '160px',
        },
      ];
    }

    // Locations
    return [
      {
        header: 'Identifier',
        accessor: (item) => <RecordIdentifier id={item.identifier || item.id} prefix={item.identifier ? '' : 'LOC'} />,
        width: '120px',
      },
      {
        header: 'Location Name',
        accessor: (item) => <span style={{ fontWeight: 600, color: 'var(--color-text-main)' }}>{item.name}</span>,
        sortKey: 'name',
      },
      {
        header: 'Street Address',
        accessor: (item) => <span style={{ fontSize: '12px' }}>{item.addressText || '—'}</span>,
      },
      {
        header: 'City',
        accessor: (item) => <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>{item.city || '—'}</span>,
        width: '140px',
      },
      {
        header: 'Coordinates',
        accessor: (item) => (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-dim)' }}>
            {item.latitude && item.longitude ? `${item.latitude}, ${item.longitude}` : '—'}
          </span>
        ),
        width: '150px',
      },
    ];
  };

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Intelligence' },
        { label: 'Registry' },
      ]}
    >
      <div style={{ padding: '20px 24px' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
            borderBottom: '1px solid var(--color-border-subtle)',
            paddingBottom: '16px',
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: '20px',
                fontWeight: 700,
                color: 'var(--color-text-main)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                letterSpacing: '-0.01em',
              }}
            >
              <Database size={20} color="var(--color-accent-ops)" />
              {t('page.registry.title')}
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--color-text-dim)' }}>
              {t('page.registry.subtitle')}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={fetchData}
              className="btn btn-secondary"
              title="Refresh register"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              {t('action.refresh')}
            </button>
            {canManage && (
              <button
                onClick={() => {
                  setFormData({});
                  setShowCreateModal(true);
                }}
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={15} />
                Register {activeTab.slice(0, -1)}
              </button>
            )}
          </div>
        </div>

        {/* Tab Strip */}
        <div
          style={{
            display: 'flex',
            gap: '6px',
            marginBottom: '16px',
            borderBottom: '1px solid var(--color-border-subtle)',
            paddingBottom: '10px',
          }}
        >
          {[
            { id: 'persons', label: 'Persons', icon: <Users size={14} /> },
            { id: 'organisations', label: 'Organisations', icon: <Building2 size={14} /> },
            { id: 'vehicles', label: 'Vehicles', icon: <Car size={14} /> },
            { id: 'devices', label: 'Devices', icon: <Cpu size={14} /> },
            { id: 'locations', label: 'Locations', icon: <MapPin size={14} /> },
            { id: 'weapons', label: 'Weapons', icon: <Database size={14} /> },
            { id: 'licences', label: 'Licences & permits', icon: <Database size={14} /> },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as RegistryTab);
                  setSearch('');
                  setProvenanceFilter('');
                }}
                className={`btn ${isActive ? 'btn-primary' : 'btn-ghost'}`}
                style={{
                  fontSize: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Filter Bar */}
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={`Search ${activeTab} by name, identifier, plate or attributes...`}
          onReset={() => {
            setSearch('');
            setProvenanceFilter('');
          }}
          totalResults={filteredData.length}
        />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: '0 0 18px', fontSize: 12, color: 'var(--text-secondary)' }}>
          Provenance
          <select value={provenanceFilter} onChange={(event) => setProvenanceFilter(event.target.value)} style={{ padding: '6px 8px' }}>
            <option value="">All sources</option>
            <option value="MANUAL">Manual</option>
            <option value="SYNTHETIC">Synthetic</option>
            <option value="IMPORTED">Imported</option>
            <option value="SYSTEM">System</option>
          </select>
        </label>

        {/* Content */}
        {loading ? (
          <LoadingState message={`Querying ${activeTab} directory...`} />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchData} />
        ) : dataList.length === 0 ? (
          <EmptyState
            title={`No ${activeTab} registered`}
            description={`The ${activeTab} directory is currently empty for this exercise event.`}
            actionLabel={canManage ? `Register First ${activeTab.slice(0, -1)}` : undefined}
            onAction={canManage ? () => setShowCreateModal(true) : undefined}
          />
        ) : (
          <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <DataTable
              columns={getColumns()}
              data={filteredData}
              keyExtractor={(item) => item.id}
              onRowClick={(item) => router.push(`/events/${eventId}/registry/${activeTab}/${item.id}`)}
              emptyMessage={`No ${activeTab} match your active filter.`}
            />
          </div>
        )}

        {/* Modal: Register Entity */}
        {showCreateModal && canManage && (
          <div className="dialog-overlay dialog-overlay-top" role="presentation">
            <div className="dialog-surface form-dialog-surface" role="dialog" aria-modal="true" aria-label="Register Intelligence Entity" style={{ maxWidth: '500px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  background: 'var(--color-bg-panel)',
                  borderBottom: '1px solid var(--color-border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Database size={16} color="var(--color-accent-ops)" />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-main)' }}>
                    Register {activeTab.slice(0, -1).toUpperCase()} in Intelligence Directory
                  </span>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreate} style={{ padding: '18px' }}>
                {formError && (
                  <div
                    style={{
                      padding: '8px 12px',
                      marginBottom: '14px',
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid var(--color-danger)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '12px',
                      color: 'var(--color-danger)',
                    }}
                  >
                    {formError}
                  </div>
                )}

                {/* Form fields depending on activeTab */}
                {activeTab === 'persons' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                          First Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.firstName || ''}
                          onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                          className="input-field"
                          style={{ width: '100%' }}
                          autoFocus
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                          Last Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.lastName || ''}
                          onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                          className="input-field"
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                      <label style={{ display: 'grid', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)' }}>
                        Middle Name
                        <input className="input-field" value={formData.middleName || ''} onChange={(e) => setFormData({ ...formData, middleName: e.target.value })} />
                      </label>
                      <label style={{ display: 'grid', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)' }}>
                        Alias
                        <input className="input-field" value={formData.alias || ''} onChange={(e) => setFormData({ ...formData, alias: e.target.value })} />
                      </label>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                      <label style={{ display: 'grid', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)' }}>
                        Primary email
                        <input type="email" className="input-field" value={formData.email || ''} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                      </label>
                      <label style={{ display: 'grid', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)' }}>
                        Primary phone
                        <input className="input-field" value={formData.phone || ''} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                      </label>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                          National ID / Passport
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 880512/1234"
                          value={formData.nationalId || ''}
                          onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })}
                          className="input-field"
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                          Date of Birth
                        </label>
                        <input
                          type="date"
                          value={formData.dateOfBirth || ''}
                          onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                          className="input-field"
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                        Intelligence Notes / Aliases
                      </label>
                      <textarea
                        rows={3}
                        value={formData.notes || ''}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className="input-field"
                        style={{ width: '100%', resize: 'vertical' }}
                      />
                    </div>
                  </>
                )}

                {activeTab === 'organisations' && (
                  <>
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                        Organisation Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. EnergoGrid Systems a.s."
                        value={formData.name || ''}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="input-field"
                        style={{ width: '100%' }}
                        autoFocus
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                      <label style={{ display: 'grid', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)' }}>
                        Short name
                        <input className="input-field" value={formData.shortName || ''} onChange={(e) => setFormData({ ...formData, shortName: e.target.value })} />
                      </label>
                      <label style={{ display: 'grid', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)' }}>
                        Email
                        <input type="email" className="input-field" value={formData.email || ''} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                      </label>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                      <label style={{ display: 'grid', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)' }}>
                        Phone
                        <input className="input-field" value={formData.phone || ''} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                      </label>
                      <label style={{ display: 'grid', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--color-text-dim)' }}>
                        Website
                        <input type="url" className="input-field" value={formData.website || ''} onChange={(e) => setFormData({ ...formData, website: e.target.value })} />
                      </label>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                          IČO / Registration #
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 28491823"
                          value={formData.registrationNumber || ''}
                          onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value })}
                          className="input-field"
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                          Entity Type
                        </label>
                        <select
                          value={formData.type || 'CORPORATION'}
                          onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                          className="select-field"
                          style={{ width: '100%' }}
                        >
                          <option value="CORPORATION">Corporation</option>
                          <option value="GOVERNMENT">Government Agency</option>
                          <option value="NGO">NGO</option>
                          <option value="ACADEMIC">Academic</option>
                          <option value="CRITICAL_INFRASTRUCTURE">Critical Infrastructure</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                        Context / Description
                      </label>
                      <textarea
                        rows={3}
                        value={formData.notes || ''}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className="input-field"
                        style={{ width: '100%', resize: 'vertical' }}
                      />
                    </div>
                  </>
                )}

                {activeTab === 'vehicles' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                          License Plate (SPZ) *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. 2AB 9482"
                          value={formData.licensePlate || ''}
                          onChange={(e) => setFormData({ ...formData, licensePlate: e.target.value })}
                          className="input-field"
                          style={{ width: '100%' }}
                          autoFocus
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                          Color
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Dark Grey"
                          value={formData.color || ''}
                          onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                          className="input-field"
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                          Make *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Skoda"
                          value={formData.make || ''}
                          onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                          className="input-field"
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                          Model *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Octavia Combi"
                          value={formData.model || ''}
                          onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                          className="input-field"
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                        VIN
                      </label>
                      <input
                        type="text"
                        placeholder="17-character VIN"
                        value={formData.vin || ''}
                        onChange={(e) => setFormData({ ...formData, vin: e.target.value })}
                        className="input-field"
                        style={{ width: '100%' }}
                      />
                    </div>
                  </>
                )}

                {activeTab === 'devices' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                          Device Type *
                        </label>
                        <select
                          value={formData.deviceType || 'LAPTOP'}
                          onChange={(e) => setFormData({ ...formData, deviceType: e.target.value })}
                          className="select-field"
                          style={{ width: '100%' }}
                        >
                          <option value="LAPTOP">Laptop</option>
                          <option value="SERVER">Server / Host</option>
                          <option value="PHONE">Mobile Phone</option>
                          <option value="ROUTER">Router / Switch</option>
                          <option value="IOT">IoT / SCADA Controller</option>
                          <option value="STORAGE">Storage / NAS</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                          Serial Number
                        </label>
                        <input
                          type="text"
                          placeholder="Hardware SN"
                          value={formData.serialNumber || ''}
                          onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                          className="input-field"
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                          Make & Model
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Lenovo ThinkPad T14"
                          value={formData.make || ''}
                          onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                          className="input-field"
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                          IP / MAC Address
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 192.168.1.104"
                          value={formData.ipAddress || ''}
                          onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
                          className="input-field"
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                  </>
                )}

                {activeTab === 'locations' && (
                  <>
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                        Location Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Central Data Center Brno"
                        value={formData.name || ''}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="input-field"
                        style={{ width: '100%' }}
                        autoFocus
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '14px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                          Address
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Technologická 2"
                          value={formData.address || ''}
                          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                          className="input-field"
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                          City
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Brno"
                          value={formData.city || ''}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                          className="input-field"
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                          Latitude
                        </label>
                        <input
                          type="number"
                          step="any"
                          placeholder="e.g. 49.1951"
                          value={formData.latitude || ''}
                          onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                          className="input-field"
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                          Longitude
                        </label>
                        <input
                          type="number"
                          step="any"
                          placeholder="e.g. 16.6068"
                          value={formData.longitude || ''}
                          onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                          className="input-field"
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                  </>
                )}

                {activeTab === 'licences' && (
                  <div style={{display:'grid',gap:12,marginBottom:16}}>
                    {partiesError && <p role="alert">{partiesError}</p>}
                    <label className="form-label">Licence title<input required maxLength={200} className="input-field" style={{width:'100%'}} value={formData.title || ''} onChange={e=>setFormData({...formData,title:e.target.value})}/></label>
                    <label className="form-label">Category<select className="input-field" style={{width:'100%'}} value={formData.category || 'OTHER'} onChange={e=>setFormData({...formData,category:e.target.value})}>{['DRIVING','FIREARMS','PROFESSIONAL','BUSINESS','SECURITY','OTHER'].map(v=><option key={v}>{v}</option>)}</select></label>
                    <label className="form-label">Holder<select required className="input-field" style={{width:'100%'}} value={formData.holderId || ''} onChange={e=>setFormData({...formData,holderId:e.target.value})}><option value="">Select holder</option><optgroup label="Persons">{licenceParties.persons.map(p=><option key={p.id} value={p.id}>{p.displayName} · {p.identifier}</option>)}</optgroup><optgroup label="Organisations">{licenceParties.organisations.map(o=><option key={o.id} value={o.id}>{o.name} · {o.identifier}</option>)}</optgroup></select></label>
                    <label className="form-label">Issuing authority<select required className="input-field" style={{width:'100%'}} value={formData.issuerId || ''} onChange={e=>setFormData({...formData,issuerId:e.target.value})}><option value="">Select organisation</option>{licenceParties.organisations.filter(o=>o.id!==formData.holderId).map(o=><option key={o.id} value={o.id}>{o.name} · {o.identifier}</option>)}</select></label>
                    <label className="form-label">Licence number<input maxLength={100} className="input-field" style={{width:'100%'}} value={formData.licenceNumber || ''} onChange={e=>setFormData({...formData,licenceNumber:e.target.value})}/></label>
                    <label className="form-label">Valid from<input required type="date" className="input-field" style={{width:'100%'}} value={formData.validFrom || ''} onChange={e=>setFormData({...formData,validFrom:e.target.value})}/></label>
                    <label className="form-label">Valid until (optional)<input type="date" min={formData.validFrom || undefined} className="input-field" style={{width:'100%'}} value={formData.validUntil || ''} onChange={e=>setFormData({...formData,validUntil:e.target.value})}/></label>
                    <label className="form-label">Status<select className="input-field" style={{width:'100%'}} value={formData.status || 'ISSUED'} onChange={e=>setFormData({...formData,status:e.target.value})}>{['ISSUED','SUSPENDED','REVOKED','ARCHIVED'].map(v=><option key={v}>{v}</option>)}</select></label>
                    <label className="form-label">Notes<textarea rows={3} className="input-field" style={{width:'100%'}} value={formData.notes || ''} onChange={e=>setFormData({...formData,notes:e.target.value})}/></label>
                  </div>
                )}
                {activeTab === 'weapons' && (
                  <>
                    <div style={{ marginBottom: '14px' }}>
                      <label className="form-label">Category / Type *</label>
                      <input required className="input-field" style={{ width: '100%' }} value={formData.category || ''} onChange={(e) => setFormData({ ...formData, category: e.target.value })} autoFocus />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                      <div><label className="form-label">Manufacturer</label><input className="input-field" style={{ width: '100%' }} value={formData.manufacturer || ''} onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })} /></div>
                      <div><label className="form-label">Model</label><input className="input-field" style={{ width: '100%' }} value={formData.model || ''} onChange={(e) => setFormData({ ...formData, model: e.target.value })} /></div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                      <div><label className="form-label">Serial number</label><input className="input-field" style={{ width: '100%' }} value={formData.serialNumber || ''} onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })} /></div>
                      <div><label className="form-label">Calibre / descriptor</label><input className="input-field" style={{ width: '100%' }} value={formData.calibre || ''} onChange={(e) => setFormData({ ...formData, calibre: e.target.value })} /></div>
                    </div>
                    <div><label className="form-label">Notes</label><textarea rows={3} className="input-field" style={{ width: '100%', resize: 'vertical' }} value={formData.notes || ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} /></div>
                  </>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="btn btn-secondary"
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? 'Registering...' : 'Register Entity'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
