export interface UserUpdatePayload {
  userId: number
  clicks: number
  energy?: number
  level?: number | null
  clickLevel?: number | null
  energyLevel?: number | null
}

export interface ErrorResponse {
  message: string
}
