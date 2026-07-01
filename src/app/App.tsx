import { useState } from 'react';
import { GitMerge, Settings } from 'lucide-react';
import { C } from './theme';
import { SELECTED_REPO_ID } from './data';
import { Sidebar } from './components/sidebar';
import { Workspace } from './components/workspace';
import { PullAllDrawer } from './components/pull-all-drawer';
import { SettingsModal } from './components/settings-modal';

function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div
      style={{
        height: 48,
        flexShrink: 0,
        background: C.panel1,
        borderBottom: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <GitMerge size={12} color="white" />
        </div>
        <span style={{ color: C.textPrimary, fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>
          VibeGit Desk
        </span>
      </div>
      <div style={{ flex: 1 }} />
      <button
        onClick={onOpenSettings}
        title="Settings"
        style={{
          background: 'none',
          border: '1px solid transparent',
          color: C.textWeak,
          borderRadius: 6,
          padding: '5px 7px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
        }}
        onMouseEnter={e => {
          const target = e.currentTarget;
          target.style.background = C.hoverBg;
          target.style.borderColor = C.border;
          target.style.color = C.textSecondary;
        }}
        onMouseLeave={e => {
          const target = e.currentTarget;
          target.style.background = 'none';
          target.style.borderColor = 'transparent';
          target.style.color = C.textWeak;
        }}
      >
        <Settings size={13} />
      </button>
    </div>
  );
}

export default function App() {
  const [selectedRepoId, setSelectedRepoId] = useState(() => SELECTED_REPO_ID);
  const [showPullDrawer, setShowPullDrawer] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: C.appBg,
        color: C.textPrimary,
        fontFamily: 'Inter, system-ui, sans-serif',
        overflow: 'hidden',
        fontSize: 14,
      }}
    >
      <TopBar onOpenSettings={() => setShowSettings(true)} />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Sidebar
          selectedRepoId={selectedRepoId}
          onSelectRepo={id => setSelectedRepoId(id)}
          onPullAll={() => setShowPullDrawer(true)}
          onOpenSettings={() => setShowSettings(true)}
        />
        <Workspace
          selectedRepoId={selectedRepoId}
          onOpenSettings={() => setShowSettings(true)}
        />
      </div>
      <PullAllDrawer open={showPullDrawer} onClose={() => setShowPullDrawer(false)} />
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
