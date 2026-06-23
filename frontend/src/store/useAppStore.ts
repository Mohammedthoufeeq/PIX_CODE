import { create } from 'zustand';
import type { SessionRecord } from '../api/client';

export type { SessionRecord };

// ─── Types ───

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
  extension?: string;
}

export interface AgentStep {
  type: 'thought' | 'action' | 'observation' | 'diff' | 'status';
  content: string;
  tool?: string;
  args?: any;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  filesModified?: string[];
  plan?: string;
  steps?: AgentStep[];
  isStreaming?: boolean;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  type: 'api' | 'ai' | 'server';
  // API calls
  method?: string;
  url?: string;
  status?: number;
  duration?: number;  // ms
  requestPreview?: string;   // truncated to ~200 chars
  responsePreview?: string;  // truncated to ~300 chars
  error?: string;
  // AI calls
  model?: string;
  // Server logs
  level?: string;
  logger?: string;
  message?: string;
}

export interface DiffResult {
  filePath: string;
  original: string;
  modified: string;
  diff: string;
  status: 'pending' | 'applied' | 'rejected';
}

export interface TaskRecord {
  id: string;
  prompt: string;
  model: string;
  status: 'planning' | 'planned' | 'executing' | 'executed' | 'applied' | 'rejected' | 'error';
  plan?: string;
  diffs?: DiffResult[];
  createdAt: string;
  completedAt?: string;
}

// ─── State Interface ───

export interface AppState {
  // Project
  currentProject: string | null;
  recentProjects: string[];
  projectTree: TreeNode | null;

  // Files
  selectedFile: string | null;
  fileContent: string | null;
  contextFiles: string[];

  // Editor
  showDiff: boolean;
  diffData: { original: string; modified: string; filePath: string } | null;

  // Chat
  chatMessages: ChatMessage[];
  isLoading: boolean;
  chatSessions: SessionRecord[];
  currentSessionId: string | null;

  // Agent
  currentPlan: string | null;
  pendingDiffs: DiffResult[];
  tasks: TaskRecord[];

  // Settings
  selectedModel: string;

  // Git
  gitBranch: string | null;
  gitStatus: { status: string; files: { path: string; status: string }[] } | null;

  // UI
  activePanel: 'chat' | 'tasks' | 'git' | 'logs';
  sidebarTab: 'chat' | 'cowork' | 'code';
  showTerminal: boolean;
  terminalOutput: string[];
  showApproval: boolean;
  approvalData: {
    type: string;
    description: string;
    details: string;
    onApprove: () => void;
    onReject: () => void;
  } | null;

  // Actions
  setCurrentProject: (p: string) => void;
  setSelectedFile: (f: string | null) => void;
  setFileContent: (c: string | null) => void;
  addChatMessage: (m: ChatMessage) => void;
  updateChatMessage: (id: string, updates: Partial<ChatMessage>) => void;
  clearChatMessages: () => void;
  setChatSessions: (sessions: SessionRecord[]) => void;
  updateSessionInList: (id: string, updates: Partial<SessionRecord>) => void;
  addSessionToList: (session: SessionRecord) => void;
  setCurrentSessionId: (id: string | null) => void;
  setLoading: (l: boolean) => void;
  setCurrentPlan: (p: string | null) => void;
  setSelectedModel: (m: string) => void;
  setShowDiff: (s: boolean) => void;
  setDiffData: (d: { original: string; modified: string; filePath: string } | null) => void;
  setProjectTree: (t: TreeNode | null) => void;
  setContextFiles: (f: string[]) => void;
  addContextFile: (f: string) => void;
  removeContextFile: (f: string) => void;
  setTasks: (t: TaskRecord[]) => void;
  addTask: (t: TaskRecord) => void;
  updateTask: (id: string, updates: Partial<TaskRecord>) => void;
  setGitBranch: (b: string | null) => void;
  setGitStatus: (s: { status: string; files: { path: string; status: string }[] } | null) => void;
  setActivePanel: (p: 'chat' | 'tasks' | 'git' | 'logs') => void;
  setShowTerminal: (s: boolean) => void;
  addTerminalOutput: (o: string) => void;
  clearTerminalOutput: () => void;
  setShowApproval: (s: boolean) => void;
  setApprovalData: (d: AppState['approvalData']) => void;
  setPendingDiffs: (d: DiffResult[]) => void;
  setRecentProjects: (p: string[]) => void;
  updateDiffStatus: (filePath: string, status: DiffResult['status']) => void;
  setSidebarTab: (t: 'chat' | 'cowork' | 'code') => void;

  // Logs
  logs: LogEntry[];
  addLog: (entry: LogEntry) => void;
  clearLogs: () => void;
}

// ─── Store ───

export const useAppStore = create<AppState>((set) => ({
  // Project
  currentProject: null,
  recentProjects: [],
  projectTree: null,

  // Files
  selectedFile: null,
  fileContent: null,
  contextFiles: [],

  // Editor
  showDiff: false,
  diffData: null,

  // Chat
  chatMessages: [],
  isLoading: false,
  chatSessions: [],
  currentSessionId: null,

  // Agent
  currentPlan: null,
  pendingDiffs: [],
  tasks: [],

  // Settings
  selectedModel: 'sonnet-4',

  // Git
  gitBranch: null,
  gitStatus: null,

  // UI
  activePanel: 'chat',
  sidebarTab: 'chat',
  showTerminal: false,
  terminalOutput: [],
  showApproval: false,
  approvalData: null,

  // Actions
  setCurrentProject: (p) => set({ currentProject: p }),
  setSelectedFile: (f) => set({ selectedFile: f }),
  setFileContent: (c) => set({ fileContent: c }),
  addChatMessage: (m) =>
    set((state) => ({ chatMessages: [...state.chatMessages, m] })),
  updateChatMessage: (id, updates) =>
    set((state) => ({
      chatMessages: state.chatMessages.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    })),
  clearChatMessages: () => set({ chatMessages: [] }),
  setChatSessions: (sessions) => set({ chatSessions: sessions }),
  updateSessionInList: (id, updates) =>
    set((state) => ({
      chatSessions: state.chatSessions.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    })),
  addSessionToList: (session) =>
    set((state) => ({ chatSessions: [session, ...state.chatSessions] })),
  setCurrentSessionId: (id) => set({ currentSessionId: id }),
  setLoading: (l) => set({ isLoading: l }),
  setCurrentPlan: (p) => set({ currentPlan: p }),
  setSelectedModel: (m) => set({ selectedModel: m }),
  setShowDiff: (s) => set({ showDiff: s }),
  setDiffData: (d) => set({ diffData: d }),
  setProjectTree: (t) => set({ projectTree: t }),
  setContextFiles: (f) => set({ contextFiles: f }),
  addContextFile: (f) =>
    set((state) => ({
      contextFiles: state.contextFiles.includes(f)
        ? state.contextFiles
        : [...state.contextFiles, f],
    })),
  removeContextFile: (f) =>
    set((state) => ({
      contextFiles: state.contextFiles.filter((cf) => cf !== f),
    })),
  setTasks: (t) => set({ tasks: t }),
  addTask: (t) =>
    set((state) => ({ tasks: [t, ...state.tasks] })),
  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
    })),
  setGitBranch: (b) => set({ gitBranch: b }),
  setGitStatus: (s) => set({ gitStatus: s }),
  setActivePanel: (p) => set({ activePanel: p }),
  setShowTerminal: (s) => set({ showTerminal: s }),
  addTerminalOutput: (o) =>
    set((state) => ({ terminalOutput: [...state.terminalOutput, o] })),
  clearTerminalOutput: () => set({ terminalOutput: [] }),
  setShowApproval: (s) => set({ showApproval: s }),
  setApprovalData: (d) => set({ approvalData: d }),
  setPendingDiffs: (d) => set({ pendingDiffs: d }),
  setRecentProjects: (p) => set({ recentProjects: p }),
  updateDiffStatus: (filePath, status) =>
    set((state) => ({
      pendingDiffs: state.pendingDiffs.map((d) =>
        d.filePath === filePath ? { ...d, status } : d
      ),
    })),
  setSidebarTab: (t) => set({ sidebarTab: t }),

  // Logs
  logs: [],
  addLog: (entry) =>
    set((state) => ({
      // Keep at most 200 entries; newest first
      logs: [entry, ...state.logs].slice(0, 200),
    })),
  clearLogs: () => set({ logs: [] }),
}));
