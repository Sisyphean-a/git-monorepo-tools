import { useState, type Dispatch, type SetStateAction } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { BUILT_IN_COMMAND_OPTIONS, createCommandId, DEFAULT_BUILT_IN_COMMAND_ACTION, getBuiltInCommandLabel } from '../features/commands/command-center';
import { C } from '../theme';
import type { AppSettings, BuiltInCommandAction, CommandCenterSettings, CommandCombo, CustomCommandButton } from '../domain/types';
import { Input, Select } from './settings-modal-shared';

interface CommandSettingsTabProps {
  draft: AppSettings;
  setDraft: Dispatch<SetStateAction<AppSettings>>;
}

export function CommandSettingsTab({ draft, setDraft }: CommandSettingsTabProps) {
  const updateCommandCenter = (updater: (current: CommandCenterSettings) => CommandCenterSettings) => {
    setDraft(current => ({
      ...current,
      commandCenter: updater(current.commandCenter),
    }));
  };

  const addCombo = () => {
    updateCommandCenter(current => ({
      ...current,
      combos: [
        ...current.combos,
        { id: createCommandId('combo'), label: '新组合', actions: ['stage-all'] },
      ],
    }));
  };

  const addCustomCommand = () => {
    updateCommandCenter(current => ({
      ...current,
      customCommands: [
        ...current.customCommands,
        { id: createCommandId('cmd'), label: '', command: '' },
      ],
    }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <CommandSection title={`组合按钮（${draft.commandCenter.combos.length}）`} onAdd={addCombo}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {draft.commandCenter.combos.map(combo => (
            <ComboEditor
              key={combo.id}
              combo={combo}
              onChange={nextCombo => updateCommandCenter(current => ({
                ...current,
                combos: current.combos.map(item => item.id === combo.id ? nextCombo : item),
              }))}
              onRemove={() => updateCommandCenter(current => ({
                ...current,
                combos: current.combos.filter(item => item.id !== combo.id),
              }))}
            />
          ))}
        </div>
      </CommandSection>

      <CommandSection title={`自定义命令（${draft.commandCenter.customCommands.length}）`} onAdd={addCustomCommand}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {draft.commandCenter.customCommands.map(command => (
            <CustomCommandEditor
              key={command.id}
              command={command}
              onChange={nextCommand => updateCommandCenter(current => ({
                ...current,
                customCommands: current.customCommands.map(item => item.id === command.id ? nextCommand : item),
              }))}
              onRemove={() => updateCommandCenter(current => ({
                ...current,
                customCommands: current.customCommands.filter(item => item.id !== command.id),
              }))}
            />
          ))}
        </div>
      </CommandSection>
    </div>
  );
}

function CommandSection({
  title,
  children,
  onAdd,
}: {
  title: string;
  children: React.ReactNode;
  onAdd: () => void;
}) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ color: C.textSecondary, fontSize: 12, fontWeight: 600 }}>{title}</span>
        <button
          onClick={onAdd}
          style={{ background: C.panel1, border: `1px solid ${C.border}`, color: C.textSecondary, borderRadius: 5, padding: '5px 10px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <Plus size={11} /> 添加
        </button>
      </div>
      {children}
    </section>
  );
}

function ComboEditor({
  combo,
  onChange,
  onRemove,
}: {
  combo: CommandCombo;
  onChange: (combo: CommandCombo) => void;
  onRemove: () => void;
}) {
  const [nextAction, setNextAction] = useState<BuiltInCommandAction>(DEFAULT_BUILT_IN_COMMAND_ACTION);

  const moveAction = (from: number, to: number) => {
    if (to < 0 || to >= combo.actions.length) return;
    const nextActions = [...combo.actions];
    const [target] = nextActions.splice(from, 1);
    if (!target) return;
    nextActions.splice(to, 0, target);
    onChange({ ...combo, actions: nextActions });
  };

  return (
    <div style={{ background: C.panel1, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <Input value={combo.label} onChange={label => onChange({ ...combo, label })} placeholder="名称" />
        </div>
        <button onClick={onRemove} style={iconBtnStyle()}>
          <Trash2 size={12} />
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {combo.actions.map((action, index) => (
          <div key={`${combo.id}-${action}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <span style={{ color: C.textPrimary, fontSize: 11 }}>{getBuiltInCommandLabel(action)}</span>
            <button onClick={() => moveAction(index, index - 1)} disabled={index === 0} style={iconBtnStyle(index === 0)}>
              <ChevronLeft size={11} />
            </button>
            <button onClick={() => moveAction(index, index + 1)} disabled={index === combo.actions.length - 1} style={iconBtnStyle(index === combo.actions.length - 1)}>
              <ChevronRight size={11} />
            </button>
            <button onClick={() => onChange({ ...combo, actions: combo.actions.filter((_, actionIndex) => actionIndex !== index) })} style={iconBtnStyle()}>
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <div style={{ flex: 1 }}>
          <Select
            value={nextAction}
            onChange={value => setNextAction(value as BuiltInCommandAction)}
            options={BUILT_IN_COMMAND_OPTIONS}
          />
        </div>
        <button
          onClick={() => onChange({ ...combo, actions: [...combo.actions, nextAction] })}
          style={{ background: C.btnPrimary, border: 'none', color: 'white', borderRadius: 6, padding: '0 12px', cursor: 'pointer', fontSize: 11 }}
        >
          添加步骤
        </button>
      </div>
    </div>
  );
}

function CustomCommandEditor({
  command,
  onChange,
  onRemove,
}: {
  command: CustomCommandButton;
  onChange: (command: CustomCommandButton) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ background: C.panel1, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <Input value={command.label} onChange={label => onChange({ ...command, label })} placeholder="名称" />
        </div>
        <button onClick={onRemove} style={iconBtnStyle()}>
          <Trash2 size={12} />
        </button>
      </div>
      <Input value={command.command} onChange={value => onChange({ ...command, command: value })} placeholder="wails build" monospace />
    </div>
  );
}

function iconBtnStyle(disabled = false) {
  return {
    background: 'none',
    border: 'none',
    color: disabled ? C.textWeak : C.textSecondary,
    cursor: disabled ? 'not-allowed' : 'pointer',
    padding: 2,
    display: 'flex',
    alignItems: 'center',
    opacity: disabled ? 0.45 : 1,
  } as const;
}
