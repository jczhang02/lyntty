export function expectsRemotePiEcho(text: string): boolean {
    const trimmedText = text.trim();
    return !trimmedText.startsWith('/') || /^\/skill:[^\s/]+(?:\s|$)/.test(trimmedText);
}
