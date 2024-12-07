import { ValueTransformer } from 'typeorm'

export const numericTransformer: ValueTransformer = {
  to: (value: number) => value,
  from: (value: string) => parseFloat(value),
}
