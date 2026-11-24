'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable, Column } from '@/components/common/DataTable';
import { FilterBar } from '@/components/common/FilterBar';
import { RecordIdentifier, StatusBadge } from '@/components/common/Badges';
import { LoadingState, EmptyState, ErrorState } from '@/components/common/StateViews';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { workspaceLabel } from '@/lib/workspace-navigation';
import { FileText, Upload, Download, RefreshCw, X, History, FileCheck } from 'lucide-react';
import type { DocumentItem, DocumentDetail } from '@cyris/contracts';

export default function DocumentsPage(){
  const {eventId}=useParams<{eventId:string}>();
  const {currentUser,viewAs}=useAuth();
  return <DocumentsWorkspace key={[eventId,currentUser?.user.id??'',viewAs?.id??''].join(':')} eventId={eventId}/>;
}
function DocumentsWorkspace({eventId}:{eventId:string}){
  const {hasPermission,viewAs}=useAuth();
  const { formatTime, locale } = usePreferences();
  const tr = (label: string) => workspaceLabel(locale, label);

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Selected document detail drawer
  const [selectedDoc, setSelectedDoc] = useState<DocumentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Upload Document Modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    description: '',
    documentType: 'REPORT',
    visibility: 'EVENT',
    file: null as File | null,
  });

  // Upload Version Modal
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [versionNote, setVersionNote] = useState('');
  const [versionFile, setVersionFile] = useState<File | null>(null);

  const canUpload=!viewAs&&(hasPermission('document.create',eventId)||hasPermission('platform.manage'));
  const canVersion=!viewAs&&(hasPermission('document.version',eventId)||hasPermission('platform.manage'));

  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.listDocuments(eventId, {
        documentType: typeFilter || undefined,
        status: statusFilter || undefined,
      });
      if (res.ok && res.data) {
        setDocuments(res.data.items);
      } else {
        setError(res.error || 'Failed to load documents');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      fetchDocuments();
    }
  }, [eventId, typeFilter, statusFilter]);

  const openDocumentDetail = async (docId: string) => {
    setDetailLoading(true);
    try {
      const res = await apiClient.getDocument(eventId, docId);
      if (res.ok && res.data) {
        setSelectedDoc(res.data);
      }
    } catch {
      // ignore
    } finally {
      setDetailLoading(false);
    }
  };

  const handleFileRead = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // strip data:...;base64,
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!canUpload||uploading)return;
    if (!uploadForm.file) {
      setUploadError('Please select a file to upload');
      return;
    }
    setUploading(true);
    setUploadError(null);

    try {
      const base64Data = await handleFileRead(uploadForm.file);
      const res = await apiClient.uploadDocument(eventId, {
        title: uploadForm.title.trim() || uploadForm.file.name,
        description: uploadForm.description.trim() || undefined,
        documentType: uploadForm.documentType,
        visibility: uploadForm.visibility,
        filename: uploadForm.file.name,
        mimeType: uploadForm.file.type || 'application/octet-stream',
        data: base64Data,
      });

      if (res.ok) {
        setShowUploadModal(false);
        setUploadForm({ title: '', description: '', documentType: 'REPORT', visibility: 'EVENT', file: null });
        fetchDocuments();
      } else {
        setUploadError(res.error || 'Upload failed');
      }
    } catch (err: any) {
      setUploadError(err.message || 'Error reading file');
    } finally {
      setUploading(false);
    }
  };

  const handleVersionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canVersion||uploading||!selectedDoc || !versionFile) return;

    setUploading(true);
    setUploadError(null);
    try {
      const base64Data = await handleFileRead(versionFile);
      const res = await apiClient.uploadDocumentVersion(eventId, selectedDoc.id, {
        filename: versionFile.name,
        mimeType: versionFile.type || 'application/octet-stream',
        data: base64Data,
        changeNote: versionNote.trim() || undefined,
      });

      if (res.ok && res.data) {
        setSelectedDoc(res.data);
        setShowVersionModal(false);
        setVersionFile(null);
        setVersionNote('');
        fetchDocuments();
      } else {
        setUploadError(res.error || 'Failed to upload new version');
      }
    } catch (err: any) {
      setUploadError(err.message || 'Error reading file');
    } finally {
      setUploading(false);
    }
  };

  const filteredDocs = useMemo(() => {
    return documents.filter((d) => {
      const matchSearch =
        search === '' ||
        d.title.toLowerCase().includes(search.toLowerCase()) ||
        d.originalFilename.toLowerCase().includes(search.toLowerCase()) ||
        (d.documentNumber && d.documentNumber.toLowerCase().includes(search.toLowerCase()));
      return matchSearch;
    });
  }, [documents, search]);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const columns: Column<DocumentItem>[] = [
    {
      key: 'documentNumber',
      header: tr("Identifier"),
      width: '120px',
      render: (d) => <RecordIdentifier id={d.documentNumber || d.id.slice(0, 8)} prefix="DOC" />,
    },
    {
      key: 'title',
      header: 'Document / File',
      render: (d) => (
        <div>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{d.title}</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{d.originalFilename}</div>
        </div>
      ),
    },
    {
      key: 'documentType',
      header: tr("Category"),
      width: '140px',
      render: (d) => (
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            fontSize: '11px',
            borderRadius: '4px',
            background: 'rgba(59, 130, 246, 0.15)',
            color: 'var(--accent-primary)',
            fontFamily: 'monospace',
          }}
        >
          {d.documentType}
        </span>
      ),
    },
    {
      key: 'byteSize',
      header: tr("Size"),
      width: '100px',
      render: (d) => <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{formatBytes(d.byteSize)}</span>,
    },
    {
      key: 'sha256',
      header: 'SHA-256',
      width: '150px',
      render: (d) => (
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: '11px',
            color: 'var(--text-muted)',
          }}
          title={d.sha256}
        >
          {d.sha256.slice(0, 12)}…
        </span>
      ),
    },
    {
      key: 'textExtractionStatus',
      header: tr("Text Status"),
      width: '120px',
      render: (d) => (
        <span
          style={{
            fontSize: '10px',
            textTransform: 'uppercase',
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: '4px',
            background:
              d.textExtractionStatus === 'COMPLETED'
                ? 'rgba(34, 197, 94, 0.15)'
                : d.textExtractionStatus === 'FAILED'
                ? 'rgba(239, 68, 68, 0.15)'
                : 'rgba(156, 163, 175, 0.15)',
            color:
              d.textExtractionStatus === 'COMPLETED'
                ? 'var(--text-primary)'
                : d.textExtractionStatus === 'FAILED'
                ? 'var(--text-primary)'
                : 'var(--text-secondary)',
          }}
        >
          {d.textExtractionStatus}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '90px',
      align: 'right',
      render: (d) => (
        <a
          href={apiClient.getDocumentDownloadUrl(eventId, d.id)}
          download
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            borderRadius: '4px',
            background: 'var(--bg-surface)',
            color: 'var(--accent-primary)',
            fontSize: '11px',
            textDecoration: 'none',
          }}
        >
          <Download size={13} /> Get
        </a>
      ),
    },
  ];

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Event', href: `/events/${eventId}/overview` },
        { label: 'Documents & Files', href: `/events/${eventId}/documents` },
      ]}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={20} style={{ color: 'var(--accent-primary)' }} /> Documents & Files
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            {tr("Central object storage for forensic artifacts, legal filings, briefings, and case reports")}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={fetchDocuments}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: '6px',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={13} /> {tr("Refresh")}
          </button>
          {canUpload && (
            <button
              onClick={() => setShowUploadModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                background: 'var(--accent-primary)',
                border: 'none',
                borderRadius: '6px',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Upload size={14} /> {tr("Upload File")}
            </button>
          )}
        </div>
      </div>

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Filter documents by title, file, DOC-ID..."
      />

      {loading ? (
        <LoadingState message={tr("Loading documents catalog...")} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchDocuments} />
      ) : filteredDocs.length === 0 ? (
        <EmptyState
          title={tr("No documents found")}
          description={search ? 'No documents match your query filters.' : 'No documents have been uploaded to this exercise yet.'}
        />
      ) : (
        <DataTable
          columns={columns}
          data={filteredDocs}
          keyExtractor={(d) => d.id}
          onRowClick={(d) => openDocumentDetail(d.id)}
        />
      )}

      {/* DOCUMENT DETAIL DRAWER */}
      {selectedDoc && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            justifyContent: 'flex-end',
            zIndex: 100,
          }}
          onClick={() => setSelectedDoc(null)}
        >
          <div
            style={{
              width: 'min(620px, 100vw)',
              maxWidth: '100vw',
              height: '100%',
              background: 'var(--bg-panel)',
              borderLeft: '1px solid var(--border-default)',
              padding: '24px',
              overflowY: 'auto',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{minWidth:0,overflowWrap:'anywhere'}}>
                <span style={{ fontSize: '11px', color: 'var(--accent-primary)', fontWeight: 600, textTransform: 'uppercase' }}>
                  {selectedDoc.documentNumber || selectedDoc.id}
                </span>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 0 0' }}>
                  {selectedDoc.title}
                </h2>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {selectedDoc.originalFilename} · {formatBytes(selectedDoc.byteSize)}
                </div>
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {selectedDoc.description && (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', background: 'var(--bg-surface)', padding: '12px', borderRadius: '6px' }}>
                {selectedDoc.description}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,180px),1fr))', gap: '10px' }}>
              <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{tr("Category")}</span>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                  {selectedDoc.documentType}
                </div>
              </div>
              <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{tr("Text Extraction")}</span>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                  {selectedDoc.textExtractionStatus}
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: '12px', borderRadius: '6px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{tr("Cryptographic SHA-256 Hash")}</span>
              <div style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-primary)', wordBreak: 'break-all', marginTop: '4px' }}>
                {selectedDoc.sha256}
              </div>
            </div>

            {selectedDoc.extractedText && (
              <div style={{ background: 'var(--bg-surface)', padding: '12px', borderRadius: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                  {locale==='cs'?'Extrahovaný text dokumentu':'Extracted normalized text'}
                </span>
                <pre
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    maxHeight: 'min(45vh,420px)',
                    overflowWrap: 'anywhere',
                    lineHeight: 1.6,
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    marginTop: '8px',
                    padding: '8px',
                    background: 'var(--bg-inset)',
                    borderRadius: '4px',
                  }}
                >
                  {selectedDoc.extractedText}
                </pre>
              </div>
            )}

            {/* VERSION HISTORY */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <History size={15} /> {locale==='cs'?'Historie verzí':'Version history'} ({selectedDoc.versions.length})
                </span>
                {canVersion && (
                  <button
                    onClick={() => setShowVersionModal(true)}
                    style={{
                      fontSize: '11px',
                      padding: '4px 8px',
                      background: 'var(--bg-surface)',
                      border: 'none',
                      borderRadius: '4px',
                      color: 'var(--accent-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    {locale==='cs'?'+ Nová verze':'+ New version'}
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedDoc.versions.map((v) => (
                  <div
                    key={v.id}
                    style={{
                      padding: '10px',
                      background: 'var(--bg-surface)',
                      borderRadius: '6px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{minWidth:0,overflowWrap:'anywhere'}}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Version {v.versionNumber} · {v.filename}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {v.changeNote || 'Standard revision'} · {formatTime(v.uploadedAt)}
                      </div>
                    </div>
                    <a
                      href={apiClient.getDocumentDownloadUrl(eventId, selectedDoc.id, v.versionNumber)}
                      download
                      style={{
                        padding: '4px 8px',
                        background: 'var(--bg-panel)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '4px',
                        color: 'var(--accent-primary)',
                        fontSize: '11px',
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Download size={12} /> {tr("Download")}
                    </a>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
              <a
                href={apiClient.getDocumentDownloadUrl(eventId, selectedDoc.id)}
                download
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '10px',
                  background: 'var(--accent-primary)',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  boxSizing: 'border-box',
                }}
              >
                <Download size={16} /> {tr("Download Current Version")}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* UPLOAD DOCUMENT MODAL */}
      {showUploadModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
          }}
          onClick={() => setShowUploadModal(false)}
        >
          <div
            style={{
              width: '460px',
              maxWidth: '90vw',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-default)',
              borderRadius: '8px',
              padding: '24px',
              boxSizing: 'border-box',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{tr("Upload Document")}</h3>
              <button onClick={() => setShowUploadModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            {uploadError && (
              <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '12px', marginBottom: '12px' }}>
                {uploadError}
              </div>
            )}

            <form onSubmit={handleUploadSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Document Title *
                </label>
                <input
                  type="text"
                  required
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                  placeholder={tr("e.g. Server Compromise Forensic Report")}
                  style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '4px' }}>
                  {tr("Category")}
                </label>
                <select
                  value={uploadForm.documentType}
                  onChange={(e) => setUploadForm({ ...uploadForm, documentType: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' }}
                >
                  <option value="REPORT">{tr("REPORT")}</option>
                  <option value="FORENSIC_REPORT">FORENSIC_REPORT</option>
                  <option value="LAB_REPORT">LAB_REPORT</option>
                  <option value="PHOTO">{tr("PHOTO")}</option>
                  <option value="INTERVIEW">{tr("INTERVIEW")}</option>
                  <option value="COURT_FILING">COURT_FILING</option>
                  <option value="EXHIBIT">{tr("EXHIBIT")}</option>
                  <option value="BRIEFING_ATTACHMENT">BRIEFING_ATTACHMENT</option>
                  <option value="OTHER">{tr("OTHER")}</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Description (optional)
                </label>
                <textarea
                  rows={2}
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                  placeholder={tr("Summary or operational notes...")}
                  style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Select File *
                </label>
                <input
                  type="file"
                  required
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setUploadForm({
                      ...uploadForm,
                      file: f,
                      title: uploadForm.title || (f ? f.name.replace(/\.[^/.]+$/, '') : ''),
                    });
                  }}
                  style={{ width: '100%', color: 'var(--text-muted)', fontSize: '12px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  style={{ padding: '8px 14px', background: 'var(--bg-surface)', border: 'none', borderRadius: '6px', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}
                >
                  {tr("Cancel")}
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  style={{ padding: '8px 16px', background: 'var(--accent-primary)', border: 'none', borderRadius: '6px', color: '#ffffff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* UPLOAD VERSION MODAL */}
      {showVersionModal && selectedDoc && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 120,
          }}
          onClick={() => setShowVersionModal(false)}
        >
          <div
            style={{
              width: '420px',
              maxWidth: '90vw',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-default)',
              borderRadius: '8px',
              padding: '24px',
              boxSizing: 'border-box',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Upload New Revision
              </h3>
              <button onClick={() => setShowVersionModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            {uploadError&&<p role="alert" style={{color:'var(--text-primary)',background:'var(--status-danger-bg)',padding:10}}>{uploadError}</p>}
            <form onSubmit={handleVersionSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Revision Note
                </label>
                <input
                  type="text"
                  value={versionNote}
                  onChange={(e) => setVersionNote(e.target.value)}
                  placeholder={tr("e.g. Added section 3 technical timeline")}
                  style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Select Updated File *
                </label>
                <input
                  type="file"
                  required
                  onChange={(e) => setVersionFile(e.target.files?.[0] || null)}
                  style={{ width: '100%', color: 'var(--text-muted)', fontSize: '12px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowVersionModal(false)}
                  style={{ padding: '8px 14px', background: 'var(--bg-surface)', border: 'none', borderRadius: '6px', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}
                >
                  {tr("Cancel")}
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  style={{ padding: '8px 16px', background: 'var(--accent-primary)', border: 'none', borderRadius: '6px', color: '#ffffff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {uploading ? 'Uploading...' : 'Save Version'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
