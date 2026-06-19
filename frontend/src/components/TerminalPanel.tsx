import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as TerminalIcon, ChevronDown, Trash2, Maximize2, Minimize2, Copy } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useAppStore } from '../store/useAppStore';
import * as api from '../api/client';
import toast from 'react-hot-toast';

// ANSI colour helpers
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  cyan:   '\x1b[38;2;0;240;255m',
  violet: '\x1b[38;2;176;38;255m',
  green:  '\x1b[38;2;63;185;80m',
  red:    '\x1b[38;2;248;81;73m',
  yellow: '\x1b[38;2;210;153;34m',
  grey:   '\x1b[38;2;139;148;158m',
  white:  '\x1b[38;2;201;209;217m',
};

const BANNER = [
  `${C.cyan}${C.bold}╔══════════════════════════════════════╗${C.reset}`,
  `${C.cyan}${C.bold}║  ${C.violet}PIX Code Agent ${C.cyan}· Neural Terminal   ${C.cyan}${C.bold}║${C.reset}`,
  `${C.cyan}${C.bold}╚══════════════════════════════════════╝${C.reset}`,
  `${C.grey}Type a shell command and press Enter.${C.reset}`,
  '',
].join('\r\n');

const PROMPT = `${C.cyan}${C.bold}→${C.reset} `;

const TerminalPanel: React.FC = () => {
  const {
    showTerminal,
    setShowTerminal,
    setShowApproval,
    setApprovalData,
    currentProject,
  } = useAppStore();

  const [expanded, setExpanded]   = useState(false);
  const containerRef  = useRef<HTMLDivElement>(null);
  const termRef       = useRef<Terminal | null>(null);
  const fitRef        = useRef<FitAddon | null>(null);
  const inputBuf      = useRef('');
  const historyBuf    = useRef<string[]>([]);
  const historyIdx    = useRef(-1);
  const isRunning     = useRef(false);

  // ── Bootstrap xterm ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!showTerminal || !containerRef.current) return;

    const term = new Terminal({
      theme: {
        background:       '#0d1117',
        foreground:       '#c9d1d9',
        cursor:           '#00f0ff',
        cursorAccent:     '#0d1117',
        selectionBackground: 'rgba(0,240,255,0.25)',
        black:   '#161b22', red:     '#f85149', green:   '#3fb950', yellow:  '#d29922',
        blue:    '#58a6ff', magenta: '#bc8cff', cyan:    '#39c5cf', white:   '#b1bac4',
        brightBlack:   '#6e7681', brightRed:   '#ff7b72', brightGreen: '#56d364',
        brightYellow:  '#e3b341', brightBlue:  '#79c0ff', brightMagenta: '#d2a8ff',
        brightCyan:    '#56d4dd', brightWhite: '#f0f6fc',
      },
      fontFamily:  "'JetBrains Mono', 'Fira Code', Consolas, monospace",
      fontSize:    12,
      lineHeight:  1.5,
      cursorStyle: 'bar',
      cursorBlink: true,
      scrollback:  2000,
      convertEol:  true,
    });

    const fit         = new FitAddon();
    const searchAddon = new SearchAddon();
    const linksAddon  = new WebLinksAddon();

    term.loadAddon(fit);
    term.loadAddon(searchAddon);
    term.loadAddon(linksAddon);
    term.open(containerRef.current);
    fit.fit();

    term.write(BANNER);
    term.write(PROMPT);

    // Resize observer
    const ro = new ResizeObserver(() => { try { fit.fit(); } catch {} });
    ro.observe(containerRef.current);

    // Keyboard input handling
    term.onData((data) => {
      if (isRunning.current) return;

      // Ctrl-C
      if (data === '\x03') {
        term.write('^C\r\n');
        inputBuf.current = '';
        term.write(PROMPT);
        return;
      }
      // Ctrl-L – clear
      if (data === '\x0c') {
        term.clear();
        term.write(PROMPT);
        return;
      }
      // Enter
      if (data === '\r') {
        const cmd = inputBuf.current.trim();
        term.write('\r\n');
        if (cmd) {
          historyBuf.current.unshift(cmd);
          historyIdx.current = -1;
          inputBuf.current = '';
          runCommand(cmd, term);
        } else {
          term.write(PROMPT);
        }
        return;
      }
      // Backspace
      if (data === '\x7f') {
        if (inputBuf.current.length > 0) {
          inputBuf.current = inputBuf.current.slice(0, -1);
          term.write('\b \b');
        }
        return;
      }
      // Up arrow – history
      if (data === '\x1b[A') {
        const next = historyIdx.current + 1;
        if (next < historyBuf.current.length) {
          historyIdx.current = next;
          const prev = historyBuf.current[next];
          // erase current input
          term.write('\x1b[2K\r' + PROMPT);
          inputBuf.current = prev;
          term.write(prev);
        }
        return;
      }
      // Down arrow – history
      if (data === '\x1b[B') {
        if (historyIdx.current > 0) {
          historyIdx.current--;
          const prev = historyBuf.current[historyIdx.current];
          term.write('\x1b[2K\r' + PROMPT);
          inputBuf.current = prev;
          term.write(prev);
        } else if (historyIdx.current === 0) {
          historyIdx.current = -1;
          term.write('\x1b[2K\r' + PROMPT);
          inputBuf.current = '';
        }
        return;
      }
      // Printable characters
      if (data >= ' ' || data === '\t') {
        inputBuf.current += data;
        term.write(data);
      }
    });

    termRef.current = term;
    fitRef.current  = fit;

    return () => {
      ro.disconnect();
      term.dispose();
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTerminal]);

  // Re-fit when expanded state changes
  useEffect(() => {
    setTimeout(() => { try { fitRef.current?.fit(); } catch {} }, 50);
  }, [expanded]);

  // ── Execute command via backend ──────────────────────────────────────────
  const runCommand = useCallback(async (cmd: string, term: Terminal, approved = false) => {
    isRunning.current = true;
    term.write(`${C.cyan}$ ${C.white}${cmd}${C.reset}\r\n`);

    try {
      const res = await api.runCommand(cmd, '', approved);
      if (!res.success) {
        term.write(`${C.red}✗ ${res.error ?? 'Unknown error'}${C.reset}\r\n`);
      } else if (res.data) {
        const { stdout, stderr, exit_code, requires_approval, reason } = res.data;

        if (requires_approval) {
          term.write(`${C.yellow}⚠ Command flagged: ${reason}${C.reset}\r\n`);
          setApprovalData({
            type:        'Dangerous Command Warning',
            description: `Command flagged as dangerous: "${cmd}"\nReason: ${reason}\n\nRun anyway?`,
            details:     cmd,
            onApprove:   () => { runCommand(cmd, term, true); },
            onReject:    () => {
              term.write(`${C.red}✗ Rejected by user${C.reset}\r\n`);
              term.write(PROMPT);
            },
          });
          setShowApproval(true);
          isRunning.current = false;
          return;
        }

        if (stdout) {
          term.write(stdout.replace(/\n/g, '\r\n'));
          if (!stdout.endsWith('\n')) term.write('\r\n');
        }
        if (stderr) {
          const lines = stderr.split('\n').filter(Boolean);
          lines.forEach((l) => term.write(`${C.red}${l}${C.reset}\r\n`));
        }
        const exitColor = exit_code === 0 ? C.green : C.red;
        term.write(`${exitColor}[exit ${exit_code}]${C.reset}\r\n`);
      }
    } catch {
      term.write(`${C.red}✗ Network error${C.reset}\r\n`);
    }

    isRunning.current = false;
    term.write(PROMPT);
  }, [setApprovalData, setShowApproval]);

  // ── Copy button ──────────────────────────────────────────────────────────
  function handleCopy() {
    if (!termRef.current) return;
    const sel = termRef.current.getSelection();
    if (sel) {
      navigator.clipboard.writeText(sel);
      toast.success('Copied');
    }
  }

  if (!showTerminal) return null;

  return (
    <div
      className={`bg-[#0d1117] border-t border-[#30363d] flex flex-col transition-all duration-300 ${
        expanded ? 'h-[420px]' : 'h-[220px]'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-[#30363d] flex-shrink-0">
        <div className="flex items-center gap-2">
          <TerminalIcon size={12} className="text-[#3fb950]" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8b949e] font-['Space_Grotesk']">
            Neural Terminal
          </span>
          {currentProject && (
            <span className="text-[9px] text-[#484f58] font-code truncate max-w-[120px]">
              {currentProject.split(/[/\\]/).pop()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleCopy}
            className="p-1 rounded hover:bg-[#30363d] text-[#484f58] hover:text-[#8b949e] transition-colors"
            title="Copy selection">
            <Copy size={11} />
          </button>
          <button onClick={() => { termRef.current?.clear(); termRef.current?.write(PROMPT); }}
            className="p-1 rounded hover:bg-[#30363d] text-[#484f58] hover:text-[#8b949e] transition-colors"
            title="Clear terminal">
            <Trash2 size={11} />
          </button>
          <button onClick={() => setExpanded((v) => !v)}
            className="p-1 rounded hover:bg-[#30363d] text-[#484f58] hover:text-[#8b949e] transition-colors"
            title={expanded ? 'Collapse' : 'Expand'}>
            {expanded ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
          </button>
          <button onClick={() => setShowTerminal(false)}
            className="p-1 rounded hover:bg-[#30363d] text-[#484f58] hover:text-[#8b949e] transition-colors">
            <ChevronDown size={12} />
          </button>
        </div>
      </div>

      {/* xterm.js mount point */}
      <div ref={containerRef} className="flex-1 overflow-hidden px-1 py-1" />
    </div>
  );
};

export default TerminalPanel;
