// DI tokens for ioredis clients.
// Two separate clients are required: a Redis connection in subscribe mode
// cannot execute regular commands, so pub/sub needs its own connection.
// REDIS_CLIENT handles all commands (including PUBLISH).
// REDIS_SUBSCRIBER is used only for SUBSCRIBE/UNSUBSCRIBE.
export const REDIS_CLIENT = 'REDIS_CLIENT'
export const REDIS_SUBSCRIBER = 'REDIS_SUBSCRIBER'
