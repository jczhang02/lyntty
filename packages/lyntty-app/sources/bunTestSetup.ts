import { mock } from 'bun:test';

// Bun's ESM resolver currently selects a broken wrappers entrypoint; the CJS
// export initializes the same WASM-backed implementation correctly.
const sodium = require('libsodium-wrappers') as typeof import('libsodium-wrappers').default;
await sodium.ready;

// React Native's Flow-annotated entrypoint cannot be parsed by Bun. Tests that
// need a different native surface replace these modules with their own factory.
(globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__ = false;

const nativeComponent = () => null;
const removeListener = () => undefined;
const addListener = () => ({ remove: removeListener });
const addChangeListener = addListener;
const styleSheet = {
    create: <T>(styles: T): T => styles,
    flatten: <T>(styles: T): T => styles,
    compose: <T>(first: T, second: T): T => second ?? first,
    hairlineWidth: 1,
};

(globalThis as any).expo = {
    EventEmitter: class {
        addListener = addListener;
        remove = removeListener;
    },
};

mock.module('react-native', () => ({
    ActivityIndicator: nativeComponent,
    Alert: { alert: () => undefined },
    Animated: {
        View: nativeComponent,
        Text: nativeComponent,
        Value: class {},
        timing: () => ({ start: () => undefined }),
        event: () => undefined,
        createAnimatedComponent: nativeComponent,
    },
    AppState: {
        currentState: 'active',
        addEventListener,
    },
    Appearance: {
        getColorScheme: () => 'light',
        addChangeListener,
    },
    Dimensions: {
        get: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
        addEventListener,
    },
    FlatList: nativeComponent,
    Image: nativeComponent,
    Keyboard: { addListener, dismiss: () => undefined },
    KeyboardAvoidingView: nativeComponent,
    LayoutAnimation: { configureNext: () => undefined },
    Linking: { openURL: async () => undefined, canOpenURL: async () => true },
    LogBox: { ignoreLogs: () => undefined },
    Modal: nativeComponent,
    NativeEventEmitter: class {
        addListener = addListener;
        removeAllListeners = removeListener;
    },
    NativeModules: { RNDeviceInfo: {} },
    PixelRatio: { get: () => 1, getFontScale: () => 1 },
    Platform: {
        OS: 'android',
        select: <T>(options: { android?: T; ios?: T; default?: T }): T | undefined => options.android ?? options.default,
    },
    Pressable: nativeComponent,
    RefreshControl: nativeComponent,
    ScrollView: nativeComponent,
    StatusBar: nativeComponent,
    StyleSheet: styleSheet,
    Switch: nativeComponent,
    Text: nativeComponent,
    TextInput: nativeComponent,
    TouchableOpacity: nativeComponent,
    TouchableWithoutFeedback: nativeComponent,
    TurboModuleRegistry: { getEnforcing: () => ({}) },
    View: nativeComponent,
    useAnimatedValue: () => ({}),
    useWindowDimensions: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
}));

mock.module('@expo/vector-icons', () => ({
    FontAwesome: nativeComponent,
    Ionicons: nativeComponent,
    MaterialCommunityIcons: nativeComponent,
    Octicons: nativeComponent,
}));

mock.module('react-native-device-info', () => ({
    getDeviceType: () => 'Handset',
}));

mock.module('react-native-mmkv', () => ({
    MMKV: class {
        getString() { return undefined; }
        set() { return undefined; }
        delete() { return undefined; }
    },
}));

mock.module('expo-crypto', () => ({
    CryptoDigestAlgorithm: { SHA512: 'SHA-512' },
    digest: async (algorithm: string, data: Uint8Array) => {
        const input = new Uint8Array(data);
        return new Uint8Array(await crypto.subtle.digest(algorithm, input));
    },
    getRandomBytes: (length: number) => crypto.getRandomValues(new Uint8Array(length)),
    getRandomBytesAsync: async (length: number) => crypto.getRandomValues(new Uint8Array(length)),
    randomUUID: () => crypto.randomUUID(),
}));

mock.module('@more-tech/react-native-libsodium', () => ({
    default: sodium,
}));

mock.module('rn-encryption', () => ({
    encryptAsyncAES: async (data: string, keyBase64: string) => {
        const keyBytes = Uint8Array.from(Buffer.from(keyBase64, 'base64'));
        const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
        const nonce = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: nonce },
            key,
            new TextEncoder().encode(data),
        ));
        const output = new Uint8Array(nonce.length + ciphertext.length);
        output.set(nonce);
        output.set(ciphertext, nonce.length);
        return Buffer.from(output).toString('base64');
    },
    decryptAsyncAES: async (encoded: string, keyBase64: string) => {
        const input = Uint8Array.from(Buffer.from(encoded, 'base64'));
        const keyBytes = Uint8Array.from(Buffer.from(keyBase64, 'base64'));
        const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
        const plaintext = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: input.slice(0, 12) },
            key,
            input.slice(12),
        );
        return new TextDecoder().decode(plaintext);
    },
}));

mock.module('expo-file-system/legacy', () => ({
    cacheDirectory: 'file:///tmp/',
    EncodingType: { Base64: 'base64', UTF8: 'utf8' },
    writeAsStringAsync: async () => undefined,
    readAsStringAsync: async () => '',
    deleteAsync: async () => undefined,
}));

mock.module('expo-image-picker', () => ({
    requestMediaLibraryPermissionsAsync: async () => ({ status: 'denied' }),
    launchImageLibraryAsync: async () => ({ canceled: true, assets: [] }),
}));

mock.module('expo-image-manipulator', () => ({
    SaveFormat: { JPEG: 'jpeg' },
    manipulateAsync: async (uri: string) => ({ uri, width: 0, height: 0 }),
}));

mock.module('expo-router', () => ({
    router: { push: () => undefined, replace: () => undefined, back: () => undefined },
    useRouter: () => ({ push: () => undefined, replace: () => undefined, back: () => undefined }),
    useNavigation: () => ({}),
    useLocalSearchParams: () => ({}),
    useGlobalSearchParams: () => ({}),
    Stack: { Screen: nativeComponent },
    Tabs: { Screen: nativeComponent },
    Slot: nativeComponent,
}));

mock.module('expo-localization', () => ({
    getLocales: () => [{ languageTag: 'en-US', languageCode: 'en', textDirection: 'ltr' }],
    getCalendars: () => [],
}));

mock.module('expo-constants', () => ({
    default: { expoConfig: {}, manifest: {}, platform: {} },
}));

mock.module('expo-application', () => ({
    applicationName: 'Lyntty',
    nativeApplicationVersion: '0.0.0',
    nativeBuildVersion: '0',
}));

mock.module('expo-device', () => ({
    deviceName: 'Test Device',
    modelName: 'Test Model',
    osName: 'Android',
    osVersion: 'Test',
    deviceType: 1,
}));

mock.module('expo-notifications', () => ({
    addNotificationReceivedListener: addListener,
    addNotificationResponseReceivedListener: addListener,
    getPermissionsAsync: async () => ({ status: 'denied' }),
    requestPermissionsAsync: async () => ({ status: 'denied' }),
    setNotificationHandler: () => undefined,
}));

mock.module('expo-secure-store', () => ({
    getItemAsync: async () => null,
    setItemAsync: async () => undefined,
    deleteItemAsync: async () => undefined,
}));

mock.module('react-native-safe-area-context', () => ({
    SafeAreaProvider: nativeComponent,
    SafeAreaView: nativeComponent,
    initialWindowMetrics: null,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

mock.module('react-native-unistyles', () => ({
    StyleSheet: styleSheet,
    UnistylesRuntime: {},
    useUnistyles: () => ({ theme: {}, rt: {} }),
}));
