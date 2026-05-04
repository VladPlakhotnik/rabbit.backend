import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm'

// Game-user refresh-token store with the same rotation + reuse-detection
// model as admin_refresh_tokens. Until this lands, game refresh tokens
// were stateless JWTs — there was no way to revoke them, no rotation,
// and no detection of theft. Mirrors the admin schema deliberately so
// the two flows can share verification logic if we ever ship the auth
// shared package.
export class CreateUserRefreshTokens1746300000 implements MigrationInterface {
  name = 'CreateUserRefreshTokens1746300000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'user_refresh_tokens',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          // FK to users.id which is an int PK.
          { name: 'user_id', type: 'int', isNullable: false },
          // bcrypt(jti). The token's `jti` claim is the lookup key —
          // we walk active rows for the user and bcrypt-compare each.
          // Storing the hash, not the token, keeps a DB leak from
          // yielding live sessions.
          { name: 'token_hash', type: 'varchar', length: '100', isNullable: false },
          { name: 'expires_at', type: 'timestamptz', isNullable: false },
          // Set when consumed by /auth/refresh. Presenting a token
          // whose used_at is non-null is a reuse-attack signal —
          // AuthService responds by revoking every active row for the
          // user.
          { name: 'used_at', type: 'timestamptz', isNullable: true },
          // Set on logout, password change, or reuse-attack response.
          // Distinct from used_at — used = consumed legitimately,
          // revoked = killed.
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
      'user_refresh_tokens',
      new TableIndex({ name: 'IDX_user_refresh_tokens_user_id', columnNames: ['user_id'] }),
    )
    await queryRunner.createIndex(
      'user_refresh_tokens',
      new TableIndex({ name: 'IDX_user_refresh_tokens_expires_at', columnNames: ['expires_at'] }),
    )

    await queryRunner.createForeignKey(
      'user_refresh_tokens',
      new TableForeignKey({
        name: 'FK_user_refresh_tokens_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        // Removing a user removes their sessions too — refresh rows
        // would otherwise be orphaned.
        onDelete: 'CASCADE',
      }),
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('user_refresh_tokens', true)
  }
}
