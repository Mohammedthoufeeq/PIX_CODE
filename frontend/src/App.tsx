import React, { useEffect, useCallback } from 'react';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Sidebar from './components/Sidebar';
import CodeEditor from './components/CodeEditor';
import DiffViewer from './components/DiffViewer';
import ChatPanel from './components/ChatPanel';
import CenteredDashboard from './components/CenteredDashboard';
import StatusBar from './components/StatusBar';
import TerminalPanel from './components/TerminalPanel';
import ApprovalModal from './components/ApprovalModal';
import { useAppStore } from './store/useAppStore';
import * as api from './api/client';
import { setLogHandler } from './api/client';

const App: React.FC = () => {
  const {
    showDiff,
    setShowDiff,
    addTerminalOutput,
    selectedFile,
    currentProject,
    setCurrentProject,
    setProjectTree,
    setSidebarTab,
    addLog,
  } = useAppStore();

  // Wire the API log interceptor to the store once
  useEffect(() => {
    setLogHandler(addLog);
  }, [addLog]);

  // ─── Keyboard Shortcuts ───
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ctrl+Shift+D: toggle diff view
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setShowDiff(!showDiff);
        addTerminalOutput(
          `[${new Date().toLocaleTimeString()}] Diff view ${!showDiff ? 'enabled' : 'disabled'}`
        );
      }

      // Ctrl+P: quick file search
      if (e.ctrlKey && !e.shiftKey && e.key === 'p') {
        e.preventDefault();
        addTerminalOutput(
          `[${new Date().toLocaleTimeString()}] Quick file search (Ctrl+P) triggered`
        );
      }
    },
    [showDiff, setShowDiff, addTerminalOutput]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    // Check if there is an active project on backend on startup
    fetch('/api/project/active')
      .then((res) => res.json())
      .then((data) => {
        if (data.workspace) {
          setCurrentProject(data.workspace);
          addTerminalOutput(`[System] Connected to active workspace: ${data.workspace}`);
          
          // Load tree
          api.getProjectTree().then((treeRes) => {
            if (treeRes.success && treeRes.data) {
              setProjectTree((treeRes.data as any).tree);
            }
          });
        }
      })
      .catch(() => {});
  }, [setCurrentProject, setProjectTree, addTerminalOutput]);

  // Load chat sessions when workspace changes
  useEffect(() => {
    if (currentProject) {
      api.getSessions().then((res) => {
        if (res.success && res.data?.sessions) {
          const sessions = res.data.sessions;
          useAppStore.getState().setChatSessions(sessions);
          
          if (sessions.length > 0) {
            const latestSession = sessions[0];
            useAppStore.getState().setCurrentSessionId(latestSession.id);
            
            api.getSession(latestSession.id).then((sessRes) => {
              if (sessRes.success && sessRes.data?.session) {
                useAppStore.getState().clearChatMessages();
                sessRes.data.session.history.forEach((msg: any) => {
                  useAppStore.getState().addChatMessage(msg);
                });
                addTerminalOutput(`[System] Chat session "${latestSession.title}" reloaded`);
              }
            });
          } else {
            useAppStore.getState().setCurrentSessionId(null);
            useAppStore.getState().clearChatMessages();
          }
        }
      });
    }
  }, [currentProject, addTerminalOutput]);

  // Switch sidebar to code tab when editing a file
  useEffect(() => {
    if (selectedFile) {
      setSidebarTab('code');
    }
  }, [selectedFile, setSidebarTab]);


  return (
    <Layout>
      {/* Toast Notifications */}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1c2128',
            color: '#e6edf3',
            border: '1px solid #30363d',
            borderRadius: '10px',
            fontSize: '12px',
            padding: '10px 14px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          },
          success: {
            iconTheme: { primary: '#3fb950', secondary: '#1c2128' },
          },
          error: {
            iconTheme: { primary: '#f85149', secondary: '#1c2128' },
          },
        }}
      />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        {currentProject && <Sidebar />}

        {/* Center: Editor, Diff, Dashboard, or Centered Chat */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex overflow-hidden">
            {showDiff ? (
              <DiffViewer />
            ) : selectedFile ? (
              <CodeEditor />
            ) : (
              /* Centered Dashboard or Centered wide Chat */
              <div className="flex-1 flex bg-[#0d1117]">
                {currentProject ? (
                  <div className="flex-1 max-w-4xl mx-auto flex flex-col border-x border-[#30363d] bg-[#0d1117]">
                    <ChatPanel isCentered={true} />
                  </div>
                ) : (
                  <CenteredDashboard />
                )}
              </div>
            )}
          </div>
          {/* Terminal */}
          <TerminalPanel />
        </div>

        {/* Right: Chat Panel (only visible when editing a file or viewing diff) */}
        {(selectedFile || showDiff) && (
          <ChatPanel isCentered={false} />
        )}
      </div>

      {/* Status Bar */}
      <StatusBar />

      {/* Approval Modal */}
      <ApprovalModal />
    </Layout>
  );
};

export default App;
