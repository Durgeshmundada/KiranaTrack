import { Router } from 'express';

type PublicPage = {
  title: string;
  description: string;
  body: string;
};

const publicPagesRouter = Router();
const supportEmail = 'mundadadurgesh@gmail.com';
const appDownloadUrl = 'https://expo.dev/artifacts/eas/fsMz585vTH36FNtPxgG2nm.apk';
const appDownloadExpiresLabel = 'June 6, 2026';
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
        <p>The app helps merchants maintain digital records and collect customer udhaar through secure Razorpay payment links.</p>
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
          <li>Creates Razorpay payment links for exact outstanding udhaar amounts.</li>
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
        <p>Last updated: May 22, 2026</p>
        <p>KiranaTrack respects your privacy. This policy explains what information the app processes and how it is used.</p>
        <h2>Information We Collect</h2>
        <ul>
          <li>Account information such as email address and authentication session details.</li>
          <li>Business records entered by the user, including vendors, bills, payments, customer names, phone numbers, udhaar entries, and out-of-stock items.</li>
          <li>Payment link and repayment information needed to process Razorpay payment links.</li>
          <li>Basic technical logs needed to keep the service reliable and secure.</li>
        </ul>
        <h2>How We Use Information</h2>
        <ul>
          <li>To provide bill, udhaar, payment, and reporting features.</li>
          <li>To create and track Razorpay payment links requested by the merchant.</li>
          <li>To secure accounts, prevent misuse, and troubleshoot support requests.</li>
          <li>To improve reliability and performance of the service.</li>
        </ul>
        <h2>Sharing</h2>
        <p>We do not sell user data. Payment information may be shared with Razorpay only as required to create and process payment links. Data may also be stored with trusted infrastructure providers used to operate the application.</p>
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
        <p>Last updated: May 22, 2026</p>
        <p>By using KiranaTrack, you agree to these terms.</p>
        <h2>Use of the App</h2>
        <p>KiranaTrack is intended for merchants and small businesses to maintain operational records such as bills, payments, customer udhaar, and inventory reminders. Users are responsible for the accuracy of information they enter into the app.</p>
        <h2>Payments</h2>
        <p>Razorpay payment links are generated only when the merchant requests collection for an outstanding udhaar balance. The payment amount is based on the customer ledger maintained in the app.</p>
        <h2>User Responsibilities</h2>
        <ul>
          <li>Maintain accurate customer, phone, bill, payment, and udhaar records.</li>
          <li>Use payment links only for genuine outstanding amounts.</li>
          <li>Protect login credentials and device access.</li>
          <li>Comply with applicable tax, accounting, consumer, and payment regulations.</li>
        </ul>
        <h2>Service Availability</h2>
        <p>We aim to keep the service available, but interruptions may occur due to maintenance, network issues, third-party providers, or events outside our control.</p>
        <h2>Limitation</h2>
        <p>KiranaTrack is a record-keeping and payment-link utility. It does not provide tax, legal, or accounting advice.</p>
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
          <p>Last updated: May 22, 2026</p>
          <h2>Cancellation</h2>
          <p>KiranaTrack payment links are created for customer udhaar repayment. A customer is not required to pay until they open and complete the payment link. Unpaid payment links may expire or be cancelled according to Razorpay and merchant handling rules.</p>
          <h2>Refunds</h2>
          <p>Completed payments are treated as repayment against the customer's outstanding udhaar balance. If a payment was made by mistake, duplicated, or made for an incorrect amount, the customer or merchant should contact KiranaTrack support at <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>
          <p>Refund requests are reviewed against the merchant ledger, Razorpay payment status, and repayment records. Approved refunds are processed through the original payment method where possible and may take time based on Razorpay, bank, and payment network timelines.</p>
          <h2>Disputes</h2>
          <p>For payment disputes, include the customer name, phone number, payment link, payment date, and amount when contacting support.</p>
        `,
      }),
    );
  },
);

export { publicPagesRouter };
