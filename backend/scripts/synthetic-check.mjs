const apiBaseUrl = (process.env.SYNTHETIC_API_BASE_URL ?? '').trim().replace(/\/$/, '');
const syntheticEmail = (process.env.SYNTHETIC_EMAIL ?? '').trim().toLowerCase();
const syntheticPassword = process.env.SYNTHETIC_PASSWORD ?? '';
const syntheticHealthToken = (process.env.SYNTHETIC_HEALTH_TOKEN ?? '').trim();
const syntheticVendorName = (
  process.env.SYNTHETIC_VENDOR_NAME ?? 'KiranaTrack Synthetic Monitor Vendor'
).trim();
const requestTimeoutMs = Math.min(
  Math.max(Number(process.env.SYNTHETIC_TIMEOUT_MS ?? 9000), 3000),
  30000,
);

if (!apiBaseUrl) {
  throw new Error('SYNTHETIC_API_BASE_URL is required');
}

if (!syntheticEmail || !syntheticPassword) {
  throw new Error('SYNTHETIC_EMAIL and SYNTHETIC_PASSWORD are required');
}

if (!syntheticVendorName) {
  throw new Error('SYNTHETIC_VENDOR_NAME must not be empty');
}

const withTimeout = async (url, init = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const requestJson = async (path, init = {}) => {
  const response = await withTimeout(`${apiBaseUrl}${path}`, init);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  return { response, payload, text };
};

const assertStatus = (name, response, allowed) => {
  if (!allowed.includes(response.status)) {
    throw new Error(`${name} failed with status=${response.status}`);
  }
};

const logStep = (message, context = {}) => {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'synthetic.check',
      message,
      ...context,
    }),
  );
};

const run = async () => {
  const health = await requestJson('/health');
  assertStatus('health', health.response, [200]);

  if (syntheticHealthToken) {
    const detailed = await requestJson('/health/detailed', {
      method: 'GET',
      headers: {
        'x-health-token': syntheticHealthToken,
      },
    });
    assertStatus('health/detailed', detailed.response, [200]);
  }

  const login = await requestJson('/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: syntheticEmail,
      password: syntheticPassword,
    }),
  });
  assertStatus('auth/login', login.response, [200]);

  const accessToken = login.payload?.data?.accessToken;
  if (!accessToken || typeof accessToken !== 'string') {
    throw new Error('auth/login response is missing accessToken');
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const billNumber = `SYN-${uniqueSuffix}`;
  const billDate = new Date().toISOString();

  const createVendor = await requestJson('/api/vendors', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: syntheticVendorName,
      phone: null,
      gstNumber: null,
      defaultCollectorName: 'Synthetic Collector',
    }),
  });
  assertStatus('create vendor', createVendor.response, [200, 201]);
  const vendorId = createVendor.payload?.data?._id;
  if (!vendorId) {
    throw new Error('create vendor response is missing vendor id');
  }

  const createBill = await requestJson('/api/bills', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      billNumber,
      vendorId,
      date: billDate,
      totalAmountPaise: 50000,
      imageUrl: 'https://example.com/synthetic-bill.jpg',
      imageHash: `synthetic-${uniqueSuffix}`,
      clientRequestId: `synthetic-bill-${uniqueSuffix}`,
      lineItems: [
        {
          name: 'Synthetic Item',
          qty: 1,
          ratePaise: 50000,
          amountPaise: 50000,
        },
      ],
    }),
  });
  assertStatus('create bill', createBill.response, [201, 200]);
  const billId = createBill.payload?.data?._id;
  if (!billId) {
    throw new Error('create bill response is missing bill id');
  }

  const addPayment = await requestJson(`/api/bills/${billId}/payments`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      amountPaise: 10000,
      date: billDate,
      collectorName: 'Synthetic Collector',
      mode: 'cash',
      notes: 'synthetic payment',
      clientRequestId: `synthetic-payment-${uniqueSuffix}`,
    }),
  });
  assertStatus('add payment', addPayment.response, [201, 200]);
  const paymentId = addPayment.payload?.data?._id;
  if (!paymentId) {
    throw new Error('add payment response is missing payment id');
  }

  const updatePayment = await requestJson(`/api/payments/${paymentId}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({
      amountPaise: 11000,
      date: billDate,
      collectorName: 'Synthetic Collector',
      mode: 'cash',
      notes: 'synthetic payment updated',
    }),
  });
  assertStatus('update payment', updatePayment.response, [200]);

  const analytics = await requestJson('/api/analytics/summary', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  assertStatus('analytics summary', analytics.response, [200]);

  const deletePayment = await requestJson(`/api/payments/${paymentId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  assertStatus('delete payment', deletePayment.response, [200]);

  const deleteBill = await requestJson(`/api/bills/${billId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  assertStatus('delete bill', deleteBill.response, [200]);

  logStep('synthetic check passed', {
    apiBaseUrl,
    requestTimeoutMs,
    syntheticVendorName,
  });
};

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'synthetic.check.failed',
      error: error instanceof Error ? error.message : String(error),
      apiBaseUrl,
    }),
  );
  process.exit(1);
});
