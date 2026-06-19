import React, { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { AlertTriangle, ShieldCheck, ShieldX, X } from 'lucide-react';

const ApprovalModal: React.FC = () => {
  const { showApproval, approvalData, setShowApproval, setApprovalData } = useAppStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!showApproval || !approvalData) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        approvalData.onApprove();
        close();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        approvalData.onReject();
        close();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showApproval, approvalData]);

  function close() {
    setShowApproval(false);
    setApprovalData(null);
  }

  if (!showApproval || !approvalData) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-in">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => {
          approvalData.onReject();
          close();
        }}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#d29922]/10 flex items-center justify-center">
              <AlertTriangle size={16} className="text-[#d29922]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#e6edf3]">Approval Required</h3>
              <p className="text-[11px] text-[#8b949e]">{approvalData.type}</p>
            </div>
          </div>
          <button
            onClick={() => {
              approvalData.onReject();
              close();
            }}
            className="p-1.5 rounded-lg hover:bg-[#30363d] text-[#8b949e] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-[#c9d1d9] leading-relaxed">
            {approvalData.description}
          </p>
          {approvalData.details && (
            <pre className="text-[11px] text-[#c9d1d9] bg-[#0d1117] rounded-lg p-3 overflow-x-auto scrollbar-thin font-mono whitespace-pre-wrap border border-[#30363d] max-h-[200px]">
              {approvalData.details}
            </pre>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[#30363d] bg-[#1c212822]">
          <div className="flex items-center gap-2 text-[10px] text-[#484f58]">
            <kbd className="px-1.5 py-0.5 rounded bg-[#1c2128] border border-[#30363d] font-mono">Enter</kbd>
            <span>Approve</span>
            <kbd className="px-1.5 py-0.5 rounded bg-[#1c2128] border border-[#30363d] font-mono ml-2">Esc</kbd>
            <span>Reject</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                approvalData.onReject();
                close();
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#da3633] hover:bg-[#f85149] text-white text-xs font-medium rounded-lg transition-colors"
            >
              <ShieldX size={13} />
              Reject
            </button>
            <button
              onClick={() => {
                approvalData.onApprove();
                close();
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#238636] hover:bg-[#2ea043] text-white text-xs font-medium rounded-lg transition-colors glow-green"
            >
              <ShieldCheck size={13} />
              Approve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApprovalModal;
