import { request } from './http'

export type HealthResponse = { status: string }

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health')
}
