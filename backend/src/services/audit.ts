import type { PoolClient } from 'pg';

import { createObjectId } from '../db/id';
import { dbQuery } from '../db/postgres';

type AuditEntityType = 'bill' | 'payment' | 'udhaar_entry';
type AuditAction = 'create' | 'update' | 'delete';

export const recordAuditEvent = async (params: {
  ownerUserId: string;
  actorUserId: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  payload?: Record<string, unknown>;
  client?: PoolClient;
}): Promise<void> => {
  await dbQuery(
    `
      insert into audit_events (
        id,
        owner_user_id,
        actor_user_id,
        entity_type,
        entity_id,
        action,
        payload
      )
      values ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      createObjectId(),
      params.ownerUserId,
      params.actorUserId,
      params.entityType,
      params.entityId,
      params.action,
      JSON.stringify(params.payload ?? {}),
    ],
    params.client,
  );
};
