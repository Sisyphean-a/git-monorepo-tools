import { useState } from 'react';
import { Eye, EyeOff, Plus, Trash2, GripVertical, X } from 'lucide-react';
import { C } from '../theme';
import type { Repo } from '../types';

interface SettingsModalProps {
  repos: Repo[];
  open: boolean;
  onClose: () => void;
}

type SettingsTab = 'repositories' | 'ai-commit' | 'git-behavior';

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', color: C.textSecondary, fontSize: 11, fontWeight: 600, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  monospace,
}: {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  type?: string;
  monospace?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder}
      type={type}
      style={{
        width: '100%',
        background: C.panel1,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: '8px 10px',
        color: value ? C.textPrimary : C.textWeak,
        fontSize: 12,
        outline: 'none',
        boxSizing: 'border-box',
        fontFamily: monospace ? 'JetBrains Mono, monospace' : 'Inter, sans-serif',
      }}
      onFocus={e => {
        e.target.style.borderColor = C.btnPrimary;
      }}
      onBlur={e => {
        e.target.style.borderColor = C.border;
      }}
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%',
        background: C.panel1,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: '8px 10px',
        color: C.textPrimary,
        fontSize: 12,
        outline: 'none',
        fontFamily: 'Inter, sans-serif',
        cursor: 'pointer',
      }}
    >
      {options.map(option => (
        <option key={option.value} value={option.value} style={{ background: C.panel1 }}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        background: checked ? C.btnPrimary : C.panel3,
        border: `1px solid ${checked ? C.btnPrimary : C.border}`,
        cursor: 'pointer',
        position: 'relative',
        transition: 'all 0.15s',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 3,
          left: checked ? 17 : 3,
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: 'white',
          transition: 'left 0.15s',
        }}
      />
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function RepositoriesTab({ repos }: { repos: Repo[] }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ color: C.textSecondary, fontSize: 12, fontWeight: 600 }}>Repositories ({repos.length})</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={{ background: C.panel1, border: `1px solid ${C.border}`, color: C.textSecondary, borderRadius: 5, padding: '5px 10px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Plus size={11} /> Add Folder
          </button>
          <button style={{ background: C.btnPrimary, border: 'none', color: 'white', borderRadius: 5, padding: '5px 10px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Plus size={11} /> Add Repository
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {repos.map(repo => (
          <div
            key={repo.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: C.panel1,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: '8px 10px',
            }}
          >
            <GripVertical size={12} color={C.textWeak} style={{ cursor: 'grab', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.textPrimary, fontSize: 12, fontWeight: 500 }}>{repo.name}</div>
              <div style={{ color: C.textWeak, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {repo.path}
              </div>
            </div>
            <span style={{ color: C.textWeak, fontSize: 10, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 3, padding: '2px 6px', flexShrink: 0 }}>
              {repo.category}
            </span>
            <button style={{ background: 'none', border: 'none', color: C.textWeak, cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AICommitTab() {
  const [apiKey, setApiKey] = useState('sk-••••••••••••••••••••••••••••••');
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com');
  const [model, setModel] = useState('deepseek-chat');
  const [maxDiff, setMaxDiff] = useState('8000');
  const [gen3, setGen3] = useState(true);
  const [stagedOnly, setStagedOnly] = useState(true);
  const [prompt, setPrompt] = useState(
    'You are a Git commit message generator. Analyze the following staged diff and generate concise commit messages. Output 3 candidates in different styles: emoji, short, and conventional commit format.'
  );

  return (
    <div>
      <FormRow label="API Key">
        <div style={{ position: 'relative' }}>
          <input
            value={showKey ? 'sk-abcdefghij1234567890abcdefghij12' : apiKey}
            onChange={e => setApiKey(e.target.value)}
            type={showKey ? 'text' : 'password'}
            placeholder="sk-..."
            style={{
              width: '100%',
              background: C.panel1,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: '8px 36px 8px 10px',
              color: C.textPrimary,
              fontSize: 12,
              outline: 'none',
              fontFamily: 'JetBrains Mono, monospace',
              boxSizing: 'border-box',
            }}
            onFocus={e => {
              e.target.style.borderColor = C.btnPrimary;
            }}
            onBlur={e => {
              e.target.style.borderColor = C.border;
            }}
          />
          <button
            onClick={() => setShowKey(value => !value)}
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: C.textWeak,
              cursor: 'pointer',
              padding: 2,
            }}
          >
            {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
      </FormRow>
      <FormRow label="Base URL">
        <Input value={baseUrl} onChange={setBaseUrl} monospace />
      </FormRow>
      <FormRow label="Model">
        <Select
          value={model}
          onChange={setModel}
          options={[
            { value: 'deepseek-chat', label: 'deepseek-chat' },
            { value: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
            { value: 'gpt-4o', label: 'gpt-4o' },
            { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6' },
          ]}
        />
      </FormRow>
      <FormRow label="Prompt Template">
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          style={{
            width: '100%',
            background: C.panel1,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '8px 10px',
            color: C.textPrimary,
            fontSize: 12,
            outline: 'none',
            fontFamily: 'JetBrains Mono, monospace',
            boxSizing: 'border-box',
            resize: 'vertical',
            minHeight: 90,
            lineHeight: 1.6,
          }}
          onFocus={e => {
            e.target.style.borderColor = C.btnPrimary;
          }}
          onBlur={e => {
            e.target.style.borderColor = C.border;
          }}
        />
      </FormRow>
      <FormRow label="Max Diff Characters">
        <Input value={maxDiff} onChange={setMaxDiff} monospace />
        <div style={{ color: C.textWeak, fontSize: 10, marginTop: 3 }}>Large diffs will be truncated to this limit before sending</div>
      </FormRow>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: C.textSecondary, fontSize: 12, fontWeight: 500 }}>Generate 3 commit options</div>
            <div style={{ color: C.textWeak, fontSize: 11 }}>Return Emoji, Standard Short, and Conventional Commit formats</div>
          </div>
          <Toggle checked={gen3} onChange={() => setGen3(value => !value)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: C.textSecondary, fontSize: 12, fontWeight: 500 }}>Use staged changes only</div>
            <div style={{ color: C.textWeak, fontSize: 11 }}>Only include staged files in the diff sent to AI</div>
          </div>
          <Toggle checked={stagedOnly} onChange={() => setStagedOnly(value => !value)} />
        </div>
      </div>
    </div>
  );
}

function GitBehaviorTab() {
  const [scanInterval, setScanInterval] = useState('60');
  const [pullStrategy, setPullStrategy] = useState('ff-only');
  const [pushStrategy, setPushStrategy] = useState('upstream-only');
  const [concurrency, setConcurrency] = useState('3');
  const [timeout, setTimeout] = useState('60');

  return (
    <div>
      <FormRow label="Auto Scan Interval">
        <Select
          value={scanInterval}
          onChange={setScanInterval}
          options={[
            { value: '30', label: '30 seconds' },
            { value: '60', label: '60 seconds' },
            { value: '120', label: '120 seconds' },
            { value: '0', label: 'Manual only' },
          ]}
        />
      </FormRow>
      <FormRow label="Pull All Strategy">
        <Select
          value={pullStrategy}
          onChange={setPullStrategy}
          options={[
            { value: 'ff-only', label: 'Fast-forward only (recommended)' },
            { value: 'rebase', label: 'Rebase' },
            { value: 'merge', label: 'Merge' },
          ]}
        />
        <div style={{ color: C.textWeak, fontSize: 10, marginTop: 3 }}>Repos with local changes or diverged history will be skipped</div>
      </FormRow>
      <FormRow label="Push All Strategy">
        <Select
          value={pushStrategy}
          onChange={setPushStrategy}
          options={[
            { value: 'upstream-only', label: 'Only push branches with upstream (recommended)' },
            { value: 'all', label: 'Push all ahead branches' },
          ]}
        />
        <div style={{ color: C.textWeak, fontSize: 10, marginTop: 3 }}>Branches without a remote upstream will be skipped</div>
      </FormRow>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <FormRow label="Concurrency">
            <Select
              value={concurrency}
              onChange={setConcurrency}
              options={[
                { value: '1', label: '1 (sequential)' },
                { value: '2', label: '2' },
                { value: '3', label: '3' },
                { value: '5', label: '5 (max)' },
              ]}
            />
          </FormRow>
        </div>
        <div style={{ flex: 1 }}>
          <FormRow label="Operation Timeout">
            <Select
              value={timeout}
              onChange={setTimeout}
              options={[
                { value: '30', label: '30 seconds' },
                { value: '60', label: '60 seconds' },
                { value: '120', label: '120 seconds' },
              ]}
            />
          </FormRow>
        </div>
      </div>
    </div>
  );
}

export function SettingsModal({ repos, open, onClose }: SettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('ai-commit');

  if (!open) return null;

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: 'repositories', label: 'Repositories' },
    { key: 'ai-commit', label: 'AI Commit' },
    { key: 'git-behavior', label: 'Git Behavior' },
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
          width: 680,
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
          <h3 style={{ color: C.textPrimary, fontSize: 15, fontWeight: 600, margin: 0 }}>Settings</h3>
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
            {tab === 'repositories' && <RepositoriesTab repos={repos} />}
            {tab === 'ai-commit' && <AICommitTab />}
            {tab === 'git-behavior' && <GitBehaviorTab />}
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
            Cancel
          </button>
          <button
            onClick={onClose}
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
            Save Changes
          </button>
        </div>
      </div>
    </>
  );
}
