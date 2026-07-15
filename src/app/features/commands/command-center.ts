import type {
  BuiltInCommandAction,
  CommandCenterSettings,
  CommandCombo,
  CustomCommandButton,
} from '../../domain/types.js';

export const BUILT_IN_COMMAND_OPTIONS: { value: BuiltInCommandAction; label: string }[] = [
  { value: 'stage-all', label: '全部暂存' },
  { value: 'unstage-all', label: '全部取消暂存' },
  { value: 'generate', label: '生成' },
  { value: 'commit', label: '提交' },
  { value: 'pull', label: 'Pull' },
  { value: 'push', label: 'Push' },
  { value: 'refresh', label: '刷新' },
];

export const DEFAULT_BUILT_IN_COMMAND_ACTION: BuiltInCommandAction = 'stage-all';

const BUILT_IN_COMMAND_SET = new Set<BuiltInCommandAction>(
  BUILT_IN_COMMAND_OPTIONS.map(option => option.value),
);

const DEFAULT_COMBOS: CommandCombo[] = [
  {
    id: 'combo-stage-generate-commit-push',
    label: '暂存→生成→提交→推送',
    actions: ['stage-all', 'generate', 'commit', 'push'],
  },
];

export const DEFAULT_COMMAND_CENTER: CommandCenterSettings = {
  combos: DEFAULT_COMBOS,
  customCommands: [],
};

export function cloneDefaultCommandCenter() {
  return JSON.parse(JSON.stringify(DEFAULT_COMMAND_CENTER)) as CommandCenterSettings;
}

export function createCommandId(prefix: 'combo' | 'cmd') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isBuiltInCommandAction(value: unknown): value is BuiltInCommandAction {
  return typeof value === 'string' && BUILT_IN_COMMAND_SET.has(value as BuiltInCommandAction);
}

export function getBuiltInCommandLabel(action: BuiltInCommandAction) {
  return BUILT_IN_COMMAND_OPTIONS.find(option => option.value === action)?.label ?? action;
}

export function formatComboSummary(actions: BuiltInCommandAction[]) {
  return actions.map(getBuiltInCommandLabel).join(' → ');
}

export function sanitizeCommandCenter(value: unknown) {
  const fallback = cloneDefaultCommandCenter();
  if (!value || typeof value !== 'object') return fallback;
  const source = value as Partial<CommandCenterSettings>;
  return {
    combos: sanitizeCommandCombos(source.combos, fallback.combos),
    customCommands: sanitizeCustomCommands(source.customCommands),
  };
}

function sanitizeCommandCombos(value: unknown, fallback: CommandCombo[]) {
  if (!Array.isArray(value)) return fallback;
  const combos: CommandCombo[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const combo = item as Partial<CommandCombo>;
    const actions = Array.isArray(combo.actions)
      ? combo.actions.filter(isBuiltInCommandAction)
      : [];
    const label = sanitizeText(combo.label, actions.length > 0 ? formatComboSummary(actions) : '');
    const id = sanitizeText(combo.id, createCommandId('combo'));
    if (!label || actions.length === 0) continue;
    combos.push({ id, label, actions });
  }
  return combos;
}

function sanitizeCustomCommands(value: unknown) {
  if (!Array.isArray(value)) return [] as CustomCommandButton[];
  const commands: CustomCommandButton[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const command = item as Partial<CustomCommandButton>;
    const label = sanitizeText(command.label, '');
    const shell = sanitizeText(command.command, '');
    const id = sanitizeText(command.id, createCommandId('cmd'));
    if (!label || !shell) continue;
    commands.push({ id, label, command: shell });
  }
  return commands;
}

function sanitizeText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
