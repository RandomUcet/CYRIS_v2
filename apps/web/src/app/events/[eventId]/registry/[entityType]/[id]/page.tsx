'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { useDialogAccessibility } from '@/hooks/useDialogAccessibility';
import { RecordHeader } from '@/components/common/RecordHeader';
import { RecordTabs } from '@/components/common/RecordTabs';
import { RecordInspector } from '@/components/common/RecordInspector';
import { RecordIdentifier } from '@/components/common/Badges';
import { TimelineView } from '@/components/common/TimelineView';
import { RelationshipGraph } from '@/components/common/RelationshipGraph';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import styles from './registry-detail.module.css';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  Database,
  Share2,
  Clock,
  Layers,
  ArrowRight,
  Plus,
  Users,
  Building2,
  Car,
  Cpu,
  MapPin,
  X,
} from 'lucide-react';

export default function RegistryEntityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const entityType = params.entityType as string; // persons, organisations, vehicles, devices, locations, weapons
  const id = params.id as string;
  const { hasPermission, isPlatformAdmin, viewAs } = useAuth();
  const { formatTime, formatDate, locale } = usePreferences();
  const cs = locale === 'cs';
  const tr = (cz: string, en: string) => cs ? cz : en;
  const canEdit = !viewAs && (isPlatformAdmin || hasPermission('registry.update', eventId));
  const canLink = !viewAs && (isPlatformAdmin || hasPermission('registry.relationship.manage', eventId));

  const [activeTab, setActiveTab] = useState<'overview' | 'relations' | 'timeline'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [entityData, setEntityData] = useState<any>(null);
  const [relationships, setRelationships] = useState<any[]>([]);
  const [timelineItems, setTimelineItems] = useState<any[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  // Add Relationship Modal
  const [showRelModal, setShowRelModal] = useState(false);
  const [targetResourceId, setTargetResourceId] = useState('');
  const [targetQuery, setTargetQuery] = useState('');
  const [searchingTargets, setSearchingTargets] = useState(false);
  const [relType, setRelType] = useState('RELATED_TO');
  const [addingRel, setAddingRel] = useState(false);
  const [relationshipError, setRelationshipError] = useState<string | null>(null);
  const [relationshipTargets, setRelationshipTargets] = useState<Array<{ id: string; label: string }>>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  useDialogAccessibility(editOpen, () => { if (!saving) setEditOpen(false); });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaVersion, setMediaVersion] = useState(0);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const fetchEntityDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      let res;
      if (entityType === 'persons') res = await apiClient.getPerson(eventId, id);
      else if (entityType === 'organisations') res = await apiClient.getOrganisation(eventId, id);
      else if (entityType === 'vehicles') res = await apiClient.getVehicle(eventId, id);
      else if (entityType === 'devices') res = await apiClient.getDevice(eventId, id);
      else if (entityType === 'locations') res = await apiClient.getLocation(eventId, id);
      else if (entityType === 'weapons') res = await apiClient.getWeapon(eventId, id);
      else if (entityType === 'licences') res = await apiClient.getLicence(eventId, id);

      if (res?.ok && res.data) {
        setEntityData(res.data);
      } else {
        setError(res?.error || `Failed to load ${entityType} record`);
      }

      // Fetch relationships for this resource
      const relRes = await apiClient.getRelationships(id);
      if (relRes?.ok && relRes.data) {
        setRelationships(Array.isArray(relRes.data) ? relRes.data : []);
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const fetchTimeline = async () => {
    setTimelineLoading(true);
    try {
      const res = await apiClient.getResourceTimeline(id);
      if (res?.ok && res.data) {
        setTimelineItems(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err) {
      console.error('Failed to load timeline', err);
    } finally {
      setTimelineLoading(false);
    }
  };

  useEffect(() => {
    if (eventId && entityType && id) {
      fetchEntityDetails();
    }
  }, [eventId, entityType, id]);

  useEffect(() => {
    if (id && activeTab === 'timeline') {
      fetchTimeline();
    }
  }, [id, activeTab]);

  // Search only visible records in the selected exercise, without downloading
  // every person, organisation and device into the user's browser.
  useEffect(() => {
    if (!showRelModal || targetQuery.trim().length < 2) {
      setRelationshipTargets([]);
      setSearchingTargets(false);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setSearchingTargets(true);
      void apiClient.searchRegistryRecords(eventId, targetQuery.trim()).then((response) => {
        if (!active) return;
        if (response.ok && response.data) {
          setRelationshipTargets(response.data.filter((target) => target.id !== id).map((target) => ({
            id: target.id, label: `${target.identifier || target.entityType} — ${target.label}`,
          })));
        } else {
          setRelationshipTargets([]);
          setRelationshipError(response.error || 'Could not search the registry');
        }
      }).catch((err) => {
        if (active) setRelationshipError(err instanceof Error ? err.message : String(err));
      }).finally(() => { if (active) setSearchingTargets(false); });
    }, 260);
    return () => { active = false; window.clearTimeout(timer); };
  }, [eventId, id, showRelModal, targetQuery]);

  const handleAddRelationship = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canLink || !targetResourceId.trim() || targetResourceId === id) return;
    setAddingRel(true);
    setRelationshipError(null);
    try {
      const res = await apiClient.createRelationship(id, {
        targetResourceId: targetResourceId.trim(),
        relationshipType: relType,
      });
      if (res.ok) {
        setShowRelModal(false);
        setTargetResourceId('');
        setTargetQuery('');
        fetchEntityDetails();
      } else {
        setRelationshipError(res.error || 'Failed to create relationship');
      }
    } catch (err: any) {
      setRelationshipError(err.message || 'Failed to create relationship');
    } finally {
      setAddingRel(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setSaveError(null);
    const payload = Object.fromEntries(Object.entries(editData).filter(([key, value]) => !['id', 'eventId', 'identifier', 'createdAt', 'updatedAt', 'visibility', 'owningUnitId'].includes(key) && value !== null));
    const update = entityType === 'persons' ? apiClient.updatePerson(eventId, id, payload)
      : entityType === 'organisations' ? apiClient.updateOrganisation(eventId, id, payload)
      : entityType === 'locations' ? apiClient.updateLocation(eventId, id, payload)
      : entityType === 'vehicles' ? apiClient.updateVehicle(eventId, id, payload)
      : entityType === 'devices' ? apiClient.updateDevice(eventId, id, payload)
      : entityType === 'licences' ? apiClient.updateLicence(eventId,id,{
        title:editData.title,category:editData.category,licenceNumber:editData.licenceNumber || null,
        validFrom:editData.validFrom,validUntil:editData.validUntil || null,status:editData.status,description:editData.description || null,
      })
      : apiClient.updateWeapon(eventId, id, payload);
    const result = await update;
    if (result.ok) {
      setEditOpen(false);
      await fetchEntityDetails();
    } else {
      setSaveError(result.error || 'Unable to save record');
    }
    setSaving(false);
  };

  const updateContact = (kind: 'emails' | 'phones', index: number, field: string, value: string | boolean) => {
    const contacts = Array.isArray(editData[kind]) ? [...editData[kind]] : [];
    contacts[index] = { ...contacts[index], [field]: value };
    if (field === 'primary' && value === true) {
      contacts.forEach((contact, contactIndex) => {
        if (contactIndex !== index) contacts[contactIndex] = { ...contact, primary: false };
      });
    }
    setEditData({ ...editData, [kind]: contacts });
  };

  const addContact = (kind: 'emails' | 'phones') => {
    const contacts = Array.isArray(editData[kind]) ? [...editData[kind]] : [];
    contacts.push({ value: '', label: '', primary: contacts.length === 0 });
    setEditData({ ...editData, [kind]: contacts });
  };

  const removeContact = (kind: 'emails' | 'phones', index: number) => {
    const contacts = (Array.isArray(editData[kind]) ? editData[kind] : []).filter((_: any, i: number) => i !== index);
    setEditData({ ...editData, [kind]: contacts });
  };

  const handleMediaUpload = async (file: File) => {
    if (!canEdit || mediaBusy) return;
    setMediaError(null);
    const formats = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    if (!formats.has(file.type) || !file.size || file.size > 5 * 1024 * 1024) {
      setMediaError(tr('Použijte JPEG, PNG, WebP nebo GIF o velikosti maximálně 5 MB.',
        'Use a JPEG, PNG, WebP or GIF image up to 5 MB.'));
      return;
    }
    setMediaBusy(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Unable to read image'));
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.readAsDataURL(file);
      });
      const result = await apiClient.uploadRegistryPrimaryMedia(eventId, id, {
        filename: file.name,
        mimeType: file.type,
        data,
      });
      if (!result.ok) throw new Error(result.error || 'Unable to upload image');
      setMediaVersion((version) => version + 1);
      await fetchEntityDetails();
    } catch (err: any) {
      setMediaError(err.message || 'Unable to upload image');
    } finally {
      setMediaBusy(false);
      if (mediaInputRef.current) mediaInputRef.current.value = '';
    }
  };

  const handleMediaRemove = async () => {
    if (!canEdit || mediaBusy ||
      !window.confirm(tr('Odstranit obrázek tohoto záznamu?', 'Remove this record image?'))) return;
    setMediaBusy(true);
    setMediaError(null);
    try {
      const result = await apiClient.removeRegistryPrimaryMedia(eventId, id);
      if (!result.ok) throw new Error(result.error || 'Unable to remove image');
      setMediaVersion((version) => version + 1);
      await fetchEntityDetails();
    } catch (err: any) {
      setMediaError(err.message || 'Unable to remove image');
    } finally {
      setMediaBusy(false);
    }
  };

  const handleRemoveRelationship = async (relationshipId: string) => {
    if (!canLink || !window.confirm(tr('Opravdu odstranit tuto vazbu?', 'Remove this relationship?'))) return;
    setRelationshipError(null);
    const result = await apiClient.removeRelationship(eventId, relationshipId);
    if (result.ok) await fetchEntityDetails();
    else setRelationshipError(result.error || 'Unable to remove relationship');
  };

  if (loading) {
    return (
      <AppShell
        breadcrumbs={[
          { label: 'Intelligence', href: `/events/${eventId}/registry` },
          { label: entityType, href: `/events/${eventId}/registry` },
          { label: 'Loading...' },
        ]}
      >
        <div style={{ padding: '40px' }}>
          <LoadingState message={`Accessing ${entityType} intelligence record...`} />
        </div>
      </AppShell>
    );
  }

  if (error || !entityData) {
    return (
      <AppShell
        breadcrumbs={[
          { label: 'Intelligence', href: `/events/${eventId}/registry` },
          { label: entityType, href: `/events/${eventId}/registry` },
          { label: 'Error' },
        ]}
      >
        <div style={{ padding: '40px' }}>
          <ErrorState message={error || 'Record not found'} onRetry={fetchEntityDetails} />
        </div>
      </AppShell>
    );
  }

  const getEntityTitle = () => {
    if (entityType === 'persons') {
      return entityData.displayName || [entityData.givenName, entityData.middleName, entityData.familyName].filter(Boolean).join(' ') || id;
    }
    if (entityType === 'organisations') return entityData.name;
    if (entityType === 'vehicles') return `${entityData.label || [entityData.make, entityData.model].filter(Boolean).join(' ')}${entityData.registrationPlate ? ` (${entityData.registrationPlate})` : ''}`;
    if (entityType === 'devices') return `${entityData.label || entityData.deviceType || 'Device'}${entityData.serialNumber ? ` (${entityData.serialNumber})` : ''}`;
    if (entityType === 'locations') return entityData.name;
    if (entityType === 'licences') return entityData.title;
    if (entityType === 'weapons') return `${entityData.category}${entityData.model ? ` — ${entityData.model}` : ''}`;
    return id;
  };

  const getEntityPrefix = () => {
    if (entityType === 'persons') return 'P';
    if (entityType === 'organisations') return 'ORG';
    if (entityType === 'vehicles') return 'VEH';
    if (entityType === 'devices') return 'DEV';
    if (entityType === 'locations') return 'LOC';
    if (entityType === 'weapons') return 'WPN';
    if (entityType === 'licences') return 'LIC';
    return 'RES';
  };

  const editFields: Record<string, Array<[string, string]>> = {
    persons: [['displayName', 'Display name'], ['givenName', 'Given name'], ['middleName', 'Middle name'], ['familyName', 'Family name'], ['dateOfBirth', 'Date of birth'], ['description', 'Notes']],
    organisations: [['name', 'Name'], ['shortName', 'Short name'], ['email', 'Email'], ['phone', 'Phone'], ['website', 'Website'], ['description', 'Notes']],
    locations: [['name', 'Name'], ['locationType', 'Type'], ['addressText', 'Address'], ['city', 'City'], ['region', 'Region'], ['postalCode', 'Postal code'], ['country', 'Country'], ['description', 'Notes']],
    vehicles: [['label', 'Label'], ['registrationPlate', 'Registration plate'], ['make', 'Manufacturer'], ['model', 'Model'], ['variant', 'Variant'], ['modelYear', 'Year'], ['colour', 'Colour'], ['description', 'Notes']],
    devices: [['label', 'Label'], ['deviceType', 'Type'], ['manufacturer', 'Manufacturer'], ['model', 'Model'], ['serialNumber', 'Serial number'], ['assetTag', 'Asset tag'], ['hostname', 'Hostname'], ['operatingSystem', 'Operating system'], ['macAddress', 'MAC address'], ['ipAddress', 'IP address'], ['description', 'Notes']],
    licences: [['title','Title'],['category','Category'],['licenceNumber','Licence number'],['validFrom','Valid from'],['validUntil','Valid until'],['status','Status'],['description','Notes']],
    weapons: [['category', 'Category / type'], ['manufacturer', 'Manufacturer'], ['model', 'Model'], ['serialNumber', 'Serial number'], ['calibre', 'Calibre / descriptor'], ['description', 'Notes']],
  };

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Intelligence', href: `/events/${eventId}/registry` },
        { label: entityType, href: `/events/${eventId}/registry` },
        { label: getEntityTitle() },
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Record Header */}
        <RecordHeader
          identifier={entityData.identifier || id}
          title={getEntityTitle()}
          status={<span className="badge badge-neutral">{entityType.slice(0, -1).toUpperCase()}</span>}
          priority={<span className="badge badge-neutral">{tr('ZÁZNAM REGISTRU', 'REGISTRY RECORD')}</span>}
          classification={<span className="badge badge-neutral">{tr('Viditelnost', 'Visibility')}: {entityData.visibility ?? '—'}</span>}
          actions={
            <div style={{ display: 'flex', gap: '8px' }}>
              <Link href={`/events/${eventId}/registry`} className="btn btn-ghost" style={{ fontSize: '12px' }}>
                {tr('Zpět do registru', 'Back to registry')}
              </Link>
              {canEdit && <button
                onClick={() => { setEditData({ ...entityData }); setEditOpen(true); }}
                className="btn btn-secondary"
                style={{ fontSize: '12px' }}
              >
                {tr('Upravit záznam', 'Edit record')}
              </button>}
              <button
                onClick={() => setInspectorOpen(!inspectorOpen)}
                className={`btn ${inspectorOpen ? 'btn-secondary' : 'btn-ghost'}`}
                style={{ fontSize: '12px' }}
              >
                <Layers size={13} style={{ marginRight: '4px' }} />
                {inspectorOpen ? 'Hide' : 'Inspect'}
              </button>
            </div>
          }
        />

        {/* Tabs */}
        <RecordTabs
          tabs={[
            { id: 'overview', label: tr('Profil záznamu', 'Entity profile'), icon: <Database size={14} /> },
            { id: 'relations', label: tr('Vazby', 'Relationship graph'), count: relationships.length, icon: <Share2 size={14} /> },
            { id: 'timeline', label: tr('Aktivita', 'Operational activity'), count: timelineItems.length, icon: <Clock size={14} /> },
          ]}
          activeTab={activeTab}
          onChange={(tab) => setActiveTab(tab as any)}
        />

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div
                  style={{
                    background: 'var(--color-bg-surface)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '18px 22px',
                  }}
                >
                  {['persons', 'organisations', 'locations', 'vehicles', 'devices', 'weapons'].includes(entityType) && (
                    <div style={{ marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                      <div style={{ width: 72, height: 72, borderRadius: 6, overflow: 'hidden', background: 'var(--color-bg-panel)', border: '1px solid var(--color-border-subtle)', display: 'grid', placeItems: 'center', color: 'var(--color-text-dim)', fontSize: 20 }}>
                        <img
                          key={mediaVersion}
                          src={`${apiClient.getRegistryPrimaryMediaUrl(eventId, id)}?v=${mediaVersion}`}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(event) => { event.currentTarget.style.display = 'none'; }}
                        />
                        {getEntityTitle().slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{tr('Hlavní obrázek', 'Primary image')}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>{tr('Přístupné pouze uživatelům s oprávněním k registru.', 'Visible only to users with registry access.')}</div>
                      </div>
                      {canEdit && (
                        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                          <input
                            ref={mediaInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            hidden
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void handleMediaUpload(file);
                            }}
                          />
                          <button className="btn btn-secondary" type="button" disabled={mediaBusy} onClick={() => mediaInputRef.current?.click()}>
                            {mediaBusy ? tr('Zpracovávám…','Working…') : tr('Nahrát / nahradit','Upload / replace')}
                          </button>
                          <button className="btn btn-ghost" type="button" disabled={mediaBusy} onClick={() => void handleMediaRemove()}>
                            {tr('Odstranit','Remove')}
                          </button>
                        </div>
                      )}
                      {mediaError && <div role="alert" style={{ width: '100%', color: 'var(--color-danger)', fontSize: 12 }}>{mediaError}</div>}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: 'var(--color-text-dim)',
                      letterSpacing: '0.06em',
                      marginBottom: '14px',
                    }}
                  >
                    {tr('Údaje registru', 'Registry profile')}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                    {Object.entries(entityData)
                      .filter(([k]) => !['id', 'createdAt', 'updatedAt', 'eventId', 'owningUnitId'].includes(k))
                      .map(([key, val]) => (
                        <div key={key} style={{ padding: '8px 12px', background: 'var(--color-bg-panel)', borderRadius: 'var(--radius-sm)' }}>
                          <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--color-text-dim)', fontWeight: 600, letterSpacing: '0.05em' }}>
                            {key.replace(/([A-Z])/g, ' $1')}
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-main)', marginTop: '3px', overflowWrap: 'anywhere' }}>
                            {Array.isArray(val) ? (val.length ? val.map((entry) => typeof entry === 'string' ? entry : entry.value).join(', ') : '—') : val ? String(val) : '—'}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Quick Relationship Preview */}
                <div
                  style={{
                    background: 'var(--color-bg-surface)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '12px 16px',
                      background: 'var(--color-bg-panel)',
                      borderBottom: '1px solid var(--color-border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-main)' }}>
                      Connected Entities & Graph Links ({relationships.length})
                    </span>
                    <button
                      onClick={() => setActiveTab('relations')}
                      className="btn btn-ghost"
                      style={{ padding: '2px 6px', fontSize: '11px' }}
                    >
                      View Graph →
                    </button>
                  </div>
                  <div style={{ padding: '8px 12px' }}>
                    {relationships.length === 0 ? (
                      <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: '12px' }}>
                        No relationship links attached to this intelligence record.
                      </div>
                    ) : (
                      relationships.slice(0, 5).map((rel) => (
                        <div
                          key={rel.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 6px',
                            borderBottom: '1px solid var(--color-border-subtle)',
                            fontSize: '12px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '2px 5px',
                                background: 'rgba(2, 132, 199, 0.15)',
                                color: 'var(--color-accent-ops)',
                                borderRadius: '3px',
                              }}
                            >
                              {rel.relationshipType}
                            </span>
                            {(() => {
                              const other = rel.targetResourceId === id ? rel.source : rel.target;
                              const otherId = rel.targetResourceId === id ? rel.sourceResourceId : rel.targetResourceId;
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <RecordIdentifier id={other?.identifier || otherId.slice(0, 8)} prefix="" />
                                  {other?.title && (
                                    <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>
                                      {other.title}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>{formatDate(rel.createdAt)}</span>
                            {canLink && <button className="btn btn-ghost" type="button" style={{ padding: 2 }} onClick={() => void handleRemoveRelationship(rel.id)}
                              aria-label={tr('Odstranit vazbu', 'Remove relationship')}>
                              <X size={13} />
                            </button>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* RELATIONS TAB */}
            {activeTab === 'relations' && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '14px',
                  }}
                >
                  <div style={{ fontSize: '13px', color: 'var(--color-text-dim)' }}>
                    {tr('Vazby a souvislosti, které se vztahují k tomuto záznamu.', 'Connections and relationships associated with this record.')}
                  </div>
                  {canLink && <button
                    onClick={() => setShowRelModal(true)}
                    className="btn btn-primary"
                    style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <Plus size={14} /> {tr('Vytvořit vazbu','Establish graph link')}
                  </button>}
                </div>

                <RelationshipGraph
                  centerResourceId={id}
                  relationships={relationships}
                  currentResourceTitle={getEntityTitle()}
                  currentResourceType={entityType.slice(0, -1).toUpperCase()}
                  height="540px"
                />
              </div>
            )}

            {/* TIMELINE TAB */}
            {activeTab === 'timeline' && (
              <div>
                <div style={{ marginBottom: '14px', fontSize: '13px', color: 'var(--color-text-dim)' }}>
                  {tr('Chronologický přehled událostí souvisejících se záznamem.', 'Chronological activity associated with this record.')}
                </div>
                {timelineLoading ? (
                  <LoadingState message="Reconstructing entity timeline..." />
                ) : (
                  <TimelineView items={timelineItems} />
                )}
              </div>
            )}
          </div>

          {/* Contextual Right Inspector */}
          <RecordInspector
            title="Intelligence Record Controls"
            isOpen={inspectorOpen}
            onClose={() => setInspectorOpen(false)}
            rows={[
              { label: 'Canonical Resource UUID', value: id, copyable: true },
              { label: 'Entity Type', value: entityType.slice(0, -1).toUpperCase() },
              { label: 'Connected Links', value: String(relationships.length) },
              { label: 'Created At', value: formatTime(entityData.createdAt) },
              { label: 'Last Modified', value: formatTime(entityData.updatedAt || entityData.createdAt) },
            ]}
            actions={
              <button
                onClick={() => setShowRelModal(true)}
                className="btn btn-secondary"
                style={{ width: '100%', justifyContent: 'center', display: canLink ? undefined : 'none' }}
                disabled={!canLink}
              >
                {tr('Vytvořit vazbu','Establish link')}
              </button>
            }
          />
        </div>

        {/* Modal: Add Relationship */}
        {showRelModal && canLink && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(2px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '16px',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '460px',
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-strong)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                overflow: 'hidden',
              }}
            >
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
                  <Share2 size={15} color="var(--color-accent-ops)" />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-main)' }}>
                    {tr('Propojit záznamy', 'Connect graph records')}
                  </span>
                </div>
                <button
                  onClick={() => setShowRelModal(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleAddRelationship} style={{ padding: '18px' }}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                    {tr('Cílový záznam registru', 'Target registry record')} *
                  </label>
                  <input type="search" className="input-field" autoFocus maxLength={80}
                    value={targetQuery} onChange={(e) => {
                      setTargetQuery(e.target.value);
                      setTargetResourceId('');
                      setRelationshipTargets([]);
                      setRelationshipError(null);
                    }} placeholder={tr('Hledat podle jména, názvu nebo identifikátoru…', 'Search by name, label or identifier…')}
                    aria-label={tr('Hledat cíl vazby', 'Search relationship target')}
                    style={{ width: '100%', marginBottom: 8 }} />
                  {searchingTargets && <p role="status" className={styles.relationSearchHelp}>
                    {tr('Hledám záznamy…', 'Searching records…')}</p>}
                  <select
                    required
                    value={targetResourceId}
                    onChange={(e) => setTargetResourceId(e.target.value)}
                    className="select-field"
                    style={{ width: '100%' }}
                    disabled={!relationshipTargets.length}
                  >
                    <option value="">{targetQuery.trim().length < 2
                      ? tr('Nejprve zadejte alespoň dva znaky', 'Enter at least two characters')
                      : tr('Vyberte odpovídající záznam', 'Select a matching record')}</option>
                    {relationshipTargets.map((target) => (
                      <option key={target.id} value={target.id}>{target.label}</option>
                    ))}
                  </select>
                  {!searchingTargets && targetQuery.trim().length >= 2 && relationshipTargets.length === 0
                    && !relationshipError && <p className={styles.relationSearchHelp}>
                      {tr('Žádné dostupné záznamy. Zkuste jiný výraz.', 'No accessible records found. Try another search.')}</p>}
                </div>
                {relationshipError && (
                  <div role="alert" style={{ marginBottom: '14px', color: 'var(--color-danger)', fontSize: '12px' }}>
                    {relationshipError}
                  </div>
                )}

                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: '6px' }}>
                    {tr('Typ vazby', 'Relationship type')}
                  </label>
                  <select
                    value={relType}
                    onChange={(e) => setRelType(e.target.value)}
                    className="select-field"
                    style={{ width: '100%' }}
                  >
                    <option value="RELATED_TO">RELATED_TO</option>
                    <option value="EMPLOYED_BY">EMPLOYED_BY</option>
                    <option value="OWNS">OWNS</option>
                    <option value="LOCATED_AT">LOCATED_AT</option>
                    <option value="COMMUNICATED_WITH">COMMUNICATED_WITH</option>
                    <option value="ASSOCIATED_WITH">ASSOCIATED_WITH</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowRelModal(false)}
                    className="btn btn-secondary"
                    disabled={addingRel}
                  >
                    {tr('Zrušit', 'Cancel')}
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={addingRel || !targetResourceId || targetResourceId === id}>
                    {addingRel ? tr('Propojuji…','Connecting…') : tr('Vytvořit vazbu','Connect link')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {editOpen && canEdit && (
          <div className="modal-backdrop" role="presentation">
            <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="registry-edit-title" style={{ maxWidth: 640 }}>
              <div className="modal-header"><h2 id="registry-edit-title">{tr('Upravit záznam', 'Edit record')}</h2><button className="btn btn-ghost" onClick={() => setEditOpen(false)}><X size={16} /></button></div>
              <form onSubmit={handleSave} style={{ display: 'grid', gap: 12 }}>
                {saveError && <div role="alert" style={{ color: 'var(--color-danger)', fontSize: 12 }}>{saveError}</div>}
                {(editFields[entityType] || []).map(([key, label]) => (
                  <label key={key} style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                    {label}
                    {entityType === 'licences' && (key === 'category' || key === 'status') ?
                      <select className="input-field" value={editData[key] || ''} onChange={event=>setEditData({...editData,[key]:event.target.value})}>
                        {(key==='category'?['DRIVING','FIREARMS','PROFESSIONAL','BUSINESS','SECURITY','OTHER']:['ISSUED','SUSPENDED','REVOKED','ARCHIVED']).map(value=><option key={value}>{value}</option>)}
                      </select> :
                      <input type={entityType==='licences' && ['validFrom','validUntil'].includes(key)?'date':'text'} className="input-field" value={editData[key] || ''} onChange={(event) => setEditData({ ...editData, [key]: event.target.value })} />}
                  </label>
                ))}
                {entityType === 'persons' && (['emails', 'phones'] as const).map((kind) => (
                  <fieldset key={kind} style={{ border: '1px solid var(--color-border-subtle)', padding: 10 }}>
                    <legend style={{ fontSize: 12, fontWeight: 600 }}>{kind === 'emails' ? tr('E-mailové adresy','Email addresses') : tr('Telefonní čísla','Phone numbers')}</legend>
                    {(Array.isArray(editData[kind]) ? editData[kind] : []).map((contact: any, index: number) => (
                      <div key={`${kind}-${index}`} className={styles.contactRow}>
                        <input className="input-field" value={contact.value || ''} placeholder={kind === 'emails' ? 'name@example.test' : '+420 …'} onChange={(event) => updateContact(kind, index, 'value', event.target.value)} />
                        <input className="input-field" value={contact.label || ''} placeholder={tr('Popisek', 'Label')} onChange={(event) => updateContact(kind, index, 'label', event.target.value)} />
                        <label style={{ fontSize: 11, whiteSpace: 'nowrap' }}><input type="checkbox" checked={contact.primary === true} onChange={(event) => updateContact(kind, index, 'primary', event.target.checked)} /> {tr('Hlavní', 'Primary')}</label>
                        <button className="btn btn-ghost" type="button" onClick={() => removeContact(kind, index)} aria-label={`Remove ${kind.slice(0, -1)}`}><X size={14} /></button>
                      </div>
                    ))}
                    <button className="btn btn-secondary" type="button" onClick={() => addContact(kind)}>+ {kind === 'emails' ? tr('Přidat e-mail','Add email') : tr('Přidat telefon','Add phone')}</button>
                  </fieldset>
                ))}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditOpen(false)}>{tr('Zrušit', 'Cancel')}</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? tr('Ukládám…', 'Saving…') : tr('Uložit změny', 'Save changes')}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
