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
            return 'paste';
        default:
            return 'pass-through';
    }
}
function isWindowsPlatform(platform) {
    return platform.toLowerCase().startsWith('win');
}
