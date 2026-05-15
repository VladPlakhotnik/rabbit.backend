import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddAdminAvatarUrl1748400000 implements MigrationInterface {
  name = 'AddAdminAvatarUrl1748400000'

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('admins')
    if (table?.findColumnByName('avatar_url')) {
      return
    }

    await queryRunner.query('ALTER TABLE "admins" ADD COLUMN "avatar_url" text')
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('admins')
    if (!table?.findColumnByName('avatar_url')) {
      return
    }

    await queryRunner.query('ALTER TABLE "admins" DROP COLUMN "avatar_url"')
  }
}
