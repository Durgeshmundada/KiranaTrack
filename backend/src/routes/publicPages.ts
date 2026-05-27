import express, { Router } from 'express';

import { getRazorpayKeyId } from '../services/razorpay';
import { confirmAppSubscriptionCheckoutPayment } from '../services/subscription';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpError, sendOk } from '../utils/http';

type PublicPage = {
  title: string;
  description: string;
  body: string;
};

const publicPagesRouter = Router();
const supportEmail = 'mundadadurgesh@gmail.com';
const appDownloadUrl = 'https://expo.dev/artifacts/eas/sqpKxH7aLpwJWpSd4Vaosf.apk';
const appDownloadExpiresLabel = 'June 10, 2026';
const siteLinks = [
  { href: '/', label: 'Home' },
  { href: '/download', label: 'Download App' },
  { href: '/about-us', label: 'About Us' },
  { href: '/contact-us', label: 'Contact Us' },
  { href: '/privacy-policy', label: 'Privacy Policy' },
  { href: '/terms-and-conditions', label: 'Terms & Conditions' },
  { href: '/cancellation-refund-policies', label: 'Cancellation/Refund Policies' },
];

const shell = (page: PublicPage): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${page.title} | KiranaTrack</title>
    <meta name="description" content="${page.description}" />
    <style>
      :root {
        color-scheme: light;
        --bg: #f8fafc;
        --panel: #ffffff;
        --text: #0f172a;
        --muted: #475569;
        --line: #cbd5e1;
        --accent: #2563eb;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font-family: Arial, Helvetica, sans-serif;
        line-height: 1.6;
      }
      header {
        background: #0b1120;
        color: #f8fafc;
        padding: 28px 20px;
      }
      .wrap {
        width: min(920px, calc(100% - 32px));
        margin: 0 auto;
      }
      .brand {
        margin: 0;
        font-size: 32px;
        letter-spacing: 0;
      }
      .tagline {
        margin: 6px 0 0;
        color: #cbd5e1;
      }
      nav {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 18px;
      }
      nav a {
        color: #dbeafe;
        text-decoration: none;
        border: 1px solid rgba(219, 234, 254, 0.35);
        border-radius: 6px;
        padding: 6px 10px;
      }
      main {
        padding: 28px 0 44px;
      }
      article {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 24px;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 30px;
        letter-spacing: 0;
      }
      h2 {
        margin: 24px 0 8px;
        font-size: 20px;
        letter-spacing: 0;
      }
      p {
        margin: 0 0 12px;
        color: var(--muted);
      }
      ul {
        color: var(--muted);
        margin: 8px 0 16px;
        padding-left: 20px;
      }
      a {
        color: var(--accent);
      }
      .button-link {
        display: inline-block;
        background: var(--accent);
        color: #ffffff;
        border-radius: 6px;
        padding: 10px 14px;
        text-decoration: none;
        font-weight: 700;
      }
      .meta {
        font-size: 14px;
      }
      .notice {
        border-left: 4px solid var(--accent);
        background: #eff6ff;
        padding: 12px 14px;
        margin: 16px 0;
        color: #1e3a8a;
      }
      footer {
        border-top: 1px solid var(--line);
        color: var(--muted);
        padding: 18px 0 28px;
      }
    </style>
  </head>
  <body>
    <header>
      <div class="wrap">
        <p class="brand">KiranaTrack</p>
        <p class="tagline">Mobile bill, udhaar, payment, and inventory tracking for small retailers.</p>
        <nav aria-label="Primary navigation">
          ${siteLinks
            .map((link) => `<a href="${link.href}">${link.label}</a>`)
            .join('')}
        </nav>
      </div>
    </header>
    <main>
      <div class="wrap">
        <article>
          ${page.body}
        </article>
      </div>
    </main>
    <footer>
      <div class="wrap">
        KiranaTrack. Support: <a href="mailto:${supportEmail}">${supportEmail}</a>
      </div>
    </footer>
  </body>
</html>`;

const render = (page: PublicPage): string => shell(page);

const safeJsonForHtml = (value: unknown): string =>
  (JSON.stringify(value) ?? 'null')
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

const isValidRazorpaySubscriptionId = (value: string): boolean =>
  /^sub_[A-Za-z0-9]+$/.test(value);

const readBodyString = (body: unknown, key: string): string | null => {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const subscriptionCheckoutCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://*.razorpay.com",
  "style-src 'self' 'unsafe-inline' https://*.razorpay.com",
  "img-src 'self' data: https://*.razorpay.com https://*.razorpay.in",
  "connect-src 'self' https://*.razorpay.com https://*.razorpay.in",
  "frame-src https://*.razorpay.com https://*.razorpay.in",
  "form-action 'self' https://*.razorpay.com https://*.razorpay.in",
  "frame-ancestors 'self'",
  "object-src 'none'",
].join('; ');

const renderSubscriptionCheckout = (params: {
  keyId: string;
  subscriptionId: string;
  verifyUrl: string;
  appReturnUrl: string;
}): string => {
  const checkoutOptions = {
    key: params.keyId,
    subscription_id: params.subscriptionId,
    name: 'KiranaTrack',
    description: 'Rs 1/month app access',
    theme: {
      color: '#f59e0b',
    },
    retry: {
      enabled: true,
    },
  };

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>KiranaTrack Subscription Checkout</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0b1120;
        --panel: #111827;
        --text: #f8fafc;
        --muted: #cbd5e1;
        --line: #334155;
        --accent: #f59e0b;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background: var(--bg);
        color: var(--text);
        font-family: Arial, Helvetica, sans-serif;
        display: grid;
        place-items: center;
        padding: 20px;
      }
      main {
        width: min(460px, 100%);
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 22px;
      }
      h1 {
        margin: 0 0 10px;
        font-size: 26px;
        letter-spacing: 0;
      }
      p {
        color: var(--muted);
        line-height: 1.5;
        margin: 0 0 14px;
      }
      button, a.button {
        width: 100%;
        border: 0;
        border-radius: 8px;
        padding: 14px 16px;
        background: var(--accent);
        color: #111827;
        font-size: 17px;
        font-weight: 700;
        text-align: center;
        text-decoration: none;
        display: block;
      }
      a.button {
        margin-top: 10px;
        background: #1d4ed8;
        color: #ffffff;
      }
      .status {
        min-height: 46px;
        margin-top: 14px;
        color: var(--muted);
      }
      .error {
        color: #fecaca;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>KiranaTrack Auto Pay</h1>
      <p>Start the Rs 1/month subscription. Choose UPI on Razorpay to open payment apps available on this phone.</p>
      <button id="pay-button" type="button">Open UPI Checkout</button>
      <a class="button" href="${params.appReturnUrl}">Return to App</a>
      <p id="status" class="status">Opening Razorpay checkout...</p>
    </main>
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
    <script>
      const checkoutOptions = ${safeJsonForHtml(checkoutOptions)};
      const verifyUrl = ${safeJsonForHtml(params.verifyUrl)};
      const appReturnUrl = ${safeJsonForHtml(params.appReturnUrl)};
      const statusEl = document.getElementById('status');
      const payButton = document.getElementById('pay-button');

      function setStatus(message, isError) {
        statusEl.textContent = message;
        statusEl.className = isError ? 'status error' : 'status';
      }

      checkoutOptions.handler = async function (response) {
        setStatus('Payment received. Verifying subscription...');
        try {
          const verifyResponse = await fetch(verifyUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(response),
          });
          if (!verifyResponse.ok) {
            throw new Error('Verification failed');
          }

          setStatus('Subscription verified. Returning to app...');
          window.setTimeout(function () {
            window.location.href = appReturnUrl + '?subscription=success';
          }, 700);
        } catch (_error) {
          setStatus('Payment finished, but the app could not refresh automatically. Return to the app and tap refresh.', true);
        }
      };

      checkoutOptions.modal = {
        ondismiss: function () {
          setStatus('Checkout closed. Tap Open UPI Checkout to try again.');
        },
      };

      function openCheckout() {
        if (!window.Razorpay) {
          setStatus('Razorpay checkout is still loading. Try again in a moment.', true);
          return;
        }

        const checkout = new window.Razorpay(checkoutOptions);
        checkout.open();
        setStatus('Choose UPI in Razorpay to continue in your payment app.');
      }

      payButton.addEventListener('click', openCheckout);
      window.addEventListener('load', function () {
        window.setTimeout(openCheckout, 350);
      });
    </script>
  </body>
</html>`;
};

publicPagesRouter.get('/subscription/checkout/:subscriptionId', (req, res) => {
  const subscriptionId = req.params.subscriptionId;
  if (!isValidRazorpaySubscriptionId(subscriptionId)) {
    throw new HttpError(404, 'Subscription checkout not found');
  }

  res.setHeader('Content-Security-Policy', subscriptionCheckoutCsp);
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(
    renderSubscriptionCheckout({
      keyId: getRazorpayKeyId(),
      subscriptionId,
      verifyUrl: `${req.protocol}://${req.get('host')}/subscription/checkout/verify`,
      appReturnUrl: 'kiranatrack:///',
    }),
  );
});

publicPagesRouter.post(
  '/subscription/checkout/verify',
  express.json({ limit: '20kb' }),
  asyncHandler(async (req, res) => {
    const paymentId = readBodyString(req.body, 'razorpay_payment_id');
    const subscriptionId = readBodyString(req.body, 'razorpay_subscription_id');
    const signature = readBodyString(req.body, 'razorpay_signature');

    if (!paymentId || !subscriptionId || !signature) {
      throw new HttpError(400, 'Missing Razorpay checkout response');
    }

    sendOk(
      res,
      await confirmAppSubscriptionCheckoutPayment({
        paymentId,
        subscriptionId,
        signature,
      }),
    );
  }),
);

publicPagesRouter.get('/download', (_req, res) => {
  res.redirect(302, appDownloadUrl);
});

publicPagesRouter.get('/', (_req, res) => {
  res.type('html').send(
    render({
      title: 'Home',
      description: 'KiranaTrack app information and policy pages.',
      body: `
        <h1>KiranaTrack</h1>
        <p>KiranaTrack is a mobile application for kirana stores and small retailers to manage supplier bills, customer udhaar, repayments, out-of-stock items, and business analytics.</p>
        <p>The app helps merchants maintain digital records with a Rs 1/month Razorpay subscription for editing access.</p>
        <h2>Download the App</h2>
        <p>Install the current Android preview APK for KiranaTrack.</p>
        <p><a class="button-link" href="/download">Download Android APK</a></p>
        <p class="meta">This internal testing download link is valid until ${appDownloadExpiresLabel}.</p>
        <div class="notice">Use this website to review KiranaTrack app information, contact details, privacy policy, terms, and cancellation/refund policies.</div>
        <h2>Important Pages</h2>
        <ul>
          <li><a href="/download">Download App</a></li>
          <li><a href="/about-us">About Us</a></li>
          <li><a href="/contact-us">Contact Us</a></li>
          <li><a href="/privacy-policy">Privacy Policy</a></li>
          <li><a href="/terms-and-conditions">Terms & Conditions</a></li>
          <li><a href="/cancellation-refund-policies">Cancellation/Refund Policies</a></li>
        </ul>
      `,
    }),
  );
});

publicPagesRouter.get(['/about-us', '/about'], (_req, res) => {
  res.type('html').send(
    render({
      title: 'About Us',
      description: 'About KiranaTrack.',
      body: `
        <h1>About Us</h1>
        <p>KiranaTrack is built for small retailers, grocery stores, and kirana businesses that need a simple way to track daily purchase bills, supplier payments, customer udhaar, repayments, and stock reminders.</p>
        <p>The application is operated by Durgesh Mundada under the KiranaTrack name.</p>
        <h2>What KiranaTrack Does</h2>
        <ul>
          <li>Stores supplier bills and payment records.</li>
          <li>Maintains customer udhaar ledgers and repayment history.</li>
          <li>Uses Razorpay subscriptions for app access.</li>
          <li>Provides basic analytics and monthly reports for shop operations.</li>
        </ul>
      `,
    }),
  );
});

publicPagesRouter.get(['/contact-us', '/contact'], (_req, res) => {
  res.type('html').send(
    render({
      title: 'Contact Us',
      description: 'Contact KiranaTrack support.',
      body: `
        <h1>Contact Us</h1>
        <p>For product support, payment questions, refund requests, account help, or policy questions, contact KiranaTrack support.</p>
        <h2>Support Email</h2>
        <p><a href="mailto:${supportEmail}">${supportEmail}</a></p>
        <h2>App Download</h2>
        <p><a href="/download">Download the current Android APK</a></p>
        <h2>Response Time</h2>
        <p>We usually respond within 2 business days.</p>
        <h2>App Name</h2>
        <p>KiranaTrack</p>
      `,
    }),
  );
});

publicPagesRouter.get('/privacy-policy', (_req, res) => {
  res.type('html').send(
    render({
      title: 'Privacy Policy',
      description: 'KiranaTrack privacy policy.',
      body: `
        <h1>Privacy Policy</h1>
        <p>Last updated: May 23, 2026</p>
        <p>KiranaTrack respects your privacy. This policy explains what information the app processes and how it is used.</p>
        <h2>Information We Collect</h2>
        <ul>
          <li>Account information such as email address and authentication session details.</li>
          <li>Business records entered by the user, including vendors, bills, payments, customer names, phone numbers, udhaar entries, and out-of-stock items.</li>
          <li>Subscription and payment status information needed to process Razorpay app access.</li>
          <li>Basic technical logs needed to keep the service reliable and secure.</li>
        </ul>
        <h2>How We Use Information</h2>
        <ul>
          <li>To provide bill, udhaar, payment, and reporting features.</li>
          <li>To create and track Razorpay subscriptions for app access.</li>
          <li>To secure accounts, prevent misuse, and troubleshoot support requests.</li>
          <li>To improve reliability and performance of the service.</li>
        </ul>
        <h2>Sharing</h2>
        <p>We do not sell user data. Payment information may be shared with Razorpay only as required to create and process app subscriptions. Data may also be stored with trusted infrastructure providers used to operate the application.</p>
        <h2>Data Security</h2>
        <p>We use authentication, server-side access controls, and secure infrastructure practices to protect business records. No system can be guaranteed to be completely secure, so users should keep login credentials private.</p>
        <h2>Data Retention</h2>
        <p>Business records are retained while the account is active or as required for operational, legal, accounting, or dispute resolution purposes.</p>
        <h2>Contact</h2>
        <p>For privacy questions, email <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>
      `,
    }),
  );
});

publicPagesRouter.get('/terms-and-conditions', (_req, res) => {
  res.type('html').send(
    render({
      title: 'Terms & Conditions',
      description: 'KiranaTrack terms and conditions.',
      body: `
        <h1>Terms & Conditions</h1>
        <p>Last updated: May 23, 2026</p>
        <p>By using KiranaTrack, you agree to these terms.</p>
        <h2>Use of the App</h2>
        <p>KiranaTrack is intended for merchants and small businesses to maintain operational records such as bills, payments, customer udhaar, and inventory reminders. Users are responsible for the accuracy of information they enter into the app.</p>
        <h2>Payments</h2>
        <p>KiranaTrack requires a Rs 1/month subscription to use editing features. If the subscription expires, the account remains view-only until payment is completed.</p>
        <h2>User Responsibilities</h2>
        <ul>
          <li>Maintain accurate customer, phone, bill, payment, and udhaar records.</li>
          <li>Keep the app subscription active to use editing features.</li>
          <li>Protect login credentials and device access.</li>
          <li>Comply with applicable tax, accounting, consumer, and payment regulations.</li>
        </ul>
        <h2>Service Availability</h2>
        <p>We aim to keep the service available, but interruptions may occur due to maintenance, network issues, third-party providers, or events outside our control.</p>
        <h2>Limitation</h2>
        <p>KiranaTrack is a record-keeping utility. It does not provide tax, legal, or accounting advice.</p>
        <h2>Contact</h2>
        <p>For terms-related questions, email <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>
      `,
    }),
  );
});

publicPagesRouter.get(
  ['/cancellation-refund-policies', '/cancellation-refund-policy'],
  (_req, res) => {
    res.type('html').send(
      render({
        title: 'Cancellation/Refund Policies',
        description: 'KiranaTrack cancellation and refund policies.',
        body: `
          <h1>Cancellation/Refund Policies</h1>
          <p>Last updated: May 23, 2026</p>
          <h2>Cancellation</h2>
          <p>KiranaTrack subscriptions can be cancelled by contacting support. Auto pay is scheduled to stop at the end of the paid billing cycle when possible.</p>
          <h2>Refunds</h2>
          <p>If a subscription payment was made by mistake, duplicated, or charged incorrectly, the user should contact KiranaTrack support at <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>
          <p>Refund requests are reviewed against account access, Razorpay payment status, and billing records. Approved refunds are processed through the original payment method where possible and may take time based on Razorpay, bank, and payment network timelines.</p>
          <h2>Disputes</h2>
          <p>For payment disputes, include the account email, Razorpay payment id if available, payment date, and amount when contacting support.</p>
        `,
      }),
    );
  },
);

export { publicPagesRouter };
