const { existsSync, readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { spawnSync } = require('node:child_process')

const projectRoot = resolve(__dirname, '..')
const dumpPath = resolve(
  projectRoot,
  process.env.LOCAL_DB_DUMP_PATH || 'latest.dump',
)

// latest.dump was created on 2026-04-30. These are the SQL migrations added
// after that snapshot, in commit order. SQL twins of TypeORM migrations are
// used so setup needs only Docker and Node, not a working app connection.
const postDumpMigrations = [
  'migrations/add_clicker_case_to_game_type_enum.sql',
  'migrations/add_notifications_i18n.sql',
  'migrations/clicker_cases_add_is_available.sql',
  'migrations/clicker_cases_extend_and_seed.sql',
  'migrations/clicker_cases_game_type_and_limits.sql',
  'migrations/clicker_levels_refactor_and_seed.sql',
  'scripts/local-db/prepare-oauth-unique-indexes.sql',
  'migrations/users_unique_indexes_for_oauth_ids.sql',
  'scripts/local-db/prepare-case-seeds.sql',
  'migrations/revolution_case_seed.sql',
  'migrations/shadow_case_seed.sql',
  'migrations/cases_add_is_available.sql',
  'migrations/clicker_history_audit_log.sql',
  'migrations/clicker_skill_levels_seed.sql',
  'migrations/clicker_boosts_seed.sql',
  'migrations/clicker_autoclicker_bank_model.sql',
  'migrations/clicker_energy_level_per_level_regen.sql',
  'migrations/clicker_user_total_points.sql',
  'src/migrations/1746100000-CreateAdminTables.sql',
  'src/migrations/1746200000-RenameUserRoles.sql',
  'src/migrations/1746300000-CreateUserRefreshTokens.sql',
  'migrations/clicker_active_challenges.sql',
  'src/migrations/1746400000-CreatePartnerLevels.sql',
  'src/migrations/1746500000-CreateMinesSessions.sql',
  'src/migrations/1746600000-CreateCrashAutoBets.sql',
  'src/migrations/1746700000-CreateBotProfiles.sql',
  'src/migrations/1746800000-CreateCrashSessions.sql',
  'src/migrations/1746900000-AddVipQualifyingVolume.sql',
  'src/migrations/1747000000-AddVipXpLedger.sql',
  'src/migrations/1747100000-AddVipRewardClaims.sql',
  'migrations/bonus_wheel_carrots_rewards.sql',
  'src/migrations/1747200000-CreateEarnVaultPositions.sql',
  'src/migrations/1747300000-AddDiscordSubscriptionBonus.sql',
  'src/migrations/1747400000-AddPartnerCpmModel.sql',
  'src/migrations/1747500000-AddPartnerWorkspace.sql',
  'src/migrations/1747600000-AddPartnerPostbackLogs.sql',
  'src/migrations/1747700000-RemoveBonusWheelCashbackRewards.sql',
  'src/migrations/1747800000-AddSteamProfileBonusState.sql',
  'migrations/add_giveaway_tiers_and_user_deposits.sql',
  'migrations/add_user_deposit_status_fields.sql',
  'src/migrations/1747900000-DropUserRank.sql',
  'src/migrations/1748000000-RelaxNotificationUserId.sql',
  'src/migrations/1748100000-AddNewsAdminFields.sql',
  'src/migrations/1748200000-AddInvestorAdminRole.sql',
  'src/migrations/1748300000-CreateAdminSecurityEvents.sql',
  'src/migrations/1748400000-AddAdminAvatarUrl.sql',
  'src/migrations/1748500000-AddUserBlocking.sql',
  'src/migrations/1748600000-AddUserCountry.sql',
  'src/migrations/1748700000-AddSkinsbackDeposits.sql',
]

function runDocker(args, input) {
  const result = spawnSync('docker', args, {
    cwd: projectRoot,
    input,
    stdio: input ? ['pipe', 'inherit', 'inherit'] : 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

if (!existsSync(dumpPath)) {
  console.error(`Database dump not found: ${dumpPath}`)
  console.error(
    'Put the custom-format dump at latest.dump or set LOCAL_DB_DUMP_PATH.',
  )
  process.exit(1)
}

for (const migration of postDumpMigrations) {
  const migrationPath = resolve(projectRoot, migration)
  if (!existsSync(migrationPath)) {
    console.error(`Migration not found: ${migrationPath}`)
    process.exit(1)
  }
}

console.log('Starting local PostgreSQL and Redis...')
runDocker(['compose', 'up', '-d', '--wait', 'postgres', 'redis'])

console.log('Recreating the local bunny database...')
runDocker([
  'compose',
  'exec',
  '-T',
  'postgres',
  'dropdb',
  '--username=bunny',
  '--force',
  '--if-exists',
  'bunny',
])
runDocker([
  'compose',
  'exec',
  '-T',
  'postgres',
  'createdb',
  '--username=bunny',
  'bunny',
])

console.log(`Restoring ${dumpPath}...`)
runDocker(
  [
    'compose',
    'exec',
    '-T',
    'postgres',
    'pg_restore',
    '--username=bunny',
    '--dbname=bunny',
    '--no-owner',
    '--no-privileges',
    '--exit-on-error',
  ],
  readFileSync(dumpPath),
)

for (const [index, migration] of postDumpMigrations.entries()) {
  console.log(
    `[${index + 1}/${postDumpMigrations.length}] Applying ${migration}`,
  )
  runDocker(
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '--username=bunny',
      '--dbname=bunny',
      '--set=ON_ERROR_STOP=1',
    ],
    readFileSync(resolve(projectRoot, migration)),
  )
}

console.log('Local database is ready.')
console.log('Start the API with: yarn dev:local')
