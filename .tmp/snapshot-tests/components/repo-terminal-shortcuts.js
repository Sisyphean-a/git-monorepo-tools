export const powerShellAddLineSequence = '\x1b[1;8S';
export function getWindowsTerminalShortcutAction(event, hasSelection, platform) {
    if (!isWindowsPlatform(platform) || event.type !== 'keydown') {
        return 'pass-through';
    }
    if (isWindowsShiftEnter(event, platform)) {
        return 'insert-line';
    }
    if (!event.ctrlKey || event.altKey || event.metaKey) {
        return 'pass-through';
    }
    switch (event.key.toLowerCase()) {
        case 'c':
            return hasSelection ? 'copy-selection' : 'pass-through';
        case 'v':
            return 'paste-clipboard';
        default:
            return 'pass-through';
    }
}
export function handleWindowsTerminalShortcutEvent(event, bindings, platform) {
    if (event.type === 'keypress' && isWindowsShiftEnter(event, platform)) {
        return false;
    }
    switch (getWindowsTerminalShortcutAction(event, bindings.hasSelection(), platform)) {
        case 'copy-selection':
            bindings.copySelection();
            return false;
        case 'insert-line':
            bindings.insertLine?.(powerShellAddLineSequence);
            return false;
        case 'paste-clipboard':
            bindings.pasteClipboard();
            return false;
        default:
            return true;
    }
}
export async function pasteTerminalClipboard(getClipboardText, transformPastedText, writeInput) {
    const text = await getClipboardText();
    if (!text) {
        return false;
    }
    const pastedText = transformPastedText(text);
    if (!pastedText) {
        return false;
    }
    await writeInput(pastedText);
    return true;
}
export function queueTerminalInput(inputQueue, writeInput, data) {
    return inputQueue.then(() => writeInput(data));
}
function isWindowsPlatform(platform) {
    return platform.toLowerCase().startsWith('win');
}
function isWindowsShiftEnter(event, platform) {
    return isWindowsPlatform(platform)
        && event.shiftKey
        && !event.ctrlKey
        && !event.altKey
        && !event.metaKey
        && event.key === 'Enter';
}
