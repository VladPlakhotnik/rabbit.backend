import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { StripeService } from './stripe.service'

@Controller('payment')
export class PaymentController {
  constructor(private stripeService: StripeService) {}

  @Post('create-payment-intent')
  async createPaymentIntent(@Body() body: any) {
    const { amount, paymentMethod } = body
    const stripe = this.stripeService.getStripeInstance()

    try {
      const paymentMethodTypes = []

      if (paymentMethod === 'card') {
        paymentMethodTypes.push('card')
      } else if (paymentMethod === 'google_pay') {
        paymentMethodTypes.push('card') // Google Pay обрабатывается как card
      } else if (paymentMethod === 'apple_pay') {
        paymentMethodTypes.push('card') // Apple Pay также как card
      } else {
        throw new HttpException(
          'Unsupported payment method',
          HttpStatus.BAD_REQUEST,
        )
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100, // сумма в центах
        currency: 'usd',
        payment_method_types: paymentMethodTypes,
      })

      return { clientSecret: paymentIntent.client_secret }
    } catch (error) {
      throw new HttpException(error as string, HttpStatus.BAD_REQUEST)
    }
  }
}
