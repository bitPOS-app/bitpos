export default function Privacy() {
  return (
    <div className="container mx-auto px-4 py-16 md:py-24 max-w-3xl">
      <div className="mb-12">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Privacy Policy</h1>
        <p className="text-muted-foreground">Last updated: May 26, 2026</p>
      </div>

      <div className="prose prose-invert prose-orange max-w-none">
        <p>
          bitPOS is a server-side application. Unlike a self-hosted or browser-only tool, your account
          data lives on our servers. This policy explains exactly what we store, why we store it, and
          what we do not do with it.
        </p>

        <h2>1. What We Store</h2>
        <p>
          When you create an account and use bitPOS, the following is stored in our database:
        </p>
        <ul>
          <li><strong>Account identity:</strong> your email address, username (handle), and a bcrypt hash of your PIN. Your PIN is never stored in plaintext.</li>
          <li><strong>Lightning sub-wallet:</strong> when you register, bitPOS automatically provisions a Lightning sub-wallet for your account on our Alby Hub node. The internal connection credential for that sub-wallet is stored encrypted at rest (AES-256-GCM) on our servers. You never provide a NWC URL — this is handled entirely by bitPOS infrastructure.</li>
          <li><strong>Transaction history:</strong> every payment you receive or send through bitPOS — amount, direction, timestamp, payment hash, Lightning address of counterpart (where available), and status. This is the ledger that backs your balance.</li>
          <li><strong>Bolt Card data:</strong> for each NFC card linked to your account — the card UID, programmed keys (encrypted at rest), and spend limits. This is required to authenticate card tap payments.</li>
          <li><strong>Session data:</strong> an HTTP-only session cookie used to keep you logged in. Sessions expire on logout or after inactivity.</li>
          <li><strong>Login security data:</strong> failed login attempt count and temporary lockout timestamps, to protect against brute-force attacks.</li>
        </ul>

        <h2>2. What We Store for Card Orders</h2>
        <p>
          If you purchase a physical Bolt Card through the bitPOS shop, we collect the shipping name
          and address you provide. This information is encrypted at rest and shared with our
          third-party print and fulfillment provider solely to fulfil your order. We do not retain it
          after fulfillment is complete.
        </p>

        <h2>3. What We Do Not Store</h2>
        <ul>
          <li>We do not store your PIN in plaintext — only a one-way bcrypt hash.</li>
          <li>We do not log the full content of Lightning invoices beyond what is necessary for the ledger.</li>
          <li>We do not run advertising trackers, analytics pixels, or third-party session recording scripts.</li>
          <li>We do not sell, rent, or share your data with third parties for commercial purposes.</li>
        </ul>

        <h2>4. Server Logs and IP Addresses</h2>
        <p>
          Our API server logs every inbound request for operational purposes — this includes the HTTP
          method, URL path (not query strings or request bodies), response status code, and response
          time. IP addresses are used for rate limiting (to prevent brute-force attacks) and are not
          retained in long-term logs. Log files are rotated and purged automatically.
        </p>

        <h2>5. Third-Party Services</h2>
        <p>
          bitPOS relies on the following external services to operate:
        </p>
        <ul>
          <li><strong>Alby Hub (NWC):</strong> your Lightning sub-wallet is provisioned on an Alby Hub instance. Payments flow through Alby's infrastructure. Their privacy policy applies to the underlying Lightning node.</li>
          <li><strong>Exchange rate feeds:</strong> real-time BTC/fiat price data is fetched from public price APIs. No user data is sent to these APIs.</li>
          <li><strong>Print fulfillment provider:</strong> shipping address data is sent to fulfil physical card orders only.</li>
        </ul>

        <h2>6. Verify What Runs</h2>
        <p>
          The server-side code that handles your data is fully open source under AGPL-3.0 at{" "}
          <a href="https://github.com/bitPOS-app/bitpos" target="_blank" rel="noopener noreferrer">
            github.com/bitPOS-app/bitpos
          </a>. The commit hash of the deployed binary is exposed at{" "}
          <a href="/api/version" target="_blank" rel="noopener noreferrer">/api/version</a> so you
          can verify that what runs in production matches the published source.
        </p>

        <h2>7. Account Deletion</h2>
        <p>
          You may permanently delete your account from the account settings. Deletion removes your
          entity record, account record, and associated data from our database. Transaction records
          may be retained in anonymised form for financial accounting purposes. Withdraw your balance
          before deleting — it cannot be recovered afterwards.
        </p>

        <h2>8. Changes to This Policy</h2>
        <p>
          We will update the "Last updated" date when this policy changes. For material changes, we
          will post a notice in the app. The full history of this policy is visible in the public
          GitHub repository.
        </p>

        <h2>9. Contact</h2>
        <p>
          Privacy questions can be directed to the project's public GitHub repository at{" "}
          <a href="https://github.com/bitPOS-app/bitpos" target="_blank" rel="noopener noreferrer">
            github.com/bitPOS-app/bitpos
          </a>.
        </p>
      </div>
    </div>
  );
}
