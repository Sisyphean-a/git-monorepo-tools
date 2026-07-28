import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Plus, Trash2, X } from 'lucide-react';
import { BUILT_IN_COMMAND_OPTIONS, createCommandId, DEFAULT_BUILT_IN_COMMAND_ACTION, getBuiltInCommandLabel, getProjectCommands, moveCommand } from '../features/commands/command-center';
import { C } from '../theme';
import type { AppSettings, BuiltInCommandAction, CommandCenterSettings, CommandCombo, CustomCommandButton, Repo } from '../domain/types';
import { Input, Select } from './settings-modal-shared';

type CommandTab = 'global' | 'project';

interface CommandModalProps {
  repo: Repo | null;
  settings: AppSettings;
  open: boolean;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
}

export function CommandModal({ repo, settings, open, onClose, onSave }: CommandModalProps) {
  const [tab, setTab] = useState<CommandTab>(repo ? 'project' : 'global');
  const [draft, setDraft] = useState(settings);
  const openedRef = useRef(false);

  useEffect(() => {
    if (open && !openedRef.current) {
      setDraft(settings);
      setTab(repo ? 'project' : 'global');
    }
    openedRef.current = open;
  }, [open, settings]);

  if (!open) return null;

  const updateCommandCenter = (updater: (current: CommandCenterSettings) => CommandCenterSettings) => {
    setDraft(current => ({ ...current, commandCenter: updater(current.commandCenter) }));
  };
  const updateProjectCommands = (updater: (commands: CustomCommandButton[]) => CustomCommandButton[]) => {
    if (!repo) return;
    updateCommandCenter(current => {
      const commands = updater(getProjectCommands(current, repo.id));
      const projectCommands = { ...current.projectCommands };
      if (commands.length === 0) {
        delete projectCommands[repo.id];
      } else {
        projectCommands[repo.id] = commands;
      }
      return { ...current, projectCommands };
    });
  };
  const projectCommands = repo ? getProjectCommands(draft.commandCenter, repo.id) : [];

  const addCombo = () => {
    updateCommandCenter(current => ({
      ...current,
      combos: [...current.combos, { id: createCommandId('combo'), label: '新组合', actions: ['stage-all'] }],
    }));
  };
  const addGlobalCommand = () => {
    updateCommandCenter(current => ({
      ...current,
      customCommands: [...current.customCommands, { id: createCommandId('cmd'), label: '', command: '' }],
    }));
  };
  const addProjectCommand = () => {
    updateProjectCommands(commands => [...commands, { id: createCommandId('cmd'), label: '', command: '' }]);
  };

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
          width: 640,
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
          <h3 style={{ color: C.textPrimary, fontSize: 15, fontWeight: 600, margin: 0 }}>命令</h3>
          <button onClick={onClose} style={closeButtonStyle()}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '12px 20px 0', flexShrink: 0 }}>
          <TabButton active={tab === 'project'} onClick={() => setTab('project')}>项目命令</TabButton>
          <TabButton active={tab === 'global'} onClick={() => setTab('global')}>全局命令</TabButton>
        </div>

        <div style={{ overflowY: 'auto', padding: 20 }}>
          {tab === 'global' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <CommandSection title={`组合按钮（${draft.commandCenter.combos.length}）`} onAdd={addCombo}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {draft.commandCenter.combos.map((combo, index) => (
                    <ComboEditor
                      key={combo.id}
                      combo={combo}
                      canMoveUp={index > 0}
                      canMoveDown={index < draft.commandCenter.combos.length - 1}
                      onMoveUp={() => updateCommandCenter(current => ({
                        ...current,
                        combos: moveCommand(current.combos, index, index - 1),
                      }))}
                      onMoveDown={() => updateCommandCenter(current => ({
                        ...current,
                        combos: moveCommand(current.combos, index, index + 1),
                      }))}
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

              <CommandSection title={`全局命令（${draft.commandCenter.customCommands.length}）`} onAdd={addGlobalCommand}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {draft.commandCenter.customCommands.map((command, index) => (
                    <CustomCommandEditor
                      key={command.id}
                      command={command}
                      canMoveUp={index > 0}
                      canMoveDown={index < draft.commandCenter.customCommands.length - 1}
                      onMoveUp={() => updateCommandCenter(current => ({
                        ...current,
                        customCommands: moveCommand(current.customCommands, index, index - 1),
                      }))}
                      onMoveDown={() => updateCommandCenter(current => ({
                        ...current,
                        customCommands: moveCommand(current.customCommands, index, index + 1),
                      }))}
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
          )}

          {tab === 'project' && (repo ? (
            <CommandSection title={`${repo.name} 的项目命令（${projectCommands.length}）`} onAdd={addProjectCommand}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {projectCommands.map((command, index) => (
                  <CustomCommandEditor
                    key={command.id}
                    command={command}
                    canMoveUp={index > 0}
                    canMoveDown={index < projectCommands.length - 1}
                    onMoveUp={() => updateProjectCommands(commands => moveCommand(commands, index, index - 1))}
                    onMoveDown={() => updateProjectCommands(commands => moveCommand(commands, index, index + 1))}
                    onChange={nextCommand => updateProjectCommands(commands => (
                      commands.map(item => item.id === command.id ? nextCommand : item)
                    ))}
                    onRemove={() => updateProjectCommands(commands => (
                      commands.filter(item => item.id !== command.id)
                    ))}
                  />
                ))}
              </div>
            </CommandSection>
          ) : (
            <div style={{ color: C.textWeak, fontSize: 12 }}>选择一个项目后可配置其专属命令。</div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          <button onClick={onClose} style={secondaryButtonStyle()}>取消</button>
          <button onClick={() => onSave(draft)} style={primaryButtonStyle()}>保存</button>
        </div>
      </div>
    </>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? C.selectedBg : C.panel2,
        border: `1px solid ${active ? C.btnPrimary : C.border}`,
        color: active ? C.textPrimary : C.textSecondary,
        borderRadius: 6,
        padding: '7px 12px',
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      {children}
    </button>
  );
}

function CommandSection({ title, children, onAdd }: { title: string; children: React.ReactNode; onAdd: () => void }) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ color: C.textSecondary, fontSize: 12, fontWeight: 600 }}>{title}</span>
        <button onClick={onAdd} style={secondaryButtonStyle()}>
          <Plus size={11} /> 添加
        </button>
      </div>
      {children}
    </section>
  );
}

function ComboEditor({
  combo,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onChange,
  onRemove,
}: {
  combo: CommandCombo;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
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
    <div style={editorStyle()}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <div style={{ flex: 1 }}><Input value={combo.label} onChange={label => onChange({ ...combo, label })} placeholder="名称" /></div>
        <button onClick={onMoveUp} disabled={!canMoveUp} style={iconButtonStyle(!canMoveUp)}><ChevronUp size={12} /></button>
        <button onClick={onMoveDown} disabled={!canMoveDown} style={iconButtonStyle(!canMoveDown)}><ChevronDown size={12} /></button>
        <button onClick={onRemove} style={iconButtonStyle()}><Trash2 size={12} /></button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {combo.actions.map((action, index) => (
          <div key={`${combo.id}-${action}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <span style={{ color: C.textPrimary, fontSize: 11 }}>{getBuiltInCommandLabel(action)}</span>
            <button onClick={() => moveAction(index, index - 1)} disabled={index === 0} style={iconButtonStyle(index === 0)}><ChevronLeft size={11} /></button>
            <button onClick={() => moveAction(index, index + 1)} disabled={index === combo.actions.length - 1} style={iconButtonStyle(index === combo.actions.length - 1)}><ChevronRight size={11} /></button>
            <button onClick={() => onChange({ ...combo, actions: combo.actions.filter((_, actionIndex) => actionIndex !== index) })} style={iconButtonStyle()}><Trash2 size={11} /></button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <div style={{ flex: 1 }}><Select value={nextAction} onChange={value => setNextAction(value as BuiltInCommandAction)} options={BUILT_IN_COMMAND_OPTIONS} /></div>
        <button onClick={() => onChange({ ...combo, actions: [...combo.actions, nextAction] })} style={primaryButtonStyle()}>添加步骤</button>
      </div>
    </div>
  );
}

function CustomCommandEditor({
  command,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onChange,
  onRemove,
}: {
  command: CustomCommandButton;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onChange: (command: CustomCommandButton) => void;
  onRemove: () => void;
}) {
  return (
    <div style={editorStyle()}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <div style={{ flex: 1 }}><Input value={command.label} onChange={label => onChange({ ...command, label })} placeholder="名称" /></div>
        <button onClick={onMoveUp} disabled={!canMoveUp} style={iconButtonStyle(!canMoveUp)}><ChevronUp size={12} /></button>
        <button onClick={onMoveDown} disabled={!canMoveDown} style={iconButtonStyle(!canMoveDown)}><ChevronDown size={12} /></button>
        <button onClick={onRemove} style={iconButtonStyle()}><Trash2 size={12} /></button>
      </div>
      <textarea
        value={command.command}
        onChange={event => onChange({ ...command, command: event.target.value })}
        placeholder="wails build"
        rows={4}
        style={{
          width: '100%',
          minHeight: 88,
          resize: 'vertical',
          background: C.panel1,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          padding: '8px 10px',
          color: command.command ? C.textPrimary : C.textWeak,
          fontSize: 12,
          lineHeight: 1.5,
          outline: 'none',
          boxSizing: 'border-box',
          fontFamily: 'JetBrains Mono, monospace',
        }}
        onFocus={event => {
          event.target.style.borderColor = C.btnPrimary;
        }}
        onBlur={event => {
          event.target.style.borderColor = C.border;
        }}
      />
    </div>
  );
}

function editorStyle() {
  return { background: C.panel1, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 } as const;
}

function closeButtonStyle() {
  return { marginLeft: 'auto', background: 'none', border: 'none', color: C.textWeak, cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' } as const;
}

function secondaryButtonStyle() {
  return { background: C.panel2, border: `1px solid ${C.border}`, color: C.textSecondary, borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 } as const;
}

function primaryButtonStyle() {
  return { background: C.btnPrimary, border: 'none', color: 'white', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 11 } as const;
}

function iconButtonStyle(disabled = false) {
  return { background: 'none', border: 'none', color: disabled ? C.textWeak : C.textSecondary, cursor: disabled ? 'not-allowed' : 'pointer', padding: 2, display: 'flex', alignItems: 'center', opacity: disabled ? 0.45 : 1 } as const;
}
