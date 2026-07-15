import { useState, type Dispatch, type SetStateAction } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { C } from '../theme';
import type { AppSettings } from '../domain/types';
import { FormRow, Input, Select, Toggle } from './settings-modal-shared';

interface AICommitSettingsTabProps {
  draft: AppSettings;
  setDraft: Dispatch<SetStateAction<AppSettings>>;
}

export function AICommitSettingsTab({ draft, setDraft }: AICommitSettingsTabProps) {
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
      <div style={{ marginBottom: 16, padding: '10px 12px', background: C.panel1, border: `1px solid ${C.border}`, borderRadius: 6, color: C.textSecondary, fontSize: 11, lineHeight: 1.6 }}>
        生成后直接写入输入框
      </div>
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
            <div style={{ color: C.textSecondary, fontSize: 12, fontWeight: 500 }}>仅使用已暂存变更</div>
            <div style={{ color: C.textWeak, fontSize: 11 }}>只发送已暂存 Diff</div>
          </div>
          <Toggle checked={ai.stagedOnly} onChange={() => setDraft(current => ({ ...current, aiCommit: { ...current.aiCommit, stagedOnly: !current.aiCommit.stagedOnly } }))} />
        </div>
      </div>
    </div>
  );
}
