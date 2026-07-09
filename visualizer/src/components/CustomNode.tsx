import React from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import {
  FileCode2,
  Layers,
  Blocks,
  Cpu,
  Play,
  Terminal,
  Code,
  Type,
  FolderGit,
  Package,
  Box,
  Globe,
  Database,
} from 'lucide-react';
import { Symbol } from '../types';

// Helper to get color variables and icons by Symbol Kind
export function getSymbolTheme(kind: string) {
  let color = '#3b82f6';
  let Icon = Code;

  switch (kind) {
    case 'project':
      color = 'var(--color-project)';
      Icon = FolderGit;
      break;
    case 'file':
      color = 'var(--color-file)';
      Icon = FileCode2;
      break;
    case 'package':
      color = '#ef4444';
      Icon = Package;
      break;
    case 'module':
      color = '#e2e8f0';
      Icon = Box;
      break;
    case 'class':
      color = 'var(--color-class)';
      Icon = Layers;
      break;
    case 'interface':
      color = 'var(--color-interface)';
      Icon = Blocks;
      break;
    case 'struct':
      color = 'var(--color-variable)';
      Icon = Cpu;
      break;
    case 'function':
      color = 'var(--color-function)';
      Icon = Play;
      break;
    case 'method':
      color = 'var(--color-method)';
      Icon = Terminal;
      break;
    case 'variable':
      color = 'var(--color-variable)';
      Icon = Code;
      break;
    case 'type_alias':
      color = 'var(--color-type)';
      Icon = Type;
      break;
    case 'api_route':
      color = '#10b981';
      Icon = Globe;
      break;
    case 'data_model':
      color = '#f59e0b';
      Icon = Database;
      break;
  }

  return { color, Icon };
}

type CustomNodeType = Node<{ label: string; symbol: Symbol }, 'customNode'>;
type FileGroupNodeType = Node<{ label: string; path: string; symbol: Symbol }, 'fileGroup'>;
type ClassGroupNodeType = Node<{ label: string; symbol: Symbol }, 'classGroup'>;

// Leaf Node (Functions, Methods, Variables, etc.) - Rendered as circular fluid node
export const CustomNode = React.memo(({ data, selected }: NodeProps<CustomNodeType>) => {
  const symbol = data.symbol;
  const { color } = getSymbolTheme(symbol.kind);

  // Determine circle size by node type for visual hierarchy
  let size = 10;
  if (symbol.kind === 'file') size = 15;
  else if (symbol.kind === 'class' || symbol.kind === 'interface') size = 12;

  return (
    <div
      className={`fluid-node ${selected ? 'selected' : ''}`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        border: selected ? '2px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.25)',
        boxShadow: selected
          ? `0 0 14px ${color}, 0 0 0 2px #ffffff`
          : `0 0 8px ${color}`,
        position: 'relative',
        cursor: 'pointer',
        transition: 'transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.15s ease',
      }}
    >
      {/* Invisible Handles located in the exact center of the node so edges connect center-to-center */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          opacity: 0,
          width: 1,
          height: 1,
          pointerEvents: 'none',
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          opacity: 0,
          width: 1,
          height: 1,
          pointerEvents: 'none',
        }}
      />

      {/* Symbol Name Label on the right side of the circle */}
      <span
        style={{
          position: 'absolute',
          left: size + 6,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: selected ? '12px' : '10.5px',
          fontWeight: selected ? 700 : 500,
          color: selected ? '#ffffff' : '#e2e8f0',
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
          textShadow: '0 1px 3px rgba(0, 0, 0, 0.95), 0 0 4px rgba(0, 0, 0, 0.8)',
          pointerEvents: 'none',
        }}
      >
        {data.label}
      </span>
    </div>
  );
});

// File Container Group Node (unused in flat mode but kept for NodeTypes compatibility)
export const FileGroupNode = React.memo(({ data, selected }: NodeProps<FileGroupNodeType>) => {
  return (
    <div className={`file-group-node ${selected ? 'selected' : ''}`}>
      <div className="group-title">
        <FileCode2 size={16} color="var(--color-file)" />
        <span>{data.label}</span>
      </div>
    </div>
  );
});

// Class Container Group Node (unused in flat mode but kept for NodeTypes compatibility)
export const ClassGroupNode = React.memo(({ data, selected }: NodeProps<ClassGroupNodeType>) => {
  const symbol = data.symbol;
  const { color, Icon } = getSymbolTheme(symbol.kind);

  return (
    <div className={`class-group-node ${selected ? 'selected' : ''}`} style={{ borderColor: color }}>
      <Handle type="target" position={Position.Left} style={{ background: '#64748b' }} />
      <div className="class-group-title" style={{ color }}>
        <Icon size={14} />
        <span>{data.label}</span>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#64748b' }} />
    </div>
  );
});
