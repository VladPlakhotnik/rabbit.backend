const isEnabled = (name: string): boolean => process.env[name] === 'true'

export const areBackgroundJobsDisabled = (): boolean =>
  isEnabled('DISABLE_BACKGROUND_JOBS')

export const areScheduledJobsDisabled = (): boolean =>
  areBackgroundJobsDisabled() || isEnabled('DISABLE_SCHEDULED_JOBS')

export const areBotsDisabled = (): boolean =>
  areBackgroundJobsDisabled() || isEnabled('DISABLE_BOTS')
