-- B-121 (#1557): persist profile fields on the User model.
ALTER TABLE "User" ADD COLUMN "displayName" TEXT,
ADD COLUMN "avatarUrl" TEXT;

-- Backfill from the latest UPDATE_USER AdminLog entry per address (latest wins).
WITH latest AS (
    SELECT DISTINCT ON (target)
        target AS address,
        metadata->>'displayName' AS "displayName",
        metadata->>'avatarUrl' AS "avatarUrl"
    FROM "AdminLog"
    WHERE action = 'UPDATE_USER' AND target IS NOT NULL
    ORDER BY target, "createdAt" DESC
)
INSERT INTO "User" (address, "displayName", "avatarUrl", "createdAt", "updatedAt")
SELECT address, "displayName", "avatarUrl", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM latest
ON CONFLICT (address) DO UPDATE
SET "displayName" = EXCLUDED."displayName",
    "avatarUrl" = EXCLUDED."avatarUrl",
    "updatedAt" = CURRENT_TIMESTAMP;
