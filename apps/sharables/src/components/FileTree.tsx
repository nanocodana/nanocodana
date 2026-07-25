'use client'

import React, { useState } from 'react';
import { File, Folder, FolderOpen, Trash2, FileJson, FileCode, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface FileTreeProps {
  files: Record<string, any>;
  selectedFile?: string;
  onSelectFile: (path: string) => void;
  onDeleteFile?: (path: string) => void;
}

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
}

function buildTree(files: Record<string, any>): TreeNode[] {
  const root: TreeNode[] = [];
  // fullPath ('' = root) -> the children array to insert into, so descending a
  // path writes into the actual node's children (the previous version built a
  // throwaway map per level and dropped nested files).
  const childrenByPath = new Map<string, TreeNode[]>([['', root]]);

  Object.keys(files).forEach((path) => {
    const parts = path.split('/').filter(Boolean);
    let parentPath = '';

    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      const fullPath = parentPath ? `${parentPath}/${part}` : part;
      const siblings = childrenByPath.get(parentPath);
      if (!siblings) return; // parent collapsed into a file (collision) — skip

      let node = siblings.find((n) => n.name === part);
      if (!node) {
        node = {
          name: part,
          path: fullPath,
          type: isFile ? 'file' : 'folder',
          children: isFile ? undefined : [],
        };
        siblings.push(node);
        if (node.children) childrenByPath.set(fullPath, node.children);
      } else if (!isFile && !node.children) {
        // A FILE named like this folder already exists (e.g. 'utils' file +
        // 'utils/helpers.js'). Promote it to a folder so descending is safe —
        // rendering the nested files wins over crashing on the collision.
        node.type = 'folder';
        node.children = [];
        childrenByPath.set(fullPath, node.children);
      }

      parentPath = fullPath;
    });
  });

  // Folders first, then alphabetical — applied at every level.
  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    nodes.sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1,
    );
    nodes.forEach((n) => n.children && sortNodes(n.children));
    return nodes;
  };

  return sortNodes(root);
}

function getFileIcon(filename: string) {
  if (filename.endsWith('.json')) return <FileJson className="h-4 w-4 text-yellow-500" />;
  if (filename.endsWith('.js') || filename.endsWith('.ts') || filename.endsWith('.tsx')) return <FileCode className="h-4 w-4 text-blue-500" />;
  return <FileText className="h-4 w-4 text-gray-500" />;
}

function TreeItem({
  node,
  selectedFile,
  onSelectFile,
  onDeleteFile,
  depth = 0
}: {
  node: TreeNode;
  selectedFile?: string;
  onSelectFile: (path: string) => void;
  onDeleteFile?: (path: string) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(true);

  if (node.type === 'folder') {
    return (
      <div>
        <div
          className={cn(
            "flex items-center py-1.5 px-2 cursor-pointer hover:bg-accent/50 text-sm select-none transition-colors",
            "text-muted-foreground hover:text-foreground"
          )}
          style={{ paddingLeft: depth * 12 + 8 }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <FolderOpen className="mr-2 h-4 w-4 text-blue-400" />
          ) : (
            <Folder className="mr-2 h-4 w-4 text-blue-400" />
          )}
          <span className="font-medium">{node.name}</span>
        </div>
        {expanded && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                selectedFile={selectedFile}
                onSelectFile={onSelectFile}
                onDeleteFile={onDeleteFile}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isSelected = node.path === selectedFile;

  return (
    <div
      className={cn(
        "group flex items-center py-1.5 px-2.5 my-0.5 cursor-pointer text-sm select-none transition-all duration-200 relative rounded-md",
        isSelected
          ? "bg-white shadow-sm text-foreground font-medium ring-1 ring-border/50"
          : "text-muted-foreground hover:bg-white/50 hover:text-foreground"
      )}
      style={{ paddingLeft: depth * 12 + 10 }}
      onClick={() => onSelectFile(node.path)}
    >
      <span className="mr-2 opacity-80 group-hover:opacity-100 transition-opacity">{getFileIcon(node.name)}</span>
      <span className="flex-1 truncate">{node.name}</span>

      {onDeleteFile && node.name !== 'App.js' && node.name !== 'App.tsx' && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-all duration-200 absolute right-1 hover:bg-red-50 hover:text-red-600 rounded-md scale-90 hover:scale-100"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onDeleteFile(node.path);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export function FileTree({ files, selectedFile, onSelectFile, onDeleteFile }: FileTreeProps) {
  const tree = buildTree(files);

  return (
    <div className="flex flex-col h-full bg-muted/20 border-r border-border/50">
      <div className="p-4 border-b border-border/40">
        <h3 className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">Explorer</h3>
      </div>
      <div className="flex-1 overflow-y-auto py-2 px-2">
        {tree.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            selectedFile={selectedFile}
            onSelectFile={onSelectFile}
            onDeleteFile={onDeleteFile}
          />
        ))}
      </div>
    </div>
  );
}
