const VISIBLE_JSX_ATTRIBUTES = new Set([
    'accessibilityHint',
    'accessibilityLabel',
    'cancelText',
    'confirmText',
    'detail',
    'footer',
    'header',
    'label',
    'placeholder',
    'subtitle',
    'title',
]);

const VISIBLE_OBJECT_PROPERTIES = new Set([
    'accessibilityHint',
    'accessibilityLabel',
    'body',
    'cancelText',
    'confirmText',
    'description',
    'detail',
    'footer',
    'label',
    'message',
    'placeholder',
    'subtitle',
    'text',
    'title',
]);

const TECHNICAL_TEXT = new Set([
    'API',
    'CLI',
    'HTTP',
    'HTTPS',
    'ID',
    'JSON',
    'OK',
    'PID',
    'QR',
    'URL',
    'UUID',
    'claude',
    'codex',
    'gemini',
    'Edit',
    'ExitPlanMode',
    'GitHub',
    'Lyntty',
    'MultiEdit',
    'NotebookEdit',
    'LYNTTY',
    'lyntty',
    'lynttyd',
    'pi',
    'relay',
    'web',
    'Entering plan mode',
    'Write',
    'XXXXX-XXXXX-XXXXX...',
    'exit_plan_mode',
    'service events must use role "agent"',
    'subagent must be a cuid2 value',
]);

const HUMAN_TEXT_RE = /[A-Za-z\u00C0-\u024F\u0400-\u04FF\u3400-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/;
const COLOR_RE = /^#(?:[0-9A-Fa-f]{3,8})$/;
const SHELL_COMMAND_RE = /^\$\s+/;
const URL_OR_PROTOCOL_RE = /^(?:https?:\/\/|wss?:\/\/|mailto:|file:\/\/|lyntty:\/\/)/i;
const ROUTE_RE = /^\/[A-Za-z0-9_./:[\]()-]+$/;
const MODULE_PATH_RE = /^(?:@\/|\.\.?\/|~\/)[A-Za-z0-9_./:@()[\]-]+$/;
const FILE_NAME_RE = /^[A-Za-z0-9_./:@()[\]-]+\.(?:cjs|css|html|jpeg|jpg|js|json|md|mjs|png|svg|ts|tsx|txt|wasm|yml|yaml)$/i;
const STORAGE_KEY_RE = /^[a-z][A-Za-z0-9]*(?:\.[a-zA-Z0-9]+)+$/;
function normalizeText(value) {
    return value.replace(/\s+/g, ' ').trim();
}

function isUserFacingText(value) {
    const text = normalizeText(value);

    if (!text || text.length <= 1 || !HUMAN_TEXT_RE.test(text)) {
        return false;
    }

    if (TECHNICAL_TEXT.has(text)) {
        return false;
    }

    if (COLOR_RE.test(text) || SHELL_COMMAND_RE.test(text)) {
        return false;
    }

    if (text.includes('events must use role "agent"')) {
        return false;
    }

    if (text.startsWith('Server error: ') || text.startsWith('Title changed to ')) {
        return false;
    }

    if (URL_OR_PROTOCOL_RE.test(text) || ROUTE_RE.test(text) || MODULE_PATH_RE.test(text) || FILE_NAME_RE.test(text)) {
        return false;
    }

    if (STORAGE_KEY_RE.test(text)) {
        return false;
    }

    return true;
}

function isAllowedTechnicalLiteral(value) {
    return !isUserFacingText(value);
}

function getStaticString(node) {
    if (!node) {
        return null;
    }

    if (node.type === 'Literal' && typeof node.value === 'string') {
        return node.value;
    }

    if (node.type === 'TemplateLiteral') {
        return node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join('${}');
    }

    return null;
}

function getPropertyName(node) {
    if (!node) {
        return null;
    }

    if (node.type === 'Identifier') {
        return node.name;
    }

    if (node.type === 'Literal' && typeof node.value === 'string') {
        return node.value;
    }

    return null;
}

function getJsxName(node) {
    if (!node) {
        return null;
    }

    if (node.type === 'JSXIdentifier') {
        return node.name;
    }

    if (node.type === 'JSXMemberExpression') {
        const objectName = getJsxName(node.object);
        const propertyName = getJsxName(node.property);
        return objectName && propertyName ? `${objectName}.${propertyName}` : propertyName;
    }

    return null;
}

function isTranslationCall(node) {
    return node?.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 't';
}

function isUserFacingCallee(node) {
    if (node?.type !== 'MemberExpression') {
        return false;
    }

    const objectName = node.object?.type === 'Identifier' ? node.object.name : null;
    const propertyName = getPropertyName(node.property);

    if (objectName === 'Modal' && ['alert', 'confirm', 'prompt'].includes(propertyName ?? '')) {
        return true;
    }

    if (objectName === 'Alert' && propertyName === 'alert') {
        return true;
    }

    return false;
}

function isJsxChildExpression(node) {
    return node?.parent?.type === 'JSXElement' && node.parent.children?.includes(node);
}

function hasUserFacingCallAncestor(node) {
    let current = node.parent;
    while (current) {
        if (current.type === 'CallExpression' && isUserFacingCallee(current.callee)) {
            return true;
        }
        current = current.parent;
    }
    return false;
}

function reportString(context, node, value, messageId = 'hardcoded') {
    if (!isUserFacingText(value)) {
        return;
    }

    context.report({
        node,
        messageId,
        data: {
            text: normalizeText(value),
        },
    });
}

function scanUserFacingExpression(context, node, messageId) {
    if (!node || isTranslationCall(node)) {
        return;
    }

    const staticString = getStaticString(node);
    if (staticString !== null) {
        reportString(context, node, staticString, messageId);
        return;
    }

    if (node.type === 'ArrayExpression') {
        for (const element of node.elements) {
            scanUserFacingExpression(context, element, messageId);
        }
        return;
    }

    if (node.type === 'ObjectExpression') {
        for (const property of node.properties) {
            if (property.type !== 'Property') {
                continue;
            }
            const keyName = getPropertyName(property.key);
            if (keyName && VISIBLE_OBJECT_PROPERTIES.has(keyName)) {
                scanUserFacingExpression(context, property.value, messageId);
            }
        }
        return;
    }

    if (node.type === 'ConditionalExpression') {
        scanUserFacingExpression(context, node.consequent, messageId);
        scanUserFacingExpression(context, node.alternate, messageId);
        return;
    }

    if (node.type === 'LogicalExpression') {
        scanUserFacingExpression(context, node.right, messageId);
        return;
    }

    if (node.type === 'BinaryExpression' && node.operator === '+') {
        scanUserFacingExpression(context, node.left, messageId);
        scanUserFacingExpression(context, node.right, messageId);
    }
}

export default {
    meta: {
        type: 'problem',
        docs: {
            description: 'Require i18n for user-visible strings in Lyntty app UI code.',
        },
        messages: {
            hardcoded: 'User-visible string "{{text}}" must use i18n t(...).',
            hardcodedJsxText: 'JSX text "{{text}}" must use i18n t(...).',
            hardcodedModal: 'Modal/Alert string "{{text}}" must use i18n t(...).',
            hardcodedObject: 'User-visible object property "{{text}}" must use i18n t(...).',
        },
        schema: [],
    },
    create(context) {
        return {
            JSXAttribute(node) {
                const attrName = node.name?.name;
                if (!VISIBLE_JSX_ATTRIBUTES.has(attrName)) {
                    return;
                }

                if (node.value?.type === 'Literal') {
                    reportString(context, node.value, node.value.value);
                    return;
                }

                if (node.value?.type !== 'JSXExpressionContainer') {
                    return;
                }

                scanUserFacingExpression(context, node.value.expression, 'hardcoded');
            },
            JSXText(node) {
                reportString(context, node, node.value, 'hardcodedJsxText');
            },
            JSXExpressionContainer(node) {
                if (!isJsxChildExpression(node)) {
                    return;
                }
                scanUserFacingExpression(context, node.expression, 'hardcodedJsxText');
            },
            CallExpression(node) {
                if (!isUserFacingCallee(node.callee)) {
                    return;
                }

                for (const arg of node.arguments) {
                    scanUserFacingExpression(context, arg, 'hardcodedModal');
                }
            },
            Property(node) {
                if (hasUserFacingCallAncestor(node)) {
                    return;
                }

                const keyName = getPropertyName(node.key);
                if (!keyName || !VISIBLE_OBJECT_PROPERTIES.has(keyName)) {
                    return;
                }

                const staticString = getStaticString(node.value);
                if (staticString === null || isAllowedTechnicalLiteral(staticString)) {
                    return;
                }

                reportString(context, node.value, staticString, 'hardcodedObject');
            },
        };
    },
};
