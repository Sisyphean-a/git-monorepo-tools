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

export const DEFAULT_COMMAND_CATALOG: CommandCenterSettings = {
  combos: DEFAULT_COMBOS,
  customCommands: [],
  projectCommands: {},
};

export type CommandScope = 'global' | 'project';

export type CommandCatalogAction =
  | { type: 'add-combo' }
  | { type: 'replace-combo'; index: number; combo: CommandCombo }
  | { type: 'remove-combo'; index: number }
  | { type: 'move-combo'; from: number; to: number }
  | { type: 'add-custom'; scope: CommandScope; repoId?: string }
  | { type: 'replace-custom'; scope: CommandScope; repoId?: string; index: number; command: CustomCommandButton }
  | { type: 'remove-custom'; scope: CommandScope; repoId?: string; index: number }
  | { type: 'move-custom'; scope: CommandScope; repoId?: string; from: number; to: number };

export interface CommandCatalogView {
  combos: readonly CommandCombo[];
  globalCommands: readonly CustomCommandButton[];
  projectCommands: readonly CustomCommandButton[];
}

export interface CatalogCommand {
  scope: CommandScope;
  command: CustomCommandButton;
}

export function cloneDefaultCommandCatalog() {
  return JSON.parse(JSON.stringify(DEFAULT_COMMAND_CATALOG)) as CommandCenterSettings;
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

export function getCommandCatalogView(catalog: CommandCenterSettings, repoId: string | null | undefined): CommandCatalogView {
  return {
    combos: catalog.combos,
    globalCommands: catalog.customCommands,
    projectCommands: repoId ? getProjectCommands(catalog, repoId) : [],
  };
}

export function getRepoCommands(catalog: CommandCenterSettings, repoId: string): CatalogCommand[] {
  return [
    ...getProjectCommands(catalog, repoId).map(command => ({ scope: 'project' as const, command })),
    ...catalog.customCommands.map(command => ({ scope: 'global' as const, command })),
  ];
}

export function getProjectCommands(catalog: CommandCenterSettings, repoId: string) {
  return catalog.projectCommands[repoId] ?? [];
}

/**
 * Flow: all catalog edits return a new value; empty project lists are removed before persistence.
 */
export function applyCommandCatalogAction(
  catalog: CommandCenterSettings,
  action: CommandCatalogAction,
): CommandCenterSettings {
  switch (action.type) {
    case 'add-combo':
      return {
        ...catalog,
        combos: [...catalog.combos, { id: createCommandId('combo'), label: '新组合', actions: [DEFAULT_BUILT_IN_COMMAND_ACTION] }],
      };
    case 'replace-combo':
      return { ...catalog, combos: replaceAt(catalog.combos, action.index, action.combo) };
    case 'remove-combo':
      return { ...catalog, combos: removeAt(catalog.combos, action.index) };
    case 'move-combo':
      return { ...catalog, combos: moveCommand(catalog.combos, action.from, action.to) };
    case 'add-custom':
      return updateCustomCommands(catalog, action.scope, action.repoId, commands => [
        ...commands,
        { id: createCommandId('cmd'), label: '', command: '' },
      ]);
    case 'replace-custom':
      return updateCustomCommands(catalog, action.scope, action.repoId, commands => (
        replaceAt(commands, action.index, action.command)
      ));
    case 'remove-custom':
      return updateCustomCommands(catalog, action.scope, action.repoId, commands => removeAt(commands, action.index));
    case 'move-custom':
      return updateCustomCommands(catalog, action.scope, action.repoId, commands => (
        moveCommand(commands, action.from, action.to)
      ));
  }
}

export function moveCommand<T>(commands: readonly T[], from: number, to: number) {
  if (from < 0 || from >= commands.length || to < 0 || to >= commands.length) {
    throw new RangeError('命令排序位置无效');
  }
  const ordered = [...commands];
  const [command] = ordered.splice(from, 1);
  ordered.splice(to, 0, command!);
  return ordered;
}

export function sanitizeCommandCatalog(value: unknown) {
  const fallback = cloneDefaultCommandCatalog();
  if (!value || typeof value !== 'object') return fallback;
  const source = value as Partial<CommandCenterSettings>;
  return {
    combos: sanitizeCommandCombos(source.combos, fallback.combos),
    customCommands: sanitizeCustomCommands(source.customCommands),
    projectCommands: sanitizeProjectCommands(source.projectCommands),
  };
}

function updateCustomCommands(
  catalog: CommandCenterSettings,
  scope: CommandScope,
  repoId: string | undefined,
  update: (commands: CustomCommandButton[]) => CustomCommandButton[],
): CommandCenterSettings {
  if (scope === 'global') {
    return { ...catalog, customCommands: update(catalog.customCommands) };
  }
  if (!repoId) {
    throw new Error('项目命令缺少仓库 ID');
  }
  const commands = update(getProjectCommands(catalog, repoId));
  const projectCommands = { ...catalog.projectCommands };
  if (commands.length === 0) {
    delete projectCommands[repoId];
  } else {
    projectCommands[repoId] = commands;
  }
  return { ...catalog, projectCommands };
}

function replaceAt<T>(items: readonly T[], index: number, next: T) {
  if (index < 0 || index >= items.length) {
    throw new RangeError('命令位置无效');
  }
  return items.map((item, itemIndex) => itemIndex === index ? next : item);
}

function removeAt<T>(items: readonly T[], index: number) {
  if (index < 0 || index >= items.length) {
    throw new RangeError('命令位置无效');
  }
  return items.filter((_, itemIndex) => itemIndex !== index);
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

function sanitizeProjectCommands(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {} as Record<string, CustomCommandButton[]>;
  }
  const projectCommands: Record<string, CustomCommandButton[]> = {};
  for (const [repoId, commands] of Object.entries(value)) {
    const id = sanitizeText(repoId, '');
    const sanitized = sanitizeCustomCommands(commands);
    if (id && sanitized.length > 0) projectCommands[id] = sanitized;
  }
  return projectCommands;
}

function sanitizeText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
