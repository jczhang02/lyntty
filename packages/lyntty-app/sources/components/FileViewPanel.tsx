import * as React from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Text } from '@/components/StyledText';
import { HorizontalScrollView } from '@/components/HorizontalScrollView';
import { MarkdownView } from '@/components/markdown/MarkdownView';
import { SimpleSyntaxHighlighter } from '@/components/SimpleSyntaxHighlighter';
import { Typography } from '@/constants/Typography';
import { layout } from '@/components/layout';
import { sessionReadFile } from '@/sync/ops';
import { t } from '@/text';

interface FileViewPanelProps {
    sessionId: string;
    filePath: string;
    onHeaderRightSlotChange: (slot: React.ReactNode) => void;
}

type FileState =
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'binary' }
    | { kind: 'loaded'; content: string };

function getFileLanguage(path: string): string | null {
    const extension = path.split('.').pop()?.toLowerCase();
    const languages: Record<string, string> = {
        bash: 'bash',
        c: 'c',
        cc: 'cpp',
        cpp: 'cpp',
        css: 'css',
        cxx: 'cpp',
        dockerfile: 'docker',
        env: 'bash',
        go: 'go',
        gql: 'graphql',
        graphql: 'graphql',
        htm: 'html',
        html: 'html',
        ini: 'ini',
        java: 'java',
        js: 'javascript',
        json: 'json',
        jsx: 'javascript',
        kt: 'kotlin',
        less: 'css',
        md: 'markdown',
        php: 'php',
        prisma: 'graphql',
        py: 'python',
        rb: 'ruby',
        rs: 'rust',
        rust: 'rust',
        scss: 'css',
        sh: 'bash',
        sql: 'sql',
        svelte: 'markup',
        swift: 'swift',
        tf: 'hcl',
        toml: 'toml',
        ts: 'typescript',
        tsx: 'typescript',
        vue: 'markup',
        xml: 'xml',
        yaml: 'yaml',
        yml: 'yaml',
    };
    return extension ? (languages[extension] ?? null) : null;
}

function isBinaryExtension(path: string): boolean {
    const extension = path.split('.').pop()?.toLowerCase();
    if (!extension) {
        return false;
    }
    return [
        '7z', 'aac', 'avi', 'bmp', 'db', 'deb', 'dmg', 'doc', 'docx', 'exe',
        'flac', 'flv', 'gif', 'gz', 'ico', 'jpeg', 'jpg', 'mov', 'mp3', 'mp4',
        'ogg', 'otf', 'pdf', 'png', 'ppt', 'pptx', 'rar', 'rpm', 'sqlite',
        'sqlite3', 'svg', 'tar', 'ttf', 'wav', 'webm', 'wmv', 'woff', 'woff2',
        'xls', 'xlsx', 'zip',
    ].includes(extension);
}

function decodeBase64Utf8(base64: string): string {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder().decode(bytes);
}

export const FileViewPanel = React.memo(function FileViewPanel({
    sessionId,
    filePath,
    onHeaderRightSlotChange,
}: FileViewPanelProps) {
    const { theme } = useUnistyles();
    const [fileState, setFileState] = React.useState<FileState>({ kind: 'loading' });
    const language = getFileLanguage(filePath);

    React.useEffect(() => {
        onHeaderRightSlotChange(null);
        return () => onHeaderRightSlotChange(null);
    }, [onHeaderRightSlotChange]);

    React.useEffect(() => {
        let cancelled = false;
        setFileState({ kind: 'loading' });

        if (isBinaryExtension(filePath)) {
            setFileState({ kind: 'binary' });
            return () => {
                cancelled = true;
            };
        }

        void sessionReadFile(sessionId, filePath).then((response) => {
            if (cancelled) {
                return;
            }
            if (!response.success || !response.content) {
                setFileState({ kind: 'error', message: response.error || t('files.failedToRead') });
                return;
            }
            try {
                setFileState({ kind: 'loaded', content: decodeBase64Utf8(response.content) });
            } catch {
                setFileState({ kind: 'binary' });
            }
        }).catch((error: unknown) => {
            if (!cancelled) {
                setFileState({
                    kind: 'error',
                    message: error instanceof Error ? error.message : t('files.failedToRead'),
                });
            }
        });

        return () => {
            cancelled = true;
        };
    }, [filePath, sessionId]);

    if (fileState.kind === 'loading') {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            </View>
        );
    }

    if (fileState.kind === 'error') {
        return (
            <View style={styles.centered}>
                <Ionicons name="alert-circle-outline" size={32} color={theme.colors.textDestructive} />
                <Text style={[styles.message, { color: theme.colors.textSecondary }]}>{fileState.message}</Text>
            </View>
        );
    }

    if (fileState.kind === 'binary') {
        return (
            <View style={styles.centered}>
                <Ionicons name="document-outline" size={32} color={theme.colors.textSecondary} />
                <Text style={[styles.message, { color: theme.colors.textSecondary }]}>{t('files.binaryFile')}</Text>
            </View>
        );
    }

    if (language === 'markdown') {
        return (
            <ScrollView
                style={styles.container}
                contentContainerStyle={styles.markdownContent}
            >
                <MarkdownView markdown={fileState.content} sessionId={sessionId} />
            </ScrollView>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.codeOuterContent}>
            <HorizontalScrollView contentContainerStyle={styles.codeContent}>
                <SimpleSyntaxHighlighter
                    code={fileState.content}
                    language={language}
                    selectable
                />
            </HorizontalScrollView>
        </ScrollView>
    );
});

const styles = StyleSheet.create(() => ({
    container: {
        flex: 1,
    },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    message: {
        marginTop: 8,
        textAlign: 'center',
        ...Typography.default(),
    },
    markdownContent: {
        width: '100%',
        maxWidth: layout.maxWidth,
        alignSelf: 'center',
        padding: 16,
    },
    codeOuterContent: {
        flexGrow: 1,
        width: '100%',
        maxWidth: layout.maxWidth,
        alignSelf: 'center',
    },
    codeContent: {
        padding: 16,
    },
}));
