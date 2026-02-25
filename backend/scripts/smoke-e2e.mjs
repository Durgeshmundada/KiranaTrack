import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dns.setDefaultResultOrder('ipv4first');

const resolveWorkspaceRoot = () => {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'backend')) && fs.existsSync(path.join(cwd, 'mobile'))) {
    return cwd;
  }
  return path.resolve(cwd, '..');
};

const workspaceRoot = resolveWorkspaceRoot();
const backendEnvPath = path.join(workspaceRoot, 'backend', '.env');
const mobileEnvPath = path.join(workspaceRoot, 'mobile', '.env');

if (!fs.existsSync(backendEnvPath)) {
  throw new Error(`Missing backend env file: ${backendEnvPath}`);
}

if (!fs.existsSync(mobileEnvPath)) {
  throw new Error(`Missing mobile env file: ${mobileEnvPath}`);
}

const backendEnv = dotenv.parse(fs.readFileSync(backendEnvPath));
const mobileEnv = dotenv.parse(fs.readFileSync(mobileEnvPath));

const apiBaseUrl = 'http://localhost:4000';

const assertStatus = (name, actualStatus, expectedStatuses) => {
  if (!expectedStatuses.includes(actualStatus)) {
    throw new Error(`${name} failed. Expected ${expectedStatuses.join('/')} got ${actualStatus}`);
  }
};

const requestJson = async (token, method, endpoint, body) => {
  const response = await fetch(`${apiBaseUrl}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return { response, json, text };
};

const run = async () => {
  const health = await fetch(`${apiBaseUrl}/health`);
  assertStatus('health', health.status, [200]);

  const supabaseUrl = backendEnv.SUPABASE_URL;
  const serviceRoleKey = backendEnv.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = mobileEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    throw new Error('Missing Supabase URL/service key/anon key in env files');
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const email = `smoke_${Date.now()}@example.com`;
  const password = 'SmokeTest@12345';

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (created.error || !created.data.user) {
    throw new Error(`createUser failed: ${created.error?.message ?? 'unknown error'}`);
  }

  const userId = created.data.user.id;

  try {
    const signed = await anon.auth.signInWithPassword({ email, password });
    if (signed.error || !signed.data.session?.access_token) {
      throw new Error(`signIn failed: ${signed.error?.message ?? 'no session token'}`);
    }
    const token = signed.data.session.access_token;

    const vendorName = `Smoke Vendor ${Date.now()}`;
    const vendorCreate = await requestJson(token, 'POST', '/api/vendors', {
      name: vendorName,
      phone: null,
      gstNumber: null,
      defaultCollectorName: 'Smoke Collector',
    });
    assertStatus('create vendor', vendorCreate.response.status, [201]);
    const vendorId = vendorCreate.json?.data?._id;
    if (!vendorId) {
      throw new Error('create vendor response missing _id');
    }

    const vendorList = await requestJson(token, 'GET', '/api/vendors');
    assertStatus('list vendors', vendorList.response.status, [200]);

    const billCreate = await requestJson(token, 'POST', '/api/bills', {
      billNumber: `SMK-${Date.now()}`,
      vendorId,
      date: new Date().toISOString(),
      totalAmountPaise: 125000,
      imageUrl: 'https://example.com/bill.jpg',
      imageHash: `smoke-${Date.now()}`,
      lineItems: [
        {
          name: 'Rice',
          qty: 5,
          ratePaise: 25000,
          amountPaise: 125000,
        },
      ],
    });
    assertStatus('create bill', billCreate.response.status, [201]);
    const billId = billCreate.json?.data?._id;
    if (!billId) {
      throw new Error('create bill response missing _id');
    }

    const billList = await requestJson(token, 'GET', '/api/bills');
    assertStatus('list bills', billList.response.status, [200]);

    const billDetail = await requestJson(token, 'GET', `/api/bills/${billId}`);
    assertStatus('bill detail', billDetail.response.status, [200]);

    const paymentCreate = await requestJson(token, 'POST', `/api/bills/${billId}/payments`, {
      amountPaise: 25000,
      date: new Date().toISOString(),
      collectorName: 'Smoke Collector',
      mode: 'cash',
      notes: 'Smoke payment',
    });
    assertStatus('create payment', paymentCreate.response.status, [201]);
    const paymentId = paymentCreate.json?.data?._id;
    if (!paymentId) {
      throw new Error('create payment response missing _id');
    }

    const paymentUpdate = await requestJson(token, 'PUT', `/api/payments/${paymentId}`, {
      amountPaise: 26000,
      date: new Date().toISOString(),
    });
    assertStatus('update payment', paymentUpdate.response.status, [200]);

    const oosCreate = await requestJson(token, 'POST', '/api/outofstock', {
      itemName: 'Smoke OOS Item',
    });
    assertStatus('create out-of-stock', oosCreate.response.status, [201]);
    const oosId = oosCreate.json?.data?._id;
    if (!oosId) {
      throw new Error('create out-of-stock response missing _id');
    }

    const oosUpdate = await requestJson(token, 'PUT', `/api/outofstock/${oosId}`, {
      status: 'ordered',
    });
    assertStatus('update out-of-stock', oosUpdate.response.status, [200]);

    const oosDelete = await requestJson(token, 'DELETE', `/api/outofstock/${oosId}`);
    assertStatus('delete out-of-stock', oosDelete.response.status, [200]);

    const customerCreate = await requestJson(token, 'POST', '/api/udhaar', {
      customerName: `Smoke Customer ${Date.now()}`,
      phone: null,
    });
    assertStatus('create udhaar customer', customerCreate.response.status, [201]);
    const customerId = customerCreate.json?.data?._id;
    if (!customerId) {
      throw new Error('create udhaar customer response missing _id');
    }

    const entryCreate = await requestJson(token, 'POST', `/api/udhaar/${customerId}/entries`, {
      type: 'credit',
      amountPaise: 5000,
      description: 'Smoke udhaar entry',
      date: new Date().toISOString(),
    });
    assertStatus('create udhaar entry', entryCreate.response.status, [201]);
    const latestEntry = entryCreate.json?.data?.entries?.at?.(-1);
    const entryId = latestEntry?._id;
    if (!entryId) {
      throw new Error('create udhaar entry response missing entry id');
    }

    const entryDelete = await requestJson(token, 'DELETE', `/api/udhaar/entries/${entryId}`);
    assertStatus('delete udhaar entry', entryDelete.response.status, [200]);

    const analyticsSummary = await requestJson(token, 'GET', '/api/analytics/summary');
    assertStatus('analytics summary', analyticsSummary.response.status, [200]);

    const analyticsVendor = await requestJson(token, 'GET', '/api/analytics/vendor-wise');
    assertStatus('analytics vendor-wise', analyticsVendor.response.status, [200]);

    const analyticsMonthly = await requestJson(token, 'GET', '/api/analytics/monthly-spend');
    assertStatus('analytics monthly-spend', analyticsMonthly.response.status, [200]);

    const analyticsAnomalies = await requestJson(token, 'GET', '/api/analytics/price-anomalies');
    assertStatus('analytics anomalies', analyticsAnomalies.response.status, [200]);

    const parseText = await requestJson(token, 'POST', '/api/parse/bill-text', {
      text: 'Invoice #1\nVendor Smoke Store\nTotal 1000',
    });
    assertStatus('parse bill text', parseText.response.status, [200, 422, 503]);

    const onePixelPngDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7nG5EAAAAASUVORK5CYII=';
    const parseImage = await requestJson(token, 'POST', '/api/parse/bill-image', {
      imageDataUrl: onePixelPngDataUrl,
    });
    assertStatus('parse bill image', parseImage.response.status, [200, 422, 503]);

    const billDelete = await requestJson(token, 'DELETE', `/api/bills/${billId}`);
    assertStatus('delete bill', billDelete.response.status, [200]);

    // eslint-disable-next-line no-console
    console.log('Smoke E2E passed');
  } finally {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  }
};

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(`Smoke E2E failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
