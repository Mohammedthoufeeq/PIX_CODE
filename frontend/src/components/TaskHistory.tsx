import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Clock, CheckCircle2, XCircle, AlertCircle, Loader2, Zap } from 'lucide-react';
import { useAppStore, TaskRecord } from '../store/useAppStore';

function getStatusConfig(status: TaskRecord['status']) {
  switch (status) {
    case 'planning':
      return { icon: <Loader2 size={12} className="animate-spin" />, color: 'text-[#d29922]', bg: 'bg-[#d29922]/10', label: 'Planning' };
    case 'planned':
      return { icon: <CheckCircle2 size={12} />, color: 'text-[#58a6ff]', bg: 'bg-[#58a6ff]/10', label: 'Planned' };
    case 'executing':
      return { icon: <Loader2 size={12} className="animate-spin" />, color: 'text-[#d29922]', bg: 'bg-[#d29922]/10', label: 'Executing' };
    case 'executed':
      return { icon: <CheckCircle2 size={12} />, color: 'text-[#3fb950]', bg: 'bg-[#3fb950]/10', label: 'Executed' };
    case 'applied':
      return { icon: <CheckCircle2 size={12} />, color: 'text-[#3fb950]', bg: 'bg-[#3fb950]/10', label: 'Applied' };
    case 'rejected':
      return { icon: <XCircle size={12} />, color: 'text-[#f85149]', bg: 'bg-[#f85149]/10', label: 'Rejected' };
    case 'error':
      return { icon: <AlertCircle size={12} />, color: 'text-[#f85149]', bg: 'bg-[#f85149]/10', label: 'Error' };
    default:
      return { icon: <Clock size={12} />, color: 'text-[#8b949e]', bg: 'bg-[#8b949e]/10', label: status };
  }
}

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

interface TaskItemProps {
  task: TaskRecord;
}

const TaskItem: React.FC<TaskItemProps> = ({ task }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const statusConfig = getStatusConfig(task.status);

  return (
    <div className="border-b border-[#30363d] last:border-b-0 animate-fade-in">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-start gap-2 px-3 py-2.5 hover:bg-[#1c2128] transition-colors text-left"
      >
        <span className="mt-0.5 text-[#484f58] flex-shrink-0">
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusConfig.bg} ${statusConfig.color}`}>
              {statusConfig.icon}
              {statusConfig.label}
            </span>
            <span className="text-[10px] text-[#484f58] font-mono">{task.model}</span>
          </div>
          <p className="text-xs text-[#c9d1d9] line-clamp-2 leading-relaxed">
            {task.prompt}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Clock size={10} className="text-[#484f58]" />
            <span className="text-[10px] text-[#484f58]">
              {formatDate(task.createdAt)} {formatTime(task.createdAt)}
            </span>
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 ml-6 animate-slide-down">
          {task.plan && (
            <div className="mb-2">
              <span className="text-[10px] uppercase tracking-wider text-[#8b949e] font-semibold">Plan</span>
              <pre className="mt-1 text-[11px] text-[#c9d1d9] bg-[#0d1117] rounded-md p-2 overflow-x-auto scrollbar-thin whitespace-pre-wrap font-mono leading-relaxed border border-[#30363d]">
                {task.plan}
              </pre>
            </div>
          )}
          {task.diffs && task.diffs.length > 0 && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#8b949e] font-semibold">
                Files Modified ({task.diffs.length})
              </span>
              <div className="mt-1 space-y-1">
                {task.diffs.map((d, i) => {
                  const diffStatus = getStatusConfig(d.status === 'pending' ? 'planned' : d.status === 'applied' ? 'applied' : 'rejected');
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs px-2 py-1 rounded bg-[#0d1117] border border-[#30363d]">
                      <span className={diffStatus.color}>{diffStatus.icon}</span>
                      <span className="text-[#c9d1d9] font-mono truncate text-[11px]">
                        {d.filePath.split(/[/\\]/).pop()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {task.completedAt && (
            <div className="mt-2 text-[10px] text-[#484f58]">
              Completed: {formatTime(task.completedAt)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const TaskHistory: React.FC = () => {
  const { tasks } = useAppStore();

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center">
        <Zap size={32} className="text-[#30363d] mb-3" />
        <p className="text-xs text-[#8b949e] leading-relaxed">
          No tasks yet. Send a message to the AI agent to create your first task.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} />
      ))}
    </div>
  );
};

export default TaskHistory;
