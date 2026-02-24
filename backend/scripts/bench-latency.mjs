import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

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

if (!fs.existsSync(backendEnvPath) || !fs.existsSync(mobileEnvPath)) {
  throw new Error('Missing backend/.env or mobile/.env');
}

const backendEnv = dotenv.parse(fs.readFileSync(backendEnvPath));
const mobileEnv = dotenv.parse(fs.readFileSync(mobileEnvPath));
const apiBaseUrl = `http://localhost:${backendEnv.PORT ?? '4000'}`;

const requestJson = async (token, method, endpoint, body) => {
  const startedAt = Date.now();
  const response = await fetch(`${apiBaseUrl}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const elapsedMs = Date.now() - startedAt;

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  return { response, json, elapsedMs };
};

const quantile = (arr, q) => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
  return sorted[idx];
};

const summarize = (samples) => {
  const avg = Math.round(samples.reduce((sum, n) => sum + n, 0) / Math.max(1, samples.length));
  return {
    count: samples.length,
    avg,
    min: Math.min(...samples),
    p95: quantile(samples, 0.95),
    max: Math.max(...samples),
  };
};

const record = (map, key, ms) => {
  const current = map.get(key) ?? [];
  current.push(ms);
  map.set(key, current);
};

const run = async () => {
  const supabaseUrl = backendEnv.SUPABASE_URL;
  const serviceRoleKey = backendEnv.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = mobileEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / EXPO_PUBLIC_SUPABASE_ANON_KEY');
  }

  const health = await fetch(`${apiBaseUrl}/health`);
  if (!health.ok) {
    throw new Error(`Backend not healthy on ${apiBaseUrl}`);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const email = `bench_${Date.now()}@example.com`;
  const password = 'BenchTest@12345';
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw new Error(`createUser failed: ${created.error?.message ?? 'unknown'}`);
  }
  const userId = created.data.user.id;

  const samples = new Map();

  try {
    const signed = await anon.auth.signInWithPassword({ email, password });
    const token = signed.data.session?.access_token;
    if (!token || signed.error) {
      throw new Error(`signIn failed: ${signed.error?.message ?? 'no access token'}`);
    }

    const vendorRes = await requestJson(token, 'POST', '/api/vendors', {
      name: `Bench Vendor ${Date.now()}`,
      phone: null,
      gstNumber: null,
      defaultCollectorName: 'Bench Collector',
    });
    if (!vendorRes.response.ok) {
      throw new Error(`vendor create failed: ${vendorRes.response.status}`);
    }
    record(samples, 'POST /api/vendors', vendorRes.elapsedMs);
    const vendorId = vendorRes.json?.data?._id;

    const billRes = await requestJson(token, 'POST', '/api/bills', {
      billNumber: `BENCH-${Date.now()}`,
      vendorId,
      date: new Date().toISOString(),
      totalAmountPaise: 120000,
      imageUrl: 'https://example.com/bill.jpg',
      imageHash: `bench-${Date.now()}`,
      lineItems: [{ name: 'Item', qty: 1, ratePaise: 120000, amountPaise: 120000 }],
    });
    if (!billRes.response.ok) {
      throw new Error(`bill create failed: ${billRes.response.status}`);
    }
    record(samples, 'POST /api/bills', billRes.elapsedMs);
    const billId = billRes.json?.data?._id;

    for (let i = 0; i < 5; i += 1) {
      const addPay = await requestJson(token, 'POST', `/api/bills/${billId}/payments`, {
        amountPaise: 1000 + i * 10,
        date: new Date().toISOString(),
        collectorName: 'Bench',
        mode: 'cash',
        notes: null,
      });
      if (!addPay.response.ok) {
        throw new Error(`payment create failed: ${addPay.response.status}`);
      }
      record(samples, 'POST /api/bills/:id/payments', addPay.elapsedMs);

      const paymentId = addPay.json?.data?._id;
      const editPay = await requestJson(token, 'PUT', `/api/payments/${paymentId}`, {
        amountPaise: 1100 + i * 10,
        date: new Date().toISOString(),
      });
      if (!editPay.response.ok) {
        throw new Error(`payment update failed: ${editPay.response.status}`);
      }
      record(samples, 'PUT /api/payments/:id', editPay.elapsedMs);

      const delPay = await requestJson(token, 'DELETE', `/api/payments/${paymentId}`);
      if (!delPay.response.ok) {
        throw new Error(`payment delete failed: ${delPay.response.status}`);
      }
      record(samples, 'DELETE /api/payments/:id', delPay.elapsedMs);
    }

    for (let i = 0; i < 5; i += 1) {
      const addItem = await requestJson(token, 'POST', '/api/outofstock', {
        itemName: `Bench Item ${Date.now()}-${i}`,
      });
      if (!addItem.response.ok) {
        throw new Error(`outofstock create failed: ${addItem.response.status}`);
      }
      record(samples, 'POST /api/outofstock', addItem.elapsedMs);

      const itemId = addItem.json?.data?._id;
      const updateItem = await requestJson(token, 'PUT', `/api/outofstock/${itemId}`, {
        status: 'ordered',
      });
      if (!updateItem.response.ok) {
        throw new Error(`outofstock update failed: ${updateItem.response.status}`);
      }
      record(samples, 'PUT /api/outofstock/:id', updateItem.elapsedMs);

      const deleteItem = await requestJson(token, 'DELETE', `/api/outofstock/${itemId}`);
      if (!deleteItem.response.ok) {
        throw new Error(`outofstock delete failed: ${deleteItem.response.status}`);
      }
      record(samples, 'DELETE /api/outofstock/:id', deleteItem.elapsedMs);
    }

    const deleteBill = await requestJson(token, 'DELETE', `/api/bills/${billId}`);
    if (!deleteBill.response.ok) {
      throw new Error(`bill delete failed: ${deleteBill.response.status}`);
    }
    record(samples, 'DELETE /api/bills/:id', deleteBill.elapsedMs);

    const rows = [...samples.entries()]
      .map(([route, arr]) => ({ route, ...summarize(arr) }))
      .sort((a, b) => b.avg - a.avg);

    // eslint-disable-next-line no-console
    console.table(rows);
  } finally {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  }
};

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(`Latency benchmark failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
