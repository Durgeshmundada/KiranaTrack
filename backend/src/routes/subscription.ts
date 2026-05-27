import { Router, type Request } from 'express';

import {
  type AppSubscriptionStatusDoc,
  cancelAppSubscription,
  getAppSubscriptionStatus,
  refreshAppSubscription,
  startAppSubscription,
} from '../services/subscription';
import { asyncHandler } from '../utils/asyncHandler';
import { getAuthUserId } from '../utils/authContext';
import { sendOk } from '../utils/http';

const subscriptionRouter = Router();

const getRequestOrigin = (req: Request): string | null => {
  const host = req.get('host');
  if (!host) {
    return null;
  }

  return `${req.protocol}://${host}`;
};

const withCheckoutUrl = (
  req: Request,
  status: AppSubscriptionStatusDoc,
): AppSubscriptionStatusDoc & { checkoutUrl: string | null } => {
  const origin = getRequestOrigin(req);
  const subscriptionId = status.razorpaySubscriptionId;
  const shouldOfferCheckout =
    status.accessStatus !== 'active' && Boolean(subscriptionId);

  return {
    ...status,
    checkoutUrl:
      origin && shouldOfferCheckout && subscriptionId
        ? `${origin}/subscription/checkout/${encodeURIComponent(subscriptionId)}`
        : null,
  };
};

subscriptionRouter.get(
  '/status',
  asyncHandler(async (req, res) => {
    sendOk(res, withCheckoutUrl(req, await getAppSubscriptionStatus(getAuthUserId(req))));
  }),
);

subscriptionRouter.post(
  '/start',
  asyncHandler(async (req, res) => {
    sendOk(res, withCheckoutUrl(req, await startAppSubscription(getAuthUserId(req))));
  }),
);

subscriptionRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    sendOk(res, withCheckoutUrl(req, await refreshAppSubscription(getAuthUserId(req))));
  }),
);

subscriptionRouter.post(
  '/cancel',
  asyncHandler(async (req, res) => {
    sendOk(res, withCheckoutUrl(req, await cancelAppSubscription(getAuthUserId(req))));
  }),
);

export { subscriptionRouter };
