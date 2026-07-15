import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { C } from '../theme';
import type { AppSettings, Repo, SettingsTab } from '../domain/types';
import { AICommitSettingsTab } from './ai-commit-settings-tab';
import { CommandSettingsTab } from './command-settings-tab';
import { GitBehaviorSettingsTab } from './git-behavior-settings-tab';
import { RepositoriesSettingsTab } from './repositories-settings-tab';

interface SettingsModalProps {
  repos: Repo[];
  settings: AppSettings;
  open: boolean;
  initialTab?: SettingsTab;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
  onAddScanRoot: () => Promise<void>;
  onAddCategory: () => void;
  onRemoveScanRoot: (path: string) => void;
}

export function SettingsModal({
  repos,
  settings,
  open,
  initialTab = 'ai-commit',
  onClose,
  onSave,
  onAddScanRoot,
  onAddCategory,
  onRemoveScanRoot,
}: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [draft, setDraft] = useState(settings);
  const openedRef = useRef(false);

  useEffect(() => {
    if (open && !openedRef.current) {
      setDraft(settings);
      setTab(initialTab);
    }
    openedRef.current = open;
  }, [settings, open, initialTab]);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
  }, [open, initialTab]);

  if (!open) return null;

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: 'repositories', label: '仓库' },
    { key: 'ai-commit', label: 'AI 提交' },
    { key: 'git-behavior', label: 'Git 行为' },
    { key: 'commands', label: '命令' },
  ];

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60, backdropFilter: 'blur(3px)' }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 760,
          maxWidth: '95vw',
          maxHeight: '85vh',
          background: C.panel1,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          zIndex: 70,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <h3 style={{ color: C.textPrimary, fontSize: 15, fontWeight: 600, margin: 0 }}>设置</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.textWeak, cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div style={{ width: 160, flexShrink: 0, background: C.appBg, borderRight: `1px solid ${C.border}`, padding: '10px 0' }}>
            {tabs.map(item => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 16px',
                  background: tab === item.key ? C.selectedBg : 'none',
                  border: 'none',
                  borderLeft: `2px solid ${tab === item.key ? C.btnPrimary : 'transparent'}`,
                  color: tab === item.key ? C.textPrimary : C.textSecondary,
                  fontSize: 12,
                  cursor: 'pointer',
                  transition: 'all 0.1s',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            {tab === 'repositories' && (
              <RepositoriesSettingsTab
                repos={repos}
                settings={draft}
                onAddScanRoot={onAddScanRoot}
                onAddCategory={onAddCategory}
                onRemoveScanRoot={onRemoveScanRoot}
              />
            )}
            {tab === 'ai-commit' && <AICommitSettingsTab draft={draft} setDraft={setDraft} />}
            {tab === 'git-behavior' && <GitBehaviorSettingsTab draft={draft} setDraft={setDraft} />}
            {tab === 'commands' && <CommandSettingsTab draft={draft} setDraft={setDraft} />}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{
              background: C.panel2,
              border: `1px solid ${C.border}`,
              color: C.textSecondary,
              borderRadius: 7,
              padding: '7px 18px',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            取消
          </button>
          <button
            onClick={() => onSave(draft)}
            style={{
              background: C.btnPrimary,
              border: 'none',
              color: 'white',
              borderRadius: 7,
              padding: '7px 18px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            保存更改
          </button>
        </div>
      </div>
    </>
  );
}
