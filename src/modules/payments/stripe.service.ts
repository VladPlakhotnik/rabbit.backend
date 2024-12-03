// src/modules/payments/stripe.service.ts
import { Injectable } from '@nestjs/common'
import Stripe from 'stripe'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class StripeService {
  private stripe: Stripe

  constructor(private configService: ConfigService) {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY')

    if (!stripeSecretKey) {
      throw new Error(
        'STRIPE_SECRET_KEY is not defined in environment variables',
      )
    }

    this.stripe = new Stripe(stripeSecretKey)
  }

  getStripeInstance(): Stripe {
    return this.stripe
  }
}
