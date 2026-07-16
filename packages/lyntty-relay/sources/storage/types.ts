import { ImageRef as ImageRefType } from "./files";
import type { SessionMessageContent as WireSessionMessageContent } from "lyntty-wire";

// Persisted JSON compatibility only. The corresponding product integrations
// are inactive; these shapes remain until the database contract window closes.
type LegacyGitHubProfile = {
    id: number;
    login: string;
    type: string;
    site_admin: boolean;
    avatar_url: string;
    gravatar_id: string | null;
    name: string | null;
    company: string | null;
    blog: string | null;
    location: string | null;
    email: string | null;
    hireable: boolean | null;
    bio: string | null;
    twitter_username: string | null;
    public_repos: number;
    public_gists: number;
    followers: number;
    following: number;
    created_at: string;
    updated_at: string;
    private_gists?: number;
    total_private_repos?: number;
    owned_private_repos?: number;
    disk_usage?: number;
    collaborators?: number;
    two_factor_authentication?: boolean;
    plan?: {
        collaborators: number;
        name: string;
        space: number;
        private_repos: number;
    };
};

type LegacyGitHubOrg = Record<string, never>;

declare global {
    namespace PrismaJson {
        // Session message content types
        type SessionMessageContent = WireSessionMessageContent;

        // Usage report data structure
        type UsageReportData = {
            tokens: {
                total: number;
                [key: string]: number;
            };
            cost: {
                total: number;
                [key: string]: number;
            };
        };

        // Update content types
        type UpdateBody = {
            t: 'new-message';
            sid: string;
            message: {
                id: string;
                seq: number;
                content: SessionMessageContent;
                localId: string | null;
                createdAt: number;
                updatedAt: number;
            }
        } | {
            t: 'new-session';
            id: string;
            seq: number;
            metadata: string;
            metadataVersion: number;
            agentState: string | null;
            agentStateVersion: number;
            dataEncryptionKey: string | null;
            active: boolean;
            activeAt: number;
            createdAt: number;
            updatedAt: number;
        } | {
            t: 'update-session'
            id: string;
            metadata?: {
                value: string | null;
                version: number;
            } | null | undefined
            agentState?: {
                value: string | null;
                version: number;
            } | null | undefined
        } | {
            t: 'update-account';
            id: string;
            settings?: {
                value: string | null;
                version: number;
            } | null | undefined;
            github?: LegacyGitHubProfile | null | undefined;
        } | {
            t: 'new-machine';
            machineId: string;
            seq: number;
            metadata: string;
            metadataVersion: number;
            daemonState: string | null;
            daemonStateVersion: number;
            dataEncryptionKey: string | null;
            active: boolean;
            activeAt: number;
            createdAt: number;
            updatedAt: number;
        } | {
            t: 'update-machine';
            machineId: string;
            metadata?: {
                value: string;
                version: number;
            };
            daemonState?: {
                value: string;
                version: number;
            };
            activeAt?: number;
        };

        type GitHubProfile = LegacyGitHubProfile;
        type GitHubOrg = LegacyGitHubOrg;
        type ImageRef = ImageRefType;
    }
}

// The file MUST be a module!
export { };
