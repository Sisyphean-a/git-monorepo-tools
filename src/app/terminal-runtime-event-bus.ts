import { EventsOn } from '../../frontend/wailsjs/runtime/runtime.js';
import { TerminalEventBus } from './terminal-event-bus.js';

export const terminalEventBus = new TerminalEventBus((event, handler) => EventsOn(event, handler));
