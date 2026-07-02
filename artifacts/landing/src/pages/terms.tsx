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

export default function Terms() {
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
          TERMS OF SERVICE
        </h1>
        <p className="mt-2 font-['Ubuntu_Mono'] text-[11px] uppercase tracking-[0.14em] text-white/35">
          Last updated: May 26, 2026
        </p>

        <p className="mt-8 font-['Ubuntu'] text-[15px] leading-relaxed text-white/65">
          These terms govern your use of bitPOS at bitpos.app. By creating an account, you agree to them.
          Read them - they are short and honest.
        </p>

        <Sec n="01" title="What bitPOS Is">
          <p>
            bitPOS is a <strong className="text-white/85">managed-custody</strong> Lightning point-of-sale service. When you receive
            a Lightning payment through bitPOS, your funds are held in a virtual balance on our Lightning
            node (powered by Alby Hub). We hold the keys. The balance on your account is a liability we
            owe you - not a self-custodied wallet.
          </p>
          <p>
            The source code that runs this service is published on GitHub under AGPL-3.0. You can read
            every line of code that handles your money, and you can verify that the deployed binary
            matches what is published by checking the commit hash shown in the footer.
          </p>
        </Sec>

        <Sec n="02" title="Fees">
          <ul className="space-y-2">
            <Li><><strong className="text-white/85">Receiving payments:</strong> Free. No fee to receive Lightning payments.</></Li>
            <Li><><strong className="text-white/85">Sending to an external Lightning address:</strong> 3% of the payment amount, deducted at the time of payment.</></Li>
            <Li><><strong className="text-white/85">Transfers between bitPOS accounts:</strong> Free. Internal transfers settle instantly with no fee.</></Li>
            <Li><><strong className="text-white/85">Bolt Cards:</strong> Card purchase prices are shown in the shop. No additional issuance fee beyond the card price.</></Li>
          </ul>
          <p>
            Fees are non-refundable. Lightning payments are irreversible by protocol - once a payment is
            sent, it cannot be recalled.
          </p>
        </Sec>

        <Sec n="03" title="Withdrawing Your Balance">
          <p>
            You can withdraw your balance at any time by sending to an external Lightning address or
            Lightning invoice. There is no lock-up period and no withdrawal limit beyond what the
            Lightning Network routing allows.
          </p>
          <p>
            We strongly recommend withdrawing your balance to a self-custodied wallet regularly.
            Do not treat bitPOS as a long-term store of value.
          </p>
        </Sec>

        <Sec n="04" title="Acceptable Use">
          <p>
            You are responsible for complying with the laws of your jurisdiction regarding the acceptance
            of Bitcoin and digital assets. bitPOS does not verify merchants or their business types.
            You may not use bitPOS for illegal activity, fraud, or sanctions evasion.
          </p>
          <p>
            We reserve the right to suspend or terminate accounts that we reasonably believe are being
            used in violation of these terms or applicable law.
          </p>
        </Sec>

        <Sec n="05" title="Account Termination">
          <p>
            You may delete your account at any time from the account settings. Deleting your account
            will permanently remove your account data. Withdraw your balance before deleting - once an
            account is deleted, any remaining balance cannot be recovered.
          </p>
          <p>
            If we suspend or terminate your account, we will make reasonable efforts to give you
            sufficient notice to withdraw your funds first, unless the account is suspected of fraud
            or illegal activity.
          </p>
        </Sec>

        <Sec n="06" title="Bolt Cards">
          <p>
            Bolt Cards issued by bitPOS are programmed using the open LNURL-withdraw standard and work
            at any compatible Bolt Card terminal, not only bitPOS. The card credentials (UID and keys)
            are stored on our servers to authenticate tap transactions. If you cancel a card, its
            credentials are invalidated on our servers and the card becomes inert.
          </p>
          <p>
            Physical cards are shipped by a third-party print and fulfillment provider. Once a card
            order is placed, it cannot be cancelled or refunded.
          </p>
        </Sec>

        <Sec n="07" title="No Warranties">
          <p>
            bitPOS is provided "as is." We do not guarantee uninterrupted service, specific uptime,
            or that Lightning payments will always route successfully. The Lightning Network is a live
            payment network with real routing constraints - payment failures are possible and do not
            represent a breach of these terms.
          </p>
        </Sec>

        <Sec n="08" title="Limitation of Liability">
          <p>
            To the extent permitted by law, bitPOS and its operators are not liable for lost funds
            caused by Lightning routing failures, your own actions (forgotten PIN, unauthorized access
            to your session), third-party service outages, or force majeure events. Our liability to
            you will not exceed the balance held in your account at the time of the claim.
          </p>
        </Sec>

        <Sec n="09" title="Changes to These Terms">
          <p>
            We will update the "Last updated" date when these terms change. For material changes, we
            will also post a notice in the app. Continued use of bitPOS after changes constitutes
            acceptance of the revised terms.
          </p>
        </Sec>

        <Sec n="10" title="Contact">
          <p>
            Questions about these terms can be directed to the project's public GitHub repository at{" "}
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
