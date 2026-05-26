export default function Privacy() {
  return (
    <div className="container mx-auto px-4 py-16 md:py-24 max-w-3xl">
      <div className="mb-12">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Privacy Policy</h1>
        <p className="text-muted-foreground">Last updated: May 15, 2026</p>
      </div>
      
      <div className="prose prose-invert prose-orange max-w-none">
        <p>
          At bitPOS, we believe privacy is a fundamental human right. Our application is designed with data minimization 
          as a core principle. We only collect the bare minimum necessary for the application to function locally on your device.
        </p>

        <h2>1. Information We Do Not Collect</h2>
        <p>
          Because bitPOS is a client-side application connecting directly to your node, we <strong>do not</strong>:
        </p>
        <ul>
          <li>Track your IP address.</li>
          <li>Log your transactions or invoice generation.</li>
          <li>Store your private keys or connection strings on our servers.</li>
          <li>Sell any data to third parties.</li>
        </ul>

        <h2>2. Local Storage</h2>
        <p>
          All configuration data, including NWC connection strings, custom items, and local settings, is stored 
          securely within your browser's local storage (IndexedDB/LocalStorage). This data never leaves your device 
          unless you explicitly export it.
        </p>

        <h2>3. Third-Party Services</h2>
        <p>
          If you use third-party services (such as Alby, Strike, or fiat price feeds), your interactions with those 
          services are governed by their respective privacy policies. bitPOS routes requests directly from your 
          client to these services where applicable.
        </p>

        <h2>4. On-Chain and Lightning Privacy</h2>
        <p>
          Please be aware that while the Lightning Network offers enhanced privacy compared to on-chain Bitcoin transactions, 
          it is not perfectly anonymous. Your node pubkey and channel capacities may be visible to network observers.
        </p>

        <h2>5. Changes to this Policy</h2>
        <p>
          We may update this privacy policy from time to time to reflect changes in our software or regulatory requirements.
        </p>
      </div>
    </div>
  );
}