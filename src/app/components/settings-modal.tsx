import { useEffect, useState } from 'react';
import { Eye, EyeOff, Plus, Trash2, GripVertical, X } from 'lucide-react';
import { C } from '../theme';
import type { AppSettings, Repo, SettingsTab } from '../types';

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

function RepositoriesTab({
  repos,
  settings,
  onAddScanRoot,
  onAddCategory,
  onRemoveScanRoot,
}: {
  repos: Repo[];
  settings: AppSettings;
  onAddScanRoot: () => Promise<void>;
  onAddCategory: () => void;
  onRemoveScanRoot: (path: string) => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ color: C.textSecondary, fontSize: 12, fontWeight: 600 }}>仓库（{repos.length}）</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => void onAddScanRoot()}
            style={{ background: C.panel1, border: `1px solid ${C.border}`, color: C.textSecondary, borderRadius: 5, padding: '5px 10px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Plus size={11} /> 添加文件夹
          </button>
          <button
            onClick={onAddCategory}
            style={{ background: C.btnPrimary, border: 'none', color: 'white', borderRadius: 5, padding: '5px 10px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Plus size={11} /> 添加分类
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ color: C.textSecondary, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>已配置扫描目录（{settings.scanRoots.length}）</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {settings.scanRoots.length === 0 && (
            <div style={{ color: C.textWeak, fontSize: 11, background: C.panel1, border: `1px dashed ${C.border}`, borderRadius: 6, padding: '10px 12px' }}>
              当前仅扫描默认工作区。可添加本地目录补充仓库来源。
            </div>
          )}
          {settings.scanRoots.map(root => (
            <div
              key={root.path}
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
                <div style={{ color: C.textPrimary, fontSize: 12, fontWeight: 500 }}>{root.category}</div>
                <div style={{ color: C.textWeak, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {root.path}
                </div>
              </div>
              <button onClick={() => onRemoveScanRoot(root.path)} style={{ background: 'none', border: 'none', color: C.textWeak, cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ color: C.textSecondary, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>自定义分类（{settings.customCategories.length}）</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {settings.customCategories.length === 0 && (
            <span style={{ color: C.textWeak, fontSize: 11 }}>当前没有额外分类</span>
          )}
          {settings.customCategories.map(category => (
            <span key={category} style={{ color: C.textSecondary, fontSize: 11, background: C.panel1, border: `1px solid ${C.border}`, borderRadius: 999, padding: '4px 10px' }}>
              {category}
            </span>
          ))}
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
          </div>
        ))}
      </div>
    </div>
  );
}

function AICommitTab({
  draft,
  setDraft,
}: {
  draft: AppSettings;
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>;
}) {
  const [showKey, setShowKey] = useState(false);
  const ai = draft.aiCommit;

  return (
    <div>
      <FormRow label="API 密钥">
        <div style={{ position: 'relative' }}>
          <input
            value={ai.apiKey}
            onChange={e => setDraft(current => ({ ...current, aiCommit: { ...current.aiCommit, apiKey: e.target.value } }))}
            type={showKey ? 'text' : 'password'}
            placeholder="sk-..."
            style={{
              width: '100%',
              background: C.panel1,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: '8px 36px 8px 10px',
              color: ai.apiKey ? C.textPrimary : C.textWeak,
              fontSize: 12,
              outline: 'none',
              fontFamily: 'JetBrains Mono, monospace',
              boxSizing: 'border-box',
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
        <Input value={ai.baseUrl} onChange={value => setDraft(current => ({ ...current, aiCommit: { ...current.aiCommit, baseUrl: value } }))} monospace />
      </FormRow>
      <FormRow label="模型">
        <Select
          value={ai.model}
          onChange={value => setDraft(current => ({ ...current, aiCommit: { ...current.aiCommit, model: value } }))}
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
          value={ai.promptTemplate}
          onChange={e => setDraft(current => ({ ...current, aiCommit: { ...current.aiCommit, promptTemplate: e.target.value } }))}
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
        />
      </FormRow>
      <FormRow label="Diff 最大字符数">
        <Select
          value={String(ai.maxDiffChars)}
          onChange={value => setDraft(current => ({ ...current, aiCommit: { ...current.aiCommit, maxDiffChars: Number(value) } }))}
          options={[
            { value: '2000', label: '2000' },
            { value: '4000', label: '4000' },
            { value: '8000', label: '8000' },
            { value: '12000', label: '12000' },
            { value: '20000', label: '20000' },
          ]}
        />
      </FormRow>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: C.textSecondary, fontSize: 12, fontWeight: 500 }}>生成 3 条提交候选</div>
            <div style={{ color: C.textWeak, fontSize: 11 }}>返回表情、标准短句和约定式提交三种格式</div>
          </div>
          <Toggle checked={ai.generateThree} onChange={() => setDraft(current => ({ ...current, aiCommit: { ...current.aiCommit, generateThree: !current.aiCommit.generateThree } }))} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: C.textSecondary, fontSize: 12, fontWeight: 500 }}>仅使用已暂存变更</div>
            <div style={{ color: C.textWeak, fontSize: 11 }}>只将已暂存文件的 Diff 发送给 AI</div>
          </div>
          <Toggle checked={ai.stagedOnly} onChange={() => setDraft(current => ({ ...current, aiCommit: { ...current.aiCommit, stagedOnly: !current.aiCommit.stagedOnly } }))} />
        </div>
      </div>
    </div>
  );
}

function GitBehaviorTab({
  draft,
  setDraft,
}: {
  draft: AppSettings;
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>;
}) {
  const gitBehavior = draft.gitBehavior;

  return (
    <div>
      <FormRow label="自动扫描">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ color: C.textSecondary, fontSize: 12, fontWeight: 500 }}>启用自动扫描</div>
            <div style={{ color: C.textWeak, fontSize: 11 }}>按间隔刷新真实仓库状态</div>
          </div>
          <Toggle checked={gitBehavior.autoScanEnabled} onChange={() => setDraft(current => ({ ...current, gitBehavior: { ...current.gitBehavior, autoScanEnabled: !current.gitBehavior.autoScanEnabled } }))} />
        </div>
      </FormRow>
      <FormRow label="自动扫描间隔">
        <Select
          value={String(gitBehavior.autoScanIntervalSeconds)}
          onChange={value => setDraft(current => ({ ...current, gitBehavior: { ...current.gitBehavior, autoScanIntervalSeconds: Number(value) } }))}
          options={[
            { value: '30', label: '30 秒' },
            { value: '60', label: '60 秒' },
            { value: '120', label: '120 秒' },
            { value: '300', label: '300 秒' },
          ]}
        />
      </FormRow>
      <FormRow label="批量 Pull 策略">
        <Select
          value={gitBehavior.pullStrategy}
          onChange={value => setDraft(current => ({ ...current, gitBehavior: { ...current.gitBehavior, pullStrategy: value as AppSettings['gitBehavior']['pullStrategy'] } }))}
          options={[
            { value: 'ff-only', label: '仅 Fast-forward（推荐）' },
            { value: 'rebase', label: '变基' },
            { value: 'merge', label: '合并' },
          ]}
        />
      </FormRow>
      <FormRow label="批量 Push 策略">
        <Select
          value={gitBehavior.pushStrategy}
          onChange={value => setDraft(current => ({ ...current, gitBehavior: { ...current.gitBehavior, pushStrategy: value as AppSettings['gitBehavior']['pushStrategy'] } }))}
          options={[
            { value: 'upstream-only', label: '仅推送有 upstream 的分支（推荐）' },
            { value: 'all', label: '推送所有领先分支' },
          ]}
        />
      </FormRow>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <FormRow label="并发数">
            <Select
              value={String(gitBehavior.concurrency)}
              onChange={value => setDraft(current => ({ ...current, gitBehavior: { ...current.gitBehavior, concurrency: Number(value) } }))}
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
              value={String(gitBehavior.timeoutSeconds)}
              onChange={value => setDraft(current => ({ ...current, gitBehavior: { ...current.gitBehavior, timeoutSeconds: Number(value) } }))}
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

  useEffect(() => {
    if (!open) return;
    setDraft(settings);
    setTab(initialTab);
  }, [settings, open, initialTab]);

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
            {tab === 'repositories' && (
              <RepositoriesTab
                repos={repos}
                settings={draft}
                onAddScanRoot={onAddScanRoot}
                onAddCategory={onAddCategory}
                onRemoveScanRoot={onRemoveScanRoot}
              />
            )}
            {tab === 'ai-commit' && <AICommitTab draft={draft} setDraft={setDraft} />}
            {tab === 'git-behavior' && <GitBehaviorTab draft={draft} setDraft={setDraft} />}
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
