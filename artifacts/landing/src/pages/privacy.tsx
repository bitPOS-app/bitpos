import { BlueprintShell } from "@/components/blueprint";

function Sec({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-dashed border-[#F7931A]/20 pt-8 mt-8">
      <div className="flex items-baseline gap-3">
        <span className="font-['Ubuntu_Mono'] text-[11px] text-[#F7931A] flex-shrink-0">{n}</span>
        <h2 className="font-['Ubuntu'] text-[19px] font-bold text-white leading-tight">{title}</h2>
      </div>
      <div className="mt-4 space-y-3 font-['Ubuntu'] text-[15px] leading-relaxed text-white/65">
        {children}
      </div>
    </section>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="font-['Ubuntu_Mono'] text-[12px] text-[#F7931A] flex-shrink-0 mt-0.5">+</span>
      <span>{children}</span>
    </li>
  );
}

export default function Privacy() {
  return (
    <BlueprintShell>
      <main className="relative z-20 mx-auto max-w-[760px] px-5 sm:px-8 pb-20 pt-10">
        <span className="font-['Ubuntu_Mono'] text-[10px] uppercase tracking-[0.2em] text-[#F7931A]/80">
          Legal
        </span>
        <h1
          className="mt-3 font-['Ubuntu'] font-bold leading-[0.95] tracking-[-0.02em] text-white"
          style={{ fontSize: "clamp(34px, 6vw, 56px)" }}
        >
          PRIVACY POLICY
        </h1>
        <p className="mt-2 font-['Ubuntu_Mono'] text-[11px] uppercase tracking-[0.14em] text-white/35">
          Last updated: May 26, 2026
        </p>

        <p className="mt-8 font-['Ubuntu'] text-[15px] leading-relaxed text-white/65">
          bitPOS is a server-side application. Unlike a self-hosted or browser-only tool, your account
          data lives on our servers. This policy explains exactly what we store, why we store it, and
          what we do not do with it.
        </p>

        <Sec n="01" title="What We Store">
          <p>When you create an account and use bitPOS, the following is stored in our database:</p>
          <ul className="mt-2 space-y-2">
            <Li><><strong className="text-white/85">Account identity:</strong> your email address, username (handle), and a bcrypt hash of your PIN. Your PIN is never stored in plaintext.</></Li>
            <Li><><strong className="text-white/85">Lightning sub-wallet:</strong> when you register, bitPOS automatically provisions a Lightning sub-wallet for your account on our Alby Hub node. The internal connection credential for that sub-wallet is stored encrypted at rest (AES-256-GCM) on our servers. You never provide a NWC URL - this is handled entirely by bitPOS infrastructure.</></Li>
            <Li><><strong className="text-white/85">Transaction history:</strong> every payment you receive or send through bitPOS - amount, direction, timestamp, payment hash, Lightning address of counterpart (where available), and status. This is the ledger that backs your balance.</></Li>
            <Li><><strong className="text-white/85">Bolt Card data:</strong> for each NFC card linked to your account - the card UID, programmed keys (encrypted at rest), and spend limits. This is required to authenticate card tap payments.</></Li>
            <Li><><strong className="text-white/85">Session data:</strong> an HTTP-only session cookie used to keep you logged in. Sessions expire on logout or after inactivity.</></Li>
            <Li><><strong className="text-white/85">Login security data:</strong> failed login attempt count and temporary lockout timestamps, to protect against brute-force attacks.</></Li>
          </ul>
        </Sec>

        <Sec n="02" title="What We Store for Card Orders">
          <p>
            If you purchase a physical Bolt Card through the bitPOS shop, we collect the shipping name
            and address you provide. This information is encrypted at rest and shared with our
            third-party print and fulfillment provider solely to fulfil your order. We do not retain it
            after fulfillment is complete.
          </p>
        </Sec>

        <Sec n="03" title="What We Do Not Store">
          <ul className="space-y-2">
            <Li>We do not store your PIN in plaintext - only a one-way bcrypt hash.</Li>
            <Li>We do not log the full content of Lightning invoices beyond what is necessary for the ledger.</Li>
            <Li>We do not run advertising trackers, analytics pixels, or third-party session recording scripts.</Li>
            <Li>We do not sell, rent, or share your data with third parties for commercial purposes.</Li>
          </ul>
        </Sec>

        <Sec n="04" title="Server Logs and IP Addresses">
          <p>
            Our API server logs every inbound request for operational purposes - this includes the HTTP
            method, URL path (not query strings or request bodies), response status code, and response
            time. IP addresses are used for rate limiting (to prevent brute-force attacks) and are not
            retained in long-term logs. Log files are rotated and purged automatically.
          </p>
        </Sec>

        <Sec n="05" title="Third-Party Services">
          <p>bitPOS relies on the following external services to operate:</p>
          <ul className="mt-2 space-y-2">
            <Li><><strong className="text-white/85">Alby Hub (NWC):</strong> your Lightning sub-wallet is provisioned on an Alby Hub instance. Payments flow through Alby's infrastructure. Their privacy policy applies to the underlying Lightning node.</></Li>
            <Li><><strong className="text-white/85">Exchange rate feeds:</strong> real-time BTC/fiat price data is fetched from public price APIs. No user data is sent to these APIs.</></Li>
            <Li><><strong className="text-white/85">Print fulfillment provider:</strong> shipping address data is sent to fulfil physical card orders only.</></Li>
          </ul>
        </Sec>

        <Sec n="06" title="Verify What Runs">
          <p>
            The server-side code that handles your data is fully open source under AGPL-3.0 at{" "}
            <a
              href="https://github.com/bitPOS-app/bitpos"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#F7931A] transition-colors hover:underline"
            >
              github.com/bitPOS-app/bitpos
            </a>. The commit hash of the deployed binary is exposed at{" "}
            <a
              href="/api/version"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#F7931A] transition-colors hover:underline"
            >
              /api/version
            </a>{" "}
            so you can verify that what runs in production matches the published source.
          </p>
        </Sec>

        <Sec n="07" title="Account Deletion">
          <p>
            You may permanently delete your account from the account settings. Deletion removes your
            entity record, account record, and associated data from our database. Transaction records
            may be retained in anonymised form for financial accounting purposes. Withdraw your balance
            before deleting - it cannot be recovered afterwards.
          </p>
        </Sec>

        <Sec n="08" title="Changes to This Policy">
          <p>
            We will update the "Last updated" date when this policy changes. For material changes, we
            will post a notice in the app. The full history of this policy is visible in the public
            GitHub repository.
          </p>
        </Sec>

        <Sec n="09" title="Contact">
          <p>
            Privacy questions can be directed to the project's public GitHub repository at{" "}
            <a
              href="https://github.com/bitPOS-app/bitpos"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#F7931A] transition-colors hover:underline"
            >
              github.com/bitPOS-app/bitpos
            </a>.
          </p>
        </Sec>
      </main>
    </BlueprintShell>
  );
}
