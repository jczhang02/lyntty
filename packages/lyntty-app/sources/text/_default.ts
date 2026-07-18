/**
 * English translations for the Lyntty app
 * Values can be:
 * - String constants for static text
 * - Functions with typed object parameters for dynamic text
 */

/**
 * English plural helper function
 * @param options - Object containing count, singular, and plural forms
 * @returns The appropriate form based on count
 */
function plural({ count, singular, plural }: { count: number; singular: string; plural: string }): string {
    return count === 1 ? singular : plural;
}

export const en = {
    tabs: {
        // Tab navigation labels
        sessions: 'Sessions',
        settings: 'Settings',
    },

    common: {
        // Simple string constants
        cancel: 'Cancel',
        authenticate: 'Authenticate',
        save: 'Save',
        saveAs: 'Save As',
        error: 'Error',
        success: 'Success',
        ok: 'OK',
        continue: 'Continue',
        back: 'Back',
        create: 'Create',
        rename: 'Rename',
        reset: 'Reset',
        logout: 'Logout',
        yes: 'Yes',
        no: 'No',
        discard: 'Discard',
        version: 'Version',
        copied: 'Copied',
        copy: 'Copy',
        scanning: 'Scanning...',
        urlPlaceholder: 'https://example.com',
        home: 'Home',
        message: 'Message',
        files: 'Files',
        fileViewer: 'File Viewer',
        loading: 'Loading...',
        retry: 'Retry',
        delete: 'Delete',
        optional: 'optional',
    },

    status: {
        connected: 'connected',
        connecting: 'connecting',
        disconnected: 'disconnected',
        error: 'error',
        online: 'online',
        offline: 'offline',
        lastSeen: ({ time }: { time: string }) => `last seen ${time}`,
        permissionRequired: 'permission required',
        activeNow: 'Active now',
        unknown: 'unknown',
        unread: 'new results',
    },

    time: {
        justNow: 'just now',
        minutesAgo: ({ count }: { count: number }) => `${count} minute${count !== 1 ? 's' : ''} ago`,
        hoursAgo: ({ count }: { count: number }) => `${count} hour${count !== 1 ? 's' : ''} ago`,
        daysAgo: ({ count }: { count: number }) => `${count} day${count !== 1 ? 's' : ''} ago`,
    },

    connect: {
        restoreAccount: 'Restore Account',
        enterSecretKey: 'Please enter a secret key',
        invalidSecretKey: 'Invalid secret key. Please check and try again.',
        enterUrlManually: 'Enter URL manually',
    },

    settings: {
        title: 'Settings',
        connectedAccounts: 'Connected Accounts',
        connectAccount: 'Connect account',
        machines: 'Node Management',
        relay: 'Relay',
        signedIn: 'Signed in',
        noNodesPaired: 'No nodes paired',
        oneNodeOnline: '1 node online',
        nodesOnline: ({ onlineCount, totalCount }: { onlineCount: number; totalCount: number }) => `${onlineCount}/${totalCount} nodes online`,
        showOfflineMachines: ({ count }: { count: number }) => count === 1 ? 'Show 1 offline machine' : `Show ${count} offline machines`,
        hideOfflineMachines: 'Hide offline machines',
        features: 'Features',
        account: 'Account',
        accountSubtitle: 'Manage your account details',
        appearance: 'Appearance',
        appearanceSubtitle: 'Customize how the app looks',
        featuresTitle: 'Features',
        featuresSubtitle: 'Enable or disable app features',
        developer: 'Developer',
        developerTools: 'Developer Tools',
        about: 'About',
        aboutFooter: 'Lyntty is a mobile control surface for local pi sessions. The relay carries encrypted sync and is not canonical history.',
        whatsNew: 'What\'s New',
        whatsNewSubtitle: 'See the latest updates and improvements',
        reportIssue: 'Report an Issue',
        privacyPolicy: 'Privacy Policy',
        termsOfService: 'Terms of Service',
        eula: 'EULA',
        scanQrCodeToAuthenticate: 'Scan node pairing QR code',
        machineStatus: ({ name, status }: { name: string; status: 'online' | 'offline' }) =>
            `${name} is ${status}`,
        featureToggled: ({ feature, enabled }: { feature: string; enabled: boolean }) =>
            `${feature} ${enabled ? 'enabled' : 'disabled'}`,
    },

    settingsAppearance: {
        // Appearance settings screen
        theme: 'Theme',
        themeDescription: 'Choose your preferred color scheme',
        themeOptions: {
            adaptive: 'Adaptive',
            light: 'Light',
            dark: 'Dark',
        },
        themeDescriptions: {
            adaptive: 'Match system settings',
            light: 'Always use light theme',
            dark: 'Always use dark theme',
        },
        display: 'Display',
        displayDescription: 'Control layout and spacing',
        inlineToolCalls: 'Inline Tool Calls',
        inlineToolCallsDescription: 'Display tool calls directly in chat messages',
        expandTodoLists: 'Expand Todo Lists',
        expandTodoListsDescription: 'Show all todos instead of just changes',
        showLineNumbersInDiffs: 'Show Line Numbers in Diffs',
        showLineNumbersInDiffsDescription: 'Display line numbers in code diffs',
        showLineNumbersInToolViews: 'Show Line Numbers in Tool Views',
        showLineNumbersInToolViewsDescription: 'Display line numbers in tool view diffs',
        wrapLinesInDiffs: 'Wrap Lines in Diffs',
        wrapLinesInDiffsDescription: 'Wrap long lines instead of horizontal scrolling in diff views',
        diffStyle: 'Diff View',
        diffStyleDescription: 'Show diffs as a single column (unified) or side-by-side (split).',
        diffStyleOptions: {
            unified: 'Unified',
            split: 'Split',
        },
        alwaysShowContextSize: 'Always Show Context Size',
        alwaysShowContextSizeDescription: 'Display context usage even when not near limit',
        avatarStyle: 'Avatar Style',
        avatarStyleDescription: 'Choose session avatar appearance',
        avatarOptions: {
            pixelated: 'Pixelated',
            gradient: 'Pet',
            brutalist: 'Brutalist',
        },
    },

    settingsFeatures: {
        // Features settings screen
        experiments: 'Experiments',
        experimentsDescription: 'Enable experimental features that are still in development. These features may be unstable or change without notice.',
        experimentalFeatures: 'Experimental Features',
        experimentalFeaturesEnabled: 'Experimental features enabled',
        experimentalFeaturesDisabled: 'Using stable features only',
        markdownCopyV2: 'Markdown Copy v2',
        markdownCopyV2Subtitle: 'Long press opens copy modal',
        hideInactiveSessions: 'Hide inactive sessions',
        hideInactiveSessionsSubtitle: 'Show only active chats in your list',
        groupToolCalls: 'Group Tool Calls',
        groupToolCallsSubtitle: 'Collapse consecutive tool calls into one container',
        imageUpload: 'Image Upload',
        imageUploadSubtitle: 'Attach images to messages for supported agents to analyze',
    },

    imageUpload: {
        permissionTitle: 'Photo Library Access',
        permissionMessage: 'Allow access to your photo library to attach images to messages.',
        limitTitle: 'Image Limit Reached',
        limitMessage: ({ max }: { max: number }) => `You can attach up to ${max} images per message.`,
        fileTooLargeTitle: 'File Too Large',
        fileTooLargeMessage: ({ name, maxMb }: { name: string; maxMb: number }) => `"${name}" exceeds the ${maxMb}MB limit and was not added.`,
        uploadFailedTitle: 'Upload Failed',
        uploadFailedMessage: ({ count }: { count: number }) => count === 1
            ? 'One image could not be uploaded and was not sent.'
            : `${count} images could not be uploaded and were not sent.`,
        notSupportedTitle: 'Images Not Supported',
        notSupportedMessage: 'This agent does not support image attachments. Images were not sent.',
    },

    errors: {
        networkError: 'Network error occurred',
        serverError: 'Server error occurred',
        unknownError: 'An unknown error occurred',
        connectionTimeout: 'Connection timed out',
        authenticationFailed: 'Authentication failed',
        permissionDenied: 'Permission denied',
        fileNotFound: 'File not found',
        invalidFormat: 'Invalid format',
        operationFailed: 'Operation failed',
        tryAgain: 'Please try again',
        contactSupport: 'Contact support if the problem persists',
        sessionNotFound: 'Session not found',
        oauthInitializationFailed: 'Failed to initialize OAuth flow',
        tokenStorageFailed: 'Failed to store authentication tokens',
        oauthStateMismatch: 'Security validation failed. Please try again',
        tokenExchangeFailed: 'Failed to exchange authorization code',
        oauthAuthorizationDenied: 'Authorization was denied',
        webViewLoadFailed: 'Failed to load authentication page',
        failedToLoadProfile: 'Failed to load user profile',
        userNotFound: 'User not found',
        sessionDeleted: 'Session has been deleted',
        sessionDeletedDescription: 'This session has been permanently removed',

        // Error functions with context
        fieldError: ({ field, reason }: { field: string; reason: string }) =>
            `${field}: ${reason}`,
        validationError: ({ field, min, max }: { field: string; min: number; max: number }) =>
            `${field} must be between ${min} and ${max}`,
        retryIn: ({ seconds }: { seconds: number }) =>
            `Retry in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`,
        errorWithCode: ({ message, code }: { message: string; code: number | string }) =>
            `${message} (Error ${code})`,
        disconnectServiceFailed: ({ service }: { service: string }) =>
            `Failed to disconnect ${service}`,
        connectServiceFailed: ({ service }: { service: string }) =>
            `Failed to connect ${service}. Please try again.`,
    },

    newSession: {
        title: 'Start New Session',
        machineOffline: 'Machine is offline',
        switchMachinesHint: '• Switch machines by clicking on the machine above',
    },

    sessionHistory: {
        // Used by session history screen
        title: 'Session History',
        empty: 'No sessions found',
        today: 'Today',
        yesterday: 'Yesterday',
        daysAgo: ({ count }: { count: number }) => `${count} ${count === 1 ? 'day' : 'days'} ago`,
        viewAll: 'View all sessions',
    },

    session: {
        inputPlaceholder: 'Type a message ...',
        inactiveArchived: 'This session is archived.',
        historyOnly: 'History only. Start Pi to make this session active via Lyntty.',
        computerOffline: 'Computer offline. History is still available.',
        waitingForPiExtension: 'Waiting for Pi extension. Messages stay queued until Pi reconnects.',
        legacyHistoryOnly: 'This legacy session cannot be controlled by this version of Lyntty.',
        installPiExtension: 'Install Pi extension',
        installPiExtensionInstructions: 'On the computer, run `lyntty remote install`, then run `/reload` in the active Pi session.',
        loadingLatestMessages: 'Loading latest messages…',
        resumeFromTerminal: 'To resume it from the terminal:',
        newChat: 'New chat',
        // Fork / duplicate / rewind flow (pi only)
    },


    server: {
        // Used by Server Configuration screen (app/(app)/server.tsx)
        serverConfiguration: 'Server Configuration',
        enterServerUrl: 'Please enter a server URL',
        notValidLynttyServer: 'Not a valid Lyntty relay',
        changeServer: 'Change Server',
        continueWithServer: 'Continue with this server?',
        resetToDefault: 'Reset to Default',
        resetServerDefault: 'Reset server to default?',
        validating: 'Validating...',
        validatingServer: 'Validating server...',
        serverReturnedError: 'Server returned an error',
        failedToConnectToServer: 'Failed to connect to server',
        currentlyUsingCustomServer: 'Currently using custom server',
        customServerUrlLabel: 'Custom Server URL',
        advancedFeatureFooter: "This is an advanced feature. Only change the server if you know what you're doing. You will need to log out and log in again after changing servers."
    },

    sessionInfo: {
        // Used by Session Info screen (app/(app)/session/[id]/info.tsx)
        killSession: 'Kill Session',
        killSessionConfirm: 'Are you sure you want to terminate this session?',
        archiveSession: 'Archive Session',
stopAndArchiveSession: 'Stop & Archive',
        archiveSessionConfirm: 'Are you sure you want to archive this session?',
        metadataCopied: 'Session metadata copied to clipboard',
        failedToCopyMetadata: 'Failed to copy session metadata',
        failedToKillSession: 'Failed to kill session',
        failedToArchiveSession: 'Failed to archive session',
        connectionStatus: 'Connection Status',
        created: 'Created',
        lastUpdated: 'Last Updated',
        quickActions: 'Quick Actions',
        viewMachine: 'View Machine',
        viewMachineSubtitle: 'View machine details and sessions',
        resumeSession: 'Resume Session',
        resumeSessionSubtitle: 'Resume this session on the same machine',
        resumeTakeoverPrompt: 'Pi is not connected to this session. Wait for it to reconnect, or choose how to resume. Waiting is safest.',
        resumeWait: 'Wait',
        resumeTakeOver: 'Take over',
        resumeStop: 'Stop & resume',
        resumeInterrupt: 'Interrupt & resume',
        resumeSessionSameMachineOnly: 'This session can only be resumed on the same machine it started on.',
        resumeSessionMachineOffline: 'This machine is offline. Resume is only available while it is online.',
        resumeSessionNeedsLynttyAgent: 'Resume is unavailable on this node. Reconnect lynttyd to enable it.',
        resumeSessionMissingMachine: 'This session is missing its node metadata, so it cannot be resumed.',
        resumeSessionMissingBackendId: 'This session does not have a resumable pi session file yet.',
        resumeSessionUnexpectedDirectoryPrompt: 'Resume cannot create directories. Start the session manually from its original path.',
        killSessionSubtitle: 'Immediately terminate the session',
        archiveSessionSubtitle: 'Archive this session and stop it',
        metadata: 'Metadata',
        host: 'Host',
        path: 'Path',
        processId: 'Process ID',
        lynttyHome: 'Lyntty Home',
        cliVersionOutdated: 'CLI Update Required',
        cliVersionOutdatedMessage: ({ currentVersion, requiredVersion }: { currentVersion: string; requiredVersion: string }) =>
            `Version ${currentVersion} installed. Update to ${requiredVersion} or later`,
        updateCliInstructions: 'Install the latest signed Lyntty CLI release.',
        deleteSession: 'Delete Session',
        deleteSessionSubtitle: 'Permanently remove this session',
        deleteSessionConfirm: 'Delete Session Permanently?',
        deleteSessionWarning: 'This action cannot be undone. All messages and data associated with this session will be permanently deleted.',
        failedToDeleteSession: 'Failed to delete session',
        sessionDeleted: 'Session deleted successfully',
        worktreeCleanupTitle: 'Delete Worktree?',
        worktreeCleanupMessage: 'The worktree has no uncommitted changes. Would you like to delete the worktree files?',
        worktreeCleanupDelete: 'Delete Worktree',
        worktreeCleanupKeep: 'Keep Files',

    },

    components: {
        emptyMainScreen: {
            // Used by EmptyMainScreen component
            readyToCode: 'Ready to code?',
            installCli: 'Install the Lyntty CLI',
            runIt: 'Run it',
            scanQrCode: 'Scan the QR code',
            openCamera: 'Open Camera',
        },
    },

    agentInput: {
        context: {
            remaining: ({ percent }: { percent: number }) => `${percent}% left`,
        },
        suggestion: {
            fileLabel: 'FILE',
            folderLabel: 'FOLDER',
        },
        noMachinesAvailable: 'No machines',
    },

    machineLauncher: {
        showLess: 'Show less',
        showAll: ({ count }: { count: number }) => `Show all (${count} paths)`,
        enterCustomPath: 'Enter custom path',
        offlineUnableToSpawn: 'Unable to spawn new session, offline',
    },

    sidebar: {
        sessionsTitle: 'Lyntty',
        showArchived: 'Show history',
        hideArchived: 'Hide history',
        newSession: 'New session',
    },

    zen: {
        toggle: 'Zen mode',
    },

    toolView: {
        input: 'Input',
        output: 'Output',
    },

    toolGroup: {
        editedFile: 'Edited file',
        editedFiles: ({ count }: { count: number }) => count === 1 ? 'Edited 1 file' : `Edited ${count} files`,
        readFiles: ({ count }: { count: number }) => count === 1 ? 'Read 1 file' : `Read ${count} files`,
        ranCommands: ({ count }: { count: number }) => count === 1 ? 'Ran 1 command' : `Ran ${count} commands`,
        searched: ({ count }: { count: number }) => count === 1 ? 'Searched 1 time' : `Searched ${count} times`,
        fetchedUrls: ({ count }: { count: number }) => count === 1 ? 'Fetched 1 URL' : `Fetched ${count} URLs`,
        ranTasks: ({ count }: { count: number }) => count === 1 ? 'Ran 1 task' : `Ran ${count} tasks`,
        usedTools: ({ count }: { count: number }) => count === 1 ? 'Used 1 tool' : `Used ${count} tools`,
        workedFor: ({ duration }: { duration: string }) => `Worked ${duration}`,
    },

    tools: {
        fullView: {
            description: 'Description',
            inputParams: 'Input Parameters',
            output: 'Output',
            error: 'Error',
            completed: 'Tool completed successfully',
            noOutput: 'No output was produced',
            running: 'Tool is running...',
        },
        taskView: {
            initializing: 'Initializing agent...',
            moreTools: ({ count }: { count: number }) => `+${count} more ${plural({ count, singular: 'tool', plural: 'tools' })}`,
        },
        multiEdit: {
            editNumber: ({ index, total }: { index: number; total: number }) => `Edit ${index} of ${total}`,
            replaceAll: 'Replace All',
        },
        names: {
            task: 'Task',
            terminal: 'Terminal',
            searchFiles: 'Search Files',
            search: 'Search',
            searchContent: 'Search Content',
            listFiles: 'List Files',
            planProposal: 'Plan proposal',
            readFile: 'Read File',
            editFile: 'Edit File',
            writeFile: 'Write File',
            fetchUrl: 'Fetch URL',
            readNotebook: 'Read Notebook',
            editNotebook: 'Edit Notebook',
            todoList: 'Todo List',
            webSearch: 'Web Search',
            reasoning: 'Reasoning',
            applyChanges: 'Update file',
            viewDiff: 'Current file changes',
            question: 'Question',
        },
        askUserQuestion: {
            submit: 'Submit Answer',
            multipleQuestions: ({ count }: { count: number }) => `${count} questions`,
            other: 'Other',
            otherDescription: 'Type your own answer',
            otherPlaceholder: 'Type your answer...',
        },
        desc: {
            terminalCmd: ({ cmd }: { cmd: string }) => `Terminal(cmd: ${cmd})`,
            searchPattern: ({ pattern }: { pattern: string }) => `Search(pattern: ${pattern})`,
            searchPath: ({ basename }: { basename: string }) => `Search(path: ${basename})`,
            fetchUrlHost: ({ host }: { host: string }) => `Fetch URL(url: ${host})`,
            editNotebookMode: ({ path, mode }: { path: string; mode: string }) => `Edit Notebook(file: ${path}, mode: ${mode})`,
            todoListCount: ({ count }: { count: number }) => `Todo List(count: ${count})`,
            webSearchQuery: ({ query }: { query: string }) => `Web Search(query: ${query})`,
            grepPattern: ({ pattern }: { pattern: string }) => `grep(pattern: ${pattern})`,
            multiEditEdits: ({ path, count }: { path: string; count: number }) => `${path} (${count} edits)`,
            readingFile: ({ file }: { file: string }) => `Reading ${file}`,
            writingFile: ({ file }: { file: string }) => `Writing ${file}`,
            modifyingFile: ({ file }: { file: string }) => `Modifying ${file}`,
            modifyingFiles: ({ count }: { count: number }) => `Modifying ${count} files`,
            modifyingMultipleFiles: ({ file, count }: { file: string; count: number }) => `${file} and ${count} more`,
            showingDiff: 'Showing changes',
        }
    },

    files: {
        changes: 'Changes',
        searchPlaceholder: 'Search files...',
        detachedHead: 'detached HEAD',
        summary: ({ staged, unstaged }: { staged: number; unstaged: number }) => `${staged} staged • ${unstaged} unstaged`,
        notRepo: 'Not a git repository',
        notUnderGit: 'This directory is not under git version control',
        searching: 'Searching files...',
        noFilesFound: 'No files found',
        noFilesInProject: 'No files in project',
        tryDifferentTerm: 'Try a different search term',
        searchResults: ({ count }: { count: number }) => `Search Results (${count})`,
        projectRoot: 'Project root',
        stagedChanges: ({ count }: { count: number }) => `Staged Changes (${count})`,
        unstagedChanges: ({ count }: { count: number }) => `Unstaged Changes (${count})`,
        // File viewer strings
        loadingFile: ({ fileName }: { fileName: string }) => `Loading ${fileName}...`,
        binaryFile: 'Binary File',
        cannotDisplayBinary: 'Cannot display binary file content',
        diff: 'Diff',
        file: 'File',
        fileEmpty: 'File is empty',
        noChanges: 'No changes to display',
        noChangesTitle: 'No changes',
        noChangesSubtitle: 'Working tree is clean',
        deleted: 'Deleted',
        changedFiles: ({ count }: { count: number }) => `${count} changed ${count === 1 ? 'file' : 'files'}`,
        allFiles: 'All Files',
        editFile: 'Edit',
        saveFile: 'Save',
        failedToRead: 'Failed to read file',
        failedToSave: 'Failed to save file',
        fileConflict: 'File conflict',
        fileConflictDescription: 'This file was modified on the device while you were editing. Reload to see the latest version.',
        reload: 'Reload',
        overwrite: 'Overwrite',
    },

    settingsAccount: {
        // Account settings screen
        accountInformation: 'Account Information',
        status: 'Status',
        statusActive: 'Active',
        statusNotAuthenticated: 'Not Authenticated',
        linkNewDevice: 'Link New Device',
        linkNewDeviceSubtitle: 'Scan QR code to link device',
        server: 'Server',
        backup: 'Backup',
        backupDescription: 'Your secret key is the only way to recover your account. Save it in a secure place like a password manager.',
        secretKey: 'Secret Key',
        tapToReveal: 'Tap to reveal',
        tapToHide: 'Tap to hide',
        secretKeyLabel: 'SECRET KEY (TAP TO COPY)',
        secretKeyCopied: 'Secret key copied to clipboard. Store it in a safe place!',
        secretKeyCopyFailed: 'Failed to copy secret key',
        dangerZone: 'Danger Zone',
        logout: 'Logout',
        logoutSubtitle: 'Sign out and clear local data',
        logoutConfirm: 'Are you sure you want to logout? Make sure you have backed up your secret key!',
    },

    settingsLanguage: {
        // Language settings screen
        title: 'Language',
        description: 'Choose your preferred language for the app interface. This will sync across all your devices.',
        currentLanguage: 'Current Language',
        automatic: 'Automatic',
        automaticSubtitle: 'Detect from device settings',
        needsRestart: 'Language Changed',
        needsRestartMessage: 'The app needs to restart to apply the new language setting.',
        restartNow: 'Restart Now',
    },

    connectButton: {
        authenticate: 'Authenticate Terminal',
        authenticateWithUrlPaste: 'Authenticate Terminal with URL paste',
        pasteAuthUrl: 'Paste the auth URL from your terminal',
    },

    updateBanner: {
        updateAvailable: 'Update available',
        pressToApply: 'Press to apply the update',
        whatsNew: "What's new",
        seeLatest: 'See the latest updates and improvements',
        nativeUpdateAvailable: 'App Update Available',
        tapToUpdateAppStore: 'Tap to update in App Store',
        tapToUpdatePlayStore: 'Tap to update in Play Store',
    },

    changelog: {
        // Used by the changelog screen
        version: ({ version }: { version: number }) => `Version ${version}`,
        noEntriesAvailable: 'No changelog entries available.',
    },

    terminal: {
        // Used by terminal connection screens
        processingConnection: 'Processing connection...',
        invalidConnectionLink: 'Invalid Connection Link',
        invalidConnectionLinkDescription: 'The connection link is missing or invalid. Please check the URL and try again.',
        connectTerminal: 'Pair Node',
        terminalRequestDescription: 'A terminal is requesting to connect to your Lyntty account. This will allow the terminal to send and receive messages securely.',
        connectionDetails: 'Connection Details',
        publicKey: 'Public Key',
        encryption: 'Encryption',
        endToEndEncrypted: 'End-to-end encrypted',
        acceptConnection: 'Accept Connection',
        connecting: 'Connecting...',
        reject: 'Reject',
        security: 'Security',
        securityFooterDevice: 'This connection was processed securely on your device and was never sent to any server. Your private data will remain secure and only you can decrypt the messages.',
        clientSideProcessing: 'Client-Side Processing',
        linkProcessedOnDevice: 'Link processed locally on device',
    },

    modals: {
        // Used across connect flows and settings
        authenticateTerminal: 'Authenticate Terminal',
        pasteUrlFromTerminal: 'Paste the authentication URL from your terminal',
        deviceLinkedSuccessfully: 'Device linked successfully',
        terminalConnectedSuccessfully: 'Terminal connected successfully',
        invalidAuthUrl: 'Invalid authentication URL',
        failedToConnectTerminal: 'Failed to connect terminal',
        cameraPermissionsRequiredToConnectTerminal: 'Camera permissions are required to connect terminal',
        failedToLinkDevice: 'Failed to link device',
        cameraPermissionsRequiredToScanQr: 'Camera permissions are required to scan QR codes'
    },

    navigation: {
        // Navigation titles and screen headers
        connectTerminal: 'Pair Node',
        linkNewDevice: 'Link New Device',
        restoreWithSecretKey: 'Restore with Secret Key',
        whatsNew: "What's New",
    },

    welcome: {
        // Main welcome screen for unauthenticated users
        title: 'Lyntty mobile control for pi',
        subtitle: 'Control local pi sessions through your self-hosted relay.',
        createAccount: 'Create account',
        linkOrRestoreAccount: 'Link or restore account',
        loginWithMobileApp: 'Login with mobile app',
    },

    review: {
        // Used by utils/requestReview.ts
        enjoyingApp: 'Enjoying the app?',
        feedbackPrompt: "We'd love to hear your feedback!",
        yesILoveIt: 'Yes, I love it!',
        notReally: 'Not really'
    },

    items: {
        // Used by Item component for copy toast
        copiedToClipboard: ({ label }: { label: string }) => `${label} copied to clipboard`
    },

    machine: {
        launchNewSessionInDirectory: 'Launch New Session in Directory',
        offlineUnableToSpawn: 'Launcher disabled while machine is offline',
        offlineHelp: '• Make sure your computer is online\n• Run `lyntty doctor` on the computer\n• Install the latest signed Lyntty CLI release if needed',
        daemon: 'Daemon',
        status: 'Status',
        stopDaemon: 'Stop Daemon',
        activeSessions: ({ count }: { count: number }) => `Active Sessions (${count})`,
        machineGroup: 'Node',
        host: 'Host',
        platform: 'Platform',
        lastSeen: 'Last Seen',
        never: 'Never',
        cliAvailability: 'CLI Availability',
        cliInstalled: 'Installed',
        cliNotFound: 'Not found',
        untitledSession: 'Untitled Session',
        back: 'Back',
        dangerZone: 'Danger Zone',
        delete: 'Delete Node',
        deleteFooter: 'Remove this machine from your account. Session history will be preserved, but you will not be able to start new sessions on this machine.',
        deleteConfirmTitle: 'Delete this machine?',
        deleteConfirmMessage: 'The machine will be removed from your account. Session history will be preserved, but you will not be able to start new sessions until you reconnect the daemon.',
        deleteFailed: 'Failed to delete machine.',
    },

    message: {
        switchedToMode: ({ mode }: { mode: string }) => `Switched to ${mode} mode`,
        unknownEvent: 'Unknown event',
        usageLimitUntil: ({ time }: { time: string }) => `Usage limit reached until ${time}`,
        sentAsGoal: 'Sent as goal',
        unknownTime: 'unknown time',
    },



    textSelection: {
        // Text selection screen
        selectText: 'Select text range',
        title: 'Select Text',
        noTextProvided: 'No text provided',
        textNotFound: 'Text not found or expired',
        textCopied: 'Text copied to clipboard',
        failedToCopy: 'Failed to copy text to clipboard',
        noTextToCopy: 'No text available to copy',
    },

    markdown: {
        // Markdown copy functionality
        codeCopied: 'Code copied',
        copyFailed: 'Copy failed',
        mermaidRenderFailed: 'Failed to render mermaid diagram',
    },

    appWide: {
        account: "Account",
        agent: "Agent",
        browseYourChatHistory: "Browse your chat history",
        cancel: "Cancel",
        cannotOpenThisLocalPiSessionBecauseNodeMetadata: "Cannot open this local Pi session because node metadata is incomplete.",
        changeTitle: "Change Title",
        commandCompletedWithNoOutput: "[Command completed with no output]",
        configureYourPreferences: "Configure your preferences",
        connect: "Connect",
        connectDevice: "Connect Device",
        connecting: "Connecting...",
        connectionError: "Connection Error",
        connectThisNodeToScanLocalPiHistory: "Connect this node to scan local Pi history.",
        couldNotLoadOlderMessagesRetry: "Could not load older messages · Retry",
        piHistoryGapOlderMessagesUnavailable: "History gap · Some older Pi messages are unavailable on this computer.",
        created: "Created",
        createDirectory: "Create Directory?",
        daemonStopped: "Daemon Stopped",
        deleted: "deleted",
        details: "Details",
        diff: "Diff",
        done: "Done",
        downloadingAndVerifyingApk: "Downloading and verifying APK…",
        editorNotAvailableOnThisPlatform: "Editor not available on this platform",
        effort: "Effort",
        enterCustomPath: "Enter custom path",
        enteringPlanMode: "Entering plan mode",
        enterMachineName: "Enter machine name",
        enterProjectPath: "Enter project path",
        enterYourSecretKeyToRestoreAccessToYour: "Enter your secret key to restore access to your account.",
        error: "Error",
        failedToCreateWorktree: "Failed to create worktree",
        failedToLoadPushNotificationSettings: "Failed to load push notification settings.",
        failedToOpenTextSelectionPleaseTryAgain: "Failed to open text selection. Please try again.",
        failedToRenameMachine: "Failed to rename machine",
        failedToRequestPushNotificationPermission: "Failed to request push notification permission.",
        failedToStopDaemonItMayNotBeRunning: "Failed to stop daemon. It may not be running.",
        fastEfficient: "fast & efficient",
        fastest: "fastest",
        fileDiffsSidebar: "File Diffs Sidebar",
        giveThisMachineACustomNameLeaveEmptyTo: "Give this machine a custom name. Leave empty to use the default hostname.",
        installSettings: "Install settings",
        interface: "Interface",
        latestFast: "latest & fast",
        latestFastest: "latest & fastest",
        latestMostCapable: "latest & most capable",
        letPiKnowMessagesComeFromLynttyMobileFor: "Let pi know messages come from Lyntty mobile for phone-friendly replies.",
        lynttyServerUrl: "Lyntty server URL",
        lynttySessionMessageInput: "Lyntty session message input",
        machine: "Machine",
        machineIsOffline: "Machine is offline",
        machineNotFound: "Machine not found",
        machineOffline: "Machine offline",
        machineRenamedSuccessfully: "Machine renamed successfully",
        manageYourAccount: "Manage your account",
        mermaidDiagramSyntaxError: "Mermaid diagram syntax error",
        messageFailed: "Message failed",
        messageNotSent: "Message not sent",
        messageStillSendingInBackground: "A message is still sending in the background. It will fail in 30 seconds if not delivered.",
        messageFailedInBackground: "A message failed to send while the app was in background. Open Lyntty and retry.",
        metadata: "Metadata",
        mobileSafeControlsForPiSessions: "Mobile-safe controls for pi sessions.",
        model: "Model",
        mostCapable: "most capable",
        new: "new",
        newSession: "New Session",
        newWorktree: "new worktree",
        noActiveSessions: "No active sessions",
        noCommandsFound: "No commands found",
        noContent: "No content",
        noLocalPiSessionsFound: "No local Pi sessions found",
        noMessagesYet: "No messages yet",
        noRecentProjectsYet: "no recent projects yet",
        noResults: "no results",
        noUsageDataAvailable: "No usage data available",
        noWorktree: "no worktree",
        openANewTerminalOnYourComputerToStart: "Open a new terminal on your computer to start session.",
        openGithub: "Open GitHub",
        openSettings: "Open Settings",
        opensSystemSettingsWhenIosWillNotPromptAgain: "Opens system settings when iOS will not prompt again.",
        optionalPanelsAndLayoutElements: "Optional panels and layout elements.",
        permission: "Permission",
        permissions: "Permissions",
        permissionsShownInTerminalOnlyResetOrSendA: "Permissions shown in terminal only. Reset or send a message to control from app.",
        piSessionHasNoWorkingDirectoryOnThisMachine: "Pi session has no working directory on this machine.",
        piSessionsOnThisMachine: "Pi sessions on this machine",
        pleaseSelectAMachine: "Please select a machine",
        preview: "Preview",
        project: "Project",
        pushNotificationPermissionsAreOnlyAvailableOnIphoneAnd: "Push notification permissions are only available on iPhone and Android.",
        pushNotificationPermissionWasNotGranted: "Push notification permission was not granted.",
        pushNotifications: "Push Notifications",
        pushNotificationsAreEnabledForThisDevice: "Push notifications are enabled for this device.",
        recent: "Recent",
        releaseManifestIsMissingSha256OpenTheGithub: "Release manifest is missing SHA-256. Open the GitHub Release instead.",
        remove: "Remove",
        removeFavorite: "Remove Favorite",
        removeValueFromValue: ({ value0, value1 }: { value0: string | number; value1: string | number }) => `Remove "${value0}" from ${value1}?`,
        renameMachine: "Rename Machine",
        requestPermissionAgain: "Request Permission Again",
        restoreWithSecretKeyInstead: "Restore with Secret Key Instead",
        resume: "Resume",
        resumeCommand: "Resume Command",
        resumeDisconnectedPiSessionsThroughLynttyd: "Resume disconnected pi sessions through lynttyd",
        resumePiSession: "Resume Pi Session",
        runTheFollowingCommandInYourTerminal: "Run the following command in your terminal:",
        scanningLocalPiHistory: "Scanning local Pi history…",
        search: "search...",
        sendMessage: "Send message",
        sendMobileContextToPi: "Send mobile context to pi",
        serverErrorValue: ({ value0 }: { value0: string | number }) => `Server error: ${value0}`,
        session: "Session",
        sessionRemote: "Session Remote",
        settings: "Settings",
        showChangedFileDetailsOnLargerScreens: "Show changed-file details on larger screens",
        showing12OfValuePiSessions: ({ value0 }: { value0: string | number }) => `Showing 12 of ${value0} Pi sessions`,
        showOrManageTheCurrentPiGoal: "Show or manage the current Pi goal",
        showPiContextUsage: "Show Pi context usage",
        showsTheSystemPromptAgainIfIosStillAllows: "Shows the system prompt again if iOS still allows it.",
        signOut: "Sign Out",
        signOutOfYourAccount: "Sign out of your account",
        split: "Split",
        startANewChatSession: "Start a new chat session",
        startANewSessionOnAnyOfYourConnected: "Start a new session on any of your connected machines.",
        startAPiSessionOnThisNodeToCreate: "Start a pi session on this node to create history.",
        startNewSession: "Start New Session",
        stopCurrentPiTurn: "Stop current Pi turn",
        stopDaemon: "Stop Daemon?",
        stopDaemon2: "Stop Daemon",
        tapToDownloadVerifyAndInstallApk: "Tap to download, verify, and install APK",
        tapToEnd: "Tap to end",
        text1OpenLynttyOnYourMobileDevice: "1. Open Lyntty on your mobile device",
        text2GoToSettingsAccount: "2. Go to Settings → Account",
        text3TapLinkNewDevice: "3. Tap \"Link New Device\"",
        text4ScanThisQrCode: "4. Scan this QR code",
        theDirectoryValueDoesNotExistWouldYouLike: ({ value0 }: { value0: string | number }) => `The directory '${value0}' does not exist. Would you like to create it?`,
        theSystemWillNotShowThePermissionPromptAgain: "The system will not show the permission prompt again, so Lyntty opened Settings instead.",
        titleChangedToValue: ({ value0 }: { value0: string | number }) => `Title changed to "${value0}"`,
        unableToScanPiSessions: "Unable to scan Pi sessions",
        unified: "Unified",
        unknownError: "Unknown error",
        untitled: "Untitled",
        updateBlocked: "Update blocked",
        updateFailed: "Update failed",
        usingCustomPathAbove: "using custom path above",
        valueIfAndroidBlocksInstallsFromThisAppOpen: ({ value0 }: { value0: string | number }) => `${value0}

If Android blocks installs from this app, open install settings, allow Lyntty, then retry.`,
        viewAllSessions: "View All Sessions",
        whatWouldYouLikeToWorkOn: "What would you like to work on?",
        worktree: "Worktree",
        youWillNotBeAbleToSpawnNewSessions: "You will not be able to spawn new sessions on this machine until you restart the daemon on your computer again. Your current sessions will stay alive.",
    },

} as const;

export type Translations = typeof en;

/**
 * Generic translation type that matches the structure of Translations
 * but allows different string values (for other languages)
 */
export type TranslationStructure = {
    readonly [K in keyof Translations]: {
        readonly [P in keyof Translations[K]]: Translations[K][P] extends string
            ? string
            : Translations[K][P] extends (...args: any[]) => string
                ? Translations[K][P]
                : Translations[K][P] extends object
                    ? {
                        readonly [Q in keyof Translations[K][P]]: Translations[K][P][Q] extends string
                            ? string
                            : Translations[K][P][Q]
                      }
                    : Translations[K][P]
    }
};
