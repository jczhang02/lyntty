import type { TranslationStructure } from '../_default';

/**
 * Russian plural helper function
 * Russian has 3 plural forms: one, few, many
 * @param options - Object containing count and the three plural forms
 * @returns The appropriate form based on Russian plural rules
 */
function plural({ count, one, few, many }: { count: number; one: string; few: string; many: string }): string {
    const n = Math.abs(count);
    const n10 = n % 10;
    const n100 = n % 100;

    // Rule: ends in 1 but not 11
    if (n10 === 1 && n100 !== 11) return one;

    // Rule: ends in 2-4 but not 12-14
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;

    // Rule: everything else (0, 5-9, 11-19, etc.)
    return many;
}

/**
 * Russian translations for the Lyntty app
 * Must match the exact structure of the English translations
 */
export const ru: TranslationStructure = {
    tabs: {
        // Tab navigation labels
        sessions: 'Терминалы',
        settings: 'Настройки',
    },

    common: {
        // Simple string constants
        cancel: 'Отмена',
        authenticate: 'Авторизация',
        save: 'Сохранить',
        saveAs: 'Сохранить как',
        error: 'Ошибка',
        success: 'Успешно',
        ok: 'ОК',
        continue: 'Продолжить',
        back: 'Назад',
        create: 'Создать',
        rename: 'Переименовать',
        reset: 'Сбросить',
        logout: 'Выйти',
        yes: 'Да',
        no: 'Нет',
        discard: 'Отменить',
        version: 'Версия',
        copied: 'Скопировано',
        copy: 'Копировать',
        scanning: 'Сканирование...',
        urlPlaceholder: 'https://example.com',
        home: 'Главная',
        message: 'Сообщение',
        files: 'Файлы',
        fileViewer: 'Просмотр файла',
        loading: 'Загрузка...',
        retry: 'Повторить',
        delete: 'Удалить',
        optional: 'необязательно',
    },

    connect: {
        restoreAccount: 'Восстановить аккаунт',
        enterSecretKey: 'Пожалуйста, введите секретный ключ',
        invalidSecretKey: 'Неверный секретный ключ. Проверьте и попробуйте снова.',
        enterUrlManually: 'Ввести URL вручную',
    },

    settings: {
        title: 'Настройки',
        connectedAccounts: 'Подключенные аккаунты',
        connectAccount: 'Подключить аккаунт',
        machines: 'Машины',
        relay: 'Relay',
        signedIn: 'Signed in',
        noNodesPaired: 'No nodes paired',
        oneNodeOnline: '1 node online',
        nodesOnline: ({ onlineCount, totalCount }: { onlineCount: number; totalCount: number }) => `${onlineCount}/${totalCount} nodes online`,
        showOfflineMachines: ({ count }: { count: number }) => {
            const lastTwo = count % 100;
            const lastOne = count % 10;
            if (lastTwo >= 11 && lastTwo <= 14) return `Показать ${count} оффлайн-машин`;
            if (lastOne === 1) return `Показать ${count} оффлайн-машину`;
            if (lastOne >= 2 && lastOne <= 4) return `Показать ${count} оффлайн-машины`;
            return `Показать ${count} оффлайн-машин`;
        },
        hideOfflineMachines: 'Скрыть оффлайн-машины',
        features: 'Функции',
        account: 'Аккаунт',
        accountSubtitle: 'Управление учётной записью',
        appearance: 'Внешний вид',
        appearanceSubtitle: 'Настройка внешнего вида приложения',
        featuresTitle: 'Возможности',
        featuresSubtitle: 'Включить или отключить функции приложения',
        developer: 'Разработчик',
        developerTools: 'Инструменты разработчика',
        about: 'О программе',
        aboutFooter: 'Lyntty is a mobile control surface for local pi sessions. The relay carries encrypted sync and is not canonical history.',
        whatsNew: 'Что нового',
        whatsNewSubtitle: 'Посмотреть последние обновления и улучшения',
        reportIssue: 'Сообщить о проблеме',
        privacyPolicy: 'Политика конфиденциальности',
        termsOfService: 'Условия использования',
        eula: 'EULA',
        scanQrCodeToAuthenticate: 'Отсканируйте QR-код для авторизации',
        machineStatus: ({ name, status }: { name: string; status: 'online' | 'offline' }) =>
            `${name} ${status === 'online' ? 'online' : 'offline'}`,
        featureToggled: ({ feature, enabled }: { feature: string; enabled: boolean }) =>
            `${feature} ${enabled ? 'включена' : 'отключена'}`,
    },

    settingsAppearance: {
        // Appearance settings screen
        theme: 'Тема',
        themeDescription: 'Выберите предпочтительную цветовую схему',
        themeOptions: {
            adaptive: 'Адаптивная',
            light: 'Светлая',
            dark: 'Тёмная',
        },
        themeDescriptions: {
            adaptive: 'Следовать настройкам системы',
            light: 'Всегда использовать светлую тему',
            dark: 'Всегда использовать тёмную тему',
        },
        display: 'Отображение',
        displayDescription: 'Управление макетом и интервалами',
        inlineToolCalls: 'Встроенные вызовы инструментов',
        inlineToolCallsDescription: 'Отображать вызовы инструментов прямо в сообщениях чата',
        expandTodoLists: 'Развернуть списки задач',
        expandTodoListsDescription: 'Показывать все задачи вместо только изменений',
        showLineNumbersInDiffs: 'Показывать номера строк в различиях',
        showLineNumbersInDiffsDescription: 'Отображать номера строк в различиях кода',
        showLineNumbersInToolViews: 'Показывать номера строк в представлениях инструментов',
        showLineNumbersInToolViewsDescription: 'Отображать номера строк в различиях представлений инструментов',
        wrapLinesInDiffs: 'Перенос строк в различиях',
        wrapLinesInDiffsDescription: 'Переносить длинные строки вместо горизонтальной прокрутки в представлениях различий',
        diffStyle: 'Вид сравнения',
        diffStyleDescription: 'Показывать различия в одну колонку (unified) или рядом (split).',
        diffStyleOptions: {
            unified: 'Unified',
            split: 'Split',
        },
        alwaysShowContextSize: 'Всегда показывать размер контекста',
        alwaysShowContextSizeDescription: 'Отображать использование контекста даже когда не близко к лимиту',
        avatarStyle: 'Стиль аватара',
        avatarStyleDescription: 'Выберите внешний вид аватара сессии',
        avatarOptions: {
            pixelated: 'Пиксельная',
            gradient: 'Питомец',
            brutalist: 'Бруталистская',
        },
    },

    settingsFeatures: {
        // Features settings screen
        experiments: 'Эксперименты',
        experimentsDescription: 'Включить экспериментальные функции, которые всё ещё разрабатываются. Эти функции могут быть нестабильными или изменяться без предупреждения.',
        experimentalFeatures: 'Экспериментальные функции',
        experimentalFeaturesEnabled: 'Экспериментальные функции включены',
        experimentalFeaturesDisabled: 'Используются только стабильные функции',
        markdownCopyV2: 'Markdown Copy v2',
        markdownCopyV2Subtitle: 'Долгое нажатие открывает модальное окно копирования',
        hideInactiveSessions: 'Скрывать неактивные сессии',
        hideInactiveSessionsSubtitle: 'Показывать в списке только активные чаты',
        groupToolCalls: 'Группировать вызовы инструментов',
        groupToolCallsSubtitle: 'Сворачивать подряд идущие вызовы инструментов в один блок',
        imageUpload: 'Загрузка изображений',
        imageUploadSubtitle: 'Прикрепляйте изображения к сообщениям для анализа поддерживаемыми агентами',
    },

    errors: {
        networkError: 'Произошла ошибка сети',
        serverError: 'Произошла ошибка сервера',
        unknownError: 'Произошла неизвестная ошибка',
        connectionTimeout: 'Время соединения истекло',
        authenticationFailed: 'Ошибка авторизации',
        permissionDenied: 'Доступ запрещен',
        fileNotFound: 'Файл не найден',
        invalidFormat: 'Неверный формат',
        operationFailed: 'Операция не выполнена',
        tryAgain: 'Пожалуйста, попробуйте снова',
        contactSupport: 'Если проблема сохранится, обратитесь в поддержку',
        sessionNotFound: 'Сессия не найдена',
        oauthInitializationFailed: 'Не удалось инициализировать процесс OAuth',
        tokenStorageFailed: 'Не удалось сохранить токены аутентификации',
        oauthStateMismatch: 'Ошибка проверки безопасности. Попробуйте снова',
        tokenExchangeFailed: 'Не удалось обменять код авторизации',
        oauthAuthorizationDenied: 'В авторизации отказано',
        webViewLoadFailed: 'Не удалось загрузить страницу аутентификации',
        failedToLoadProfile: 'Не удалось загрузить профиль пользователя',
        userNotFound: 'Пользователь не найден',
        sessionDeleted: 'Сессия была удалена',
        sessionDeletedDescription: 'Эта сессия была окончательно удалена',

        // Error functions with context
        fieldError: ({ field, reason }: { field: string; reason: string }) =>
            `${field}: ${reason}`,
        validationError: ({ field, min, max }: { field: string; min: number; max: number }) =>
            `${field} должно быть от ${min} до ${max}`,
        retryIn: ({ seconds }: { seconds: number }) =>
            `Повторить через ${seconds} ${plural({ count: seconds, one: 'секунду', few: 'секунды', many: 'секунд' })}`,
        errorWithCode: ({ message, code }: { message: string; code: number | string }) =>
            `${message} (Ошибка ${code})`,
        disconnectServiceFailed: ({ service }: { service: string }) =>
            `Не удалось отключить ${service}`,
        connectServiceFailed: ({ service }: { service: string }) =>
            `Не удалось подключить ${service}. Пожалуйста, попробуйте снова.`,
    },

    newSession: {
        title: 'Начать новую сессию',
        machineOffline: 'Машина недоступна',
        switchMachinesHint: '• Переключите машину, нажав на неё выше',
    },

    sessionHistory: {
        // Used by session history screen
        title: 'История сессий',
        empty: 'Сессии не найдены',
        today: 'Сегодня',
        yesterday: 'Вчера',
        daysAgo: ({ count }: { count: number }) => `${count} ${plural({ count, one: 'день', few: 'дня', many: 'дней' })} назад`,
        viewAll: 'Посмотреть все сессии',
    },

    server: {
        // Used by Server Configuration screen (app/(app)/server.tsx)
        serverConfiguration: 'Настройка сервера',
        enterServerUrl: 'Пожалуйста, введите URL сервера',
        notValidLynttyServer: 'Это не валидный сервер Lyntty',
        changeServer: 'Изменить сервер',
        continueWithServer: 'Продолжить с этим сервером?',
        resetToDefault: 'Сбросить по умолчанию',
        resetServerDefault: 'Сбросить сервер по умолчанию?',
        validating: 'Проверка...',
        validatingServer: 'Проверка сервера...',
        serverReturnedError: 'Сервер вернул ошибку',
        failedToConnectToServer: 'Не удалось подключиться к серверу',
        currentlyUsingCustomServer: 'Сейчас используется пользовательский сервер',
        customServerUrlLabel: 'URL пользовательского сервера',
        advancedFeatureFooter: 'Это расширенная функция. Изменяйте сервер только если знаете, что делаете. Вам нужно будет выйти и войти снова после изменения серверов.'
    },

    sessionInfo: {
        // Used by Session Info screen (app/(app)/session/[id]/info.tsx)
        killSession: 'Завершить сессию',
        killSessionConfirm: 'Вы уверены, что хотите завершить эту сессию?',
        stopAndArchiveSession: 'Остановить и архивировать',
        archiveSession: 'Архивировать сессию',
        archiveSessionConfirm: 'Вы уверены, что хотите архивировать эту сессию?',
        metadataCopied: 'Метаданные скопированы в буфер обмена',
        failedToCopyMetadata: 'Не удалось скопировать метаданные',
        failedToKillSession: 'Не удалось завершить сессию',
        failedToArchiveSession: 'Не удалось архивировать сессию',
        connectionStatus: 'Статус подключения',
        created: 'Создано',
        lastUpdated: 'Последнее обновление',
        quickActions: 'Быстрые действия',
        viewMachine: 'Посмотреть машину',
        viewMachineSubtitle: 'Посмотреть детали машины и сессии',
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
        killSessionSubtitle: 'Немедленно завершить сессию',
        archiveSessionSubtitle: 'Архивировать эту сессию и остановить её',
        metadata: 'Метаданные',
        host: 'Хост',
        path: 'Путь',
        processId: 'ID процесса',
        lynttyHome: 'Домашний каталог Lyntty',
        cliVersionOutdated: 'Требуется обновление CLI',
        cliVersionOutdatedMessage: ({ currentVersion, requiredVersion }: { currentVersion: string; requiredVersion: string }) =>
            `Установлена версия ${currentVersion}. Обновите до ${requiredVersion} или новее`,
        updateCliInstructions: 'Install the latest signed Lyntty CLI release.',
        deleteSession: 'Удалить сессию',
        deleteSessionSubtitle: 'Удалить эту сессию навсегда',
        deleteSessionConfirm: 'Удалить сессию навсегда?',
        deleteSessionWarning: 'Это действие нельзя отменить. Все сообщения и данные, связанные с этой сессией, будут удалены навсегда.',
        failedToDeleteSession: 'Не удалось удалить сессию',
        sessionDeleted: 'Сессия успешно удалена',
        worktreeCleanupTitle: 'Удалить Worktree?',
        worktreeCleanupMessage: 'В Worktree нет незафиксированных изменений. Хотите удалить файлы Worktree?',
        worktreeCleanupDelete: 'Удалить Worktree',
        worktreeCleanupKeep: 'Сохранить файлы',
    },

    components: {
        emptyMainScreen: {
            // Used by EmptyMainScreen component
            readyToCode: 'Готовы к программированию?',
            installCli: 'Установите Lyntty CLI',
            runIt: 'Запустите его',
            scanQrCode: 'Отсканируйте QR-код',
            openCamera: 'Открыть камеру',
        },
    },

    status: {
        connected: 'подключено',
        connecting: 'подключение',
        disconnected: 'отключено',
        error: 'ошибка',
        online: 'online',
        offline: 'offline',
        lastSeen: ({ time }: { time: string }) => `в сети ${time}`,
        permissionRequired: 'требуется разрешение',
        activeNow: 'Активен сейчас',
        unknown: 'неизвестно',
        unread: 'новые результаты',
    },

    time: {
        justNow: 'только что',
        minutesAgo: ({ count }: { count: number }) => `${count} ${plural({ count, one: 'минуту', few: 'минуты', many: 'минут' })} назад`,
        hoursAgo: ({ count }: { count: number }) => `${count} ${plural({ count, one: 'час', few: 'часа', many: 'часов' })} назад`,
        daysAgo: ({ count }: { count: number }) => `${count} ${plural({ count, one: 'день', few: 'дня', many: 'дней' })} назад`,
    },

    session: {
        inputPlaceholder: 'Введите сообщение...',
        inactiveArchived: 'Эта сессия неактивна.',
        historyOnly: 'History only. Start Pi to make this session active via Lyntty.',
        computerOffline: 'Computer offline. History is still available.',
        waitingForPiExtension: 'Waiting for Pi extension. Messages stay queued until Pi reconnects.',
        legacyHistoryOnly: 'This legacy session cannot be controlled by this version of Lyntty.',
        installPiExtension: 'Install Pi extension',
        installPiExtensionInstructions: 'On the computer, run `lyntty remote install`, then run `/reload` in the active Pi session.',
    loadingLatestMessages: 'Загрузка последних сообщений…',
        resumeFromTerminal: 'Чтобы возобновить её из терминала:',
        newChat: 'Новый чат',
    },

    agentInput: {
        context: {
            remaining: ({ percent }: { percent: number }) => `Осталось ${percent}%`,
        },
        suggestion: {
            fileLabel: 'ФАЙЛ',
            folderLabel: 'ПАПКА',
        },
        noMachinesAvailable: 'Нет машин',
    },

    machineLauncher: {
        showLess: 'Показать меньше',
        showAll: ({ count }: { count: number }) => `Показать все (${count} ${plural({ count, one: 'путь', few: 'пути', many: 'путей' })})`,
        enterCustomPath: 'Ввести свой путь',
        offlineUnableToSpawn: 'Невозможно создать сессию, машина offline',
    },

    sidebar: {
        sessionsTitle: 'Lyntty',
        showArchived: 'Показать архив',
        hideArchived: 'Скрыть архив',
        newSession: 'Новая сессия',
    },

    zen: {
        toggle: 'Дзен-режим',
    },

    toolView: {
        input: 'Входные данные',
        output: 'Результат',
    },

    toolGroup: {
        editedFile: 'Отредактированный файл',
        editedFiles: ({ count }: { count: number }) => `${plural({ count, one: 'Отредактирован', few: 'Отредактировано', many: 'Отредактировано' })} ${count} ${plural({ count, one: 'файл', few: 'файла', many: 'файлов' })}`,
        readFiles: ({ count }: { count: number }) => `${plural({ count, one: 'Прочитан', few: 'Прочитано', many: 'Прочитано' })} ${count} ${plural({ count, one: 'файл', few: 'файла', many: 'файлов' })}`,
        ranCommands: ({ count }: { count: number }) => `${plural({ count, one: 'Выполнена', few: 'Выполнено', many: 'Выполнено' })} ${count} ${plural({ count, one: 'команда', few: 'команды', many: 'команд' })}`,
        searched: ({ count }: { count: number }) => `${plural({ count, one: 'Выполнен', few: 'Выполнено', many: 'Выполнено' })} ${count} ${plural({ count, one: 'поиск', few: 'поиска', many: 'поисков' })}`,
        fetchedUrls: ({ count }: { count: number }) => `${plural({ count, one: 'Загружен', few: 'Загружено', many: 'Загружено' })} ${count} URL`,
        ranTasks: ({ count }: { count: number }) => `${plural({ count, one: 'Выполнена', few: 'Выполнено', many: 'Выполнено' })} ${count} ${plural({ count, one: 'задача', few: 'задачи', many: 'задач' })}`,
        usedTools: ({ count }: { count: number }) => `${plural({ count, one: 'Использован', few: 'Использовано', many: 'Использовано' })} ${count} ${plural({ count, one: 'инструмент', few: 'инструмента', many: 'инструментов' })}`,
        workedFor: ({ duration }: { duration: string }) => `Работало ${duration}`,
    },

    tools: {
        fullView: {
            description: 'Описание',
            inputParams: 'Входные параметры',
            output: 'Результат',
            error: 'Ошибка',
            completed: 'Инструмент выполнен успешно',
            noOutput: 'Результат не получен',
            running: 'Выполняется...',
        },
        taskView: {
            initializing: 'Инициализация агента...',
            moreTools: ({ count }: { count: number }) => `+${count} ещё ${plural({ count, one: 'инструмент', few: 'инструмента', many: 'инструментов' })}`,
        },
        multiEdit: {
            editNumber: ({ index, total }: { index: number; total: number }) => `Правка ${index} из ${total}`,
            replaceAll: 'Заменить все',
        },
        names: {
            task: 'Задача',
            terminal: 'Терминал',
            searchFiles: 'Поиск файлов',
            search: 'Поиск',
            searchContent: 'Поиск содержимого',
            listFiles: 'Список файлов',
            planProposal: 'Предложение плана',
            readFile: 'Чтение файла',
            editFile: 'Редактирование файла',
            writeFile: 'Запись файла',
            fetchUrl: 'Получение URL',
            readNotebook: 'Чтение блокнота',
            editNotebook: 'Редактирование блокнота',
            todoList: 'Список задач',
            webSearch: 'Веб-поиск',
            reasoning: 'Рассуждение',
            applyChanges: 'Обновить файл',
            viewDiff: 'Текущие изменения файла',
            question: 'Вопрос',
        },
        desc: {
            terminalCmd: ({ cmd }: { cmd: string }) => `Терминал(команда: ${cmd})`,
            searchPattern: ({ pattern }: { pattern: string }) => `Поиск(шаблон: ${pattern})`,
            searchPath: ({ basename }: { basename: string }) => `Поиск(путь: ${basename})`,
            fetchUrlHost: ({ host }: { host: string }) => `Получение URL(адрес: ${host})`,
            editNotebookMode: ({ path, mode }: { path: string; mode: string }) => `Редактирование блокнота(файл: ${path}, режим: ${mode})`,
            todoListCount: ({ count }: { count: number }) => `Список задач(количество: ${count})`,
            webSearchQuery: ({ query }: { query: string }) => `Веб-поиск(запрос: ${query})`,
            grepPattern: ({ pattern }: { pattern: string }) => `grep(шаблон: ${pattern})`,
            multiEditEdits: ({ path, count }: { path: string; count: number }) => `${path} (${count} ${plural({ count, one: 'правка', few: 'правки', many: 'правок' })})`,
            readingFile: ({ file }: { file: string }) => `Чтение ${file}`,
            writingFile: ({ file }: { file: string }) => `Запись ${file}`,
            modifyingFile: ({ file }: { file: string }) => `Изменение ${file}`,
            modifyingFiles: ({ count }: { count: number }) => `Изменение ${count} ${plural({ count, one: 'файла', few: 'файлов', many: 'файлов' })}`,
            modifyingMultipleFiles: ({ file, count }: { file: string; count: number }) => `${file} и ещё ${count}`,
            showingDiff: 'Показ изменений',
        },
        askUserQuestion: {
            submit: 'Отправить ответ',
            multipleQuestions: ({ count }: { count: number }) => `${count} ${plural({ count, one: 'вопрос', few: 'вопроса', many: 'вопросов' })}`,
            other: 'Другое',
            otherDescription: 'Введите свой ответ',
            otherPlaceholder: 'Введите ваш ответ...',
        }
    },

    files: {
        changes: 'Изменения',
        searchPlaceholder: 'Поиск файлов...',
        detachedHead: 'отделённый HEAD',
        summary: ({ staged, unstaged }: { staged: number; unstaged: number }) => `${staged} подготовлено • ${unstaged} не подготовлено`,
        notRepo: 'Не является git-репозиторием',
        notUnderGit: 'Эта папка не находится под управлением git',
        searching: 'Поиск файлов...',
        noFilesFound: 'Файлы не найдены',
        noFilesInProject: 'Файлов в проекте нет',
        tryDifferentTerm: 'Попробуйте другой поисковый запрос',
        searchResults: ({ count }: { count: number }) => `Результаты поиска (${count})`,
        projectRoot: 'Корень проекта',
        stagedChanges: ({ count }: { count: number }) => `Подготовленные изменения (${count})`,
        unstagedChanges: ({ count }: { count: number }) => `Неподготовленные изменения (${count})`,
        // File viewer strings
        loadingFile: ({ fileName }: { fileName: string }) => `Загрузка ${fileName}...`,
        binaryFile: 'Бинарный файл',
        cannotDisplayBinary: 'Невозможно отобразить содержимое бинарного файла',
        diff: 'Различия',
        file: 'Файл',
        fileEmpty: 'Файл пустой',
        noChanges: 'Нет изменений для отображения',
        noChangesTitle: 'Нет изменений',
        noChangesSubtitle: 'Рабочее дерево чистое',
        deleted: 'Удалён',
        changedFiles: ({ count }: { count: number }) => `${count} ${count === 1 ? 'изменённый файл' : count < 5 ? 'изменённых файла' : 'изменённых файлов'}`,
        allFiles: 'Все файлы',
        editFile: 'Редактировать',
        saveFile: 'Сохранить',
        failedToRead: 'Не удалось прочитать файл',
        failedToSave: 'Не удалось сохранить файл',
        fileConflict: 'Конфликт файла',
        fileConflictDescription: 'Файл был изменён на устройстве пока вы его редактировали. Перезагрузите чтобы увидеть актуальную версию.',
        reload: 'Перезагрузить',
        overwrite: 'Перезаписать',
    },

    settingsAccount: {
        // Account settings screen
        accountInformation: 'Информация об аккаунте',
        status: 'Статус',
        statusActive: 'Активный',
        statusNotAuthenticated: 'Не авторизован',
        linkNewDevice: 'Привязать новое устройство',
        linkNewDeviceSubtitle: 'Отсканируйте QR-код для привязки устройства',
        server: 'Сервер',
        backup: 'Резервная копия',
        backupDescription: 'Ваш секретный ключ - единственный способ восстановить ваш аккаунт. Сохраните его в безопасном месте, например в менеджере паролей.',
        secretKey: 'Секретный ключ',
        tapToReveal: 'Нажмите для показа',
        tapToHide: 'Нажмите для скрытия',
        secretKeyLabel: 'СЕКРЕТНЫЙ КЛЮЧ (НАЖМИТЕ ДЛЯ КОПИРОВАНИЯ)',
        secretKeyCopied: 'Секретный ключ скопирован в буфер обмена. Сохраните его в безопасном месте!',
        secretKeyCopyFailed: 'Не удалось скопировать секретный ключ',
        dangerZone: 'Опасная зона',
        logout: 'Выйти',
        logoutSubtitle: 'Выйти из аккаунта и очистить локальные данные',
        logoutConfirm: 'Вы уверены, что хотите выйти? Убедитесь, что вы сохранили резервную копию секретного ключа!',
    },

    connectButton: {
        authenticate: 'Авторизация терминала',
        authenticateWithUrlPaste: 'Авторизация терминала через URL',
        pasteAuthUrl: 'Вставьте авторизационный URL из терминала',
    },

    updateBanner: {
        updateAvailable: 'Доступно обновление',
        pressToApply: 'Нажмите, чтобы применить обновление',
        whatsNew: 'Что нового',
        seeLatest: 'Посмотреть последние обновления и улучшения',
        nativeUpdateAvailable: 'Доступно обновление приложения',
        tapToUpdateAppStore: 'Нажмите для обновления в App Store',
        tapToUpdatePlayStore: 'Нажмите для обновления в Play Store',
    },

    changelog: {
        // Used by the changelog screen
        version: ({ version }: { version: number }) => `Версия ${version}`,
        noEntriesAvailable: 'Записи журнала изменений недоступны.',
    },

    terminal: {
        // Used by terminal connection screens
        processingConnection: 'Обработка подключения...',
        invalidConnectionLink: 'Неверная ссылка подключения',
        invalidConnectionLinkDescription: 'Ссылка подключения отсутствует или неверна. Проверьте URL и попробуйте снова.',
        connectTerminal: 'Подключить терминал',
        terminalRequestDescription: 'Терминал запрашивает подключение к вашему аккаунту Lyntty. Это позволит терминалу безопасно отправлять и получать сообщения.',
        connectionDetails: 'Детали подключения',
        publicKey: 'Публичный ключ',
        encryption: 'Шифрование',
        endToEndEncrypted: 'Сквозное шифрование',
        acceptConnection: 'Принять подключение',
        connecting: 'Подключение...',
        reject: 'Отклонить',
        security: 'Безопасность',
        securityFooterDevice: 'Это подключение было безопасно обработано на вашем устройстве и никогда не отправлялось на сервер. Ваши личные данные останутся в безопасности, и только вы можете расшифровать сообщения.',
        clientSideProcessing: 'Обработка на стороне клиента',
        linkProcessedOnDevice: 'Ссылка обработана локально на устройстве',
    },

    modals: {
        // Used across connect flows and settings
        authenticateTerminal: 'Авторизация терминала',
        pasteUrlFromTerminal: 'Вставьте URL авторизации из вашего терминала',
        deviceLinkedSuccessfully: 'Устройство успешно связано',
        terminalConnectedSuccessfully: 'Терминал успешно подключен',
        invalidAuthUrl: 'Неверный URL авторизации',
        failedToConnectTerminal: 'Не удалось подключить терминал',
        cameraPermissionsRequiredToConnectTerminal: 'Для подключения терминала требуется доступ к камере',
        failedToLinkDevice: 'Не удалось связать устройство',
        cameraPermissionsRequiredToScanQr: 'Для сканирования QR-кодов требуется доступ к камере'
    },

    navigation: {
        // Navigation titles and screen headers
        connectTerminal: 'Подключить терминал',
        linkNewDevice: 'Связать новое устройство',
        restoreWithSecretKey: 'Восстановить секретным ключом',
        whatsNew: 'Что нового',
    },

    welcome: {
        // Main welcome screen for unauthenticated users
        title: 'Lyntty mobile control for pi',
        subtitle: 'Control local pi sessions through your self-hosted relay.',
        createAccount: 'Создать аккаунт',
        linkOrRestoreAccount: 'Связать или восстановить аккаунт',
        loginWithMobileApp: 'Войти через мобильное приложение',
    },

    review: {
        // Used by utils/requestReview.ts
        enjoyingApp: 'Нравится приложение?',
        feedbackPrompt: 'Мы будем рады вашему отзыву!',
        yesILoveIt: 'Да, мне нравится!',
        notReally: 'Не совсем'
    },

    items: {
        // Used by Item component for copy toast
        copiedToClipboard: ({ label }: { label: string }) => `${label} скопировано в буфер обмена`
    },

    machine: {
        offlineUnableToSpawn: 'Запуск отключен: машина offline',
        offlineHelp: '• Make sure your computer is online\n• Run `lyntty doctor` on the computer\n• Install the latest signed Lyntty CLI release if needed',
        launchNewSessionInDirectory: 'Запустить новую сессию в папке',
        daemon: 'Daemon',
        status: 'Статус',
        stopDaemon: 'Остановить daemon',
        activeSessions: ({ count }: { count: number }) => `Активные сессии (${count})`,
        machineGroup: 'Машина',
        host: 'Хост',
        platform: 'Платформа',
        lastSeen: 'Последняя активность',
        never: 'Никогда',
        cliAvailability: 'Доступность CLI',
        cliInstalled: 'Установлен',
        cliNotFound: 'Не найден',
        untitledSession: 'Безымянная сессия',
        back: 'Назад',
        dangerZone: 'Опасная зона',
        delete: 'Удалить машину',
        deleteFooter: 'Удаляет машину из вашего аккаунта. История сессий сохраняется, но вы больше не сможете запускать новые сессии на ней.',
        deleteConfirmTitle: 'Удалить эту машину?',
        deleteConfirmMessage: 'Машина будет удалена из вашего аккаунта. История сессий сохраняется, но вы больше не сможете запускать новые сессии, пока не подключите демон заново.',
        deleteFailed: 'Не удалось удалить машину.',
    },

    message: {
        switchedToMode: ({ mode }: { mode: string }) => `Переключено в режим ${mode}`,
        unknownEvent: 'Неизвестное событие',
        usageLimitUntil: ({ time }: { time: string }) => `Лимит использования достигнут до ${time}`,
        sentAsGoal: 'Отправлено в качестве цели',
        unknownTime: 'неизвестное время',
    },



    settingsLanguage: {
        // Language settings screen
        title: 'Язык',
        description: 'Выберите предпочтительный язык интерфейса приложения. Настройки синхронизируются на всех ваших устройствах.',
        currentLanguage: 'Текущий язык',
        automatic: 'Автоматически',
        automaticSubtitle: 'Определять по настройкам устройства',
        needsRestart: 'Язык изменён',
        needsRestartMessage: 'Приложение нужно перезапустить для применения новых языковых настроек.',
        restartNow: 'Перезапустить',
    },

    textSelection: {
        // Text selection screen
        selectText: 'Выделить диапазон текста',
        title: 'Выделить текст',
        noTextProvided: 'Текст не предоставлен',
        textNotFound: 'Текст не найден или устарел',
        textCopied: 'Текст скопирован в буфер обмена',
        failedToCopy: 'Не удалось скопировать текст в буфер обмена',
        noTextToCopy: 'Нет текста для копирования',
    },

    markdown: {
        // Markdown copy functionality
        codeCopied: 'Код скопирован',
        copyFailed: 'Ошибка копирования',
        mermaidRenderFailed: 'Не удалось отобразить диаграмму mermaid',
    },

    imageUpload: {
        permissionTitle: 'Доступ к библиотеке фото',
        permissionMessage: 'Разрешите доступ к вашей библиотеке фото, чтобы прикреплять изображения к сообщениям.',
        limitTitle: 'Достигнут лимит изображений',
        limitMessage: ({ max }: { max: number }) => `Можно прикрепить не более ${max} изображений на сообщение.`,
        fileTooLargeTitle: 'Файл слишком большой',
        fileTooLargeMessage: ({ name, maxMb }: { name: string; maxMb: number }) => `"${name}" превышает лимит ${maxMb}МБ и не был добавлен.`,
        uploadFailedTitle: 'Ошибка загрузки',
        uploadFailedMessage: ({ count }: { count: number }) => count === 1
            ? 'Одно изображение не удалось загрузить — оно не было отправлено.'
            : `${count} изображений не удалось загрузить — они не были отправлены.`,
        notSupportedTitle: 'Изображения не поддерживаются',
        notSupportedMessage: 'Этот агент не поддерживает вложения изображений. Изображения не были отправлены.',
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

export type TranslationsRu = typeof ru;
