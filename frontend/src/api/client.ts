// ─── API Client for PIX Code Agent Backend ───

const API_BASE = '';

interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  success: boolean;
}

// ─── Log Emitter ───

import type { LogEntry } from '../store/useAppStore';

type LogHandler = (entry: LogEntry) => void;
let _logHandler: LogHandler | null = null;

export function setLogHandler(fn: LogHandler) {
  _logHandler = fn;
}

function trunc(s: string, max = 250): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function emitApiLog(
  method: string,
  url: string,
  status: number | undefined,
  duration: number,
  reqBody: string | undefined,
  resBody: string | undefined,
  error?: string
) {
  if (!_logHandler) return;
  _logHandler({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    type: 'api',
    method,
    url,
    status,
    duration,
    requestPreview: reqBody ? trunc(reqBody) : undefined,
    responsePreview: resBody ? trunc(resBody) : undefined,
    error,
  });
}

export function emitAiLog(model: string, duration: number, preview: string, error?: string) {
  if (!_logHandler) return;
  _logHandler({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    type: 'ai',
    model,
    duration,
    responsePreview: trunc(preview, 300),
    error,
  });
}

// ─── Core request helper ───

async function request<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const method = (options.method || 'GET').toUpperCase();
  const t0 = Date.now();
  const reqBody = typeof options.body === 'string' ? options.body : undefined;

  try {
    const response = await fetch(`${API_BASE}${url}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    const rawText = await response.text();
    const duration = Date.now() - t0;

    if (!response.ok) {
      let errorMsg: string;
      try {
        const parsed = JSON.parse(rawText);
        errorMsg = parsed.detail || parsed.error || parsed.message || `HTTP ${response.status}`;
      } catch {
        errorMsg = rawText || `HTTP ${response.status}: ${response.statusText}`;
      }
      emitApiLog(method, url, response.status, duration, reqBody, rawText, errorMsg);
      return { success: false, error: errorMsg };
    }

    let data: T;
    try {
      data = JSON.parse(rawText) as T;
    } catch {
      data = rawText as unknown as T;
    }

    emitApiLog(method, url, response.status, duration, reqBody, rawText);
    return { success: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error';
    emitApiLog(method, url, undefined, Date.now() - t0, reqBody, undefined, message);
    return { success: false, error: message };
  }
}

// ─── Project ───

export async function selectProject(path: string) {
  return request<{ success: boolean; workspace: string }>('/api/project/select', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

export async function createProject(name: string) {
  return request<{ success: boolean; path: string; workspace: string }>('/api/project/create', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function getRecentProjects() {
  return request<string[]>('/api/project/recent');
}

export async function getProjectTree() {
  return request('/api/project/tree');
}

export async function indexProject() {
  return request('/api/project/index', { method: 'POST' });
}

export async function browseProject() {
  return request<{ success: boolean; path: string }>('/api/project/browse', { method: 'POST' });
}

export async function listDirs(path?: string) {
  const query = path ? `?path=${encodeURIComponent(path)}` : '';
  return request<{
    success: boolean;
    current_path: string;
    parent_path: string | null;
    dirs: string[];
    is_drives: boolean;
  }>(`/api/project/list-dirs${query}`);
}

// ─── Files ───

export async function readFile(path: string) {
  return request<{ content: string; language: string }>(
    `/api/files/read?path=${encodeURIComponent(path)}`
  );
}

export async function writeFile(path: string, content: string) {
  return request('/api/files/write', {
    method: 'POST',
    body: JSON.stringify({ path, content }),
  });
}

export async function searchFiles(query: string) {
  return request<{ results: string[] }>(`/api/files/search?q=${encodeURIComponent(query)}`);
}

// ─── Chat & Agent ───

export async function sendChat(
  message: string,
  contextFiles: string[],
  model: string
) {
  return request<{ response: string; files_modified?: string[] }>('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message, context_files: contextFiles, model }),
  });
}

export async function createPlan(
  prompt: string,
  contextFiles: string[],
  model: string
) {
  return request<{ plan: string; summary: string }>('/api/agent/plan', {
    method: 'POST',
    body: JSON.stringify({ prompt, context_files: contextFiles, model }),
  });
}

export async function executePlan(
  plan: string,
  contextFiles: string[],
  model: string
) {
  return request<{ results: DiffResultResponse[]; summary: string }>('/api/agent/execute', {
    method: 'POST',
    body: JSON.stringify({ plan, context_files: contextFiles, model }),
  });
}

export interface DiffResultResponse {
  file_path: string;
  original: string;
  modified: string;
  diff: string;
}

export async function applyDiff(diff: string, filePath: string) {
  return request('/api/agent/apply-diff', {
    method: 'POST',
    body: JSON.stringify({ diff, file_path: filePath }),
  });
}

export async function rejectDiff(filePath?: string) {
  return request('/api/agent/reject-diff', {
    method: 'POST',
    body: JSON.stringify({ file_path: filePath }),
  });
}

// ─── Shell / Terminal ───

export async function runCommand(command: string, cwd = '', approved = false) {
  return request<{
    stdout: string;
    stderr: string;
    exit_code: number;
    requires_approval: boolean;
    reason?: string;
  }>('/api/agent/run-command', {
    method: 'POST',
    body: JSON.stringify({ command, cwd, approved }),
  });
}

// ─── Tasks ───

export async function getTasks() {
  return request<TaskRecordResponse[]>('/api/tasks');
}

export interface TaskRecordResponse {
  id: string;
  prompt: string;
  model: string;
  status: string;
  plan?: string;
  diffs?: DiffResultResponse[];
  created_at: string;
  completed_at?: string;
}

// ─── Git ───

export async function gitStatus() {
  return request<{ status: string; files: GitFileStatus[] }>('/api/git/status');
}

export interface GitFileStatus {
  path: string;
  status: string;
}

export async function gitDiff() {
  return request<{ diff: string }>('/api/git/diff');
}

export async function gitCommit(message: string) {
  return request('/api/git/commit', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export async function gitBranch() {
  return request<{ current: string; branches: string[] }>('/api/git/branch');
}

// ─── Settings ───

export async function getSettings() {
  return request<Record<string, unknown>>('/api/settings');
}

export async function updateSettings(settings: Record<string, unknown>) {
  return request('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

// ─── Context ───

export async function addContext(path: string) {
  return request('/api/context/add', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

export async function removeContext(path: string) {
  return request('/api/context/remove', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

// ─── Chat History ───

export async function getChatHistory() {
  return request<{ history: any[] }>('/api/chat/history');
}

export async function saveChatHistory(history: any[]) {
  return request('/api/chat/history', {
    method: 'POST',
    body: JSON.stringify({ history }),
  });
}

// ─── Chat Sessions ───

export async function getSessions() {
  return request<{ sessions: Array<{ id: string; title: string; createdAt: number }> }>('/api/chat/sessions');
}

export async function createSession(id?: string, title?: string, history?: any[]) {
  return request<{ session: { id: string; title: string } }>('/api/chat/sessions', {
    method: 'POST',
    body: JSON.stringify({ id, title, history }),
  });
}

export async function getSession(id: string) {
  return request<{ session: { id: string; title: string; history: any[] } }>(`/api/chat/sessions/${id}`);
}

export async function updateSession(id: string, title?: string, history?: any[]) {
  return request<void>(`/api/chat/sessions/${id}`, {
    method: 'POST',
    body: JSON.stringify({ title, history }),
  });
}

export async function deleteSession(id: string) {
  return request<void>(`/api/chat/sessions/${id}`, {
    method: 'DELETE',
  });
}

export async function exportSession(id: string) {
  return request<{ file: string }>(`/api/chat/sessions/${id}/export`, {
    method: 'POST',
  });
}

export async function autotitleSession(id: string, first_message: string, model: string) {
  return request<{ title: string }>(`/api/chat/sessions/${id}/autotitle`, {
    method: 'POST',
    body: JSON.stringify({ first_message, model }),
  });
}

export async function updateSessionTags(id: string, tags: string[]) {
  return request<{ tags: string[] }>(`/api/chat/sessions/${id}/tags`, {
    method: 'PATCH',
    body: JSON.stringify({ tags }),
  });
}

export async function archiveSession(id: string) {
  return request<{ archived: boolean }>(`/api/chat/sessions/${id}/archive`, { method: 'POST' });
}

export async function unarchiveSession(id: string) {
  return request<{ archived: boolean }>(`/api/chat/sessions/${id}/unarchive`, { method: 'POST' });
}

export async function searchSessions(q: string) {
  return request<{ sessions: SessionRecord[] }>(
    `/api/chat/sessions/search?q=${encodeURIComponent(q)}`
  );
}

export async function forkSession(id: string, messageIndex: number, title?: string) {
  return request<{ session: SessionRecord }>(`/api/chat/sessions/${id}/fork`, {
    method: 'POST',
    body: JSON.stringify({ message_index: messageIndex, title }),
  });
}

export interface SessionRecord {
  id: string;
  title: string;
  createdAt: number;
  tags?: string[];
  archived?: boolean;
  parentId?: string | null;
  branchFrom?: { sessionId: string; messageIndex: number } | null;
}

// ─── File CRUD ───

export async function createFile(path: string, isDir = false) {
  return request<{ success: boolean; path: string }>('/api/files/create', {
    method: 'POST',
    body: JSON.stringify({ path, is_dir: isDir }),
  });
}

export async function deleteFile(path: string) {
  return request<{ success: boolean }>(`/api/files/delete?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
  });
}

export async function renameFile(oldPath: string, newPath: string) {
  return request<{ success: boolean; old_path: string; new_path: string }>('/api/files/rename', {
    method: 'POST',
    body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
  });
}

export async function getMotivationalQuote() {
  return request<{ quote: string }>('/api/quote');
}

export async function getServerLogs() {
  return request<{ logs: any[] }>('/api/logs');
}



