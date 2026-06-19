import React, { useMemo } from 'react';
import Editor from '@monaco-editor/react';
import { FileCode, Sparkles, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  pyw: 'python',
  json: 'json',
  jsonc: 'json',
  md: 'markdown',
  mdx: 'markdown',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  svg: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  conf: 'ini',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  ps1: 'powershell',
  bat: 'bat',
  cmd: 'bat',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  rb: 'ruby',
  php: 'php',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cc: 'cpp',
  cs: 'csharp',
  swift: 'swift',
  r: 'r',
  R: 'r',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  vue: 'html',
  svelte: 'html',
  env: 'ini',
  lock: 'json',
};

function getLanguage(filePath: string): string {
  const fileName = filePath.split(/[/\\]/).pop()?.toLowerCase() || '';
  if (fileName === 'dockerfile') return 'dockerfile';
  if (fileName === 'makefile' || fileName === 'gnumakefile') return 'makefile';
  if (fileName.startsWith('.env')) return 'ini';
  const ext = fileName.split('.').pop() || '';
  return EXTENSION_LANGUAGE_MAP[ext] || 'plaintext';
}

function getFileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath;
}

const CodeEditor: React.FC = () => {
  const { selectedFile, fileContent, setSelectedFile, setFileContent, showDiff } = useAppStore();

  const language = useMemo(
    () => (selectedFile ? getLanguage(selectedFile) : 'plaintext'),
    [selectedFile]
  );

  if (showDiff) return null;

  if (!selectedFile || fileContent === null) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0d1117] select-none">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-[#161b22] border border-[#30363d] flex items-center justify-center">
              <Sparkles size={32} className="text-[#30363d]" />
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#1f6feb] animate-pulse-subtle" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold text-[#e6edf3] mb-1">PIX Code Agent</h2>
            <p className="text-xs text-[#8b949e] max-w-[260px] leading-relaxed">
              Select a file from the explorer or ask the AI agent to generate code
            </p>
          </div>
          <div className="flex flex-col gap-2 mt-2 text-[10px] text-[#484f58]">
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 rounded bg-[#161b22] border border-[#30363d] font-mono">Ctrl+Enter</kbd>
              <span>Send message</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 rounded bg-[#161b22] border border-[#30363d] font-mono">Ctrl+Shift+D</kbd>
              <span>Toggle diff view</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#0d1117] overflow-hidden">
      {/* File Tab Header */}
      <div className="flex items-center bg-[#161b22] border-b border-[#30363d] min-h-[36px]">
        <div className="flex items-center gap-2 px-4 py-2 bg-[#0d1117] border-r border-[#30363d] text-xs max-w-[250px]">
          <FileCode size={13} className="text-[#58a6ff] flex-shrink-0" />
          <span className="truncate text-[#e6edf3]">{getFileName(selectedFile)}</span>
          <button
            onClick={() => {
              setSelectedFile(null);
              setFileContent(null);
            }}
            className="ml-1 p-0.5 rounded hover:bg-[#30363d] text-[#8b949e] hover:text-[#e6edf3] transition-colors flex-shrink-0"
          >
            <X size={12} />
          </button>
        </div>
        <div className="flex-1" />
        <span className="px-3 text-[10px] text-[#484f58] font-mono uppercase">{language}</span>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 monaco-editor-container">
        <Editor
          height="100%"
          language={language}
          value={fileContent}
          theme="vs-dark"
          options={{
            readOnly: true,
            minimap: { enabled: true, scale: 1 },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
            fontLigatures: true,
            lineNumbers: 'on',
            renderLineHighlight: 'line',
            scrollBeyondLastLine: false,
            wordWrap: 'off',
            padding: { top: 12 },
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            bracketPairColorization: { enabled: true },
            guides: {
              bracketPairs: true,
              indentation: true,
            },
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
              verticalSliderSize: 8,
            },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
          }}
          loading={
            <div className="flex items-center justify-center h-full bg-[#0d1117]">
              <div className="flex items-center gap-2 text-[#8b949e] text-sm">
                <div className="w-4 h-4 border-2 border-[#30363d] border-t-[#58a6ff] rounded-full animate-spin" />
                Loading editor...
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
};

export default CodeEditor;
