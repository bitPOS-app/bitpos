export default function Terms() {
  return (
    <div className="container mx-auto px-4 py-16 md:py-24 max-w-3xl">
      <div className="mb-12">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Terms of Service</h1>
        <p className="text-muted-foreground">Last updated: May 15, 2026</p>
      </div>
      
      <div className="prose prose-invert prose-orange max-w-none">
        <p>
          Welcome to bitPOS. By accessing or using our application, you agree to be bound by these terms. 
          Please read them carefully.
        </p>

        <h2>1. Self-Custody and Responsibility</h2>
        <p>
          bitPOS is a non-custodial interface. We do not hold, control, or have access to your funds, private keys, 
          or Nostr Wallet Connect (NWC) credentials. You are solely responsible for:
        </p>
        <ul>
          <li>Securing your Lightning node credentials.</li>
          <li>Ensuring the availability and uptime of your own Lightning node.</li>
          <li>The safekeeping of any funds received through the application.</li>
        </ul>

        <h2>2. Acceptable Use</h2>
        <p>
          You agree to use bitPOS only for lawful purposes. While bitPOS operates in a permissionless manner, 
          you remain fully responsible for complying with the laws and regulations of your jurisdiction regarding 
          the acceptance of Bitcoin and digital assets.
        </p>

        <h2>3. No Warranties</h2>
        <p>
          bitPOS is provided "as is" and "as available" without any warranties of any kind, express or implied. 
          We do not guarantee that the software will be error-free or uninterrupted. Due to the experimental 
          nature of the Lightning Network, routing failures or delays may occur.
        </p>

        <h2>4. Limitation of Liability</h2>
        <p>
          In no event shall bitPOS, its developers, or contributors be liable for any direct, indirect, incidental, 
          special, or consequential damages, including but not limited to loss of funds, data, or profits, arising out of 
          or in connection with the use or inability to use the software.
        </p>

        <h2>5. Modifications to the Terms</h2>
        <p>
          We reserve the right to modify these terms at any time. We will notify users of any material changes 
          by updating the "Last updated" date at the top of this page.
        </p>
      </div>
    </div>
  );
}