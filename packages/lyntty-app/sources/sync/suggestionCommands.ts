/**
 * Suggestion commands functionality for slash commands
 * Reads commands directly from session metadata storage
 */

import Fuse from 'fuse.js';
import { storage } from './storage';
import type { TranslationKey } from '@/text';

export interface CommandItem {
    command: string;        // The command without slash (e.g., "compact")
    description?: string;   // Optional description of what the command does
    descriptionKey?: TranslationKey;
}

interface SearchOptions {
    limit?: number;
    threshold?: number;
}

// Commands to ignore/filter out
export const IGNORED_COMMANDS = [
    "add-dir",
    "agents",
    "config",
    "statusline",
    "bashes",
    "settings",
    "cost",
    "doctor",
    "exit",
    "help",
    "ide",
    "init",
    "install-github-app",
    "memory",
    "migrate-installer",
    "model",
    "pr-comments",
    "release-notes",
    "resume",
    "status",
    "bug",
    "review",
    "security-review",
    "terminal-setup",
    "upgrade",
    "vim",
    "permissions",
    "hooks",
    "export",
    "logout",
    "login"
];

// Default commands always available
const DEFAULT_COMMANDS: CommandItem[] = [
    { command: 'goal', descriptionKey: 'appWide.showOrManageTheCurrentPiGoal' },
    { command: 'context', descriptionKey: 'appWide.showPiContextUsage' },
];

// Command descriptions for known tools/commands
const COMMAND_DESCRIPTIONS: Record<string, string> = {
    // Default commands
    compact: 'Compact the conversation history',
    goal: 'Show or manage the current Pi goal',
    context: 'Show Pi context usage',

    // Common tool commands
    help: 'Show available commands',
    clear: 'Clear the conversation',
    reset: 'Reset the session',
    export: 'Export conversation',
    debug: 'Show debug information',
    status: 'Show connection status',
    stop: 'Stop current operation',
    abort: 'Abort current operation',
    cancel: 'Cancel current operation',

    // Add more descriptions as needed
};

function normalizeCommandName(command: string, source: 'slash' | 'skill'): string | null {
    const withoutSlash = command.trim().replace(/^\//, '');
    if (!withoutSlash) return null;
    if (source === 'skill') {
        return withoutSlash.startsWith('skill:') ? withoutSlash : `skill:${withoutSlash}`;
    }
    return withoutSlash;
}

// Get commands from session metadata
function getCommandsFromSession(sessionId: string): CommandItem[] {
    const state = storage.getState();
    const session = state.sessions[sessionId];
    if (!session || !session.metadata) {
        return DEFAULT_COMMANDS;
    }

    const commands: CommandItem[] = [...DEFAULT_COMMANDS];

    const metadataCommands = [
        ...(session.metadata.slashCommands ?? []).map((command) => normalizeCommandName(command, 'slash')),
        ...(session.metadata.skills ?? []).map((command) => normalizeCommandName(command, 'skill')),
    ].filter((command): command is string => Boolean(command));

    for (const cmd of metadataCommands) {
        // Skip if in ignore list
        if (IGNORED_COMMANDS.includes(cmd)) continue;

        // Check if it's already in default commands or slash commands
        if (!commands.find(c => c.command === cmd)) {
            commands.push({
                command: cmd,
                description: COMMAND_DESCRIPTIONS[cmd]  // Optional description
            });
        }
    }

    return commands;
}

// Main export: search commands with fuzzy matching
export async function searchCommands(
    sessionId: string,
    query: string,
    options: SearchOptions = {}
): Promise<CommandItem[]> {
    const { limit = 10, threshold = 0.3 } = options;

    // Get commands from session metadata (no caching)
    const commands = getCommandsFromSession(sessionId);

    // If query is empty, return all commands
    if (!query || query.trim().length === 0) {
        return commands.slice(0, limit);
    }

    // Setup Fuse for fuzzy search
    const fuseOptions = {
        keys: [
            { name: 'command', weight: 0.7 },
            { name: 'description', weight: 0.3 }
        ],
        threshold,
        includeScore: true,
        shouldSort: true,
        minMatchCharLength: 1,
        ignoreLocation: true,
        useExtendedSearch: true
    };

    const fuse = new Fuse(commands, fuseOptions);
    const results = fuse.search(query, { limit });

    return results.map(result => result.item);
}

// Get all available commands for a session
export function getAllCommands(sessionId: string): CommandItem[] {
    return getCommandsFromSession(sessionId);
}
