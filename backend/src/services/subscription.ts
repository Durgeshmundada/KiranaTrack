import type { PoolClient } from 'pg';

import { env } from '../config/env';
import { dbQuery, withTransaction } from '../db/postgres';
import {
  cancelRazorpaySubscription,
  createRazorpayAppSubscription,
  createRazorpayMonthlyPlan,
  fetchRazorpaySubscription,
  type RazorpaySubscription,
  type RazorpaySubscriptionStatus,
  verifyRazorpaySubscriptionPaymentSignature,
} from './razorpay';
import { HttpError } from '../utils/http';

export type AppSubscriptionAccessStatus =
  | 'active'
  | 'past_due'
  | 'setup_required'
  | 'frozen';

export type AppSubscriptionStatusDoc = {
  status: RazorpaySubscriptionStatus | 'none';
  accessStatus: AppSubscriptionAccessStatus;
  canUseFeatures: boolean;
  autoPayEnabled: boolean;
  amountPaise: number;
  currency: 'INR';
  billingPeriod: 'monthly';
  planId: string | null;
  razorpaySubscriptionId: string | null;
  shortUrl: string | null;
  currentStart: string | null;
  currentEnd: string | null;
  nextChargeAt: string | null;
  endedAt: string | null;
  paidCount: number;
  totalCount: number;
  lastPaymentId: string | null;
  alertTitle: string;
  alertMessage: string;
  updatedAt: string | null;
};

type AppSubscriptionRow = {
  owner_user_id: string;
  razorpay_subscription_id: string;
  plan_id: string;
  status: RazorpaySubscriptionStatus;
  short_url: string | null;
  current_start: Date | string | null;
  current_end: Date | string | null;
  charge_at: Date | string | null;
  start_at: Date | string | null;
  end_at: Date | string | null;
  ended_at: Date | string | null;
  paid_count: number;
  total_count: number;
  autopay_enabled: boolean;
  last_payment_id: string | null;
  last_event_id: string | null;
  last_event_at: Date | string | null;
  raw_payload: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

type RazorpayPaymentEntity = {
  id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  method?: string;
  created_at?: number;
};

export type RazorpaySubscriptionWebhookPayload = {
  event?: string;
  created_at?: number;
  payload?: {
    subscription?: {
      entity?: RazorpaySubscription;
    };
    payment?: {
      entity?: RazorpayPaymentEntity;
    };
  };
};

const PLAN_CONFIG_KEY = 'razorpay_monthly_subscription_plan_id';

const activeStatuses = new Set<RazorpaySubscriptionStatus>([
  'authenticated',
  'active',
  'resumed',
]);

const pastDueStatuses = new Set<RazorpaySubscriptionStatus>(['pending']);
const setupStatuses = new Set<RazorpaySubscriptionStatus>(['created']);

const terminalStatuses = new Set<RazorpaySubscriptionStatus>([
  'halted',
  'cancelled',
  'completed',
  'expired',
  'paused',
  'unknown',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const dateToIso = (value: Date | string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const unixToDate = (value: number | null | undefined): Date | null =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Date(value * 1000)
    : null;

const normalizeStatus = (value: unknown): RazorpaySubscriptionStatus => {
  switch (value) {
    case 'created':
    case 'authenticated':
    case 'active':
    case 'pending':
    case 'halted':
    case 'cancelled':
    case 'completed':
    case 'expired':
    case 'paused':
    case 'resumed':
      return value;
    default:
      return 'unknown';
  }
};

const normalizeCount = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

const addGraceDays = (date: Date, graceDays: number): Date => {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + graceDays);
  return copy;
};

const hasAccessWindow = (
  row: Pick<AppSubscriptionRow, 'current_end' | 'end_at'>,
  now: Date,
): boolean => {
  const endIso = dateToIso(row.current_end ?? row.end_at);
  if (!endIso) {
    return true;
  }

  const accessEnd = addGraceDays(new Date(endIso), env.APP_SUBSCRIPTION_GRACE_DAYS);
  return accessEnd.getTime() >= now.getTime();
};

export const computeSubscriptionAccess = (
  row: AppSubscriptionRow | null,
  now = new Date(),
): AppSubscriptionAccessStatus => {
  if (!row) {
    return 'setup_required';
  }

  if (setupStatuses.has(row.status)) {
    return 'setup_required';
  }

  if (activeStatuses.has(row.status) && hasAccessWindow(row, now)) {
    return 'active';
  }

  if (pastDueStatuses.has(row.status) && hasAccessWindow(row, now)) {
    return 'past_due';
  }

  if (
    terminalStatuses.has(row.status) &&
    row.current_end &&
    hasAccessWindow(row, now) &&
    row.status === 'cancelled'
  ) {
    return 'active';
  }

  return 'frozen';
};

const buildAlertCopy = (
  accessStatus: AppSubscriptionAccessStatus,
  row: AppSubscriptionRow | null,
): { alertTitle: string; alertMessage: string } => {
  if (accessStatus === 'active') {
    return {
      alertTitle: 'Subscription active',
      alertMessage: 'Your Rs 1/month auto pay is active.',
    };
  }

  if (accessStatus === 'past_due') {
    const endDate = dateToIso(row?.current_end ?? null);
    return {
      alertTitle: 'Payment pending',
      alertMessage: endDate
        ? `Auto pay needs attention before access ends on ${endDate.slice(0, 10)}.`
        : 'Auto pay needs attention. Please refresh or complete payment to keep editing.',
    };
  }

  if (accessStatus === 'setup_required') {
    return {
      alertTitle: 'Subscription required',
      alertMessage:
        'Set up Rs 1/month auto pay to unlock editing features. You can still view your account.',
    };
  }

  return {
    alertTitle: 'Account frozen',
    alertMessage:
      'Your subscription is over. You can view your account, but editing is locked until payment is completed.',
  };
};

export const toSubscriptionStatusDoc = (
  row: AppSubscriptionRow | null,
): AppSubscriptionStatusDoc => {
  const accessStatus = computeSubscriptionAccess(row);
  const { alertTitle, alertMessage } = buildAlertCopy(accessStatus, row);

  return {
    status: row?.status ?? 'none',
    accessStatus,
    canUseFeatures: accessStatus === 'active' || accessStatus === 'past_due',
    autoPayEnabled: Boolean(row?.autopay_enabled),
    amountPaise: env.APP_SUBSCRIPTION_AMOUNT_PAISE,
    currency: 'INR',
    billingPeriod: 'monthly',
    planId: row?.plan_id ?? null,
    razorpaySubscriptionId: row?.razorpay_subscription_id ?? null,
    shortUrl: row?.short_url ?? null,
    currentStart: dateToIso(row?.current_start ?? null),
    currentEnd: dateToIso(row?.current_end ?? null),
    nextChargeAt: dateToIso(row?.charge_at ?? null),
    endedAt: dateToIso(row?.ended_at ?? null),
    paidCount: row?.paid_count ?? 0,
    totalCount: row?.total_count ?? env.APP_SUBSCRIPTION_TOTAL_COUNT,
    lastPaymentId: row?.last_payment_id ?? null,
    alertTitle,
    alertMessage,
    updatedAt: dateToIso(row?.updated_at ?? null),
  };
};

const fetchSubscriptionRowByOwner = async (
  ownerUserId: string,
  client?: PoolClient,
): Promise<AppSubscriptionRow | null> => {
  const result = await dbQuery<AppSubscriptionRow>(
    `
      select owner_user_id,
             razorpay_subscription_id,
             plan_id,
             status,
             short_url,
             current_start,
             current_end,
             charge_at,
             start_at,
             end_at,
             ended_at,
             paid_count,
             total_count,
             autopay_enabled,
             last_payment_id,
             last_event_id,
             last_event_at,
             raw_payload,
             created_at,
             updated_at
      from app_subscriptions
      where owner_user_id = $1
    `,
    [ownerUserId],
    client,
  );

  return result.rows[0] ?? null;
};

const fetchSubscriptionRowByRazorpayId = async (
  subscriptionId: string,
  client?: PoolClient,
): Promise<AppSubscriptionRow | null> => {
  const result = await dbQuery<AppSubscriptionRow>(
    `
      select owner_user_id,
             razorpay_subscription_id,
             plan_id,
             status,
             short_url,
             current_start,
             current_end,
             charge_at,
             start_at,
             end_at,
             ended_at,
             paid_count,
             total_count,
             autopay_enabled,
             last_payment_id,
             last_event_id,
             last_event_at,
             raw_payload,
             created_at,
             updated_at
      from app_subscriptions
      where razorpay_subscription_id = $1
    `,
    [subscriptionId],
    client,
  );

  return result.rows[0] ?? null;
};

export const getAppSubscriptionStatus = async (
  ownerUserId: string,
): Promise<AppSubscriptionStatusDoc> =>
  toSubscriptionStatusDoc(await fetchSubscriptionRowByOwner(ownerUserId));

const getStoredPlanId = async (): Promise<string | null> => {
  const result = await dbQuery<{ value: string }>(
    'select value from app_billing_config where key = $1',
    [PLAN_CONFIG_KEY],
  );
  return result.rows[0]?.value ?? null;
};

const storePlanId = async (planId: string): Promise<string> => {
  const result = await dbQuery<{ value: string }>(
    `
      insert into app_billing_config (key, value)
      values ($1, $2)
      on conflict (key) do update set value = app_billing_config.value
      returning value
    `,
    [PLAN_CONFIG_KEY, planId],
  );
  return result.rows[0]?.value ?? planId;
};

const resolveMonthlyPlanId = async (): Promise<string> => {
  if (env.RAZORPAY_APP_PLAN_ID) {
    return env.RAZORPAY_APP_PLAN_ID;
  }

  const storedPlanId = await getStoredPlanId();
  if (storedPlanId) {
    return storedPlanId;
  }

  const plan = await createRazorpayMonthlyPlan({
    amountPaise: env.APP_SUBSCRIPTION_AMOUNT_PAISE,
  });
  return storePlanId(plan.id);
};

const extractOwnerUserId = (
  subscription: RazorpaySubscription,
  existingRow: AppSubscriptionRow | null,
): string | null => {
  if (existingRow?.owner_user_id) {
    return existingRow.owner_user_id;
  }

  const notes = subscription.notes;
  const ownerUserId = notes?.ownerUserId;
  return typeof ownerUserId === 'string' && ownerUserId.trim()
    ? ownerUserId.trim()
    : null;
};

const upsertSubscriptionFromGateway = async (params: {
  subscription: RazorpaySubscription;
  ownerUserId?: string | null;
  eventId?: string | null;
  eventCreatedAt?: Date | null;
  paymentId?: string | null;
  client?: PoolClient;
}): Promise<AppSubscriptionRow> => {
  const existingRow = await fetchSubscriptionRowByRazorpayId(
    params.subscription.id,
    params.client,
  );
  const ownerUserId =
    params.ownerUserId ??
    extractOwnerUserId(params.subscription, existingRow);

  if (!ownerUserId) {
    throw new HttpError(400, 'Razorpay subscription is missing owner user id');
  }

  const status = normalizeStatus(params.subscription.status);
  const autopayEnabled = activeStatuses.has(status) || pastDueStatuses.has(status);

  const result = await dbQuery<AppSubscriptionRow>(
    `
      insert into app_subscriptions (
        owner_user_id,
        razorpay_subscription_id,
        plan_id,
        status,
        short_url,
        current_start,
        current_end,
        charge_at,
        start_at,
        end_at,
        ended_at,
        paid_count,
        total_count,
        autopay_enabled,
        last_payment_id,
        last_event_id,
        last_event_at,
        raw_payload
      )
      values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18::jsonb
      )
      on conflict (owner_user_id) do update
      set razorpay_subscription_id = excluded.razorpay_subscription_id,
          plan_id = excluded.plan_id,
          status = excluded.status,
          short_url = coalesce(excluded.short_url, app_subscriptions.short_url),
          current_start = excluded.current_start,
          current_end = excluded.current_end,
          charge_at = excluded.charge_at,
          start_at = excluded.start_at,
          end_at = excluded.end_at,
          ended_at = excluded.ended_at,
          paid_count = excluded.paid_count,
          total_count = excluded.total_count,
          autopay_enabled = excluded.autopay_enabled,
          last_payment_id = coalesce(excluded.last_payment_id, app_subscriptions.last_payment_id),
          last_event_id = coalesce(excluded.last_event_id, app_subscriptions.last_event_id),
          last_event_at = coalesce(excluded.last_event_at, app_subscriptions.last_event_at),
          raw_payload = excluded.raw_payload
      returning owner_user_id,
                razorpay_subscription_id,
                plan_id,
                status,
                short_url,
                current_start,
                current_end,
                charge_at,
                start_at,
                end_at,
                ended_at,
                paid_count,
                total_count,
                autopay_enabled,
                last_payment_id,
                last_event_id,
                last_event_at,
                raw_payload,
                created_at,
                updated_at
    `,
    [
      ownerUserId,
      params.subscription.id,
      params.subscription.plan_id,
      status,
      params.subscription.short_url ?? null,
      unixToDate(params.subscription.current_start),
      unixToDate(params.subscription.current_end),
      unixToDate(params.subscription.charge_at),
      unixToDate(params.subscription.start_at),
      unixToDate(params.subscription.end_at),
      unixToDate(params.subscription.ended_at),
      normalizeCount(params.subscription.paid_count),
      normalizeCount(params.subscription.total_count),
      autopayEnabled,
      params.paymentId ?? null,
      params.eventId ?? null,
      params.eventCreatedAt ?? null,
      JSON.stringify(params.subscription),
    ],
    params.client,
  );

  return result.rows[0];
};

export const startAppSubscription = async (
  ownerUserId: string,
): Promise<AppSubscriptionStatusDoc> => {
  const currentRow = await fetchSubscriptionRowByOwner(ownerUserId);
  const currentStatus = toSubscriptionStatusDoc(currentRow);
  const setupLinkUsesCurrentLimit =
    currentRow &&
    currentRow.total_count > 0 &&
    currentRow.total_count <= env.APP_SUBSCRIPTION_TOTAL_COUNT;

  if (
    currentRow &&
    (currentStatus.canUseFeatures ||
      ((currentStatus.accessStatus === 'setup_required' ||
        currentStatus.accessStatus === 'past_due') &&
        currentRow.short_url &&
        setupLinkUsesCurrentLimit))
  ) {
    return currentStatus;
  }

  const planId = await resolveMonthlyPlanId();
  const subscription = await createRazorpayAppSubscription({
    planId,
    ownerUserId,
    totalCount: env.APP_SUBSCRIPTION_TOTAL_COUNT,
  });

  const row = await upsertSubscriptionFromGateway({
    subscription,
    ownerUserId,
  });

  return toSubscriptionStatusDoc(row);
};

export const refreshAppSubscription = async (
  ownerUserId: string,
): Promise<AppSubscriptionStatusDoc> => {
  const currentRow = await fetchSubscriptionRowByOwner(ownerUserId);
  if (!currentRow) {
    return toSubscriptionStatusDoc(null);
  }

  const subscription = await fetchRazorpaySubscription(
    currentRow.razorpay_subscription_id,
  );
  const row = await upsertSubscriptionFromGateway({
    subscription,
    ownerUserId,
  });

  return toSubscriptionStatusDoc(row);
};

export const cancelAppSubscription = async (
  ownerUserId: string,
): Promise<AppSubscriptionStatusDoc> => {
  const currentRow = await fetchSubscriptionRowByOwner(ownerUserId);
  if (!currentRow?.razorpay_subscription_id) {
    throw new HttpError(404, 'Subscription not found');
  }

  const subscription = await cancelRazorpaySubscription(
    currentRow.razorpay_subscription_id,
  );
  const row = await upsertSubscriptionFromGateway({
    subscription,
    ownerUserId,
  });

  return toSubscriptionStatusDoc(row);
};

export const confirmAppSubscriptionCheckoutPayment = async (params: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
}): Promise<AppSubscriptionStatusDoc> => {
  const isValidSignature = verifyRazorpaySubscriptionPaymentSignature(params);
  if (!isValidSignature) {
    throw new HttpError(400, 'Invalid Razorpay payment signature');
  }

  const subscription = await fetchRazorpaySubscription(params.subscriptionId);
  const row = await upsertSubscriptionFromGateway({
    subscription,
    paymentId: params.paymentId,
  });

  return toSubscriptionStatusDoc(row);
};

export const assertSubscriptionAllowsWrite = async (
  ownerUserId: string,
): Promise<void> => {
  const status = await getAppSubscriptionStatus(ownerUserId);
  if (status.canUseFeatures) {
    return;
  }

  throw new HttpError(402, status.alertMessage);
};

const getWebhookEventKey = (
  eventName: string,
  payload: RazorpaySubscriptionWebhookPayload,
  subscriptionId: string,
  eventId: string | null,
): string => {
  if (eventId?.trim()) {
    return eventId.trim();
  }

  const createdAt = payload.created_at ?? Math.floor(Date.now() / 1000);
  const paymentId = payload.payload?.payment?.entity?.id ?? 'no-payment';
  return `${eventName}:${subscriptionId}:${createdAt}:${paymentId}`;
};

const recordWebhookEvent = async (
  eventKey: string,
  eventName: string,
  rawPayload: unknown,
  client: PoolClient,
): Promise<boolean> => {
  const result = await dbQuery<{ id: string }>(
    `
      insert into razorpay_webhook_events (id, event_name, raw_payload)
      values ($1, $2, $3::jsonb)
      on conflict (id) do nothing
      returning id
    `,
    [eventKey, eventName, JSON.stringify(rawPayload)],
    client,
  );

  return result.rows.length > 0;
};

const insertSubscriptionPayment = async (params: {
  ownerUserId: string;
  subscriptionId: string;
  payment: RazorpayPaymentEntity;
  client: PoolClient;
}): Promise<void> => {
  if (!params.payment.id) {
    return;
  }

  await dbQuery(
    `
      insert into app_subscription_payments (
        payment_id,
        owner_user_id,
        razorpay_subscription_id,
        amount_paise,
        currency,
        status,
        method,
        captured_at,
        raw_payload
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      on conflict (payment_id) do update
      set status = excluded.status,
          method = excluded.method,
          captured_at = excluded.captured_at,
          raw_payload = excluded.raw_payload
    `,
    [
      params.payment.id,
      params.ownerUserId,
      params.subscriptionId,
      params.payment.amount ?? 0,
      params.payment.currency ?? 'INR',
      params.payment.status ?? null,
      params.payment.method ?? null,
      unixToDate(params.payment.created_at),
      JSON.stringify(params.payment),
    ],
    params.client,
  );
};

export const handleRazorpaySubscriptionWebhook = async (
  payload: RazorpaySubscriptionWebhookPayload,
  eventId: string | null,
): Promise<{ processed: boolean; duplicate?: boolean; reason?: string }> => {
  const eventName = payload.event;
  if (!eventName?.startsWith('subscription.')) {
    return { processed: false, reason: 'not_subscription_event' };
  }

  const subscription = payload.payload?.subscription?.entity;
  if (!subscription?.id) {
    return { processed: false, reason: 'missing_subscription' };
  }

  return withTransaction(async (client) => {
    const eventKey = getWebhookEventKey(eventName, payload, subscription.id, eventId);
    const inserted = await recordWebhookEvent(eventKey, eventName, payload, client);
    if (!inserted) {
      return { processed: true, duplicate: true };
    }

    const eventCreatedAt = unixToDate(payload.created_at);
    const payment = payload.payload?.payment?.entity;
    const row = await upsertSubscriptionFromGateway({
      subscription,
      eventId: eventKey,
      eventCreatedAt,
      paymentId: payment?.id ?? null,
      client,
    });

    if (payment && isRecord(payment)) {
      await insertSubscriptionPayment({
        ownerUserId: row.owner_user_id,
        subscriptionId: row.razorpay_subscription_id,
        payment,
        client,
      });
    }

    return { processed: true };
  });
};
