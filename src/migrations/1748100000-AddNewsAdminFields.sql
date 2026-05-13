ALTER TABLE "news"
  ADD COLUMN IF NOT EXISTS "preview_image" varchar NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "category" varchar(255) NOT NULL DEFAULT 'General';

UPDATE "news" SET "preview_image" = '' WHERE "preview_image" IS NULL;
UPDATE "news" SET "category" = 'General' WHERE "category" IS NULL;

ALTER TABLE "news" ALTER COLUMN "preview_image" SET NOT NULL;
ALTER TABLE "news" ALTER COLUMN "category" SET NOT NULL;

ALTER TABLE "news" ALTER COLUMN "preview_image" DROP DEFAULT;
ALTER TABLE "news" ALTER COLUMN "category" DROP DEFAULT;
