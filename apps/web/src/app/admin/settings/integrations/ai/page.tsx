'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { StatusBadge } from '@/components/common/Badges';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Cpu,
  Plus,
  RefreshCw,
  X,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Trash2,
  Edit2,
  Key,
  ShieldCheck,
  ShieldAlert,
  Server,
  Zap,
} from 'lucide-react';
import type {
  AIProviderResponse,
  CreateAIProviderRequest,
  UpdateAIProviderRequest,
  TestConnectionResponse,
} from '@cyris/contracts';

export default function AdminAIIntegrationsPage() {
  const { isPlatformAdmin } = useAuth();
  const [providers, setProviders] = useState<AIProviderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('https://spark.cylab.local/v1');
  const [chatModel, setChatModel] = useState('');
  const [embeddingEndpoint, setEmbeddingEndpoint] = useState('');
  const [embeddingModel, setEmbeddingModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [clearApiKey, setClearApiKey] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [timeoutSeconds, setTimeoutSeconds] = useState(60);
  const [tlsVerify, setTlsVerify] = useState(true);
  const [enabled, setEnabled] = useState(false);

  // Test Connection State
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; res: TestConnectionResponse } | null>(null);

  const fetchProviders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.listAIProviders();
      if (res.ok && res.data) {
        setProviders(res.data);
      } else {
        setError(res.error || 'Failed to retrieve AI providers');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Network error fetching providers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  const openCreateModal = () => {
    setEditingId(null);
    setName('');
    setEndpoint('https://spark.cylab.local/v1');
    setChatModel('');
    setEmbeddingEndpoint('');
    setEmbeddingModel('');
    setApiKey('');
    setClearApiKey(false);
    setHasExistingKey(false);
    setTimeoutSeconds(60);
    setTlsVerify(true);
    setEnabled(false);
    setFormError(null);
    setShowModal(true);
  };

  const openEditModal = (provider: AIProviderResponse) => {
    setEditingId(provider.id);
    setName(provider.name);
    setEndpoint(provider.endpoint);
    setChatModel(provider.chatModel);
    setEmbeddingEndpoint(provider.embeddingEndpoint || '');
    setEmbeddingModel(provider.embeddingModel || '');
    setApiKey('');
    setClearApiKey(false);
    setHasExistingKey(provider.hasApiKey);
    setTimeoutSeconds(provider.timeoutSeconds);
    setTlsVerify(provider.tlsVerify);
    setEnabled(provider.enabled);
    setFormError(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      if (editingId) {
        const payload: UpdateAIProviderRequest = {
          name,
          endpoint,
          chatModel,
          embeddingEndpoint: embeddingEndpoint.trim() ? embeddingEndpoint.trim() : null,
          embeddingModel: embeddingModel.trim() ? embeddingModel.trim() : null,
          timeoutSeconds: Number(timeoutSeconds),
          tlsVerify,
          enabled,
          apiKey: apiKey.trim() ? apiKey.trim() : undefined,
          clearApiKey,
        };

        const res = await apiClient.updateAIProvider(editingId, payload);
        if (res.ok) {
          setShowModal(false);
          await fetchProviders();
        } else {
          setFormError(res.error || 'Failed to update AI provider');
        }
      } else {
        const payload: CreateAIProviderRequest = {
          name,
          providerType: 'OPENAI_COMPATIBLE',
          endpoint,
          chatModel,
          embeddingEndpoint: embeddingEndpoint.trim() ? embeddingEndpoint.trim() : undefined,
          embeddingModel: embeddingModel.trim() ? embeddingModel.trim() : undefined,
          timeoutSeconds: Number(timeoutSeconds),
          tlsVerify,
          enabled,
          apiKey: apiKey.trim() ? apiKey.trim() : undefined,
        };

        const res = await apiClient.createAIProvider(payload);
        if (res.ok) {
          setShowModal(false);
          await fetchProviders();
        } else {
          setFormError(res.error || 'Failed to create AI provider');
        }
      }
    } catch (err: unknown) {
      setFormError((err as Error).message || 'Submission error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleEnable = async (provider: AIProviderResponse) => {
    try {
      const res = await apiClient.updateAIProvider(provider.id, {
        enabled: !provider.enabled,
      });
      if (res.ok) {
        await fetchProviders();
      } else {
        alert(res.error || 'Failed to toggle status');
      }
    } catch (err: unknown) {
      alert((err as Error).message);
    }
  };

  const handleDelete = async (id: string, providerName: string) => {
    if (!confirm(`Are you sure you want to delete AI Provider "${providerName}"? Associated secrets will be permanently purged.`)) {
      return;
    }
    try {
      const res = await apiClient.deleteAIProvider(id);
      if (res.ok) {
        await fetchProviders();
      } else {
        alert(res.error || 'Failed to delete provider');
      }
    } catch (err: unknown) {
      alert((err as Error).message);
    }
  };

  const handleTestConnection = async (providerId: string) => {
    setTestingId(providerId);
    setTestResult(null);
    try {
      const res = await apiClient.testAIConnection({ providerId });
      if (res.ok && res.data) {
        setTestResult({ id: providerId, res: res.data });
        // Refresh provider list to reflect updated status in DB
        await fetchProviders();
      } else {
        setTestResult({
          id: providerId,
          res: {
            success: false,
            status: 'ERROR',
            error: res.error || 'Failed to perform connection test',
          },
        });
      }
    } catch (err: unknown) {
      setTestResult({
        id: providerId,
        res: {
          success: false,
          status: 'ERROR',
          error: (err as Error).message || 'Test connection failed',
        },
      });
    } finally {
      setTestingId(null);
    }
  };

  if (!isPlatformAdmin) {
    return (
      <AppShell>
        <div style={{ padding: '32px' }}>
          <ErrorState
            title="Access Restricted"
            message="Platform administrator privilege (platform.manage) is required to access integration settings and secret configuration."
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div style={{ padding: '24px 32px' }}>
        {/* Header Breadcrumb & Title */}
        <div style={{ marginBottom: '24px' }}>
          <div
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--color-text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '6px',
            }}
          >
            Administration → Settings → Integrations → Intelligence
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h1
                style={{
                  fontSize: '20px',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  letterSpacing: '-0.01em',
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <Cpu size={22} style={{ color: 'var(--color-accent)' }} />
                CYRIS Intelligence & AI Providers
              </h1>
              <p
                style={{
                  fontSize: '13px',
                  color: 'var(--color-text-secondary)',
                  margin: '4px 0 0 0',
                }}
              >
                Configure OpenAI-compatible inference runtimes (future DGX Spark, NIM, vLLM, or local models).
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={fetchProviders}
                disabled={loading}
                className="btn btn-secondary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 12px',
                  fontSize: '12px',
                }}
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
              <button
                type="button"
                onClick={openCreateModal}
                className="btn btn-primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  fontSize: '12px',
                }}
              >
                <Plus size={14} />
                Add AI Provider
              </button>
            </div>
          </div>
        </div>

        {/* Security & Architectural Notice Banner */}
        <div
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderLeft: '4px solid var(--color-accent)',
            borderRadius: '4px',
            padding: '14px 18px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <ShieldCheck size={18} style={{ color: 'var(--color-accent)', marginTop: '2px', flexShrink: 0 }} />
          <div style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
            <strong style={{ color: 'var(--color-text-primary)' }}>Air-Gapped & DGX Spark Ready Architecture:</strong>{' '}
            AI providers communicate exclusively via isolated HTTP API gateways. NVIDIA DGX Spark and external models never receive direct PostgreSQL credentials or unrestricted data.
            API keys are envelope-encrypted at rest using <code>CYRIS_MASTER_KEY</code> (AES-256-GCM) and are never exposed back to client browsers.
            CYRIS remains fully operational when zero AI providers are configured or when compute is offline.
          </div>
        </div>

        {/* Content Area */}
        {loading ? (
          <LoadingState message="Loading integration providers..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchProviders} />
        ) : providers.length === 0 ? (
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px dashed var(--color-border)',
              borderRadius: '6px',
              padding: '48px 24px',
              textAlign: 'center',
            }}
          >
            <Server size={32} style={{ color: 'var(--color-text-secondary)', opacity: 0.5, marginBottom: '12px' }} />
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 6px 0' }}>
              No AI Provider Configured
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', maxWidth: '440px', margin: '0 auto 20px auto' }}>
              CYRIS is operating in standard deterministic mode. To enable operational writing assist, case summaries, or timeline causation analysis, configure an OpenAI-compatible endpoint.
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '8px 16px' }}
            >
              <Plus size={14} />
              Add First Provider
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {providers.map((p) => {
              const activeTest = testResult?.id === p.id ? testResult.res : null;
              const isTesting = testingId === p.id;

              return (
                <div
                  key={p.id}
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    padding: '18px 20px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '4px',
                          backgroundColor: p.enabled ? 'rgba(46, 125, 50, 0.1)' : 'var(--color-bg)',
                          border: '1px solid var(--color-border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Cpu size={16} style={{ color: p.enabled ? 'var(--color-success)' : 'var(--color-text-secondary)' }} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                            {p.name}
                          </span>
                          <span
                            style={{
                              fontSize: '10px',
                              fontFamily: 'var(--font-mono, monospace)',
                              backgroundColor: 'var(--color-bg)',
                              padding: '2px 6px',
                              borderRadius: '3px',
                              border: '1px solid var(--color-border)',
                              color: 'var(--color-text-secondary)',
                            }}
                          >
                            {p.providerType}
                          </span>
                          {p.enabled ? (
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 600,
                                color: '#166534',
                                backgroundColor: '#dcfce7',
                                padding: '2px 7px',
                                borderRadius: '10px',
                              }}
                            >
                              ACTIVE
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: '10px',
                                color: 'var(--color-text-secondary)',
                                backgroundColor: 'var(--color-bg)',
                                padding: '2px 7px',
                                borderRadius: '10px',
                                border: '1px solid var(--color-border)',
                              }}
                            >
                              DISABLED
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono, monospace)',
                            color: 'var(--color-text-secondary)',
                            marginTop: '3px',
                          }}
                        >
                          {p.endpoint}
                        </div>
                      </div>
                    </div>

                    {/* Action Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => handleTestConnection(p.id)}
                        disabled={isTesting}
                        className="btn btn-secondary"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '11px',
                          padding: '5px 10px',
                        }}
                      >
                        <Radio size={12} className={isTesting ? 'animate-spin' : ''} />
                        {isTesting ? 'Probing...' : 'Test Connection'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleEnable(p)}
                        className="btn btn-secondary"
                        style={{
                          fontSize: '11px',
                          padding: '5px 10px',
                        }}
                      >
                        {p.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(p)}
                        className="btn btn-secondary"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          padding: '5px 10px',
                        }}
                      >
                        <Edit2 size={12} />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id, p.name)}
                        className="btn btn-danger"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          padding: '5px 9px',
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Metadata & Status Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '12px',
                      backgroundColor: 'var(--color-bg)',
                      padding: '12px 14px',
                      borderRadius: '4px',
                      border: '1px solid var(--color-border)',
                      fontSize: '12px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                        Chat Model
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 500, marginTop: '2px' }}>
                        {p.chatModel}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                        Embedding Model
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono, monospace)', marginTop: '2px' }}>
                        {p.embeddingModel || 'None (Keyword / Typesense only)'}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                        Authentication Key
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                        <Key size={12} style={{ color: p.hasApiKey ? 'var(--color-accent)' : 'var(--color-text-secondary)' }} />
                        <span>{p.hasApiKey ? 'Configured (Encrypted at rest)' : 'Not configured'}</span>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                        Timeout & TLS
                      </div>
                      <div style={{ marginTop: '2px' }}>
                        {p.timeoutSeconds}s • {p.endpoint.startsWith('https://')
                          ? (p.tlsVerify ? 'TLS verification enabled' : 'TLS verification disabled')
                          : 'HTTP'}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                        Capabilities
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '3px' }}>
                        {p.capabilities.map((c) => (
                          <span
                            key={c}
                            style={{
                              fontSize: '9px',
                              fontFamily: 'var(--font-mono, monospace)',
                              backgroundColor: 'var(--color-surface)',
                              border: '1px solid var(--color-border)',
                              padding: '1px 5px',
                              borderRadius: '2px',
                            }}
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Test Connection Inline Output */}
                  {activeTest && (
                    <div
                      style={{
                        marginTop: '12px',
                        padding: '10px 14px',
                        borderRadius: '4px',
                        backgroundColor: activeTest.success ? 'rgba(46, 125, 50, 0.08)' : 'rgba(211, 47, 47, 0.08)',
                        border: `1px solid ${activeTest.success ? 'rgba(46, 125, 50, 0.3)' : 'rgba(211, 47, 47, 0.3)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {activeTest.success ? (
                          <CheckCircle2 size={16} style={{ color: 'var(--color-success)' }} />
                        ) : (
                          <AlertTriangle size={16} style={{ color: 'var(--color-danger)' }} />
                        )}
                        <div>
                          <strong style={{ color: activeTest.success ? 'var(--color-success)' : 'var(--color-danger)' }}>
                            {activeTest.success ? 'Connection Successful' : 'Connection Failed'}
                          </strong>
                          {activeTest.success ? (
                            <div style={{ color: 'var(--color-text-secondary)', marginLeft: '8px' }}>
                              <div>Latency: {activeTest.latencyMs}ms • Chat model: {activeTest.resolvedModel}</div>
                              {activeTest.embedding && (
                                <div style={{ marginTop: '2px' }}>
                                  Embeddings: {activeTest.embedding.status}
                                  {activeTest.embedding.resolvedModel ? ` • ${activeTest.embedding.resolvedModel}` : ''}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div style={{ color: 'var(--color-text-primary)', marginTop: '2px' }}>
                              {activeTest.error}
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTestResult(null)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Create / Edit Provider Modal */}
        {showModal && (
          <div
            className="dialog-overlay"
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '20px',
            }}
          >
            <div
              className="dialog-surface"
              style={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                width: '100%',
                maxWidth: '560px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '90vh',
                overflow: 'hidden',
              }}
            >
              {/* Modal Header */}
              <div
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid var(--color-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Cpu size={18} style={{ color: 'var(--color-accent)' }} />
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {editingId ? 'Edit AI Provider' : 'Add AI Provider'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleSave} style={{ overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {formError && (
                  <div
                    style={{
                      padding: '10px 12px',
                      backgroundColor: 'rgba(211, 47, 47, 0.08)',
                      border: '1px solid rgba(211, 47, 47, 0.3)',
                      borderRadius: '4px',
                      fontSize: '12px',
                      color: 'var(--color-danger)',
                    }}
                  >
                    {formError}
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                    Display Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. NVIDIA DGX Spark or vLLM Local Inference"
                    className="input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                    Chat Endpoint
                  </label>
                  <input
                    type="url"
                    required
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    placeholder="http://spark-host:8000/v1"
                    className="input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: '13px', fontFamily: 'var(--font-mono, monospace)' }}
                  />
                  <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                    OpenAI-compatible endpoint exposing <code>/chat/completions</code>.
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                    Embedding Endpoint
                  </label>
                  <input
                    type="url"
                    value={embeddingEndpoint}
                    onChange={(e) => setEmbeddingEndpoint(e.target.value)}
                    placeholder="Optional, for example http://spark-host:8001/v1"
                    className="input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: '13px', fontFamily: 'var(--font-mono, monospace)' }}
                  />
                  <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                    Optional. Leave empty when chat and embeddings use the same OpenAI-compatible endpoint.
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                      Chat Model *
                    </label>
                    <input
                      type="text"
                      required
                      value={chatModel}
                      onChange={(e) => setChatModel(e.target.value)}
                      placeholder="e.g. meta/llama-3.1-70b-instruct"
                      className="input"
                      style={{ width: '100%', padding: '8px 10px', fontSize: '13px', fontFamily: 'var(--font-mono, monospace)' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                      Embedding Model (Optional)
                    </label>
                    <input
                      type="text"
                      value={embeddingModel}
                      onChange={(e) => setEmbeddingModel(e.target.value)}
                      placeholder="e.g. bge-large-en-v1.5"
                      className="input"
                      style={{ width: '100%', padding: '8px 10px', fontSize: '13px', fontFamily: 'var(--font-mono, monospace)' }}
                    />
                  </div>
                </div>

                {/* API Key / Secret Storage */}
                <div style={{ backgroundColor: 'var(--color-bg)', padding: '12px', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                    API Authentication Key (Optional)
                  </label>
                  {hasExistingKey && !clearApiKey ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CheckCircle2 size={13} />
                        Secret key configured (AES-256-GCM encrypted)
                      </span>
                      <button
                        type="button"
                        onClick={() => setClearApiKey(true)}
                        className="btn btn-secondary"
                        style={{ fontSize: '11px', padding: '3px 8px', color: 'var(--color-danger)' }}
                      >
                        Remove Key
                      </button>
                    </div>
                  ) : clearApiKey ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--color-danger)' }}>
                        Key flagged for removal on save.
                      </span>
                      <button
                        type="button"
                        onClick={() => setClearApiKey(false)}
                        className="btn btn-secondary"
                        style={{ fontSize: '11px', padding: '3px 8px' }}
                      >
                        Keep Existing
                      </button>
                    </div>
                  ) : null}

                  <input
                    type="password"
                    autoComplete="new-password"
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      if (clearApiKey) setClearApiKey(false);
                    }}
                    placeholder={hasExistingKey ? 'Enter new key to replace existing secret...' : 'Bearer API Key (leave empty if DGX Spark requires no auth)'}
                    className="input"
                    style={{ width: '100%', padding: '8px 10px', fontSize: '13px' }}
                  />
                  <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                    Stored strictly in isolated encrypted storage. Never exposed in API responses or logs.
                  </div>
                </div>

                {/* Timeout & TLS Verification */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'center' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                      Request Timeout (Seconds)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={300}
                      value={timeoutSeconds}
                      onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                      className="input"
                      style={{ width: '100%', padding: '8px 10px', fontSize: '13px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '18px' }}>
                      <input
                        type="checkbox"
                        checked={tlsVerify}
                        onChange={(e) => setTlsVerify(e.target.checked)}
                      />
                      <span style={{ fontSize: '12px', fontWeight: 500 }}>
                        Verify TLS Certificate
                      </span>
                    </label>
                  </div>
                </div>

                {!tlsVerify && (
                  <div
                    style={{
                      padding: '8px 12px',
                      backgroundColor: 'rgba(237, 108, 2, 0.1)',
                      border: '1px solid rgba(237, 108, 2, 0.4)',
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: '#c25e00',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                    <span>
                      <strong>Warning:</strong> Insecure TLS override active. Only use this on isolated lab networks with private self-signed certificates.
                    </span>
                  </div>
                )}

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setEnabled(e.target.checked)}
                    />
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>
                      Set as Active AI Provider for CYRIS
                    </span>
                  </label>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginLeft: '24px', marginTop: '2px' }}>
                    Enabling this provider activates Writing Assist, Case Summarization, and Timeline Causation across operational views.
                  </div>
                </div>

                {/* Modal Footer */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '10px',
                    marginTop: '12px',
                    paddingTop: '16px',
                    borderTop: '1px solid var(--color-border)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="btn btn-secondary"
                    style={{ padding: '8px 14px', fontSize: '12px' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn btn-primary"
                    style={{ padding: '8px 18px', fontSize: '12px' }}
                  >
                    {submitting ? 'Saving...' : editingId ? 'Update Provider' : 'Create Provider'}
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
