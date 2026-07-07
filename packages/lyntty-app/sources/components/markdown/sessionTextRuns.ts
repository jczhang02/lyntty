const CJK_TEXT_RE = /[\u2E80-\u2EFF\u2F00-\u2FDF\u3000-\u303F\u31C0-\u31EF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;

export type SessionTextScript = 'latin' | 'cjk';

export type SessionTextRun = {
    text: string;
    script: SessionTextScript;
};

function getSessionTextScript(char: string): SessionTextScript {
    return CJK_TEXT_RE.test(char) ? 'cjk' : 'latin';
}

export function splitSessionTextByScript(text: string): SessionTextRun[] {
    const chars = Array.from(text);
    if (chars.length === 0) {
        return [];
    }

    const runs: SessionTextRun[] = [];
    let currentScript = getSessionTextScript(chars[0]);
    let currentText = '';

    for (const char of chars) {
        const script = getSessionTextScript(char);
        if (script !== currentScript && currentText) {
            runs.push({ text: currentText, script: currentScript });
            currentText = '';
            currentScript = script;
        }
        currentText += char;
    }

    if (currentText) {
        runs.push({ text: currentText, script: currentScript });
    }

    return runs;
}
