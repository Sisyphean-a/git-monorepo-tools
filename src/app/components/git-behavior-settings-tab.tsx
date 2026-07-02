import type { Dispatch, SetStateAction } from 'react';
import type { AppSettings } from '../types';
import { FormRow, Select, Toggle } from './settings-modal-shared';

interface GitBehaviorSettingsTabProps {
  draft: AppSettings;
  setDraft: Dispatch<SetStateAction<AppSettings>>;
}

export function GitBehaviorSettingsTab({ draft, setDraft }: GitBehaviorSettingsTabProps) {
  const gitBehavior = draft.gitBehavior;

  return (
    <div>
      <FormRow label="自动扫描">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ color: '#8fa6bf', fontSize: 12, fontWeight: 500 }}>启用自动扫描</div>
            <div style={{ color: '#5f7084', fontSize: 11 }}>按间隔刷新真实仓库状态</div>
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
            { value: 'ff-only', label: '仅 Fast-forward' },
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
            { value: 'upstream-only', label: '仅 upstream 分支' },
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
                { value: '1', label: '1' },
                { value: '2', label: '2' },
                { value: '3', label: '3' },
                { value: '5', label: '5' },
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
