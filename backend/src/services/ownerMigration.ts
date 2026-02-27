import { dbQuery, withTransaction } from '../db/postgres';

const LEGACY_OWNER = 'legacy-owner';
const claimedOwners = new Set<string>();
const inFlightClaims = new Map<string, Promise<void>>();

export const claimLegacyOwnership = async (
  ownerUserId: string,
): Promise<void> => {
  if (!ownerUserId || claimedOwners.has(ownerUserId)) {
    return;
  }

  const inFlight = inFlightClaims.get(ownerUserId);
  if (inFlight) {
    await inFlight;
    return;
  }

  const claimPromise = withTransaction(async (client) => {
    await dbQuery(
      `
        update vendors
        set owner_user_id = $1
        where owner_user_id = $2
      `,
      [ownerUserId, LEGACY_OWNER],
      client,
    );

    await dbQuery(
      `
        update bills
        set owner_user_id = $1
        where owner_user_id = $2
      `,
      [ownerUserId, LEGACY_OWNER],
      client,
    );

    await dbQuery(
      `
        update out_of_stock_items
        set owner_user_id = $1
        where owner_user_id = $2
      `,
      [ownerUserId, LEGACY_OWNER],
      client,
    );

    await dbQuery(
      `
        update udhaar_customers
        set owner_user_id = $1
        where owner_user_id = $2
      `,
      [ownerUserId, LEGACY_OWNER],
      client,
    );
  })
    .then(() => {
      claimedOwners.add(ownerUserId);
    })
    .finally(() => {
      inFlightClaims.delete(ownerUserId);
    });

  inFlightClaims.set(ownerUserId, claimPromise);
  await claimPromise;
};
