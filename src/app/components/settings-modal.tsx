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
        <span style={{ color: C.textSecondary, fontSize: 12, fontWeight: 600 }}>仓库（{repos.length}）</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={{ background: C.panel1, border: `1px solid ${C.border}`, color: C.textSecondary, borderRadius: 5, padding: '5px 10px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Plus size={11} /> 添加文件夹
          </button>
          <button style={{ background: C.btnPrimary, border: 'none', color: 'white', borderRadius: 5, padding: '5px 10px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Plus size={11} /> 添加仓库
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
    '你是 Git 提交信息生成器。请分析下面已暂存的 Diff，并生成简洁的提交信息。输出 3 条不同风格的候选，包括表情风格、短句风格和约定式提交风格。'
  );

  return (
    <div>
      <FormRow label="API 密钥">
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
      <FormRow label="基础 URL">
        <Input value={baseUrl} onChange={setBaseUrl} monospace />
      </FormRow>
      <FormRow label="模型">
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
      <FormRow label="提示词模板">
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
      <FormRow label="Diff 最大字符数">
        <Input value={maxDiff} onChange={setMaxDiff} monospace />
        <div style={{ color: C.textWeak, fontSize: 10, marginTop: 3 }}>较大的 Diff 会在发送前截断到这个长度</div>
      </FormRow>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: C.textSecondary, fontSize: 12, fontWeight: 500 }}>生成 3 条提交候选</div>
            <div style={{ color: C.textWeak, fontSize: 11 }}>返回表情、标准短句和约定式提交三种格式</div>
          </div>
          <Toggle checked={gen3} onChange={() => setGen3(value => !value)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: C.textSecondary, fontSize: 12, fontWeight: 500 }}>仅使用已暂存变更</div>
            <div style={{ color: C.textWeak, fontSize: 11 }}>只将已暂存文件的 Diff 发送给 AI</div>
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
      <FormRow label="自动扫描间隔">
        <Select
          value={scanInterval}
          onChange={setScanInterval}
          options={[
            { value: '30', label: '30 秒' },
            { value: '60', label: '60 秒' },
            { value: '120', label: '120 秒' },
            { value: '0', label: '仅手动' },
          ]}
        />
      </FormRow>
      <FormRow label="批量 Pull 策略">
        <Select
          value={pullStrategy}
          onChange={setPullStrategy}
          options={[
            { value: 'ff-only', label: '仅 Fast-forward（推荐）' },
            { value: 'rebase', label: '变基' },
            { value: 'merge', label: '合并' },
          ]}
        />
        <div style={{ color: C.textWeak, fontSize: 10, marginTop: 3 }}>有本地改动或历史分叉的仓库会被跳过</div>
      </FormRow>
      <FormRow label="批量 Push 策略">
        <Select
          value={pushStrategy}
          onChange={setPushStrategy}
          options={[
            { value: 'upstream-only', label: '仅推送有 upstream 的分支（推荐）' },
            { value: 'all', label: '推送所有领先分支' },
          ]}
        />
        <div style={{ color: C.textWeak, fontSize: 10, marginTop: 3 }}>没有远端 upstream 的分支会被跳过</div>
      </FormRow>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <FormRow label="并发数">
            <Select
              value={concurrency}
              onChange={setConcurrency}
              options={[
                { value: '1', label: '1（串行）' },
                { value: '2', label: '2' },
                { value: '3', label: '3' },
                { value: '5', label: '5（最大）' },
              ]}
            />
          </FormRow>
        </div>
        <div style={{ flex: 1 }}>
          <FormRow label="操作超时">
            <Select
              value={timeout}
              onChange={setTimeout}
              options={[
                { value: '30', label: '30 秒' },
                { value: '60', label: '60 秒' },
                { value: '120', label: '120 秒' },
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
    { key: 'repositories', label: '仓库' },
    { key: 'ai-commit', label: 'AI 提交' },
    { key: 'git-behavior', label: 'Git 行为' },
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
            取消
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
            保存更改
          </button>
        </div>
      </div>
    </>
  );
}
