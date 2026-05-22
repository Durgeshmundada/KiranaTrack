import Razorpay from 'razorpay';

import { env } from '../config/env';
import { HttpError } from '../utils/http';

type RazorpayPaymentLink = {
  id: string;
  short_url: string;
  status: string;
};

let razorpayClient: Razorpay | null = null;

const requireRazorpayEnv = (): {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
} => {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || !env.RAZORPAY_WEBHOOK_SECRET) {
    throw new HttpError(503, 'Razorpay is not configured');
  }

  return {
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
  };
};

export const getRazorpayWebhookSecret = (): string => requireRazorpayEnv().webhookSecret;

const getRazorpayClient = (): Razorpay => {
  if (razorpayClient) {
    return razorpayClient;
  }

  const { keyId, keySecret } = requireRazorpayEnv();
  razorpayClient = new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
  return razorpayClient;
};

export const createRazorpayPaymentLink = async (params: {
  customerName: string;
  customerPhone: string;
  amountPaise: number;
  referenceId: string;
  ownerUserId: string;
  customerId: string;
}): Promise<RazorpayPaymentLink> => {
  const client = getRazorpayClient();

  return client.paymentLink.create({
    amount: params.amountPaise,
    currency: 'INR',
    accept_partial: false,
    reference_id: params.referenceId,
    description: `KiranaTrack udhaar payment for ${params.customerName}`,
    customer: {
      name: params.customerName,
      contact: params.customerPhone,
    },
    notify: {
      sms: false,
      email: false,
      whatsapp: false,
    },
    reminder_enable: true,
    notes: {
      source: 'kiranatrack_udhaar',
      ownerUserId: params.ownerUserId,
      customerId: params.customerId,
      amountPaise: params.amountPaise,
    },
  });
};
