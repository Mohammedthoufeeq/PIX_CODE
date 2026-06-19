import React, { useState, useMemo } from 'react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import {
  Check, X, CheckCheck, XCircle, FileCode, ArrowLeft,
  Columns, AlignLeft, ChevronDown, ChevronRight, Edit3,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import * as api from '../api/client';
import toast from 'react-hot-toast';

// ── Theme ────────────────────────────────────────────────────────────────────

const customStyles = {
  variables: {
    dark: {
      diffViewerBackground:    '#0d1117',
      diffViewerColor:         '#e6edf3',
      addedBackground:         '#12261e',
      addedColor:              '#3fb950',
      removedBackground:       '#2d1117',
      removedColor:            '#f85149',
      wordAddedBackground:     '#1a4731',
      wordRemovedBackground:   '#5c1a1a',
      addedGutterBackground:   '#0f2c18',
      removedGutterBackground: '#3d1117',
      gutterBackground:        '#161b22',
      gutterBackgroundDark:    '#161b22',
      highlightBackground:     '#1f6feb22',
      highlightGutterBackground: '#1f6feb33',
      codeFoldGutterBackground:'#1c2128',
      codeFoldBackground:      '#1c2128',
      emptyLineBackground:     '#161b22',
      gutterColor:             '#484f58',
      addedGutterColor:        '#3fb950',
      removedGutterColor:      '#f85149',
      codeFoldContentColor:    '#8b949e',
      diffViewerTitleBackground:  '#161b22',
      diffViewerTitleColor:       '#e6edf3',
      diffViewerTitleBorderColor: '#30363d',
    },
  },
  line: { padding: '2px 10px', fontSize: '13px', fontFamily: "'JetBrains Mono', monospace" },
  gutter: { padding: '2px 10px', fontSize: '12px', fontFamily: "'JetBrains Mono', monospace", minWidth: '40px' },
  contentText: { fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', lineHeight: '20px' },
};

// ── Folded-diff component ────────────────────────────────────────────────────
// Splits the diff into change-hunks with collapsed unchanged context.

interface Hunk {
  type: 'changed' | 'context';
  originalLines: string[];
  modifiedLines: string[];
  startLine: number;  // 1-based, original file
}

const CONTEXT_LINES = 3;

function splitIntoHunks(original: string, modified: string): Hunk[] {
  const origLines = original.split('\n');
  const modLines  = modified.split('\n');
  const maxLen    = Math.max(origLines.length, modLines.length);
  const changed   = Array.from({ length: maxLen }, (_, i) =>
    (origLines[i] ?? '') !== (modLines[i] ?? '')
  );

  const hunks: Hunk[] = [];
  let i = 0;

  while (i < maxLen) {
    if (!changed[i]) {
      // collect unchanged block
      let j = i;
      while (j < maxLen && !changed[j]) j++;
      hunks.push({
        type: 'context',
        originalLines: origLines.slice(i, j),
        modifiedLines: modLines.slice(i, j),
        startLine: i + 1,
      });
      i = j;
    } else {
      // expand changed block to include CONTEXT_LINES of context on each side
      let start = Math.max(0, i - CONTEXT_LINES);
      let end   = i;
      while (end < maxLen && changed[end]) end++;
      end = Math.min(maxLen, end + CONTEXT_LINES);

      // merge with previous context hunk if we overlap
      if (hunks.length > 0 && hunks[hunks.length - 1].type === 'context') {
        const prev = hunks[hunks.length - 1];
        // trim the context hunk to only keep the last CONTEXT_LINES lines
        const keep = prev.originalLines.slice(-CONTEXT_LINES);
        const trim = prev.originalLines.length - keep.length;
        if (trim > 0) {
          // replace prev with trimmed version + the changed block
          const trimmedStart = prev.startLine + trim;
          hunks[hunks.length - 1] = {
            type: 'context',
            originalLines: keep,
            modifiedLines: prev.modifiedLines.slice(-CONTEXT_LINES),
            startLine: trimmedStart,
          };
        }
        start = prev.startLine + prev.originalLines.length - 1 + keep.length;
      } else {
        start = Math.max(0, i - CONTEXT_LINES);
      }

      hunks.push({
        type: 'changed',
        originalLines: origLines.slice(start, end),
        modifiedLines: modLines.slice(start, end),
        startLine: start + 1,
      });
      i = end;
    }
  }

  return hunks;
}

const FoldedDiff: React.FC<{
  original: string;
  modified: string;
  splitView: boolean;
  onLineClick?: (line: number) => void;
}> = ({ original, modified, splitView, onLineClick }) => {
  const hunks = useMemo(() => splitIntoHunks(original, modified), [original, modified]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  return (
    <div className="diff-viewer-wrapper">
      {hunks.map((hunk, idx) => {
        if (hunk.type === 'changed') {
          return (
            <div key={idx}>
              <ReactDiffViewer
                oldValue={hunk.originalLines.join('\n')}
                newValue={hunk.modifiedLines.join('\n')}
                splitView={splitView}
                useDarkTheme
                compareMethod={DiffMethod.WORDS}
                styles={customStyles}
                linesOffset={hunk.startLine - 1}
                onLineNumberClick={(lineId) => {
                  const lineNum = parseInt(lineId.split('-')[1], 10);
                  if (!isNaN(lineNum)) onLineClick?.(hunk.startLine + lineNum - 1);
                }}
              />
            </div>
          );
        }

        // Context (unchanged) block – show as collapsed fold
        const isOpen = expanded.has(idx);
        const lineCount = hunk.originalLines.length;

        if (lineCount === 0) return null;

        if (isOpen) {
          return (
            <div key={idx}>
              <button
                onClick={() => setExpanded((s) => { const n = new Set(s); n.delete(idx); return n; })}
                className="w-full flex items-center gap-2 px-3 py-1 bg-[#1c2128] hover:bg-[#161b22] border-y border-[#30363d] text-[10px] text-[#8b949e] font-code transition-colors"
              >
                <ChevronDown size={12} className="text-[#484f58]" />
                <span>Collapse {lineCount} unchanged lines (L{hunk.startLine}–{hunk.startLine + lineCount - 1})</span>
              </button>
              <ReactDiffViewer
                oldValue={hunk.originalLines.join('\n')}
                newValue={hunk.modifiedLines.join('\n')}
                splitView={splitView}
                useDarkTheme
                compareMethod={DiffMethod.WORDS}
                styles={customStyles}
                linesOffset={hunk.startLine - 1}
              />
            </div>
          );
        }

        return (
          <button
            key={idx}
            onClick={() => setExpanded((s) => new Set([...s, idx]))}
            className="w-full flex items-center gap-2 px-3 py-1.5 bg-[#1c2128] hover:bg-[#161b22] border-y border-[#30363d] text-[10px] text-[#8b949e] font-code transition-colors"
          >
            <ChevronRight size={12} className="text-[#58a6ff]" />
            <span className="text-[#58a6ff]">
              ↕ {lineCount} unchanged lines
            </span>
            <span className="text-[#484f58] ml-1">(L{hunk.startLine}–{hunk.startLine + lineCount - 1})</span>
          </button>
        );
      })}
    </div>
  );
};

// ── DiffViewer ───────────────────────────────────────────────────────────────

const DiffViewer: React.FC = () => {
  const {
    showDiff, diffData, pendingDiffs,
    setShowDiff, setDiffData, updateDiffStatus, setPendingDiffs,
    addTerminalOutput, addChatMessage,
    setSelectedFile, setFileContent,
  } = useAppStore();

  const [splitView,  setSplitView]  = useState(true);
  const [foldMode,   setFoldMode]   = useState(true);

  if (!showDiff) return null;

  async function handleApply(filePath: string, diff: string) {
    addTerminalOutput(`[${new Date().toLocaleTimeString()}] Applying diff: ${filePath}`);
    const res = await api.applyDiff(diff, filePath);
    if (res.success) {
      updateDiffStatus(filePath, 'applied');
      toast.success(`Applied → ${filePath.split(/[/\\]/).pop()}`);
    } else {
      toast.error(res.error || 'Failed to apply diff');
    }
  }

  async function handleReject(filePath: string) {
    updateDiffStatus(filePath, 'rejected');
    toast('Changes rejected', { icon: '✗', style: { background: '#1c2128', color: '#e6edf3', border: '1px solid #30363d' } });
  }

  async function handleApplyAll() {
    const pending = pendingDiffs.filter((d) => d.status === 'pending');
    for (const d of pending) await handleApply(d.filePath, d.diff);
    addChatMessage({ id: `sys-${Date.now()}`, role: 'system', content: `✓ Applied ${pending.length} file(s)`, timestamp: Date.now() });
  }

  function handleRejectAll() {
    setPendingDiffs(pendingDiffs.map((d) => ({ ...d, status: 'rejected' as const })));
    toast('All rejected', { icon: '✗', style: { background: '#1c2128', color: '#e6edf3', border: '1px solid #30363d' } });
  }

  function handleClose() { setShowDiff(false); setDiffData(null); }

  // Click-to-edit: jump to file at the clicked line
  async function handleLineClick(filePath: string, line: number) {
    try {
      const res = await fetch(`/api/files/read?path=${encodeURIComponent(filePath)}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedFile(filePath);
        setFileContent(data.content ?? '');
        toast.success(`Opened ${filePath.split(/[/\\]/).pop()} at L${line}`);
      } else {
        toast.error('Could not open file for editing');
      }
    } catch {
      toast.error('Could not open file for editing');
    }
  }

  // ── Toolbar ──────────────────────────────────────────────────────────────

  const Toolbar: React.FC<{ filePath?: string; diff?: string; showButtons?: boolean }> = ({
    filePath, diff, showButtons = true,
  }) => (
    <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#30363d] flex-shrink-0">
      <div className="flex items-center gap-2">
        <button onClick={handleClose} className="p-1 rounded hover:bg-[#30363d] text-[#8b949e] transition-colors">
          <ArrowLeft size={14} />
        </button>
        {filePath && (
          <>
            <FileCode size={14} className="text-[#58a6ff]" />
            <span className="text-xs text-[#e6edf3] font-medium">{filePath.split(/[/\\]/).pop()}</span>
            <span className="text-[10px] text-[#8b949e] font-mono truncate max-w-[160px]">{filePath}</span>
          </>
        )}
        {!filePath && <span className="text-xs text-[#e6edf3] font-medium">Review Changes</span>}
      </div>

      <div className="flex items-center gap-1.5">
        {/* View toggle */}
        <button
          onClick={() => setSplitView((v) => !v)}
          title={splitView ? 'Switch to unified view' : 'Switch to split view'}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition-all ${
            splitView
              ? 'bg-[#58a6ff]/10 text-[#58a6ff] border-[#58a6ff]/30'
              : 'bg-transparent text-[#8b949e] border-[#30363d] hover:border-[#58a6ff]/20'
          }`}>
          {splitView ? <Columns size={11} /> : <AlignLeft size={11} />}
          {splitView ? 'Split' : 'Unified'}
        </button>

        {/* Fold toggle */}
        <button
          onClick={() => setFoldMode((v) => !v)}
          title={foldMode ? 'Show all lines' : 'Fold unchanged lines'}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition-all ${
            foldMode
              ? 'bg-[#b026ff]/10 text-[#b026ff] border-[#b026ff]/30'
              : 'bg-transparent text-[#8b949e] border-[#30363d] hover:border-[#b026ff]/20'
          }`}>
          <ChevronRight size={11} />
          {foldMode ? 'Folded' : 'Full'}
        </button>

        {showButtons && filePath && diff && (
          <>
            <button onClick={() => handleApply(filePath, diff)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white text-xs font-medium rounded-md transition-colors">
              <Check size={12} /> Apply
            </button>
            <button onClick={() => { handleReject(filePath); handleClose(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#da3633] hover:bg-[#f85149] text-white text-xs font-medium rounded-md transition-colors">
              <X size={12} /> Reject
            </button>
          </>
        )}
      </div>
    </div>
  );

  // ── Single-file diff ─────────────────────────────────────────────────────
  if (diffData && pendingDiffs.length === 0) {
    return (
      <div className="flex-1 flex flex-col bg-[#0d1117] overflow-hidden">
        <Toolbar filePath={diffData.filePath} diff={diffData.modified} />
        <div className="flex-1 overflow-auto scrollbar-thin">
          {foldMode ? (
            <FoldedDiff
              original={diffData.original}
              modified={diffData.modified}
              splitView={splitView}
              onLineClick={(line) => handleLineClick(diffData.filePath, line)}
            />
          ) : (
            <div className="diff-viewer-wrapper">
              <ReactDiffViewer
                oldValue={diffData.original}
                newValue={diffData.modified}
                splitView={splitView}
                useDarkTheme
                compareMethod={DiffMethod.WORDS}
                styles={customStyles}
                leftTitle="Original"
                rightTitle="Modified"
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Multi-file diff ──────────────────────────────────────────────────────
  if (pendingDiffs.length > 0) {
    const pendingCount = pendingDiffs.filter((d) => d.status === 'pending').length;

    return (
      <div className="flex-1 flex flex-col bg-[#0d1117] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#30363d]">
          <div className="flex items-center gap-3">
            <button onClick={handleClose} className="p-1 rounded hover:bg-[#30363d] text-[#8b949e] transition-colors">
              <ArrowLeft size={14} />
            </button>
            <span className="text-xs text-[#e6edf3] font-medium">Review Changes</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1f6feb33] text-[#58a6ff]">
              {pendingCount} pending
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {/* View controls */}
            <button onClick={() => setSplitView((v) => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition-all ${
                splitView ? 'bg-[#58a6ff]/10 text-[#58a6ff] border-[#58a6ff]/30' : 'bg-transparent text-[#8b949e] border-[#30363d]'
              }`}>
              {splitView ? <Columns size={11} /> : <AlignLeft size={11} />}
              {splitView ? 'Split' : 'Unified'}
            </button>
            <button onClick={() => setFoldMode((v) => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition-all ${
                foldMode ? 'bg-[#b026ff]/10 text-[#b026ff] border-[#b026ff]/30' : 'bg-transparent text-[#8b949e] border-[#30363d]'
              }`}>
              <ChevronRight size={11} />
              {foldMode ? 'Folded' : 'Full'}
            </button>
            {pendingCount > 0 && (
              <>
                <button onClick={handleApplyAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white text-xs font-medium rounded-md transition-colors">
                  <CheckCheck size={12} /> Apply All
                </button>
                <button onClick={handleRejectAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#da3633] hover:bg-[#f85149] text-white text-xs font-medium rounded-md transition-colors">
                  <XCircle size={12} /> Reject All
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {pendingDiffs.map((d, idx) => (
            <div key={idx} className="border-b border-[#30363d]">
              {/* File header */}
              <div className="flex items-center justify-between px-4 py-2 bg-[#1c2128]">
                <div className="flex items-center gap-2">
                  <FileCode size={13} className="text-[#58a6ff]" />
                  <span className="text-xs text-[#e6edf3]">{d.filePath.split(/[/\\]/).pop()}</span>
                  <span className="text-[10px] text-[#484f58] font-code truncate max-w-[150px]">{d.filePath}</span>
                  {d.status !== 'pending' && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      d.status === 'applied' ? 'bg-[#238636]/20 text-[#3fb950]' : 'bg-[#da3633]/20 text-[#f85149]'
                    }`}>{d.status}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {/* Click-to-edit shortcut */}
                  <button onClick={() => handleLineClick(d.filePath, 1)}
                    title="Open file in editor"
                    className="p-1 hover:bg-[#ffffff0a] text-[#8b949e] hover:text-[#00f0ff] rounded transition-all">
                    <Edit3 size={11} />
                  </button>
                  {d.status === 'pending' && (
                    <>
                      <button onClick={() => handleApply(d.filePath, d.diff)}
                        className="flex items-center gap-1 px-2 py-1 bg-[#238636] hover:bg-[#2ea043] text-white text-[10px] font-medium rounded transition-colors">
                        <Check size={10} /> Apply
                      </button>
                      <button onClick={() => handleReject(d.filePath)}
                        className="flex items-center gap-1 px-2 py-1 bg-[#da3633] hover:bg-[#f85149] text-white text-[10px] font-medium rounded transition-colors">
                        <X size={10} /> Reject
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Diff content */}
              {foldMode ? (
                <FoldedDiff
                  original={d.original}
                  modified={d.modified}
                  splitView={splitView}
                  onLineClick={(line) => handleLineClick(d.filePath, line)}
                />
              ) : (
                <div className="diff-viewer-wrapper">
                  <ReactDiffViewer
                    oldValue={d.original}
                    newValue={d.modified}
                    splitView={splitView}
                    useDarkTheme
                    compareMethod={DiffMethod.WORDS}
                    styles={customStyles}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
};

export default DiffViewer;
