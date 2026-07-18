const { execFileSync } = require('node:child_process');
const packageJson = require('./package.json');

const variant = process.env.APP_ENV || 'development';
const variants = new Set(['development', 'preview', 'production']);
if (!variants.has(variant)) {
    throw new Error(`APP_ENV must be development, preview, or production; got ${variant}`);
}
const name = {
    development: "Lyntty (dev)",
    preview: "Lyntty (preview)",
    production: "Lyntty"
}[variant];
const bundleId = {
    development: "dev.jczhang.lyntty.dev",
    preview: "dev.jczhang.lyntty.preview",
    production: "dev.jczhang.lyntty"
}[variant];
const consoleLoggingDefault = {
    development: true,
    preview: true,
    production: false,
}[variant];
const releaseExpoProjectId = process.env.LYNTTY_EXPO_PROJECT_ID;
const expoProjectId = releaseExpoProjectId
    || (variant === 'production' ? undefined : process.env.EXPO_PUBLIC_PROJECT_ID);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (variant === 'production' && (!expoProjectId || !uuidPattern.test(expoProjectId))) {
    throw new Error('Production builds require LYNTTY_EXPO_PROJECT_ID as a UUID');
}

function git(args) {
    try {
        return execFileSync('git', args, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim() || undefined;
    } catch {
        return undefined;
    }
}

function loadBuildMetadata() {
    const commitSha =
        process.env.LYNTTY_BUILD_COMMIT_SHA ||
        process.env.GITHUB_SHA ||
        git(['rev-parse', 'HEAD']);
    const commitTimestamp =
        process.env.LYNTTY_BUILD_COMMIT_TIMESTAMP ||
        (commitSha
            ? git(['show', '-s', '--format=%cI', commitSha])
            : git(['show', '-s', '--format=%cI', 'HEAD']));

    return {
        commitSha,
        commitTimestamp,
    };
}

const buildMetadata = loadBuildMetadata();

export default {
    expo: {
        name,
        slug: "lyntty",
        platforms: ["android", "ios"],
        version: packageJson.version,
        orientation: "default",
        icon: "./sources/assets/images/icon.png",
        scheme: "lyntty",
        userInterfaceStyle: "automatic",
        ios: {
            supportsTablet: true,
            bundleIdentifier: bundleId,
            config: {
                usesNonExemptEncryption: false
            },
            infoPlist: {
                NSLocalNetworkUsageDescription: "Allow $(PRODUCT_NAME) to find and connect to local devices on your network.",
                NSBonjourServices: ["_http._tcp", "_https._tcp"],
                // ATS:
                // - NSAllowsLocalNetworking: lets HTTP fetches reach LAN
                //   addresses (e.g. self-hosted server at 192.168.x.y) without
                //   forcing TLS. Production cloud server is HTTPS, so the
                //   default policy still applies there.
                // - In dev/preview only, allow arbitrary HTTP loads so a
                //   developer pointing the app at their machine doesn't have
                //   to ship a TLS cert just to test attachment uploads.
                NSAppTransportSecurity: variant === 'production'
                    ? { NSAllowsLocalNetworking: true }
                    : { NSAllowsLocalNetworking: true, NSAllowsArbitraryLoads: true }
            },
            associatedDomains: variant === 'production' ? ["applinks:app.lyntty.engineering"] : []
        },
        android: {
            adaptiveIcon: {
                foregroundImage: "./sources/assets/images/icon-adaptive.png",
                monochromeImage: "./sources/assets/images/icon-monochrome.png",
                backgroundColor: "#0B1020"
            },
            permissions: [
                "android.permission.ACCESS_NETWORK_STATE",
                "android.permission.POST_NOTIFICATIONS",
                "android.permission.REQUEST_INSTALL_PACKAGES",
            ],
            blockedPermissions: [
                "android.permission.ACTIVITY_RECOGNITION",
                "android.permission.RECORD_AUDIO",
                "android.permission.USE_BIOMETRIC",
                "android.permission.USE_FINGERPRINT",
                // Not using external storage/media access for now — blocks Google Play photo/video permission declaration
                "android.permission.READ_EXTERNAL_STORAGE",
                "android.permission.WRITE_EXTERNAL_STORAGE",
                "android.permission.READ_MEDIA_IMAGES",
                "android.permission.READ_MEDIA_VIDEO",
            ],
            package: bundleId,
            googleServicesFile: "./google-services.json",
            softwareKeyboardLayoutMode: "resize",
            usesCleartextTraffic: variant !== 'production',
            intentFilters: variant === 'production' ? [
                {
                    "action": "VIEW",
                    "autoVerify": true,
                    "data": [
                        {
                            "scheme": "https",
                            "host": "app.lyntty.engineering",
                            "pathPrefix": "/"
                        }
                    ],
                    "category": ["BROWSABLE", "DEFAULT"]
                }
            ] : []
        },
        plugins: [
            require("./plugins/withEinkCompatibility.js"),
            [
                "expo-router",
                {
                    root: "./sources/app"
                }
            ],
            "expo-asset",
            "expo-localization",
            "expo-secure-store",
            "@more-tech/react-native-libsodium",
            [
                "expo-camera",
                {
                    cameraPermission: "Allow $(PRODUCT_NAME) to access your camera to scan pairing QR codes.",
                    recordAudioAndroid: false
                }
            ],
            [
                "expo-notifications",
                {
                    "enableBackgroundRemoteNotifications": true,
                    "icon": "./sources/assets/images/icon-notification.png"
                }
            ],
            [
                'expo-splash-screen',
                {
                    ios: {
                        backgroundColor: "#F2F2F7",
                        dark: {
                            backgroundColor: "#1C1C1E",
                        }
                    },
                    android: {
                        image: "./sources/assets/images/splash-android-light.png",
                        backgroundColor: "#F5F5F5",
                        dark: {
                            image: "./sources/assets/images/splash-android-dark.png",
                            backgroundColor: "#1e1e1e",
                        }
                    }
                }
            ]
        ],
        experiments: {
            typedRoutes: true
        },
        extra: {
            router: {
                root: "./sources/app"
            },
            app: {
                consoleLoggingDefault,
                appEnv: variant,
                releaseChannel: variant === 'production' ? 'stable' : variant,
                expoProjectId,
                buildCommitSha: buildMetadata.commitSha,
                buildCommitTimestamp: buildMetadata.commitTimestamp,
            }
        }
    }
};
