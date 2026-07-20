import type { TranslationStructure } from '../_default';

/**
 * Polish plural helper function
 * Polish has 3 plural forms: one, few, many
 * @param options - Object containing count and the three plural forms
 * @returns The appropriate form based on Polish plural rules
 */
function plural({ count, one, few, many }: { count: number; one: string; few: string; many: string }): string {
    const n = Math.abs(count);
    const n10 = n % 10;
    const n100 = n % 100;

    // Rule: 1 (but not 11)
    if (n === 1) return one;

    // Rule: 2-4 but not 12-14
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;

    // Rule: everything else (0, 5-19, 11, 12-14, etc.)
    return many;
}

/**
 * Polish translations for the Lyntty app
 * Must match the exact structure of the English translations
 */
export const pl: TranslationStructure = {
    tabs: {
        // Tab navigation labels
        sessions: 'Terminale',
        settings: 'Ustawienia',
    },

    common: {
        // Simple string constants
        cancel: 'Anuluj',
        authenticate: 'Uwierzytelnij',
        save: 'Zapisz',
        saveAs: 'Zapisz jako',
        error: 'Błąd',
        success: 'Sukces',
        ok: 'OK',
        continue: 'Kontynuuj',
        back: 'Wstecz',
        create: 'Utwórz',
        rename: 'Zmień nazwę',
        reset: 'Resetuj',
        logout: 'Wyloguj',
        yes: 'Tak',
        no: 'Nie',
        discard: 'Odrzuć',
        version: 'Wersja',
        copied: 'Skopiowano',
        copy: 'Kopiuj',
        scanning: 'Skanowanie...',
        urlPlaceholder: 'https://example.com',
        home: 'Główna',
        message: 'Wiadomość',
        files: 'Pliki',
        fileViewer: 'Przeglądarka plików',
        loading: 'Ładowanie...',
        retry: 'Ponów',
        delete: 'Usuń',
        optional: 'opcjonalnie',
    },

    status: {
        connected: 'połączono',
        connecting: 'łączenie',
        disconnected: 'rozłączono',
        error: 'błąd',
        online: 'online',
        offline: 'offline',
        lastSeen: ({ time }: { time: string }) => `ostatnio widziano ${time}`,
        permissionRequired: 'wymagane uprawnienie',
        activeNow: 'Aktywny teraz',
        unknown: 'nieznane',
        unread: 'nowe wyniki',
    },

    time: {
        justNow: 'teraz',
        minutesAgo: ({ count }: { count: number }) => `${count} ${plural({ count, one: 'minuta', few: 'minuty', many: 'minut' })} temu`,
        hoursAgo: ({ count }: { count: number }) => `${count} ${plural({ count, one: 'godzina', few: 'godziny', many: 'godzin' })} temu`,
        daysAgo: ({ count }: { count: number }) => `${count} ${plural({ count, one: 'dzień', few: 'dni', many: 'dni' })} temu`,
    },

    connect: {
        restoreAccount: 'Przywróć konto',
        enterSecretKey: 'Proszę wprowadzić klucz tajny',
        invalidSecretKey: 'Nieprawidłowy klucz tajny. Sprawdź i spróbuj ponownie.',
        enterUrlManually: 'Wprowadź URL ręcznie',
    },

    settings: {
        title: 'Ustawienia',
        connectedAccounts: 'Połączone konta',
        connectAccount: 'Połącz konto',
        machines: 'Maszyny',
        relay: 'Relay',
        signedIn: 'Signed in',
        noNodesPaired: 'No nodes paired',
        oneNodeOnline: '1 node online',
        nodesOnline: ({ onlineCount, totalCount }: { onlineCount: number; totalCount: number }) => `${onlineCount}/${totalCount} nodes online`,
        showOfflineMachines: ({ count }: { count: number }) => {
            const mod10 = count % 10;
            const mod100 = count % 100;
            if (count === 1) return 'Pokaż 1 maszynę offline';
            if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `Pokaż ${count} maszyny offline`;
            return `Pokaż ${count} maszyn offline`;
        },
        hideOfflineMachines: 'Ukryj maszyny offline',
        features: 'Funkcje',
        account: 'Konto',
        accountSubtitle: 'Zarządzaj szczegółami konta',
        appearance: 'Wygląd',
        appearanceSubtitle: 'Dostosuj wygląd aplikacji',
        featuresTitle: 'Funkcje',
        featuresSubtitle: 'Włącz lub wyłącz funkcje aplikacji',
        developer: 'Deweloper',
        developerTools: 'Narzędzia deweloperskie',
        about: 'O aplikacji',
        aboutFooter: 'Lyntty is a mobile control surface for local pi sessions. The relay carries encrypted sync and is not canonical history.',
        whatsNew: 'Co nowego',
        whatsNewSubtitle: 'Zobacz najnowsze aktualizacje i ulepszenia',
        reportIssue: 'Zgłoś problem',
        privacyPolicy: 'Polityka prywatności',
        termsOfService: 'Warunki użytkowania',
        eula: 'EULA',
        scanQrCodeToAuthenticate: 'Zeskanuj kod QR, aby się uwierzytelnić',
        machineStatus: ({ name, status }: { name: string; status: 'online' | 'offline' }) =>
            `${name} jest ${status === 'online' ? 'online' : 'offline'}`,
        featureToggled: ({ feature, enabled }: { feature: string; enabled: boolean }) =>
            `${feature} ${enabled ? 'włączona' : 'wyłączona'}`,
    },

    settingsAppearance: {
        // Appearance settings screen
        theme: 'Motyw',
        themeDescription: 'Wybierz preferowaną kolorystykę',
        themeOptions: {
            adaptive: 'Adaptacyjny',
            light: 'Jasny',
            dark: 'Ciemny',
        },
        themeDescriptions: {
            adaptive: 'Dopasuj do ustawień systemu',
            light: 'Zawsze używaj jasnego motywu',
            dark: 'Zawsze używaj ciemnego motywu',
        },
        display: 'Wyświetlanie',
        displayDescription: 'Kontroluj układ i odstępy',
        inlineToolCalls: 'Wbudowane wywołania narzędzi',
        inlineToolCallsDescription: 'Wyświetlaj wywołania narzędzi bezpośrednio w wiadomościach czatu',
        expandTodoLists: 'Rozwiń listy zadań',
        expandTodoListsDescription: 'Pokazuj wszystkie zadania zamiast tylko zmian',
        showLineNumbersInDiffs: 'Pokaż numery linii w różnicach',
        showLineNumbersInDiffsDescription: 'Wyświetlaj numery linii w różnicach kodu',
        showLineNumbersInToolViews: 'Pokaż numery linii w widokach narzędzi',
        showLineNumbersInToolViewsDescription: 'Wyświetlaj numery linii w różnicach widoków narzędzi',
        wrapLinesInDiffs: 'Zawijanie linii w różnicach',
        wrapLinesInDiffsDescription: 'Zawijaj długie linie zamiast przewijania poziomego w widokach różnic',
        diffStyle: 'Widok różnic',
        diffStyleDescription: 'Pokazuj różnice w jednej kolumnie (unified) lub obok siebie (split).',
        diffStyleOptions: {
            unified: 'Unified',
            split: 'Split',
        },
        alwaysShowContextSize: 'Zawsze pokazuj rozmiar kontekstu',
        alwaysShowContextSizeDescription: 'Wyświetlaj użycie kontekstu nawet gdy nie jest blisko limitu',
        avatarStyle: 'Styl awatara',
        avatarStyleDescription: 'Wybierz wygląd awatara sesji',
        avatarOptions: {
            pixelated: 'Pikselowy',
            gradient: 'Zwierzak',
            brutalist: 'Brutalistyczny',
        },
    },

    settingsFeatures: {
        // Features settings screen
        experiments: 'Eksperymenty',
        experimentsDescription: 'Włącz eksperymentalne funkcje, które są nadal w rozwoju. Te funkcje mogą być niestabilne lub zmienić się bez ostrzeżenia.',
        experimentalFeatures: 'Funkcje eksperymentalne',
        experimentalFeaturesEnabled: 'Funkcje eksperymentalne włączone',
        experimentalFeaturesDisabled: 'Używane tylko stabilne funkcje',
        markdownCopyV2: 'Markdown Copy v2',
        markdownCopyV2Subtitle: 'Długie naciśnięcie otwiera modal kopiowania',
        hideInactiveSessions: 'Ukryj nieaktywne sesje',
        hideInactiveSessionsSubtitle: 'Wyświetlaj tylko aktywne czaty na liście',
        groupToolCalls: 'Grupuj wywołania narzędzi',
        groupToolCallsSubtitle: 'Zwijaj kolejne wywołania narzędzi w jeden kontener',
        imageUpload: 'Przesyłanie obrazów',
        imageUploadSubtitle: 'Dołączaj obrazy do wiadomości, aby obsługiwani agenci mogli je analizować',
    },

    errors: {
        networkError: 'Wystąpił błąd sieci',
        serverError: 'Wystąpił błąd serwera',
        unknownError: 'Wystąpił nieznany błąd',
        connectionTimeout: 'Przekroczono czas oczekiwania na połączenie',
        authenticationFailed: 'Uwierzytelnienie nie powiodło się',
        permissionDenied: 'Brak uprawnień',
        fileNotFound: 'Plik nie został znaleziony',
        invalidFormat: 'Nieprawidłowy format',
        operationFailed: 'Operacja nie powiodła się',
        tryAgain: 'Spróbuj ponownie',
        contactSupport: 'Skontaktuj się z pomocą techniczną, jeśli problem będzie się powtarzał',
        sessionNotFound: 'Sesja nie została znaleziona',
        oauthInitializationFailed: 'Nie udało się zainicjować przepływu OAuth',
        tokenStorageFailed: 'Nie udało się zapisać tokenów uwierzytelniania',
        oauthStateMismatch: 'Weryfikacja bezpieczeństwa nie powiodła się. Spróbuj ponownie',
        tokenExchangeFailed: 'Nie udało się wymienić kodu autoryzacji',
        oauthAuthorizationDenied: 'Autoryzacja została odrzucona',
        webViewLoadFailed: 'Nie udało się załadować strony uwierzytelniania',
        failedToLoadProfile: 'Nie udało się załadować profilu użytkownika',
        userNotFound: 'Użytkownik nie został znaleziony',
        sessionDeleted: 'Sesja została usunięta',
        sessionDeletedDescription: 'Ta sesja została trwale usunięta',

        // Error functions with context
        fieldError: ({ field, reason }: { field: string; reason: string }) =>
            `${field}: ${reason}`,
        validationError: ({ field, min, max }: { field: string; min: number; max: number }) =>
            `${field} musi być między ${min} a ${max}`,
        retryIn: ({ seconds }: { seconds: number }) =>
            `Ponów próbę za ${seconds} ${plural({ count: seconds, one: 'sekundę', few: 'sekundy', many: 'sekund' })}`,
        errorWithCode: ({ message, code }: { message: string; code: number | string }) =>
            `${message} (Błąd ${code})`,
        disconnectServiceFailed: ({ service }: { service: string }) =>
            `Nie udało się rozłączyć ${service}`,
        connectServiceFailed: ({ service }: { service: string }) =>
            `Nie udało się połączyć z ${service}. Spróbuj ponownie.`,
    },

    newSession: {
        title: 'Rozpocznij nową sesję',
        machineOffline: 'Maszyna jest offline',
        switchMachinesHint: '• Przełącz maszynę, klikając na nią powyżej',
    },

    sessionHistory: {
        // Used by session history screen
        title: 'Historia sesji',
        empty: 'Nie znaleziono sesji',
        today: 'Dzisiaj',
        yesterday: 'Wczoraj',
        daysAgo: ({ count }: { count: number }) => `${count} ${plural({ count, one: 'dzień', few: 'dni', many: 'dni' })} temu`,
        viewAll: 'Zobacz wszystkie sesje',
    },

    session: {
        inputPlaceholder: 'Wpisz wiadomość...',
        inactiveArchived: 'Ta sesja jest nieaktywna.',
        historyOnly: 'History only. Start Pi to make this session active via Lyntty.',
        computerOffline: 'Computer offline. History is still available.',
        waitingForPiExtension: 'Waiting for Pi extension. Messages stay queued until Pi reconnects.',
        legacyHistoryOnly: 'This legacy session cannot be controlled by this version of Lyntty.',
        installPiExtension: 'Install Pi extension',
        installPiExtensionInstructions: 'On the computer, run `lyntty remote install`, then run `/reload` in the active Pi session.',
    loadingLatestMessages: 'Ładowanie najnowszych wiadomości…',
        resumeFromTerminal: 'Aby wznowić ją z terminala:',
        newChat: 'Nowy czat',
    },


    server: {
        // Used by Server Configuration screen (app/(app)/server.tsx)
        serverConfiguration: 'Konfiguracja serwera',
        previewSetupTitle: 'Połącz z Relay',
        previewSetupDescription: 'Lyntty (preview) wymaga lokalnego Relay przed utworzeniem lub przywróceniem konta.',
        previewSetupFooter: 'Uruchom `bun preview:test` na komputerze, a następnie wpisz adres lokalnego Relay wyświetlony w terminalu.',
        clearRelay: 'Wyczyść Relay',
        clearRelayConfirm: 'Wyczyścić zapisany Relay i ponownie wymagać konfiguracji?',
        previewHttpRequiresLocalNetwork: 'Relay HTTP w wersji Preview musi używać localhost lub prywatnego adresu LAN.',
        failedToClearOldAccount: 'Nie udało się wyczyścić poprzedniego konta. Relay nie został zmieniony.',
        enterServerUrl: 'Proszę wprowadzić URL serwera',
        notValidLynttyServer: 'To nie jest prawidłowy serwer Lyntty',
        changeServer: 'Zmień serwer',
        continueWithServer: 'Kontynuować z tym serwerem?',
        resetToDefault: 'Resetuj do domyślnego',
        resetServerDefault: 'Zresetować serwer do domyślnego?',
        validating: 'Sprawdzanie...',
        validatingServer: 'Sprawdzanie serwera...',
        serverReturnedError: 'Serwer zwrócił błąd',
        failedToConnectToServer: 'Nie udało się połączyć z serwerem',
        currentlyUsingCustomServer: 'Aktualnie używany jest niestandardowy serwer',
        customServerUrlLabel: 'URL niestandardowego serwera',
        advancedFeatureFooter: 'To jest zaawansowana funkcja. Zmieniaj serwer tylko jeśli wiesz, co robisz. Po zmianie serwera będziesz musiał się wylogować i zalogować ponownie.'
    },

    sessionInfo: {
        // Used by Session Info screen (app/(app)/session/[id]/info.tsx)
        killSession: 'Zakończ sesję',
        killSessionConfirm: 'Czy na pewno chcesz zakończyć tę sesję?',
        stopAndArchiveSession: 'Zatrzymaj i zarchiwizuj',
        archiveSession: 'Zarchiwizuj sesję',
        archiveSessionConfirm: 'Czy na pewno chcesz zarchiwizować tę sesję?',
        metadataCopied: 'Metadane skopiowane do schowka',
        failedToCopyMetadata: 'Nie udało się skopiować metadanych',
        failedToKillSession: 'Nie udało się zakończyć sesji',
        failedToArchiveSession: 'Nie udało się zarchiwizować sesji',
        connectionStatus: 'Status połączenia',
        created: 'Utworzono',
        lastUpdated: 'Ostatnia aktualizacja',
        quickActions: 'Szybkie akcje',
        viewMachine: 'Zobacz maszynę',
        viewMachineSubtitle: 'Zobacz szczegóły maszyny i sesje',
        resumeSession: 'Resume Session',
        resumeSessionSubtitle: 'Resume this session on the same machine',
        resumeTakeoverPrompt: 'Pi is not connected to this session. Wait for it to reconnect, or choose how to resume. Waiting is safest.',
        resumeWait: 'Wait',
        resumeTakeOver: 'Take over',
        resumeStop: 'Stop & resume',
        resumeInterrupt: 'Interrupt & resume',
        resumeSessionSameMachineOnly: 'This session can only be resumed on the same machine it started on.',
        resumeSessionMachineOffline: 'This machine is offline. Resume is only available while it is online.',
        resumeSessionNeedsLynttyAgent: 'Resume is unavailable on this machine. Run `lyntty-agent auth login` to enable it.',
        resumeSessionMissingMachine: 'This session is missing its machine metadata, so it cannot be resumed.',
        resumeSessionMissingBackendId: 'This session does not have a resumable pi session file yet.',
        resumeSessionUnexpectedDirectoryPrompt: 'Resume cannot create directories. Start the session manually from its original path.',
        killSessionSubtitle: 'Natychmiastowo zakończ sesję',
        archiveSessionSubtitle: 'Zarchiwizuj tę sesję i zatrzymaj ją',
        metadata: 'Metadane',
        host: 'Host',
        path: 'Ścieżka',
        processId: 'ID procesu',
        lynttyHome: 'Katalog domowy Lyntty',
        cliVersionOutdated: 'Wymagana aktualizacja CLI',
        cliVersionOutdatedMessage: ({ currentVersion, requiredVersion }: { currentVersion: string; requiredVersion: string }) =>
            `Zainstalowana wersja ${currentVersion}. Zaktualizuj do ${requiredVersion} lub nowszej`,
        updateCliInstructions: 'Install the latest signed Lyntty CLI release.',
        deleteSession: 'Usuń sesję',
        deleteSessionSubtitle: 'Trwale usuń tę sesję',
        deleteSessionConfirm: 'Usunąć sesję na stałe?',
        deleteSessionWarning: 'Ta operacja jest nieodwracalna. Wszystkie wiadomości i dane powiązane z tą sesją zostaną trwale usunięte.',
        failedToDeleteSession: 'Nie udało się usunąć sesji',
        sessionDeleted: 'Sesja została pomyślnie usunięta',
        worktreeCleanupTitle: 'Usunąć Worktree?',
        worktreeCleanupMessage: 'Worktree nie ma niezatwierdzonych zmian. Czy chcesz usunąć pliki Worktree?',
        worktreeCleanupDelete: 'Usuń Worktree',
        worktreeCleanupKeep: 'Zachowaj pliki',
    },

    components: {
        emptyMainScreen: {
            // Used by EmptyMainScreen component
            readyToCode: 'Gotowy do kodowania?',
            installCli: 'Zainstaluj Lyntty CLI',
            runIt: 'Uruchom je',
            scanQrCode: 'Zeskanuj kod QR',
            openCamera: 'Otwórz kamerę',
        },
    },

    agentInput: {
        context: {
            remaining: ({ percent }: { percent: number }) => `Pozostało ${percent}%`,
        },
        suggestion: {
            fileLabel: 'PLIK',
            folderLabel: 'FOLDER',
        },
        noMachinesAvailable: 'Brak maszyn',
    },

    machineLauncher: {
        showLess: 'Pokaż mniej',
        showAll: ({ count }: { count: number }) => `Pokaż wszystkie (${count} ${plural({ count, one: 'ścieżka', few: 'ścieżki', many: 'ścieżek' })})`,
        enterCustomPath: 'Wprowadź niestandardową ścieżkę',
        offlineUnableToSpawn: 'Nie można utworzyć nowej sesji, offline',
    },

    sidebar: {
        sessionsTitle: 'Lyntty',
        showArchived: 'Pokaż zarchiwizowane',
        hideArchived: 'Ukryj zarchiwizowane',
        newSession: 'Nowa sesja',
    },

    zen: {
        toggle: 'Tryb zen',
    },

    toolView: {
        input: 'Wejście',
        output: 'Wyjście',
    },

    toolGroup: {
        editedFile: 'Edited file',
        editedFiles: ({ count }: { count: number }) => `${plural({ count, one: 'Edytowano 1 plik', few: `Edytowano ${count} pliki`, many: `Edytowano ${count} plików` })}`,
        readFiles: ({ count }: { count: number }) => `${plural({ count, one: 'Odczytano 1 plik', few: `Odczytano ${count} pliki`, many: `Odczytano ${count} plików` })}`,
        ranCommands: ({ count }: { count: number }) => `${plural({ count, one: 'Wykonano 1 polecenie', few: `Wykonano ${count} polecenia`, many: `Wykonano ${count} poleceń` })}`,
        searched: ({ count }: { count: number }) => `${plural({ count, one: 'Wyszukano 1 raz', few: `Wyszukano ${count} razy`, many: `Wyszukano ${count} razy` })}`,
        fetchedUrls: ({ count }: { count: number }) => `${plural({ count, one: 'Pobrano 1 URL', few: `Pobrano ${count} URLe`, many: `Pobrano ${count} URLi` })}`,
        ranTasks: ({ count }: { count: number }) => `${plural({ count, one: 'Wykonano 1 zadanie', few: `Wykonano ${count} zadania`, many: `Wykonano ${count} zadań` })}`,
        usedTools: ({ count }: { count: number }) => `${plural({ count, one: 'Użyto 1 narzędzie', few: `Użyto ${count} narzędzia`, many: `Użyto ${count} narzędzi` })}`,
        workedFor: ({ duration }: { duration: string }) => `Worked ${duration}`,
    },

    tools: {
        fullView: {
            description: 'Opis',
            inputParams: 'Parametry wejściowe',
            output: 'Wyjście',
            error: 'Błąd',
            completed: 'Narzędzie ukończone pomyślnie',
            noOutput: 'Nie wygenerowano żadnego wyjścia',
            running: 'Narzędzie działa...',
        },
        taskView: {
            initializing: 'Inicjalizacja agenta...',
            moreTools: ({ count }: { count: number }) => `+${count} ${plural({ count, one: 'więcej narzędzie', few: 'więcej narzędzia', many: 'więcej narzędzi' })}`,
        },
        multiEdit: {
            editNumber: ({ index, total }: { index: number; total: number }) => `Edycja ${index} z ${total}`,
            replaceAll: 'Zamień wszystkie',
        },
        names: {
            task: 'Zadanie',
            terminal: 'Terminal',
            searchFiles: 'Wyszukaj pliki',
            search: 'Wyszukaj',
            searchContent: 'Wyszukaj zawartość',
            listFiles: 'Lista plików',
            planProposal: 'Propozycja planu',
            readFile: 'Czytaj plik',
            editFile: 'Edytuj plik',
            writeFile: 'Zapisz plik',
            fetchUrl: 'Pobierz URL',
            readNotebook: 'Czytaj notatnik',
            editNotebook: 'Edytuj notatnik',
            todoList: 'Lista zadań',
            webSearch: 'Wyszukiwanie w sieci',
            reasoning: 'Rozumowanie',
            applyChanges: 'Zaktualizuj plik',
            viewDiff: 'Bieżące zmiany pliku',
            question: 'Pytanie',
        },
        desc: {
            terminalCmd: ({ cmd }: { cmd: string }) => `Terminal(cmd: ${cmd})`,
            searchPattern: ({ pattern }: { pattern: string }) => `Wyszukaj(wzorzec: ${pattern})`,
            searchPath: ({ basename }: { basename: string }) => `Wyszukaj(ścieżka: ${basename})`,
            fetchUrlHost: ({ host }: { host: string }) => `Pobierz URL(url: ${host})`,
            editNotebookMode: ({ path, mode }: { path: string; mode: string }) => `Edytuj notatnik(plik: ${path}, tryb: ${mode})`,
            todoListCount: ({ count }: { count: number }) => `Lista zadań(liczba: ${count})`,
            webSearchQuery: ({ query }: { query: string }) => `Wyszukiwanie w sieci(zapytanie: ${query})`,
            grepPattern: ({ pattern }: { pattern: string }) => `grep(wzorzec: ${pattern})`,
            multiEditEdits: ({ path, count }: { path: string; count: number }) => `${path} (${count} ${plural({ count, one: 'edycja', few: 'edycje', many: 'edycji' })})`,
            readingFile: ({ file }: { file: string }) => `Odczytywanie ${file}`,
            writingFile: ({ file }: { file: string }) => `Zapisywanie ${file}`,
            modifyingFile: ({ file }: { file: string }) => `Modyfikowanie ${file}`,
            modifyingFiles: ({ count }: { count: number }) => `Modyfikowanie ${count} ${plural({ count, one: 'pliku', few: 'plików', many: 'plików' })}`,
            modifyingMultipleFiles: ({ file, count }: { file: string; count: number }) => `${file} i ${count} ${plural({ count, one: 'więcej', few: 'więcej', many: 'więcej' })}`,
            showingDiff: 'Pokazywanie zmian',
        },
        askUserQuestion: {
            submit: 'Wyślij odpowiedź',
            multipleQuestions: ({ count }: { count: number }) => `${count} ${plural({ count, one: 'pytanie', few: 'pytania', many: 'pytań' })}`,
            other: 'Inne',
            otherDescription: 'Wpisz własną odpowiedź',
            otherPlaceholder: 'Wpisz swoją odpowiedź...',
        }
    },

    files: {
        changes: 'Zmiany',
        searchPlaceholder: 'Wyszukaj pliki...',
        detachedHead: 'odłączony HEAD',
        summary: ({ staged, unstaged }: { staged: number; unstaged: number }) => `${staged} przygotowanych • ${unstaged} nieprzygotowanych`,
        notRepo: 'To nie jest repozytorium git',
        notUnderGit: 'Ten katalog nie jest pod kontrolą wersji git',
        searching: 'Wyszukiwanie plików...',
        noFilesFound: 'Nie znaleziono plików',
        noFilesInProject: 'Brak plików w projekcie',
        tryDifferentTerm: 'Spróbuj innego terminu wyszukiwania',
        searchResults: ({ count }: { count: number }) => `Wyniki wyszukiwania (${count})`,
        projectRoot: 'Katalog główny projektu',
        stagedChanges: ({ count }: { count: number }) => `Przygotowane zmiany (${count})`,
        unstagedChanges: ({ count }: { count: number }) => `Nieprzygotowane zmiany (${count})`,
        // File viewer strings
        loadingFile: ({ fileName }: { fileName: string }) => `Ładowanie ${fileName}...`,
        binaryFile: 'Plik binarny',
        cannotDisplayBinary: 'Nie można wyświetlić zawartości pliku binarnego',
        diff: 'Różnice',
        file: 'Plik',
        fileEmpty: 'Plik jest pusty',
        noChanges: 'Brak zmian do wyświetlenia',
        noChangesTitle: 'Brak zmian',
        noChangesSubtitle: 'Drzewo robocze jest czyste',
        deleted: 'Usunięty',
        changedFiles: ({ count }: { count: number }) => `${count} ${count === 1 ? 'zmieniony plik' : 'zmienionych plików'}`,
        allFiles: 'Wszystkie pliki',
        editFile: 'Edytuj',
        saveFile: 'Zapisz',
        failedToRead: 'Nie udało się odczytać pliku',
        failedToSave: 'Nie udało się zapisać pliku',
        fileConflict: 'Konflikt pliku',
        fileConflictDescription: 'Ten plik został zmodyfikowany na urządzeniu podczas edycji. Załaduj ponownie aby zobaczyć najnowszą wersję.',
        reload: 'Załaduj ponownie',
        overwrite: 'Nadpisz',
    },

    settingsAccount: {
        // Account settings screen
        accountInformation: 'Informacje o koncie',
        status: 'Status',
        statusActive: 'Aktywny',
        statusNotAuthenticated: 'Nie uwierzytelniony',
        linkNewDevice: 'Połącz nowe urządzenie',
        linkNewDeviceSubtitle: 'Zeskanuj kod QR, aby połączyć urządzenie',
        server: 'Serwer',
        backup: 'Kopia zapasowa',
        backupDescription: 'Twój klucz tajny to jedyny sposób na odzyskanie konta. Zapisz go w bezpiecznym miejscu, takim jak menedżer haseł.',
        secretKey: 'Klucz tajny',
        tapToReveal: 'Dotknij, aby pokazać',
        tapToHide: 'Dotknij, aby ukryć',
        secretKeyLabel: 'KLUCZ TAJNY (DOTKNIJ, ABY SKOPIOWAĆ)',
        secretKeyCopied: 'Klucz tajny skopiowany do schowka. Przechowuj go w bezpiecznym miejscu!',
        secretKeyCopyFailed: 'Nie udało się skopiować klucza tajnego',
        dangerZone: 'Strefa niebezpieczna',
        logout: 'Wyloguj',
        logoutSubtitle: 'Wyloguj się i wyczyść dane lokalne',
        logoutConfirm: 'Czy na pewno chcesz się wylogować? Upewnij się, że masz kopię zapasową klucza tajnego!',
    },

    settingsLanguage: {
        // Language settings screen
        title: 'Język',
        description: 'Wybierz preferowany język interfejsu aplikacji. To ustawienie zostanie zsynchronizowane na wszystkich Twoich urządzeniach.',
        currentLanguage: 'Aktualny język',
        automatic: 'Automatycznie',
        automaticSubtitle: 'Wykrywaj na podstawie ustawień urządzenia',
        needsRestart: 'Język zmieniony',
        needsRestartMessage: 'Aplikacja musi zostać uruchomiona ponownie, aby zastosować nowe ustawienia języka.',
        restartNow: 'Uruchom ponownie',
    },

    connectButton: {
        authenticate: 'Uwierzytelnij terminal',
        authenticateWithUrlPaste: 'Uwierzytelnij terminal poprzez wklejenie URL',
        pasteAuthUrl: 'Wklej URL uwierzytelnienia z terminala',
    },

    updateBanner: {
        updateAvailable: 'Dostępna aktualizacja',
        pressToApply: 'Naciśnij, aby zastosować aktualizację',
        whatsNew: 'Co nowego',
        seeLatest: 'Zobacz najnowsze aktualizacje i ulepszenia',
        nativeUpdateAvailable: 'Dostępna aktualizacja aplikacji',
        tapToUpdateAppStore: 'Naciśnij, aby zaktualizować w App Store',
        tapToUpdatePlayStore: 'Naciśnij, aby zaktualizować w Sklepie Play',
    },

    changelog: {
        // Used by the changelog screen
        version: ({ version }: { version: number }) => `Wersja ${version}`,
        noEntriesAvailable: 'Brak dostępnych wpisów dziennika zmian.',
    },

    terminal: {
        // Used by terminal connection screens
        processingConnection: 'Przetwarzanie połączenia...',
        invalidConnectionLink: 'Nieprawidłowy link połączenia',
        invalidConnectionLinkDescription: 'Link połączenia jest nieprawidłowy lub go brakuje. Sprawdź URL i spróbuj ponownie.',
        connectTerminal: 'Połącz terminal',
        terminalRequestDescription: 'Terminal żąda połączenia z Twoim kontem Lyntty. Pozwoli to terminalowi bezpiecznie wysyłać i odbierać wiadomości.',
        connectionDetails: 'Szczegóły połączenia',
        publicKey: 'Klucz publiczny',
        encryption: 'Szyfrowanie',
        endToEndEncrypted: 'Szyfrowanie end-to-end',
        acceptConnection: 'Akceptuj połączenie',
        connecting: 'Łączenie...',
        reject: 'Odrzuć',
        security: 'Bezpieczeństwo',
        securityFooterDevice: 'To połączenie zostało bezpiecznie przetworzone na Twoim urządzeniu i nigdy nie zostało wysłane na żaden serwer. Twoje prywatne dane pozostaną bezpieczne i tylko Ty możesz odszyfrować wiadomości.',
        clientSideProcessing: 'Przetwarzanie po stronie klienta',
        linkProcessedOnDevice: 'Link przetworzony lokalnie na urządzeniu',
    },

    modals: {
        // Used across connect flows and settings
        authenticateTerminal: 'Uwierzytelnij terminal',
        pasteUrlFromTerminal: 'Wklej URL uwierzytelnienia z terminala',
        deviceLinkedSuccessfully: 'Urządzenie połączone pomyślnie',
        terminalConnectedSuccessfully: 'Terminal połączony pomyślnie',
        invalidAuthUrl: 'Nieprawidłowy URL uwierzytelnienia',
        failedToConnectTerminal: 'Nie udało się połączyć terminala',
        cameraPermissionsRequiredToConnectTerminal: 'Uprawnienia do kamery są wymagane do połączenia terminala',
        failedToLinkDevice: 'Nie udało się połączyć urządzenia',
        cameraPermissionsRequiredToScanQr: 'Uprawnienia do kamery są wymagane do skanowania kodów QR'
    },

    navigation: {
        // Navigation titles and screen headers
        connectTerminal: 'Połącz terminal',
        linkNewDevice: 'Połącz nowe urządzenie',
        restoreWithSecretKey: 'Przywróć kluczem tajnym',
        whatsNew: 'Co nowego',
    },

    welcome: {
        // Main welcome screen for unauthenticated users
        title: 'Lyntty mobile control for pi',
        subtitle: 'Control local pi sessions through your self-hosted relay.',
        createAccount: 'Utwórz konto',
        linkOrRestoreAccount: 'Połącz lub przywróć konto',
        loginWithMobileApp: 'Zaloguj się przez aplikację mobilną',
    },

    review: {
        // Used by utils/requestReview.ts
        enjoyingApp: 'Podoba Ci się aplikacja?',
        feedbackPrompt: 'Chcielibyśmy usłyszeć Twoją opinię!',
        yesILoveIt: 'Tak, uwielbiam ją!',
        notReally: 'Nie bardzo'
    },

    items: {
        // Used by Item component for copy toast
        copiedToClipboard: ({ label }: { label: string }) => `${label} skopiowano do schowka`
    },

    machine: {
        offlineUnableToSpawn: 'Launcher wyłączony, gdy maszyna jest offline',
        offlineHelp: '• Make sure your computer is online\n• Run `lyntty doctor` on the computer\n• Install the latest signed Lyntty CLI release if needed',
        launchNewSessionInDirectory: 'Uruchom nową sesję w katalogu',
        daemon: 'Daemon',
        status: 'Status',
        stopDaemon: 'Zatrzymaj daemon',
        activeSessions: ({ count }: { count: number }) => `Aktywne sesje (${count})`,
        machineGroup: 'Maszyna',
        host: 'Host',
        platform: 'Platforma',
        lastSeen: 'Ostatnio widziana',
        never: 'Nigdy',
        cliAvailability: 'Dostępność CLI',
        cliInstalled: 'Zainstalowany',
        cliNotFound: 'Nie znaleziono',
        untitledSession: 'Sesja bez nazwy',
        back: 'Wstecz',
        dangerZone: 'Strefa niebezpieczna',
        delete: 'Usuń maszynę',
        deleteFooter: 'Usuń tę maszynę ze swojego konta. Historia sesji zostanie zachowana, ale nie będziesz mógł uruchamiać nowych sesji na tej maszynie.',
        deleteConfirmTitle: 'Usunąć tę maszynę?',
        deleteConfirmMessage: 'Maszyna zostanie usunięta z twojego konta. Historia sesji zostanie zachowana, ale nie będziesz mógł uruchamiać nowych sesji, dopóki ponownie nie podłączysz demona.',
        deleteFailed: 'Nie udało się usunąć maszyny.',
    },

    message: {
        switchedToMode: ({ mode }: { mode: string }) => `Przełączono na tryb ${mode}`,
        unknownEvent: 'Nieznane zdarzenie',
        usageLimitUntil: ({ time }: { time: string }) => `Osiągnięto limit użycia do ${time}`,
        sentAsGoal: 'Sent as goal',
        unknownTime: 'nieznany czas',
    },



    textSelection: {
        // Text selection screen
        selectText: 'Wybierz zakres tekstu',
        title: 'Wybierz tekst',
        noTextProvided: 'Nie podano tekstu',
        textNotFound: 'Tekst nie został znaleziony lub wygasł',
        textCopied: 'Tekst skopiowany do schowka',
        failedToCopy: 'Nie udało się skopiować tekstu do schowka',
        noTextToCopy: 'Brak tekstu do skopiowania',
    },

    markdown: {
        // Markdown copy functionality
        codeCopied: 'Kod skopiowany',
        copyFailed: 'Błąd kopiowania',
        mermaidRenderFailed: 'Nie udało się wyświetlić diagramu mermaid',
    },

    imageUpload: {
        permissionTitle: 'Dostęp do biblioteki zdjęć',
        permissionMessage: 'Zezwól na dostęp do biblioteki zdjęć, aby załączać obrazy do wiadomości.',
        limitTitle: 'Osiągnięto limit obrazów',
        limitMessage: ({ max }: { max: number }) => `Możesz dołączyć maksymalnie ${max} obrazów na wiadomość.`,
        fileTooLargeTitle: 'Plik zbyt duży',
        fileTooLargeMessage: ({ name, maxMb }: { name: string; maxMb: number }) => `"${name}" przekracza limit ${maxMb}MB i nie został dodany.`,
        uploadFailedTitle: 'Przesyłanie nieudane',
        uploadFailedMessage: ({ count }: { count: number }) => count === 1
            ? 'Nie udało się przesłać jednego zdjęcia i nie zostało wysłane.'
            : `Nie udało się przesłać ${count} zdjęć i nie zostały wysłane.`,
        notSupportedTitle: 'Obrazy nieobsługiwane',
        notSupportedMessage: 'Ten agent nie obsługuje załączników obrazów. Obrazy nie zostały wysłane.',
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

export type TranslationsPl = typeof pl;
