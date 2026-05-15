import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm'

export class CreateAdminSecurityEvents1748300000 implements MigrationInterface {
  name = 'CreateAdminSecurityEvents1748300000'

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('admin_security_events')) {
      return
    }

    await queryRunner.createTable(
      new Table({
        name: 'admin_security_events',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          { name: 'admin_id', type: 'uuid', isNullable: true },
          { name: 'admin_email', type: 'varchar', length: '254', isNullable: true },
          { name: 'type', type: 'varchar', length: '64', isNullable: false },
          { name: 'ip_address', type: 'varchar', length: '45', isNullable: true },
          { name: 'user_agent', type: 'varchar', length: '500', isNullable: true },
          { name: 'metadata', type: 'jsonb', default: `'{}'::jsonb`, isNullable: false },
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
      'admin_security_events',
      new TableIndex({ name: 'IDX_admin_security_events_admin_id', columnNames: ['admin_id'] }),
    )
    await queryRunner.createIndex(
      'admin_security_events',
      new TableIndex({ name: 'IDX_admin_security_events_type', columnNames: ['type'] }),
    )
    await queryRunner.createIndex(
      'admin_security_events',
      new TableIndex({ name: 'IDX_admin_security_events_created_at', columnNames: ['created_at'] }),
    )
    await queryRunner.createForeignKey(
      'admin_security_events',
      new TableForeignKey({
        name: 'FK_admin_security_events_admin',
        columnNames: ['admin_id'],
        referencedTableName: 'admins',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('admin_security_events', true)
  }
}
