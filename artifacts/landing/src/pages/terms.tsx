export default function Terms() {
  return (
    <div className="container mx-auto px-4 py-16 md:py-24 max-w-3xl">
      <div className="mb-12">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Terms of Service</h1>
        <p className="text-muted-foreground">Last updated: May 26, 2026</p>
      </div>

      <div className="prose prose-invert prose-orange max-w-none">
        <p>
          These terms govern your use of bitPOS at bitpos.app. By creating an account, you agree to them.
          Read them — they are short and honest.
        </p>

        <h2>1. What bitPOS Is</h2>
        <p>
          bitPOS is a <strong>managed-custody</strong> Lightning point-of-sale service. When you receive
          a Lightning payment through bitPOS, your funds are held in a virtual balance on our Lightning
          node (powered by Alby Hub). We hold the keys. The balance on your account is a liability we
          owe you — not a self-custodied wallet.
        </p>
        <p>
          The source code that runs this service is published on GitHub under AGPL-3.0. You can read
          every line of code that handles your money, and you can verify that the deployed binary
          matches what is published by checking the commit hash shown in the footer.
        </p>

        <h2>2. Fees</h2>
        <ul>
          <li><strong>Receiving payments:</strong> Free. No fee to receive Lightning payments.</li>
          <li><strong>Sending to an external Lightning address:</strong> 3% of the payment amount, deducted at the time of payment.</li>
          <li><strong>Transfers between bitPOS accounts:</strong> Free. Internal transfers settle instantly with no fee.</li>
          <li><strong>Bolt Cards:</strong> Card purchase prices are shown in the shop. No additional issuance fee beyond the card price.</li>
        </ul>
        <p>
          Fees are non-refundable. Lightning payments are irreversible by protocol — once a payment is
          sent, it cannot be recalled.
        </p>

        <h2>3. Withdrawing Your Balance</h2>
        <p>
          You can withdraw your balance at any time by sending to an external Lightning address or
          Lightning invoice. There is no lock-up period and no withdrawal limit beyond what the
          Lightning Network routing allows.
        </p>
        <p>
          We strongly recommend withdrawing your balance to a self-custodied wallet regularly.
          Do not treat bitPOS as a long-term store of value.
        </p>

        <h2>4. Acceptable Use</h2>
        <p>
          You are responsible for complying with the laws of your jurisdiction regarding the acceptance
          of Bitcoin and digital assets. bitPOS does not verify merchants or their business types.
          You may not use bitPOS for illegal activity, fraud, or sanctions evasion.
        </p>
        <p>
          We reserve the right to suspend or terminate accounts that we reasonably believe are being
          used in violation of these terms or applicable law.
        </p>

        <h2>5. Account Termination</h2>
        <p>
          You may delete your account at any time from the account settings. Deleting your account
          will permanently remove your account data. Withdraw your balance before deleting — once an
          account is deleted, any remaining balance cannot be recovered.
        </p>
        <p>
          If we suspend or terminate your account, we will make reasonable efforts to give you
          sufficient notice to withdraw your funds first, unless the account is suspected of fraud
          or illegal activity.
        </p>

        <h2>6. Bolt Cards</h2>
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

        <h2>7. No Warranties</h2>
        <p>
          bitPOS is provided "as is." We do not guarantee uninterrupted service, specific uptime,
          or that Lightning payments will always route successfully. The Lightning Network is a live
          payment network with real routing constraints — payment failures are possible and do not
          represent a breach of these terms.
        </p>

        <h2>8. Limitation of Liability</h2>
        <p>
          To the extent permitted by law, bitPOS and its operators are not liable for lost funds
          caused by Lightning routing failures, your own actions (forgotten PIN, unauthorized access
          to your session), third-party service outages, or force majeure events. Our liability to
          you will not exceed the balance held in your account at the time of the claim.
        </p>

        <h2>9. Changes to These Terms</h2>
        <p>
          We will update the "Last updated" date when these terms change. For material changes, we
          will also post a notice in the app. Continued use of bitPOS after changes constitutes
          acceptance of the revised terms.
        </p>

        <h2>10. Contact</h2>
        <p>
          Questions about these terms can be directed to the project's public GitHub repository at{" "}
          <a href="https://github.com/bitPOS-app/bitpos" target="_blank" rel="noopener noreferrer">
            github.com/bitPOS-app/bitpos
          </a>.
        </p>
      </div>
    </div>
  );
}
