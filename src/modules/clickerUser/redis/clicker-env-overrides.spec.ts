import assert from 'node:assert/strict'
import { readAutoClickerMaxIdleSecOverride } from './clicker-env-overrides'

assert.equal(
  readAutoClickerMaxIdleSecOverride({
    NODE_ENV: 'development',
    CLICKER_ENABLE_LOCAL_AUTO_CLICKER_OVERRIDE: 'true',
    CLICKER_AUTO_CLICKER_MAX_IDLE_SEC: '120',
  }),
  120,
)

assert.equal(
  readAutoClickerMaxIdleSecOverride({
    NODE_ENV: 'development',
    CLICKER_AUTO_CLICKER_MAX_IDLE_SEC: '120',
  }),
  0,
)

assert.equal(
  readAutoClickerMaxIdleSecOverride({
    NODE_ENV: 'production',
    CLICKER_ENABLE_LOCAL_AUTO_CLICKER_OVERRIDE: 'true',
    CLICKER_AUTO_CLICKER_MAX_IDLE_SEC: '120',
  }),
  0,
)

assert.equal(
  readAutoClickerMaxIdleSecOverride({
    NODE_ENV: 'development',
    CLICKER_ENABLE_LOCAL_AUTO_CLICKER_OVERRIDE: 'true',
    CLICKER_AUTO_CLICKER_MAX_IDLE_SEC: '',
  }),
  0,
)

assert.equal(
  readAutoClickerMaxIdleSecOverride({
    NODE_ENV: 'development',
    CLICKER_ENABLE_LOCAL_AUTO_CLICKER_OVERRIDE: 'true',
    CLICKER_AUTO_CLICKER_MAX_IDLE_SEC: '-5',
  }),
  0,
)

console.log('clicker-env-overrides.spec.ts passed')
