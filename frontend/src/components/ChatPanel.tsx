import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Sparkles,
  Play,
  MessageSquare,
  ListTodo,
  GitBranch,
  Loader2,
  Bot,
  User,
  FileCode,
  CheckCircle2,
  Copy,
  BookOpen,
  X,
  RefreshCw,
  ChevronDown,
  Maximize2,
  Minimize2,
  Plus,
  Monitor,
  Folder,
  CornerDownLeft,
  Download,
  Square,
  ScrollText,
  Trash2,
  Globe,
  Cpu,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { useAppStore, ChatMessage, LogEntry } from '../store/useAppStore';
import * as api from '../api/client';
import { emitAiLog } from '../api/client';
import toast from 'react-hot-toast';
import ModelSelector from './ModelSelector';
import TaskHistory from './TaskHistory';

// ─── Git Panel ───

const GitPanel: React.FC = () => {
  const { gitBranch, gitStatus, setGitBranch, setGitStatus, addTerminalOutput } = useAppStore();
  const [commitMsg, setCommitMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [gitDiffContent, setGitDiffContent] = useState<string | null>(null);

  async function loadGitInfo() {
    setIsLoading(true);
    try {
      const [branchRes, statusRes] = await Promise.all([
        api.gitBranch(),
        api.gitStatus(),
      ]);
      if (branchRes.success && branchRes.data) {
        setGitBranch(branchRes.data.current);
      }
      if (statusRes.success && statusRes.data) {
        setGitStatus(statusRes.data);
      }
    } catch {
      toast.error('Failed to load git info');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadGitDiff() {
    const res = await api.gitDiff();
    if (res.success && res.data) {
      setGitDiffContent(res.data.diff);
    }
  }

  async function handleCommit() {
    if (!commitMsg.trim()) {
      toast.error('Enter a commit message');
      return;
    }
    const res = await api.gitCommit(commitMsg.trim());
    if (res.success) {
      toast.success('Changes committed');
      addTerminalOutput(`[${new Date().toLocaleTimeString()}] ✓ Git commit: ${commitMsg}`);
      setCommitMsg('');
      await loadGitInfo();
    } else {
      toast.error(res.error || 'Commit failed');
    }
  }

  useEffect(() => {
    loadGitInfo();
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#30363d]">
        <div className="flex items-center gap-2">
          <GitBranch size={13} className="text-[#3fb950]" />
          <span className="text-xs text-[#e6edf3] font-medium">
            {gitBranch || 'No branch'}
          </span>
        </div>
        <button
          onClick={loadGitInfo}
          disabled={isLoading}
          className="p-1 rounded hover:bg-[#30363d] text-[#8b949e] transition-colors"
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-2 space-y-3">
        {/* Status */}
        {gitStatus?.files && gitStatus.files.length > 0 ? (
          <div>
            <span className="text-[10px] uppercase tracking-wider text-[#8b949e] font-semibold">
              Changes ({gitStatus.files.length})
            </span>
            <div className="mt-1 space-y-0.5">
              {gitStatus.files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[#1c2128] text-xs transition-colors">
                  <span
                    className={`text-[10px] font-mono font-bold w-3 text-center ${
                      f.status === 'M'
                        ? 'text-[#d29922]'
                        : f.status === 'A'
                        ? 'text-[#3fb950]'
                        : f.status === 'D'
                        ? 'text-[#f85149]'
                        : 'text-[#8b949e]'
                    }`}
                  >
                    {f.status}
                  </span>
                  <span className="text-[#c9d1d9] font-mono truncate text-[11px]">
                    {f.path}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-xs text-[#484f58] text-center py-4">
            {isLoading ? 'Loading...' : 'No changes detected'}
          </div>
        )}

        {/* Diff */}
        <div>
          <button
            onClick={loadGitDiff}
            className="text-[10px] uppercase tracking-wider text-[#58a6ff] hover:text-[#79c0ff] font-semibold transition-colors"
          >
            View Diff
          </button>
          {gitDiffContent && (
            <pre className="mt-1 text-[10px] text-[#c9d1d9] bg-[#0d1117] rounded-md p-2 overflow-auto scrollbar-thin max-h-[200px] font-mono whitespace-pre border border-[#30363d]">
              {gitDiffContent}
            </pre>
          )}
        </div>

        {/* Commit */}
        <div className="space-y-2">
          <span className="text-[10px] uppercase tracking-wider text-[#8b949e] font-semibold">
            Commit
          </span>
          <input
            type="text"
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCommit();
            }}
            placeholder="Commit message..."
            className="w-full bg-[#1c2128] text-[#e6edf3] text-xs px-3 py-2 rounded-md border border-[#30363d] focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/30 outline-none transition-all placeholder:text-[#484f58]"
          />
          <button
            onClick={handleCommit}
            disabled={!commitMsg.trim()}
            className="w-full px-3 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-md transition-colors"
          >
            Commit Changes
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Message Bubble ───

interface MessageBubbleProps {
  message: ChatMessage;
  onFork?: (msgId: string) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onFork }) => {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (message.role === 'system') {
    return (
      <div className="flex justify-center px-4 py-1.5 animate-fade-in">
        <div className="text-[10px] text-[#8b949e] bg-[#1c2128] px-3 py-1 rounded-full border border-[#30363d]">
          {message.content}
        </div>
      </div>
    );
  }

  const isUser = message.role === 'user';
  const time = new Date(message.timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={`flex gap-3 px-4 py-3 animate-slide-up ${
        isUser ? 'flex-row-reverse' : 'flex-row'
      }`}
    >
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border shadow-lg ${
          isUser ? 'bg-[#00f0ff]/10 border-[#00f0ff]/40 shadow-[0_0_10px_rgba(0,240,255,0.2)]' : 'bg-[#b026ff]/10 border-[#b026ff]/40 shadow-[0_0_10px_rgba(176,38,255,0.2)]'
        }`}
      >
        {isUser ? <User size={14} className="text-[#00f0ff]" /> : <Bot size={14} className="text-[#b026ff]" />}
      </div>
      <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`group relative rounded-2xl px-4 py-3 text-[13px] leading-relaxed font-['Space_Grotesk'] ${
            isUser
              ? 'bg-[#00f0ff]/10 text-[#e6edf3] border border-[#00f0ff]/30 rounded-tr-sm shadow-[0_0_15px_rgba(0,240,255,0.1)]'
              : 'glass-card text-[#e6edf3] rounded-tl-sm shadow-[0_0_15px_rgba(176,38,255,0.05)]'
          }`}
        >
          {/* Render steps if assistant and has steps */}
          {!isUser && message.steps && message.steps.length > 0 && (
            <div className="mb-2 pb-2 border-b border-[#30363d] space-y-1.5 max-h-[250px] overflow-y-auto scrollbar-thin">
              <span className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider block mb-1">
                Execution Steps
              </span>
              {message.steps.map((step, idx) => {
                if (step.type === 'status') {
                  return (
                    <div key={idx} className="flex items-center gap-1.5 text-[10px] text-[#8b949e]">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#8b949e] animate-pulse" />
                      <span>{step.content}</span>
                    </div>
                  );
                }
                if (step.type === 'thought') {
                  return (
                    <div key={idx} className="bg-[#161b22] border border-[#30363d]/50 rounded-lg p-2 text-[10px] text-[#8b949e] leading-relaxed italic">
                      <strong className="text-[#c9d1d9] not-italic block mb-0.5">Thought:</strong>
                      {step.content}
                    </div>
                  );
                }
                if (step.type === 'action') {
                  return (
                    <div key={idx} className="flex items-center gap-2 text-[10px] text-[#d29922] font-mono">
                      <span className="text-[9px] px-1 py-0.5 rounded bg-[#d29922]/10 border border-[#d29922]/20">TOOL CALL</span>
                      <span>{step.tool}({JSON.stringify(step.args)})</span>
                    </div>
                  );
                }
                if (step.type === 'observation') {
                  return (
                    <details key={idx} className="group/obs border border-[#30363d] rounded-lg bg-[#0d1117]">
                      <summary className="cursor-pointer px-2 py-1 text-[9px] text-[#8b949e] font-mono select-none hover:text-[#c9d1d9] list-none flex items-center justify-between">
                        <span>Observation (Click to expand)</span>
                        <ChevronDown size={10} className="group-open/obs:rotate-180 transition-transform" />
                      </summary>
                      <pre className="px-2 py-1 text-[10px] text-[#c9d1d9] overflow-x-auto scrollbar-thin whitespace-pre-wrap font-mono border-t border-[#30363d]">
                        {step.content}
                      </pre>
                    </details>
                  );
                }
                if (step.type === 'diff') {
                  return (
                    <div key={idx} className="flex items-center gap-2 text-[10px] text-[#3fb950]">
                      <span className="text-[9px] px-1 py-0.5 rounded bg-[#3fb950]/10 border border-[#3fb950]/20 font-mono">EDIT</span>
                      <span>{step.content}</span>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          )}

          {/* Render content with code blocks */}
          {message.content ? (
            <div className="relative">
              <MessageContent content={message.content} isUser={isUser} />
              {/* Blinking cursor while streaming (no finalAnswer yet) */}
              {!isUser && message.isStreaming && (
                <span className="inline-block w-[2px] h-[1em] bg-[#00f0ff] ml-0.5 align-middle animate-[pulse_0.8s_ease-in-out_infinite]" />
              )}
            </div>
          ) : (
            !isUser && (
              <div className="flex items-center gap-2 text-[#8b949e]">
                <Loader2 size={12} className="animate-spin text-[#58a6ff]" />
                <span className="text-[11px] italic">Agent is working...</span>
              </div>
            )
          )}

          {!isUser && message.content && (
            <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
              {onFork && (
                <button
                  onClick={() => onFork(message.id)}
                  className="p-1 rounded hover:bg-[#30363d] text-[#8b949e] hover:text-[#00f0ff] transition-colors"
                  title="Fork session channel from here"
                >
                  <GitBranch size={11} />
                </button>
              )}
              <button
                onClick={handleCopy}
                className="p-1 rounded hover:bg-[#30363d] text-[#8b949e] hover:text-[#00f0ff] transition-colors"
                title="Copy response"
              >
                {copied ? <CheckCircle2 size={11} className="text-[#3fb950]" /> : <Copy size={11} />}
              </button>
            </div>
          )}
        </div>

        {message.filesModified && message.filesModified.length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isUser ? 'justify-end' : ''}`}>
            {message.filesModified.map((f, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30"
              >
                <FileCode size={9} />
                {f.split(/[/\\]/).pop()}
              </span>
            ))}
          </div>
        )}

        <span className={`text-[9px] text-[#484f58] mt-0.5 block ${isUser ? 'text-right' : ''}`}>
          {time}
        </span>
      </div>
    </div>
  );
};

// ─── Message Content with Code Blocks ───

const MessageContent: React.FC<{ content: string; isUser: boolean }> = ({ content, isUser }) => {
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-1.5">
      {parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const lines = part.slice(3, -3).split('\n');
          const lang = lines[0]?.trim() || '';
          const code = lang ? lines.slice(1).join('\n') : lines.join('\n');
          return (
            <pre
              key={i}
              className="bg-[#0d1117] text-[#e6edf3] rounded-md p-2 overflow-x-auto text-[11px] font-mono border border-[#30363d] scrollbar-thin whitespace-pre-wrap"
            >
              {lang && (
                <span className="text-[9px] text-[#484f58] uppercase tracking-wider block mb-1">
                  {lang}
                </span>
              )}
              {code}
            </pre>
          );
        }

        // Bold, inline code, newlines
        const formatted = part
          .split('\n')
          .map((line, li) => {
            const segments = line.split(/(`[^`]+`)/g).map((seg, si) => {
              if (seg.startsWith('`') && seg.endsWith('`')) {
                return (
                  <code
                    key={si}
                    className={`px-1 py-0.5 rounded text-[11px] font-mono ${
                      isUser
                        ? 'bg-white/15'
                        : 'bg-[#0d1117] text-[#79c0ff] border border-[#30363d]'
                    }`}
                  >
                    {seg.slice(1, -1)}
                  </code>
                );
              }
              // Bold
              const boldParts = seg.split(/(\*\*[^*]+\*\*)/g).map((bp, bi) => {
                if (bp.startsWith('**') && bp.endsWith('**')) {
                  return (
                    <strong key={bi} className="font-semibold">
                      {bp.slice(2, -2)}
                    </strong>
                  );
                }
                return bp;
              });
              return <React.Fragment key={si}>{boldParts}</React.Fragment>;
            });

            return (
              <React.Fragment key={li}>
                {li > 0 && <br />}
                {segments}
              </React.Fragment>
            );
          });

        return <span key={i}>{formatted}</span>;
      })}
    </div>
  );
};

// ─── Log Panel ───

const LogPanel: React.FC = () => {
  const { logs, clearLogs } = useAppStore();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <ScrollText size={28} className="text-[#30363d] mb-2" />
        <p className="text-xs text-[#8b949e]">No activity logged yet.</p>
        <p className="text-[10px] text-[#484f58] mt-1">API calls and AI requests will appear here.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#30363d]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8b949e]">
          {logs.length} event{logs.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={clearLogs}
          className="flex items-center gap-1 text-[9px] text-[#8b949e] hover:text-[#f85149] transition-colors px-1.5 py-0.5 rounded hover:bg-[#f85149]/10"
        >
          <Trash2 size={10} />
          Clear
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin py-1 space-y-px px-1">
        {logs.map((log) => {
          const isExpanded = expanded === log.id;
          const isError = !!log.error;
          const isAi = log.type === 'ai';
          const time = new Date(log.timestamp).toLocaleTimeString(undefined, {
            hour: '2-digit', minute: '2-digit', second: '2-digit',
          });

          return (
            <button
              key={log.id}
              onClick={() => setExpanded(isExpanded ? null : log.id)}
              className={`w-full text-left rounded-md px-2 py-1.5 border transition-all ${
                isExpanded
                  ? 'bg-[#161b22] border-[#30363d]'
                  : 'bg-transparent border-transparent hover:bg-[#1c2128] hover:border-[#30363d]'
              }`}
            >
              {/* Row */}
              <div className="flex items-center gap-2">
                {/* Type badge */}
                {isAi ? (
                  <span className="flex-shrink-0 flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-[#b026ff]/10 border border-[#b026ff]/30 text-[#b026ff] font-mono font-bold">
                    <Cpu size={9} /> AI
                  </span>
                ) : (
                  <span className={`flex-shrink-0 flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                    isError
                      ? 'bg-[#f85149]/10 border border-[#f85149]/30 text-[#f85149]'
                      : 'bg-[#3fb950]/10 border border-[#3fb950]/30 text-[#3fb950]'
                  }`}>
                    <Globe size={9} />
                    {log.method || 'GET'}
                  </span>
                )}

                {/* Status */}
                {log.status && (
                  <span className={`text-[9px] font-mono ${log.status >= 400 ? 'text-[#f85149]' : 'text-[#8b949e]'}`}>
                    {log.status}
                  </span>
                )}

                {/* URL / model */}
                <span className="flex-1 text-[10px] text-[#c9d1d9] truncate font-mono">
                  {isAi ? (log.model || 'model') : (log.url || '')}
                </span>

                {/* Duration */}
                <span className="flex-shrink-0 flex items-center gap-0.5 text-[9px] text-[#484f58]">
                  <Clock size={9} />
                  {log.duration < 1000 ? `${log.duration}ms` : `${(log.duration / 1000).toFixed(1)}s`}
                </span>

                {/* Error indicator */}
                {isError && <AlertCircle size={11} className="flex-shrink-0 text-[#f85149]" />}

                {/* Time */}
                <span className="flex-shrink-0 text-[9px] text-[#484f58]">{time}</span>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                  {log.requestPreview && (
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-[#8b949e] font-semibold">Request</span>
                      <pre className="mt-0.5 text-[10px] text-[#c9d1d9] font-mono bg-[#0d1117] rounded p-1.5 overflow-x-auto scrollbar-thin whitespace-pre-wrap border border-[#30363d]">
                        {log.requestPreview}
                      </pre>
                    </div>
                  )}
                  {(log.responsePreview || log.error) && (
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-[#8b949e] font-semibold">
                        {log.error ? 'Error' : 'Response'}
                      </span>
                      <pre className={`mt-0.5 text-[10px] font-mono bg-[#0d1117] rounded p-1.5 overflow-x-auto scrollbar-thin whitespace-pre-wrap border ${
                        log.error ? 'text-[#f85149] border-[#f85149]/20' : 'text-[#c9d1d9] border-[#30363d]'
                      }`}>
                        {log.error || log.responsePreview}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── Chat Panel ───

interface ChatPanelProps {
  isCentered?: boolean;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ isCentered = false }) => {
  const {
    activePanel,
    setActivePanel,
    chatMessages,
    addChatMessage,
    updateChatMessage,
    isLoading,
    setLoading,
    contextFiles,
    selectedModel,
    currentPlan,
    setCurrentPlan,
    setPendingDiffs,
    setShowDiff,
    addTask,
    updateTask,
    addTerminalOutput,
    setProjectTree,
    setShowApproval,
    setApprovalData,
    currentProject,
    currentSessionId,
    setCurrentSessionId,
    chatSessions,
    setChatSessions,
    clearChatMessages,
  } = useAppStore();

  const [isWide, setIsWide] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentMsgIdRef = useRef<string | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, scrollToBottom]);

  // Save chat history automatically to the current active session channel whenever messages are updated
  useEffect(() => {
    if (currentProject && currentSessionId && chatMessages.length > 0) {
      api.updateSession(currentSessionId, undefined, chatMessages).catch(() => {});
    }
  }, [chatMessages, currentProject, currentSessionId]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  // Query/thinking timer
  useEffect(() => {
    let interval: any;
    if (isLoading) {
      setElapsedSeconds(0);
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  async function handleSend() {
    if (!input.trim() || isLoading) return;

    let sessionId = currentSessionId;
    if (!sessionId) {
      if (!currentProject) {
        toast.error("Mount a neural link workspace first!");
        return;
      }
      sessionId = `session-${Date.now()}`;
      setCurrentSessionId(sessionId);
      await api.createSession(sessionId, "Untitled Neural Session", []);
      
      const sRes = await api.getSessions();
      if (sRes.success && sRes.data?.sessions) {
        setChatSessions(sRes.data.sessions);
      }
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    addChatMessage(userMessage);
    const messageText = input.trim();
    setInput('');
    setLoading(true);

    // Trigger autotitling if it's currently untitled
    const currentSession = chatSessions.find((s) => s.id === sessionId);
    if (currentSession && (currentSession.title === "Untitled Neural Session" || currentSession.title === "New Session")) {
      api.autotitleSession(sessionId, messageText, selectedModel).then((titleRes) => {
        if (titleRes.success && titleRes.data?.title) {
          api.getSessions().then((sRes) => {
            if (sRes.success && sRes.data?.sessions) {
              setChatSessions(sRes.data.sessions);
            }
          });
        }
      });
    }

    addTerminalOutput(`[${new Date().toLocaleTimeString()}] Sending chat: ${messageText.slice(0, 50)}...`);

    const assistantMsgId = `asst-${Date.now()}`;
    currentMsgIdRef.current = assistantMsgId;
    const assistantMessage: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      steps: [],
      isStreaming: true,
    };
    addChatMessage(assistantMessage);

    // Create fresh abort controller for this request
    abortControllerRef.current = new AbortController();
    const aiStartTime = Date.now();
    let finalAnswer = '';
    let streamingText = '';

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        signal: abortControllerRef.current.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageText,
          context_files: contextFiles,
          model: selectedModel,
          history: chatMessages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({
              role: m.role,
              content: m.content,
            })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to read stream');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      const steps: any[] = [];
      const filesModified: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim().startsWith('data: ')) {
            try {
              const data = JSON.parse(line.trim().slice(6));

              if (data.type === 'token') {
                // Real-time token streaming — show raw output while LLM generates
                streamingText += data.content;
                updateChatMessage(assistantMsgId, {
                  content: streamingText,
                  steps: [...steps],
                  filesModified: [...filesModified],
                });
              } else if (data.type === 'status') {
                steps.push({ type: 'status', content: data.content });
                addTerminalOutput(`[Agent Status] ${data.content}`);
                // Clear streaming buffer when a new step begins
                streamingText = '';
              } else if (data.type === 'thought') {
                streamingText = '';
                steps.push({ type: 'thought', content: data.content });
              } else if (data.type === 'action') {
                streamingText = '';
                steps.push({
                  type: 'action',
                  content: `Calling ${data.tool}`,
                  tool: data.tool,
                  args: data.args,
                });
                addTerminalOutput(`[Agent Action] Calling ${data.tool}(${JSON.stringify(data.args)})`);
              } else if (data.type === 'requires_approval') {
                const app_id = data.approval_id;
                const tool = data.tool;
                const args = data.args;

                steps.push({
                  type: 'action',
                  content: `Requires Approval: ${tool}`,
                  tool: tool,
                  args: args,
                });

                setApprovalData({
                  type: `Tool Approval Required`,
                  description: `The agent wants to execute the following tool action. Do you approve?`,
                  details: tool === 'run_command'
                    ? `Command: ${args.command}`
                    : `Write code to ${args.path}:\n\n${args.content.slice(0, 800)}${args.content.length > 800 ? '\n...' : ''}`,
                  onApprove: async () => {
                    addTerminalOutput(`[Approval] Approved ${tool}`);
                    await fetch('/api/chat/approve', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ approval_id: app_id }),
                    });
                  },
                  onReject: async () => {
                    addTerminalOutput(`[Approval] Rejected ${tool}`);
                    await fetch('/api/chat/reject', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ approval_id: app_id }),
                    });
                  },
                });
                setShowApproval(true);
              } else if (data.type === 'diff') {
                const d = data.diff;
                steps.push({
                  type: 'diff',
                  content: `Proposed edits to ${d.file_path}`,
                });
                
                // Set pending diff and open diff viewer
                const newDiff = {
                  filePath: d.file_path,
                  original: d.original,
                  modified: d.modified,
                  diff: d.diff,
                  status: 'pending' as const,
                };
                setPendingDiffs([newDiff]);
                setShowDiff(true);
                
                if (!filesModified.includes(d.file_path)) {
                  filesModified.push(d.file_path);
                }
              } else if (data.type === 'observation') {
                streamingText = '';
                steps.push({ type: 'observation', content: data.content });
              } else if (data.type === 'answer') {
                streamingText = '';
                finalAnswer = data.content;
                updateChatMessage(assistantMsgId, { content: finalAnswer, isStreaming: false });
              }

              // Update active message steps and final content
              updateChatMessage(assistantMsgId, {
                content: finalAnswer,
                steps: [...steps],
                filesModified: [...filesModified],
              });
            } catch (e) {
              // Parse error
            }
          }
        }
      }
      // Ensure streaming cursor is cleared even if no answer event was emitted
      updateChatMessage(assistantMsgId, { isStreaming: false });
      emitAiLog(selectedModel, Date.now() - aiStartTime, finalAnswer || streamingText);
      addTerminalOutput(`[${new Date().toLocaleTimeString()}] ✓ Execution completed`);
      // Reload the file tree
      api.getProjectTree().then((treeRes) => {
        if (treeRes.success && treeRes.data) {
          setProjectTree((treeRes.data as any).tree);
        }
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User stopped — clean up gracefully
        updateChatMessage(assistantMsgId, { isStreaming: false, content: (finalAnswer || streamingText) + '\n\n*(stopped)*' });
        emitAiLog(selectedModel, Date.now() - aiStartTime, 'stopped by user', 'aborted');
      } else {
        toast.error('Agent loop failed');
        updateChatMessage(assistantMsgId, {
          content: `Error: ${err.message || 'Failed to complete execution'}`,
          isStreaming: false,
        });
        emitAiLog(selectedModel, Date.now() - aiStartTime, '', err.message);
      }
    } finally {
      abortControllerRef.current = null;
      currentMsgIdRef.current = null;
      setLoading(false);
    }
  }

  async function handlePlan() {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: `📋 Plan: ${input.trim()}`,
      timestamp: Date.now(),
    };
    addChatMessage(userMessage);
    const prompt = input.trim();
    setInput('');
    setLoading(true);

    const taskId = `task-${Date.now()}`;
    addTask({
      id: taskId,
      prompt,
      model: selectedModel,
      status: 'planning',
      createdAt: new Date().toISOString(),
    });

    addTerminalOutput(`[${new Date().toLocaleTimeString()}] Creating plan...`);

    try {
      const res = await api.createPlan(prompt, contextFiles, selectedModel);
      if (res.success && res.data) {
        setCurrentPlan(res.data.plan);
        updateTask(taskId, { status: 'planned', plan: res.data.plan });

        addChatMessage({
          id: `plan-${Date.now()}`,
          role: 'assistant',
          content: `**Plan Created:**\n\n${res.data.plan}\n\n${res.data.summary || ''}`,
          timestamp: Date.now(),
          plan: res.data.plan,
        });
        addTerminalOutput(`[${new Date().toLocaleTimeString()}] ✓ Plan created`);
      } else {
        toast.error(res.error || 'Failed to create plan');
        updateTask(taskId, { status: 'error' });
      }
    } catch {
      toast.error('Network error');
      updateTask(taskId, { status: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    if (!currentPlan || isLoading) return;
    setLoading(true);

    addTerminalOutput(`[${new Date().toLocaleTimeString()}] Executing plan...`);

    const taskId = `exec-${Date.now()}`;
    addTask({
      id: taskId,
      prompt: 'Execute plan',
      model: selectedModel,
      status: 'executing',
      plan: currentPlan,
      createdAt: new Date().toISOString(),
    });

    try {
      const res = await api.executePlan(currentPlan, contextFiles, selectedModel);
      if (res.success && res.data) {
        const diffs = res.data.results.map((r) => ({
          filePath: r.file_path,
          original: r.original,
          modified: r.modified,
          diff: r.diff,
          status: 'pending' as const,
        }));

        setPendingDiffs(diffs);
        setShowDiff(true);
        updateTask(taskId, { status: 'executed', diffs });

        addChatMessage({
          id: `exec-${Date.now()}`,
          role: 'assistant',
          content: `**Execution Complete:** ${diffs.length} file(s) modified.\n\n${res.data.summary || 'Review the changes in the diff viewer.'}`,
          timestamp: Date.now(),
          filesModified: diffs.map((d) => d.filePath),
        });

        setCurrentPlan(null);
        addTerminalOutput(`[${new Date().toLocaleTimeString()}] ✓ Plan executed: ${diffs.length} files`);
      } else {
        toast.error(res.error || 'Execution failed');
        updateTask(taskId, { status: 'error' });
      }
    } catch {
      toast.error('Network error');
      updateTask(taskId, { status: 'error' });
    } finally {
      setLoading(false);
    }
  }

  function handleStop() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const handleForkSession = async (msgId: string) => {
    if (!currentProject || !currentSessionId) return;

    const msgIndex = chatMessages.findIndex((m) => m.id === msgId);
    if (msgIndex === -1) return;

    const forkHistory = chatMessages.slice(0, msgIndex + 1);
    const forkId = `session-fork-${Date.now()}`;
    const parentSession = chatSessions.find(s => s.id === currentSessionId);
    const forkTitle = `Fork of ${parentSession ? parentSession.title : 'Neural Session'}`;

    const res = await api.createSession(forkId, forkTitle, forkHistory);
    if (res.success) {
      setCurrentSessionId(forkId);
      clearChatMessages();
      forkHistory.forEach(m => addChatMessage(m));

      const sessionsRes = await api.getSessions();
      if (sessionsRes.success && sessionsRes.data?.sessions) {
        setChatSessions(sessionsRes.data.sessions);
      }
      toast.success(`Session forked: ${forkTitle}`);
    } else {
      toast.error("Fork failed");
    }
  };

  const { logs } = useAppStore();

  const tabs = [
    { id: 'chat' as const, label: 'Chat', icon: <MessageSquare size={13} /> },
    { id: 'tasks' as const, label: 'Tasks', icon: <ListTodo size={13} /> },
    { id: 'git' as const, label: 'Git', icon: <GitBranch size={13} /> },
    { id: 'logs' as const, label: 'Logs', icon: <ScrollText size={13} />, badge: logs.length },
  ];

  return (
    <div className={`flex flex-col h-full transition-all duration-500 ${
      isCentered 
        ? 'w-full bg-transparent' 
        : `glass-panel border-l border-[#ffffff0a] ${isWide ? 'w-[680px] min-w-[680px]' : 'w-[400px] min-w-[400px]'}`
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#ffffff0a] bg-black/20">
        <div className="flex items-center gap-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActivePanel(tab.id)}
              className={`relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold font-['Space_Grotesk'] tracking-wide transition-all duration-300 ${
                activePanel === tab.id
                  ? 'bg-[#b026ff]/15 text-[#b026ff] border border-[#b026ff]/30 shadow-[0_0_10px_rgba(176,38,255,0.2)]'
                  : 'text-[#8b949e] hover:text-[#00f0ff] hover:bg-[#ffffff05] border border-transparent'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] flex items-center justify-center text-[8px] font-mono rounded-full bg-[#b026ff] text-white px-0.5">
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {currentSessionId && (
            <button
              onClick={async () => {
                const res = await api.exportSession(currentSessionId);
                if (res.success && res.data?.file) {
                  toast.success(`Exported: ${res.data.file.split(/[/\\]/).pop()}`);
                } else {
                  toast.error("Export failed");
                }
              }}
              className="p-1.5 rounded-md text-[#8b949e] hover:text-[#00f0ff] hover:bg-[#ffffff05] transition-all border border-transparent hover:border-[#00f0ff]/20"
              title="Export chat log to Markdown"
            >
              <Download size={13} />
            </button>
          )}
          {!isCentered && (
            <button
              onClick={() => setIsWide(!isWide)}
              className="p-1.5 rounded-md text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#1c2128] transition-all"
              title={isWide ? "Collapse chat panel" : "Expand chat panel"}
            >
              {isWide ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          )}
          <ModelSelector />
        </div>
      </div>

      {/* Panel Content */}
      {activePanel === 'chat' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto scrollbar-thin py-2">
            {chatMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full px-8 text-center">
                <div className="w-12 h-12 rounded-xl bg-[#1c2128] border border-[#30363d] flex items-center justify-center mb-3">
                  <Sparkles size={20} className="text-[#58a6ff]" />
                </div>
                <h3 className="text-sm font-medium text-[#e6edf3] mb-1">AI Agent Ready</h3>
                <p className="text-[11px] text-[#8b949e] leading-relaxed">
                  Ask questions, generate code, or create an execution plan.
                  Add files to context for better results.
                </p>
                {contextFiles.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1 justify-center">
                    {contextFiles.map((f, i) => (
                      <span
                        key={i}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-[#1f6feb22] text-[#58a6ff] border border-[#1f6feb33]"
                      >
                        {f.split(/[/\\]/).pop()}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {chatMessages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} onFork={handleForkSession} />
            ))}
            {isLoading && (
              <div className="flex gap-3 px-4 py-3 animate-fade-in">
                <div className="w-8 h-8 rounded-full bg-[#b026ff]/10 border border-[#b026ff]/40 shadow-[0_0_10px_rgba(176,38,255,0.2)] flex items-center justify-center flex-shrink-0">
                  <Bot size={14} className="text-[#b026ff]" />
                </div>
                <div className="glass-card rounded-tl-sm px-4 py-3 border border-[#b026ff]/30">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 h-3">
                      <div className="w-[3px] bg-[#b026ff] rounded-full animate-[pulse_1s_ease-in-out_infinite]" style={{ height: '40%' }} />
                      <div className="w-[3px] bg-[#00f0ff] rounded-full animate-[pulse_1s_ease-in-out_infinite_0.2s]" style={{ height: '100%' }} />
                      <div className="w-[3px] bg-[#b026ff] rounded-full animate-[pulse_1s_ease-in-out_infinite_0.4s]" style={{ height: '60%' }} />
                      <div className="w-[3px] bg-[#00f0ff] rounded-full animate-[pulse_1s_ease-in-out_infinite_0.6s]" style={{ height: '80%' }} />
                      <div className="w-[3px] bg-[#b026ff] rounded-full animate-[pulse_1s_ease-in-out_infinite_0.8s]" style={{ height: '30%' }} />
                    </div>
                    <span className="text-[13px] text-[#e6edf3] font-['Space_Grotesk'] loading-dots font-semibold tracking-wide">
                      NEURAL PROCESSING ({elapsedSeconds}s)
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Plan Approval Bar */}
          {currentPlan && (
            <div className="px-3 py-2 border-t border-[#30363d] bg-[#1c2128] animate-slide-up">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-[#d29922] font-semibold uppercase tracking-wider flex items-center gap-1">
                  <BookOpen size={11} />
                  Plan Ready
                </span>
                <button
                  onClick={() => setCurrentPlan(null)}
                  className="p-0.5 rounded hover:bg-[#30363d] text-[#8b949e]"
                >
                  <X size={11} />
                </button>
              </div>
              <button
                onClick={handleExecute}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white text-xs font-medium rounded-md transition-colors"
              >
                <Play size={12} />
                Approve & Execute Plan
              </button>
            </div>
          )}

          {/* Context Files Bar */}
          {contextFiles.length > 0 && (
            <div className="px-3 py-1.5 border-t border-[#30363d] bg-[#0d111799]">
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
                <span className="text-[9px] text-[#484f58] flex-shrink-0 mr-1">CTX:</span>
                {contextFiles.map((f, i) => (
                  <span
                    key={i}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-[#1f6feb15] text-[#58a6ff] border border-[#1f6feb22] whitespace-nowrap flex-shrink-0"
                  >
                    {f.split(/[/\\]/).pop()}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="p-3 border-t border-[#ffffff0a] bg-black/40">
            <div className="glass-card p-3 border border-[#ffffff10] flex flex-col gap-3 hover:border-[#00f0ff]/40 transition-all duration-300 shadow-[0_0_15px_rgba(0,240,255,0.05)]">
              
              {/* Pills bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 px-2 py-0.5 bg-[#00f0ff]/10 text-[#00f0ff] text-[10px] font-bold font-['Space_Grotesk'] rounded border border-[#00f0ff]/30">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00f0ff] animate-pulse" />
                    LINK ACTIVE
                  </span>
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-[#ffffff05] text-[#8b949e] text-[10px] font-code rounded border border-[#ffffff10] truncate max-w-[150px]">
                    {currentProject ? currentProject.split(/[/\\]/).pop() : 'No Project'}
                  </span>
                </div>

                {/* Cyber Mascot */}
                <div className="flex-shrink-0 opacity-100 hover:scale-110 transition-transform cursor-pointer" title="PIX Neural Core">
                  <div className="w-6 h-6 rounded-md bg-[#00f0ff]/20 border border-[#00f0ff]/50 flex items-center justify-center shadow-[0_0_10px_rgba(0,240,255,0.3)]">
                    <Sparkles size={14} className="text-[#00f0ff]" />
                  </div>
                </div>
              </div>

              {/* Input textarea */}
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading}
                  placeholder="Transmit instructions to PIX..."
                  rows={1}
                  className="w-full bg-[#050505]/50 text-[#e6edf3] text-sm font-code px-3 py-3 rounded-lg border border-[#ffffff10] focus:border-[#00f0ff]/50 focus:ring-1 focus:ring-[#00f0ff]/20 outline-none placeholder:text-[#484f58] resize-none leading-relaxed transition-all scrollbar-none"
                  style={{ minHeight: '44px', maxHeight: '120px' }}
                />
                <div className="absolute right-2.5 bottom-2.5 flex items-center gap-2">
                  {!isLoading && (
                    <button
                      onClick={handlePlan}
                      disabled={!input.trim()}
                      title="Generate Architecture Plan"
                      className="p-1.5 bg-[#b026ff]/10 border border-[#b026ff]/30 hover:bg-[#b026ff]/30 text-[#b026ff] disabled:opacity-30 rounded shadow-[0_0_10px_rgba(176,38,255,0.1)] transition-all"
                    >
                      <ListTodo size={12} />
                    </button>
                  )}
                  {isLoading ? (
                    <button
                      onClick={handleStop}
                      title="Stop generation"
                      className="p-1.5 bg-[#f85149]/20 hover:bg-[#f85149]/40 border border-[#f85149]/50 text-[#f85149] rounded shadow-[0_0_10px_rgba(248,81,73,0.2)] transition-all animate-pulse"
                    >
                      <Square size={12} />
                    </button>
                  ) : (
                    <button
                      onClick={handleSend}
                      disabled={!input.trim()}
                      className="p-1.5 bg-[#00f0ff]/20 hover:bg-[#00f0ff]/40 border border-[#00f0ff]/50 disabled:opacity-30 text-[#00f0ff] rounded shadow-[0_0_10px_rgba(0,240,255,0.2)] transition-all glow-blue"
                    >
                      <Send size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* No bottom controls needed for clean UI */}

            </div>
          </div>
        </div>
      )}

      {activePanel === 'tasks' && <TaskHistory />}
      {activePanel === 'git' && <GitPanel />}
      {activePanel === 'logs' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <LogPanel />
        </div>
      )}
    </div>
  );
};

export default ChatPanel;
