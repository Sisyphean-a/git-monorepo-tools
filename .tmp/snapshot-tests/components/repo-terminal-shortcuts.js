export function getWindowsTerminalShortcutAction(event, hasSelection, platform) {
    if (!isWindowsPlatform(platform) || event.type !== 'keydown') {
        return 'pass-through';
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
    switch (getWindowsTerminalShortcutAction(event, bindings.hasSelection(), platform)) {
        case 'copy-selection':
            bindings.copySelection();
            return false;
        case 'paste-clipboard':
            event.preventDefault();
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
