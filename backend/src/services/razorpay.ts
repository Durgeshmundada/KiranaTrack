import { createHmac, timingSafeEqual } from 'node:crypto';
import Razorpay from 'razorpay';

import { env } from '../config/env';
import { HttpError } from '../utils/http';

type RazorpayPaymentLink = {
  id: string;
  short_url: string;
  status: string;
};

export type RazorpaySubscriptionStatus =
  | 'created'
  | 'authenticated'
  | 'active'
  | 'pending'
  | 'halted'
  | 'cancelled'
  | 'completed'
  | 'expired'
  | 'paused'
  | 'resumed'
  | 'unknown';

export type RazorpaySubscription = {
  id: string;
  plan_id: string;
  status: RazorpaySubscriptionStatus;
  short_url?: string | null;
  current_start?: number | null;
  current_end?: number | null;
  charge_at?: number | null;
  start_at?: number | null;
  end_at?: number | null;
  ended_at?: number | null;
  paid_count?: number | null;
  total_count?: number | null;
  notes?: Record<string, string | number | null | undefined> | null;
};

type RazorpayPlan = {
  id: string;
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

export const getRazorpayKeyId = (): string => requireRazorpayEnv().keyId;

export const verifyRazorpaySubscriptionPaymentSignature = (params: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
}): boolean => {
  const { keySecret } = requireRazorpayEnv();
  const expected = createHmac('sha256', keySecret)
    .update(`${params.paymentId}|${params.subscriptionId}`)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(params.signature, 'hex');
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
};

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

export const createRazorpayMonthlyPlan = async (params: {
  amountPaise: number;
}): Promise<RazorpayPlan> => {
  const client = getRazorpayClient();

  return client.plans.create({
    period: 'monthly',
    interval: 1,
    item: {
      name: 'KiranaTrack Monthly Access',
      amount: params.amountPaise,
      currency: 'INR',
      description: 'Monthly subscription for KiranaTrack app access',
    },
    notes: {
      source: 'kiranatrack_app_subscription',
      amountPaise: params.amountPaise,
    },
  });
};

export const createRazorpayAppSubscription = async (params: {
  planId: string;
  ownerUserId: string;
  totalCount: number;
}): Promise<RazorpaySubscription> => {
  const client = getRazorpayClient();

  return client.subscriptions.create({
    plan_id: params.planId,
    total_count: params.totalCount,
    quantity: 1,
    customer_notify: 1,
    notes: {
      source: 'kiranatrack_app_subscription',
      ownerUserId: params.ownerUserId,
    },
  });
};

export const fetchRazorpaySubscription = async (
  subscriptionId: string,
): Promise<RazorpaySubscription> => {
  const client = getRazorpayClient();
  return client.subscriptions.fetch(subscriptionId);
};

export const cancelRazorpaySubscription = async (
  subscriptionId: string,
): Promise<RazorpaySubscription> => {
  const client = getRazorpayClient();
  return client.subscriptions.cancel(subscriptionId, true);
};
