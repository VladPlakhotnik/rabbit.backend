import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm'

// Owns the `partner_levels` lookup table — admin-editable rate card for
// the partnership program. Until this lands the rates and thresholds
// were duplicated as a hardcoded `PARTNERSHIP_LEVELS` array on the
// frontend, which meant any tweak required a code deploy and a manual
// re-sync between front and back.
//
// Levels 1..5 = Bronze..Diamond. Seeded with the values that were
// previously hardcoded on the frontend so behaviour is identical on
// first deploy. Admins (or operations) tweak rows from the admin panel
// once that lands; level rows are looked up by `level` PK.
//
// Decimal precision: numeric(5,2) covers 0.01–999.99, which is enough
// for all advertised rates (0.2%–20%). Bumpable later if we ever want
// 0.001% steps.
export class CreatePartnerLevels1746400000 implements MigrationInterface {
  name = 'CreatePartnerLevels1746400000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'partner_levels',
        columns: [
          { name: 'id', type: 'serial', isPrimary: true },
          // 1..5 — corresponds to PartnerLevel enum on the backend and
          // the medal artwork keys on the frontend (bronze..diamond).
          // Unique so admin can't accidentally duplicate a row.
          { name: 'level', type: 'smallint', isNullable: false },
          // Slug matching the frontend asset key (bronze/silver/gold/
          // platinum/diamond). Frontend resolves the medal PNG by this.
          { name: 'name', type: 'varchar', length: '32', isNullable: false },
          // Cumulative deposit threshold from referrals required to
          // qualify for this level. Bronze = 0 (everyone starts here).
          {
            name: 'min_referrals_deposit',
            type: 'numeric',
            precision: 12,
            scale: 2,
            default: 0,
            isNullable: false,
          },
          // Percent of a referral's deposit credited to the partner's
          // referral_balance. Stored as a percent (0.20 = 0.20%).
          {
            name: 'your_percentage',
            type: 'numeric',
            precision: 5,
            scale: 2,
            default: 0,
            isNullable: false,
          },
          // Percent shown to the referral as their bonus when entering
          // the code (e.g. "+15% on first deposit"). Editorial copy on
          // the partner's promo materials reads from here.
          {
            name: 'referral_percentage',
            type: 'numeric',
            precision: 5,
            scale: 2,
            default: 0,
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    )

    await queryRunner.createIndex(
      'partner_levels',
      new TableIndex({
        name: 'IDX_partner_levels_level_unique',
        columnNames: ['level'],
        isUnique: true,
      }),
    )

    // Seed: same values that were previously hardcoded on the frontend.
    // Inline INSERT rather than a separate seeder to keep level metadata
    // co-located with the schema — a fresh DB always gets the rate card
    // out of the box, no extra script step.
    await queryRunner.query(`
      INSERT INTO "partner_levels"
        ("level", "name", "min_referrals_deposit", "your_percentage", "referral_percentage")
      VALUES
        (1, 'bronze',   0,      0.20, 15.00),
        (2, 'silver',   500,    0.50, 16.00),
        (3, 'gold',     1000,   1.00, 17.00),
        (4, 'platinum', 5000,   2.00, 18.00),
        (5, 'diamond',  10000,  3.00, 20.00)
      ON CONFLICT DO NOTHING;
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('partner_levels', true)
  }
}
