import {
  Controller,
  Post,
  Body,
  Res,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { Response } from 'express'
import Stripe from 'stripe'

const stripe = new Stripe(
  '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',
  {
    apiVersion: '2024-11-20.acacia', // Match your account's API version
  },
)

@Controller('payment')
export class PaymentController {
  @Post('create-payment-intent')
  async createPaymentIntent(@Body() body: any, @Res() res: Response) {
    const { amount, paymentMethod } = body

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

      return res.status(200).send({
        clientSecret: paymentIntent.client_secret,
      })
    } catch (error) {
      return res.status(400).send({ error })
    }
  }
}
