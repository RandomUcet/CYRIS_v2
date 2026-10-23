'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import cytoscape from 'cytoscape';
import { ZoomIn, ZoomOut, Maximize2, Filter, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  subtitle?: string;
  route?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface RelationshipGraphProps {
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  relationships?: any[];
  centerResourceId?: string;
  currentResourceTitle?: string;
  currentResourceType?: string;
  selectedNodeId?: string | null;
  onSelectNode?: (node: GraphNode | null) => void;
  onNodeSelect?: (node: any) => void;
  height?: string;
  eventId?: string;
}

const TYPE_COLORS: Record<string, string> = {
  person: '#38bdf8',
  organisation: '#818cf8',
  vehicle: '#fbbf24',
  device: '#a3e635',
  location: '#34d399',
  incident: '#f87171',
  case: '#fb923c',
  evidence: '#10b981',
  lab_analysis: '#c084fc',
};

export function RelationshipGraph({
  nodes: propNodes,
  edges: propEdges,
  relationships,
  centerResourceId,
  currentResourceTitle,
  currentResourceType,
  selectedNodeId,
  onSelectNode,
  onNodeSelect,
  height = '500px',
  eventId,
}: RelationshipGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const router = useRouter();

  const [activeEdgeFilter, setActiveEdgeFilter] = useState<string>('');
  const [inspectedNode, setInspectedNode] = useState<GraphNode | null>(null);

  const { nodes, edges } = useMemo(() => {
    if (propNodes && propEdges) {
      return { nodes: propNodes, edges: propEdges };
    }
    const nMap = new Map<string, GraphNode>();
    const eList: GraphEdge[] = [];

    if (centerResourceId) {
      nMap.set(centerResourceId, {
        id: centerResourceId,
        label: currentResourceTitle || centerResourceId.slice(0, 8),
        type: (currentResourceType || 'resource').toLowerCase(),
        subtitle: currentResourceType,
      });
    }

    if (relationships) {
      for (const rel of relationships) {
        const sId = rel.sourceResourceId || rel.sourceId;
        const tId = rel.targetResourceId || rel.targetId;
        if (!sId || !tId) continue;

        const srcIdentity = rel.source;
        if (!nMap.has(sId) || (!nMap.get(sId)?.subtitle && srcIdentity?.identifier)) {
          const label =
            sId === centerResourceId && currentResourceTitle
              ? currentResourceTitle
              : srcIdentity?.title
              ? `${srcIdentity.identifier ? srcIdentity.identifier + ' • ' : ''}${srcIdentity.title}`
              : srcIdentity?.identifier || (sId === centerResourceId && currentResourceTitle ? currentResourceTitle : sId.slice(0, 8));
          const type =
            sId === centerResourceId && currentResourceType
              ? currentResourceType.toLowerCase()
              : srcIdentity?.type?.toLowerCase() || 'resource';
          nMap.set(sId, {
            id: sId,
            label,
            subtitle: srcIdentity?.identifier || (sId === centerResourceId ? currentResourceType : undefined),
            type,
          });
        }

        const tgtIdentity = rel.target;
        if (!nMap.has(tId) || (!nMap.get(tId)?.subtitle && tgtIdentity?.identifier)) {
          const label =
            tId === centerResourceId && currentResourceTitle
              ? currentResourceTitle
              : tgtIdentity?.title
              ? `${tgtIdentity.identifier ? tgtIdentity.identifier + ' • ' : ''}${tgtIdentity.title}`
              : tgtIdentity?.identifier || (tId === centerResourceId && currentResourceTitle ? currentResourceTitle : tId.slice(0, 8));
          const type =
            tId === centerResourceId && currentResourceType
              ? currentResourceType.toLowerCase()
              : tgtIdentity?.type?.toLowerCase() || 'resource';
          nMap.set(tId, {
            id: tId,
            label,
            subtitle: tgtIdentity?.identifier || (tId === centerResourceId ? currentResourceType : undefined),
            type,
          });
        }

        eList.push({
          id: rel.id || `${sId}-${tId}-${rel.relationshipType}`,
          source: sId,
          target: tId,
          label: rel.relationshipType || 'RELATED_TO',
        });
      }
    }

    return { nodes: Array.from(nMap.values()), edges: eList };
  }, [propNodes, propEdges, relationships, centerResourceId, currentResourceTitle, currentResourceType]);

  const availableEdgeTypes = useMemo(() => {
    return Array.from(new Set(edges.map((e) => e.label))).filter(Boolean);
  }, [edges]);

  const filteredEdges = useMemo(() => {
    if (!activeEdgeFilter) return edges;
    return edges.filter((e) => e.label === activeEdgeFilter);
  }, [edges, activeEdgeFilter]);

  // Cytoscape initialization and updates
  useEffect(() => {
    if (!containerRef.current) return;

    const cyElements: cytoscape.ElementDefinition[] = [
      ...nodes.map((n) => ({
        data: {
          id: n.id,
          label: n.label,
          type: n.type,
          color: TYPE_COLORS[n.type] || '#94a3b8',
          subtitle: n.subtitle || '',
          route: n.route || '',
        },
      })),
      ...filteredEdges.map((e) => ({
        data: {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label,
        },
      })),
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements: cyElements,
      boxSelectionEnabled: false,
      autounselectify: false,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#151a24',
            'border-width': 2,
            'border-color': 'data(color)',
            label: 'data(label)',
            'font-family': 'Inter, sans-serif',
            'font-size': '11px',
            'font-weight': 600,
            color: '#e2e8f0',
            'text-valign': 'bottom',
            'text-margin-y': 6,
            width: 32,
            height: 32,
            'text-background-color': '#090c10',
            'text-background-opacity': 0.8,
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle',
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 4,
            'border-color': '#38bdf8',
            'background-color': '#222b3d',
            width: 38,
            height: 38,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': '#374258',
            'target-arrow-color': '#374258',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 0.8,
            label: 'data(label)',
            'font-family': 'JetBrains Mono, monospace',
            'font-size': '9px',
            color: '#94a3b8',
            'text-background-color': '#0f131a',
            'text-background-opacity': 0.9,
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle',
          },
        },
        {
          selector: 'edge:selected',
          style: {
            width: 2.5,
            'line-color': '#38bdf8',
            'target-arrow-color': '#38bdf8',
          },
        },
      ],
      layout: {
        name: 'breadthfirst',
        directed: true,
        padding: 40,
        spacingFactor: 1.25,
        animate: false,
      },
    });

    cy.on('tap', 'node', (evt) => {
      const nodeData = evt.target.data();
      const match = nodes.find((n) => n.id === nodeData.id) || null;
      setInspectedNode(match);
      if (onSelectNode) onSelectNode(match);
      if (onNodeSelect) onNodeSelect(match);
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        setInspectedNode(null);
        if (onSelectNode) onSelectNode(null);
        if (onNodeSelect) onNodeSelect(null);
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, [nodes, filteredEdges, onSelectNode, onNodeSelect]);

  // Synchronize external selection
  useEffect(() => {
    if (!cyRef.current) return;
    if (selectedNodeId) {
      cyRef.current.$(`node[id = "${selectedNodeId}"]`).select();
    } else {
      cyRef.current.$('node:selected').unselect();
    }
  }, [selectedNodeId]);

  const handleFit = () => {
    cyRef.current?.fit(undefined, 30);
  };

  const handleZoomIn = () => {
    if (!cyRef.current) return;
    cyRef.current.zoom(cyRef.current.zoom() * 1.25);
  };

  const handleZoomOut = () => {
    if (!cyRef.current) return;
    cyRef.current.zoom(cyRef.current.zoom() * 0.8);
  };

  const handleOpenRecord = () => {
    if (!inspectedNode) return;
    if (inspectedNode.route) {
      router.push(inspectedNode.route);
    } else if (eventId) {
      const t = inspectedNode.type;
      if (t === 'case') router.push(`/events/${eventId}/cases/${inspectedNode.id}`);
      else if (t === 'incident') router.push(`/events/${eventId}/incidents/${inspectedNode.id}`);
      else if (t === 'evidence') router.push(`/events/${eventId}/evidence/${inspectedNode.id}`);
      else if (t === 'lab_analysis') router.push(`/events/${eventId}/lab/${inspectedNode.id}`);
      else router.push(`/events/${eventId}/registry`);
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
      }}
    >
      {/* Controls Bar */}
      <div
        style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          zIndex: 10,
          display: 'flex',
          gap: '6px',
          alignItems: 'center',
          background: 'var(--bg-surface)',
          padding: '4px 8px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-default)',
        }}
      >
        <button type="button" onClick={handleFit} className="btn-ghost" title="Fit to Viewport" style={{ padding: '4px' }}>
          <Maximize2 size={14} />
        </button>
        <button type="button" onClick={handleZoomIn} className="btn-ghost" title="Zoom In" style={{ padding: '4px' }}>
          <ZoomIn size={14} />
        </button>
        <button type="button" onClick={handleZoomOut} className="btn-ghost" title="Zoom Out" style={{ padding: '4px' }}>
          <ZoomOut size={14} />
        </button>

        {availableEdgeTypes.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', borderLeft: '1px solid var(--border-default)', paddingLeft: '8px', marginLeft: '4px' }}>
            <Filter size={12} style={{ color: 'var(--text-muted)' }} />
            <select
              value={activeEdgeFilter}
              onChange={(e) => setActiveEdgeFilter(e.target.value)}
              style={{ height: '24px', fontSize: '11px', padding: '1px 6px' }}
            >
              <option value="">All Relationships</option>
              {availableEdgeTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: '10px',
          left: '10px',
          zIndex: 10,
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          background: 'rgba(15, 19, 26, 0.85)',
          padding: '4px 10px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
          fontSize: '11px',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Entities:</span>
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
            <span style={{ color: 'var(--text-secondary)' }}>{type.replace(/_/g, ' ')}</span>
          </div>
        ))}
      </div>

      {/* Inspected Node Drawer/Card */}
      {inspectedNode && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            width: '240px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: TYPE_COLORS[inspectedNode.type] || 'var(--text-muted)', fontWeight: 600 }}>
                {inspectedNode.type}
              </div>
              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                {inspectedNode.label}
              </div>
            </div>
          </div>

          {inspectedNode.subtitle && (
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              {inspectedNode.subtitle}
            </div>
          )}

          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            UUID: <code>{inspectedNode.id.slice(0, 13)}…</code>
          </div>

          <button
            type="button"
            className="btn-primary"
            onClick={handleOpenRecord}
            style={{ width: '100%', fontSize: '11px', padding: '4px 8px', marginTop: '4px' }}
          >
            <ExternalLink size={12} /> Open Canonical Record
          </button>
        </div>
      )}

      {/* Canvas Element */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
