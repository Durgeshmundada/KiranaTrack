import { Router } from 'express';
import Razorpay from 'razorpay';

import { createObjectId } from '../db/id';
import { dbQuery, withTransaction } from '../db/postgres';
import { logWarn } from '../observability/logger';
import { recordAuditEvent } from '../services/audit';
import { getRazorpayWebhookSecret } from '../services/razorpay';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpError, sendOk } from '../utils/http';

const razorpayWebhookRouter = Router();

type RazorpayWebhookPayload = {
  event?: unknown;
  payload?: {
    payment_link?: {
      entity?: {
        id?: unknown;
        status?: unknown;
        amount?: unknown;
        amount_paid?: unknown;
        notes?: Record<string, unknown>;
      };
    };
    payment?: {
      entity?: {
        id?: unknown;
      };
    };
  };
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const getPaymentLinkEntity = (
  payload: RazorpayWebhookPayload,
): NonNullable<
  NonNullable<RazorpayWebhookPayload['payload']>['payment_link']
>['entity'] => payload.payload?.payment_link?.entity;

razorpayWebhookRouter.post(
  '/razorpay',
  asyncHandler(async (req, res) => {
    if (!Buffer.isBuffer(req.body)) {
      throw new HttpError(400, 'Invalid webhook body');
    }

    const signature = req.header('x-razorpay-signature');
    if (!signature) {
      throw new HttpError(400, 'Missing Razorpay signature');
    }

    const rawBody = req.body.toString('utf8');
    const isValid = Razorpay.validateWebhookSignature(
      rawBody,
      signature,
      getRazorpayWebhookSecret(),
    );
    if (!isValid) {
      throw new HttpError(400, 'Invalid Razorpay signature');
    }

    const payload = JSON.parse(rawBody) as RazorpayWebhookPayload;
    if (payload.event !== 'payment_link.paid') {
      sendOk(res, { ignored: true });
      return;
    }

    const paymentLink = getPaymentLinkEntity(payload);
    const paymentLinkId = typeof paymentLink?.id === 'string' ? paymentLink.id : null;
    if (!paymentLinkId) {
      throw new HttpError(400, 'Missing Razorpay payment link id');
    }

    const eventId = req.header('x-razorpay-event-id') ?? null;
    const razorpayPaymentId =
      typeof payload.payload?.payment?.entity?.id === 'string'
        ? payload.payload.payment.entity.id
        : null;
    const amountPaidPaise =
      toNumber(paymentLink?.amount_paid) ?? toNumber(paymentLink?.amount) ?? 0;

    const result = await withTransaction(async (client) => {
      const linkResult = await dbQuery<{
        id: string;
        owner_user_id: string;
        customer_id: string;
        amount_paise: number;
        status: string;
        repayment_entry_id: string | null;
      }>(
        `
          select id, owner_user_id, customer_id, amount_paise, status, repayment_entry_id
          from razorpay_udhaar_payment_links
          where id = $1
          for update
        `,
        [paymentLinkId],
        client,
      );

      if (linkResult.rows.length === 0) {
        logWarn('razorpay.webhook.payment_link_not_found', {
          paymentLinkId,
          eventId,
        });
        return { markedPaid: false, reason: 'payment_link_not_found' };
      }

      const link = linkResult.rows[0];
      if (link.status === 'paid' && link.repayment_entry_id) {
        return {
          markedPaid: true,
          duplicate: true,
          entryId: link.repayment_entry_id,
        };
      }

      if (amountPaidPaise < link.amount_paise) {
        throw new HttpError(409, 'Razorpay payment amount is lower than expected');
      }

      const balanceResult = await dbQuery<{ balance_paise: number }>(
        `
          select coalesce(
            sum(
              case
                when type = 'credit' then amount_paise
                when type = 'repayment' then -amount_paise
                else 0
              end
            ),
            0
          )::int as balance_paise
          from udhaar_entries
          where customer_id = $1
            and deleted_at is null
        `,
        [link.customer_id],
        client,
      );

      const currentBalancePaise = balanceResult.rows[0]?.balance_paise ?? 0;
      const repaymentAmountPaise = Math.min(link.amount_paise, currentBalancePaise);
      let repaymentEntryId: string | null = null;

      if (repaymentAmountPaise > 0) {
        repaymentEntryId = createObjectId();
        await dbQuery(
          `
            insert into udhaar_entries (id, customer_id, type, amount_paise, description, date)
            values ($1, $2, 'repayment', $3, $4, now())
          `,
          [
            repaymentEntryId,
            link.customer_id,
            repaymentAmountPaise,
            `Razorpay payment link ${paymentLinkId}`,
          ],
          client,
        );

        await recordAuditEvent({
          ownerUserId: link.owner_user_id,
          actorUserId: link.owner_user_id,
          entityType: 'udhaar_entry',
          entityId: repaymentEntryId,
          action: 'create',
          payload: {
            customerId: link.customer_id,
            type: 'repayment',
            amountPaise: repaymentAmountPaise,
            source: 'razorpay',
            paymentLinkId,
            paymentId: razorpayPaymentId,
          },
          client,
        });
      }

      await dbQuery(
        `
          update razorpay_udhaar_payment_links
          set status = 'paid',
              amount_paid_paise = $2,
              razorpay_payment_id = $3,
              webhook_event_id = $4,
              repayment_entry_id = $5,
              paid_at = now(),
              updated_at = now()
          where id = $1
        `,
        [
          paymentLinkId,
          amountPaidPaise,
          razorpayPaymentId,
          eventId,
          repaymentEntryId,
        ],
        client,
      );

      await dbQuery(
        `
          update udhaar_customers
          set updated_at = now()
          where id = $1
            and owner_user_id = $2
        `,
        [link.customer_id, link.owner_user_id],
        client,
      );

      return {
        markedPaid: true,
        entryId: repaymentEntryId,
        amountPaise: repaymentAmountPaise,
      };
    });

    sendOk(res, result);
  }),
);

export { razorpayWebhookRouter };
