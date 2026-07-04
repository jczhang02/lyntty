ALTER TABLE "TerminalAuthRequest" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "TerminalAuthRequest" ADD COLUMN "consumedAt" TIMESTAMP(3);
ALTER TABLE "AccountAuthRequest" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "AccountAuthRequest" ADD COLUMN "consumedAt" TIMESTAMP(3);
