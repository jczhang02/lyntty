import { PrismaPg } from "@prisma/adapter-pg";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient } from "@/generated/prisma/client";
import { createPGlite } from "@/storage/pgliteLoader";
import { resolveDatabaseProvider } from "@/storage/databaseProvider";

let pgliteInstance: PGlite | null = null;
let closePromise: Promise<void> | null = null;

function createClient(): PrismaClient {
    const provider = resolveDatabaseProvider();

    if (provider === "pglite") {
        const pgliteDir = process.env.PGLITE_DIR
            ?? (process.env.NODE_ENV === "test" ? "memory://" : "./data/pglite");
        pgliteInstance = createPGlite(pgliteDir);
        return new PrismaClient({ adapter: new PrismaPGlite(pgliteInstance) });
    }

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("DATABASE_URL is required when DB_PROVIDER=postgres");
    }
    return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const db = createClient();

export function getPGlite(): PGlite | null {
    return pgliteInstance;
}

export function closeDatabase(): Promise<void> {
    if (closePromise) {
        return closePromise;
    }

    closePromise = (async () => {
        const embeddedDatabase = pgliteInstance;
        pgliteInstance = null;
        try {
            await db.$disconnect();
        } finally {
            if (embeddedDatabase) {
                await embeddedDatabase.close();
            }
        }
    })();
    return closePromise;
}
