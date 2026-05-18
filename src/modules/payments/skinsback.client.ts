import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import { firstValueFrom } from 'rxjs'

export interface SkinsbackCreateOrderRequest {
  currency: string
  fail_url?: string
  max_amount?: number
  min_amount?: number
  order_id: string
  result_url?: string
  steam_id: string
  success_url?: string
  trade_token?: string
}

export interface SkinsbackCreateOrderResponse {
  status: 'success'
  transaction_id: number | string
  url: string
}

export interface SkinsbackOrdersRequest {
  ending: number
  start_from?: string
  starting: number
}

interface SkinsbackErrorResponse {
  code?: number | string
  error?: string
  message?: string
  status: 'error'
}

type SkinsbackApiResponse<T> = T | SkinsbackErrorResponse

@Injectable()
export class SkinsbackClient {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async createOrder(
    request: SkinsbackCreateOrderRequest,
  ): Promise<SkinsbackCreateOrderResponse> {
    return this.request<SkinsbackCreateOrderResponse>({
      method: 'create',
      ...request,
    })
  }

  async getOrderStatus(
    lookup: { order_id: string } | { transaction_id: string },
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>({
      method: 'orderstatus',
      ...lookup,
    })
  }

  async listOrders(
    request: SkinsbackOrdersRequest,
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>({
      method: 'orders',
      ...request,
    })
  }

  private async request<T>(
    params: Record<string, string | number | undefined>,
  ): Promise<T> {
    const clientId = this.configService.get<string>('SKINSBACK_CLIENT_ID')?.trim()
    const clientSecret = this.configService
      .get<string>('SKINSBACK_CLIENT_SECRET')
      ?.trim()
    const apiUrl =
      this.configService.get<string>('SKINSBACK_API_URL')?.trim() ||
      'https://skinsback.com/api.php'
    const timeout =
      Number(this.configService.get<string>('SKINSBACK_TIMEOUT_MS')) || 15_000

    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException('Skinsback is not configured')
    }

    const form = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        form.set(key, String(value))
      }
    }

    const response = await firstValueFrom(
      this.httpService.post<SkinsbackApiResponse<T>>(
        apiUrl,
        form.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-CLIENT-ID': clientId,
            'X-CLIENT-SECRET': clientSecret,
          },
          timeout,
        },
      ),
    )

    const data = response.data
    const maybeError = data as SkinsbackErrorResponse | undefined
    if (!data || maybeError?.status === 'error') {
      const error = maybeError
      const message =
        error?.message || error?.error || 'Skinsback request failed'
      throw new BadGatewayException({
        code: error?.code,
        message,
        provider: 'skinsback',
      })
    }

    return data as T
  }
}
