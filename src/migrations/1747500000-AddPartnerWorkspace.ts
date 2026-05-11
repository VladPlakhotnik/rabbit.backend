import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddPartnerWorkspace1747500000 implements MigrationInterface {
  name = 'AddPartnerWorkspace1747500000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "referral_campaign_id" int,
        ADD COLUMN IF NOT EXISTS "referral_source" varchar(64),
        ADD COLUMN IF NOT EXISTS "referral_sub_id" varchar(64);

      CREATE TABLE IF NOT EXISTS "partner_campaigns" (
        "id" serial PRIMARY KEY,
        "user_id" int NOT NULL,
        "name" varchar(64) NOT NULL,
        "slug" varchar(64) NOT NULL,
        "landing_path" varchar(128) NOT NULL DEFAULT '/',
        "source" varchar(64),
        "sub_id" varchar(64),
        "status" varchar(16) NOT NULL DEFAULT 'ACTIVE',
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_partner_campaigns_user_slug_unique"
        ON "partner_campaigns" ("user_id", "slug");

      CREATE INDEX IF NOT EXISTS "IDX_partner_campaigns_user_status"
        ON "partner_campaigns" ("user_id", "status");

      CREATE TABLE IF NOT EXISTS "partner_campaign_daily_stats" (
        "id" serial PRIMARY KEY,
        "partner_user_id" int NOT NULL,
        "campaign_id" int NOT NULL,
        "day" date NOT NULL,
        "impressions" int NOT NULL DEFAULT 0,
        "unique_impressions" int NOT NULL DEFAULT 0,
        "payable_impressions" int NOT NULL DEFAULT 0,
        "registrations" int NOT NULL DEFAULT 0,
        "referral_deposit_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "cpm_estimated_amount" numeric(12,4) NOT NULL DEFAULT 0,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_partner_campaign_daily_stats_campaign_day_unique"
        ON "partner_campaign_daily_stats" ("partner_user_id", "campaign_id", "day");

      CREATE TABLE IF NOT EXISTS "partner_commission_ledger" (
        "id" serial PRIMARY KEY,
        "partner_user_id" int NOT NULL,
        "campaign_id" int,
        "type" varchar(24) NOT NULL,
        "status" varchar(24) NOT NULL,
        "amount" numeric(12,4) NOT NULL DEFAULT 0,
        "reference" varchar(128),
        "description" text,
        "metadata" jsonb,
        "created_at" timestamp NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS "IDX_partner_commission_ledger_partner_created"
        ON "partner_commission_ledger" ("partner_user_id", "created_at");

      CREATE TABLE IF NOT EXISTS "partner_postback_settings" (
        "id" serial PRIMARY KEY,
        "user_id" int NOT NULL,
        "enabled" boolean NOT NULL DEFAULT false,
        "postback_url" varchar(512),
        "secret" varchar(64) NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_partner_postback_settings_user_unique"
        ON "partner_postback_settings" ("user_id");

      ALTER TABLE "partner_cpm_daily_stats"
        ADD COLUMN IF NOT EXISTS "campaign_id" int,
        ADD COLUMN IF NOT EXISTS "source" varchar(64),
        ADD COLUMN IF NOT EXISTS "sub_id" varchar(64);

      ALTER TABLE "partner_cpm_visitors"
        ADD COLUMN IF NOT EXISTS "campaign_id" int,
        ADD COLUMN IF NOT EXISTS "sub_id" varchar(64);

      CREATE INDEX IF NOT EXISTS "IDX_partner_cpm_visitors_campaign_day"
        ON "partner_cpm_visitors" ("campaign_id", "day");
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "partner_postback_settings";
      DROP TABLE IF EXISTS "partner_commission_ledger";
      DROP TABLE IF EXISTS "partner_campaign_daily_stats";
      DROP TABLE IF EXISTS "partner_campaigns";
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "referral_campaign_id",
        DROP COLUMN IF EXISTS "referral_source",
        DROP COLUMN IF EXISTS "referral_sub_id";
      ALTER TABLE "partner_cpm_daily_stats"
        DROP COLUMN IF EXISTS "campaign_id",
        DROP COLUMN IF EXISTS "source",
        DROP COLUMN IF EXISTS "sub_id";
      ALTER TABLE "partner_cpm_visitors"
        DROP COLUMN IF EXISTS "campaign_id",
        DROP COLUMN IF EXISTS "sub_id";
    `)
  }
}
