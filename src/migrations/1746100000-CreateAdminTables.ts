import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm'

// Creates the admin panel staff tables. Owns:
//   - admins                : staff accounts (separate from `users`)
//   - admin_refresh_tokens  : hashed refresh-token storage with rotation tracking
//   - admin_role enum       : super_admin / admin / manager / viewer
//
// Naming prefix `admin-` to keep timestamp coordination clear with the
// clicker-agent's migrations (which use the `clicker-` prefix).
export class CreateAdminTables1746100000 implements MigrationInterface {
  name = 'CreateAdminTables1746100000'

  async up(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL needs the enum type defined separately for TypeORM's
    // Table builder to reference it.
    await queryRunner.query(
      `CREATE TYPE "admin_role" AS ENUM ('super_admin', 'admin', 'manager', 'viewer')`,
    )

    await queryRunner.createTable(
      new Table({
        name: 'admins',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          { name: 'email', type: 'varchar', length: '254', isNullable: false },
          { name: 'password_hash', type: 'varchar', length: '100', isNullable: false },
          { name: 'first_name', type: 'varchar', length: '100', isNullable: false },
          { name: 'last_name', type: 'varchar', length: '100', isNullable: false },
          { name: 'role', type: 'admin_role', default: `'manager'`, isNullable: false },
          { name: 'is_active', type: 'boolean', default: true, isNullable: false },
          { name: 'failed_login_attempts', type: 'int', default: 0, isNullable: false },
          { name: 'locked_until', type: 'timestamptz', isNullable: true },
          { name: 'last_login_at', type: 'timestamptz', isNullable: true },
          { name: 'last_login_ip', type: 'varchar', length: '45', isNullable: true },
          { name: 'created_by_id', type: 'uuid', isNullable: true },
          { name: 'totp_secret', type: 'varchar', length: '64', isNullable: true },
          { name: 'totp_enabled', type: 'boolean', default: false, isNullable: false },
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
      'admins',
      new TableIndex({ name: 'IDX_admins_email_unique', columnNames: ['email'], isUnique: true }),
    )

    // Self-referencing FK — created_by_id → admins.id. ON DELETE SET NULL
    // so killing an admin doesn't cascade-remove every record they ever
    // created.
    await queryRunner.createForeignKey(
      'admins',
      new TableForeignKey({
        name: 'FK_admins_created_by',
        columnNames: ['created_by_id'],
        referencedTableName: 'admins',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    )

    await queryRunner.createTable(
      new Table({
        name: 'admin_refresh_tokens',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          { name: 'admin_id', type: 'uuid', isNullable: false },
          { name: 'token_hash', type: 'varchar', length: '100', isNullable: false },
          { name: 'expires_at', type: 'timestamptz', isNullable: false },
          { name: 'used_at', type: 'timestamptz', isNullable: true },
          { name: 'revoked_at', type: 'timestamptz', isNullable: true },
          { name: 'ip_address', type: 'varchar', length: '45', isNullable: true },
          { name: 'user_agent', type: 'varchar', length: '500', isNullable: true },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    )

    await queryRunner.createIndex(
      'admin_refresh_tokens',
      new TableIndex({ name: 'IDX_admin_refresh_tokens_admin_id', columnNames: ['admin_id'] }),
    )
    await queryRunner.createIndex(
      'admin_refresh_tokens',
      new TableIndex({ name: 'IDX_admin_refresh_tokens_expires_at', columnNames: ['expires_at'] }),
    )

    await queryRunner.createForeignKey(
      'admin_refresh_tokens',
      new TableForeignKey({
        name: 'FK_admin_refresh_tokens_admin',
        columnNames: ['admin_id'],
        referencedTableName: 'admins',
        referencedColumnNames: ['id'],
        // Removing an admin removes their sessions too.
        onDelete: 'CASCADE',
      }),
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('admin_refresh_tokens', true)
    await queryRunner.dropTable('admins', true)
    await queryRunner.query(`DROP TYPE IF EXISTS "admin_role"`)
  }
}
