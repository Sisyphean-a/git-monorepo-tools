export const ctrlVInput = '\x16';
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
export async function pasteTerminalClipboard(options) {
    const fallbackInput = options.source === 'keyboard' ? ctrlVInput : undefined;
    let text;
    try {
        text = await options.getClipboardText();
    }
    catch (error) {
        if (!fallbackInput) {
            throw error;
        }
        await options.writeInput(fallbackInput);
        return true;
    }
    const input = text
        ? options.transformPastedText(text)
        : fallbackInput;
    if (!input) {
        return false;
    }
    await options.writeInput(input);
    return true;
}
export function queueTerminalInput(inputQueue, writeInput, data) {
    return inputQueue.then(() => writeInput(data));
}
function isWindowsPlatform(platform) {
    return platform.toLowerCase().startsWith('win');
}
