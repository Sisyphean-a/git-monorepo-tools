import { spawn, spawnSync } from 'node:child_process';

function toWindowsPath(targetPath) {
  return targetPath.replace(/\//g, '\\');
}

function normalizePath(targetPath) {
  return targetPath.replace(/\\/g, '/');
}

function escapePowerShell(value) {
  return value.replace(/'/g, "''");
}

function launchDetached(command, args, cwd) {
  const child = spawn(command, args, {
    cwd: cwd ? toWindowsPath(cwd) : undefined,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
}

export function openFolder(targetPath) {
  launchDetached('explorer.exe', [toWindowsPath(targetPath)]);
}

export function openTerminal(targetPath) {
  launchDetached(
    'powershell.exe',
    ['-NoExit', '-Command', `Set-Location -LiteralPath '${escapePowerShell(toWindowsPath(targetPath))}'`],
    targetPath,
  );
}

export function openConflictTool(targetPath) {
  launchDetached(
    'powershell.exe',
    ['-NoExit', '-Command', `Set-Location -LiteralPath '${escapePowerShell(toWindowsPath(targetPath))}'; git mergetool`],
    targetPath,
  );
}

export function pickFolder() {
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    "$dialog.Description = '选择要添加的目录'",
    '$dialog.UseDescriptionForTitle = $true',
    'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {',
    '  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '  Write-Output $dialog.SelectedPath',
    '}',
  ].join('; ');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-STA', '-Command', script], {
    encoding: 'utf8',
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || '').trim();
    throw new Error(message || '目录选择失败');
  }
  const selected = result.stdout.trim();
  return selected ? normalizePath(selected) : null;
}
