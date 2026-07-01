-- Add account-wide auth token versioning and per-token revocation.
ALTER TABLE "Account" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "RevokedAuthToken" (
    "jti" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevokedAuthToken_pkey" PRIMARY KEY ("jti")
);

CREATE INDEX "RevokedAuthToken_accountId_idx" ON "RevokedAuthToken"("accountId");
CREATE INDEX "RevokedAuthToken_expiresAt_idx" ON "RevokedAuthToken"("expiresAt");

ALTER TABLE "RevokedAuthToken"
    ADD CONSTRAINT "RevokedAuthToken_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
