import { motion } from "framer-motion";
import { ArrowRight, Bitcoin, CreditCard, Shield, Zap, QrCode, Lock, BarChart3, Github, Download, Smartphone, ShoppingCart, Package, CheckCircle2 } from "lucide-react";
import nfcImg from "@/assets/nfc-tap.png";
import lnImg from "@/assets/lightning-network.png";

const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.2 }
  }
};

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-24 pb-32 md:pt-32 md:pb-40">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-background to-background pointer-events-none" />
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="flex flex-col items-center text-center space-y-8 max-w-3xl mx-auto"
          >
            <div className="space-y-4">
              <motion.div variants={fadeInUp} className="relative inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary overflow-hidden">
                <motion.span
                  className="pointer-events-none absolute inset-0 -skew-x-12"
                  style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)", width: "55%" }}
                  animate={{ x: ["-110%", "320%"] }}
                  transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.8, ease: "easeInOut" }}
                />
                <Zap className="mr-2 h-4 w-4" />
                Lightning Fast Payments
              </motion.div>
              <motion.h1 variants={fadeInUp} className="text-4xl font-extrabold tracking-tight sm:text-5xl xl:text-6xl/none">
                The Bitcoin POS <br />
                <span className="text-primary">in your pocket.</span>
              </motion.h1>
              <motion.p variants={fadeInUp} className="max-w-[600px] mx-auto text-lg text-muted-foreground md:text-xl leading-relaxed">
                Accept instant payments, issue NFC tap-to-pay Bolt Cards, and run a full point-of-sale terminal - all on the Lightning Network.
              </motion.p>
            </div>
            <motion.div variants={fadeInUp} className="flex flex-col gap-3 min-[400px]:flex-row justify-center">
              <a
                href="/app/"
                className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                Launch App
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
              <a
                href="#features"
                className="inline-flex h-12 items-center justify-center rounded-md border border-input bg-background px-8 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                Explore Features
              </a>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 md:py-32 bg-secondary/50 border-y border-white/5">
        <div className="container mx-auto px-4 md:px-6">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="flex flex-col items-center justify-center space-y-4 text-center mb-16"
          >
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">Everything you need to run on Bitcoin</h2>
            <p className="max-w-[700px] text-muted-foreground md:text-xl">
              Skip the banks, drop the fees, and take control of your business revenue.
            </p>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: <QrCode className="h-8 w-8" />,
                title: "Point of Sale",
                description: "Clean, intuitive interface for calculating totals and generating instant Lightning invoices."
              },
              {
                icon: <CreditCard className="h-8 w-8" />,
                title: "Bolt Card NFC",
                description: "Issue physical tap-to-pay cards to your employees or regular customers. Instant settlement."
              },
              {
                icon: <Lock className="h-8 w-8" />,
                title: "Custodial Wallet",
                description: "bitPOS holds your Lightning balance on your behalf. No node to run, no channels to manage - instant access, always."
              },
              {
                icon: <BarChart3 className="h-8 w-8" />,
                title: "Rich Analytics",
                description: "Track your sales, popular items, and revenue growth with built-in privacy-preserving analytics."
              },
              {
                icon: <Shield className="h-8 w-8" />,
                title: "Staff Accounts",
                description: "Create restricted POS-only views for your staff. They can generate invoices but cannot spend funds."
              },
              {
                icon: <Bitcoin className="h-8 w-8" />,
                title: "Auto-Conversion",
                description: "Price items in your local fiat currency, receive payments instantly in Bitcoin."
              }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.1 } }
                }}
                className="group relative overflow-hidden rounded-xl border border-white/5 bg-card p-6 shadow-sm transition-colors hover:border-primary/50"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {feature.icon}
                </div>
                <h3 className="mb-2 text-xl font-bold">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
                <div className="absolute inset-0 border-2 border-transparent transition-colors group-hover:border-primary/20 rounded-xl pointer-events-none" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Deep Dive 1 */}
      <section className="py-24 md:py-32 overflow-hidden">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6 }}
              className="order-2 lg:order-1 relative"
            >
              <div className="aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 shadow-2xl relative">
                 <img src={nfcImg} alt="NFC Tap to Pay" className="object-cover w-full h-full" />
                 <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
              </div>
              <div className="absolute -bottom-6 -right-6 h-32 w-32 bg-primary/20 blur-[50px] rounded-full pointer-events-none" />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6 }}
              className="order-1 lg:order-2 space-y-6"
            >
              <div className="inline-flex items-center rounded-full border border-white/10 bg-secondary px-3 py-1 text-sm font-medium">
                <CreditCard className="mr-2 h-4 w-4 text-primary" />
                Physical Cards
              </div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Tap to pay with Bitcoin.</h2>
              <p className="text-lg text-muted-foreground">
                bitPOS brings the familiar tap-to-pay experience to the Lightning Network. Issue programmable NFC Bolt Cards to your customers or employees. 
              </p>
              <ul className="space-y-4 mt-6">
                {[
                  "Offline payment capability",
                  "Instant sub-second settlement",
                  "3% on outbound · 0% in-network",
                  "Programmable spend limits"
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary">
                      <Zap className="h-3 w-3" />
                    </div>
                    <span className="font-medium text-white/90">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Buy Cards Section */}
      <section className="py-24 md:py-32 bg-secondary/30 border-y border-white/5 overflow-hidden">
        <div className="container mx-auto px-4 md:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="flex flex-col items-center text-center space-y-4 mb-14"
          >
            <motion.div variants={fadeInUp} className="inline-flex items-center rounded-full border border-white/10 bg-secondary px-3 py-1 text-sm font-medium">
              <ShoppingCart className="mr-2 h-4 w-4 text-primary" />
              Physical Cards
            </motion.div>
            <motion.h2 variants={fadeInUp} className="text-3xl font-bold tracking-tight sm:text-4xl">
              Get your NFC cards.
            </motion.h2>
            <motion.p variants={fadeInUp} className="max-w-[560px] text-lg text-muted-foreground">
              We ship genuine NXP NTAG 424 DNA cards - the same chip used in bank cards and passports. Just tap and pay, every time.
            </motion.p>
          </motion.div>

          <div className="grid gap-8 lg:grid-cols-2 items-center max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6 }}
              className="rounded-2xl border border-white/10 bg-card p-8 space-y-6"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-primary">
                <Package className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-1">NXP NTAG 424 DNA</h3>
                <p className="text-muted-foreground text-sm">Genuine NFC chips. ISO/IEC 14443 compliant. Compatible with any NFC-capable Android phone.</p>
              </div>
              <ul className="space-y-3">
                {[
                  "Cryptographic authentication on every tap",
                  "Works with any NFC Android phone",
                  "Factory-new and ready to program",
                  "Ships worldwide",
                ].map((point, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-white/80">{point}</span>
                  </li>
                ))}
              </ul>
              <a
                href="/app/business/shop"
                className="inline-flex w-full h-12 items-center justify-center rounded-md bg-primary px-6 text-sm font-bold text-primary-foreground shadow-lg transition-all hover:bg-primary/90 hover:scale-105 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring gap-2"
              >
                <ShoppingCart className="h-4 w-4" />
                Order Cards
                <ArrowRight className="h-4 w-4" />
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6 }}
              className="space-y-5"
            >
              {[
                { step: "1", title: "Order your cards", body: "Choose a quantity and we ship genuine NXP NTAG 424 DNA cards direct to you." },
                { step: "2", title: "Program with Card Writer", body: "Use the free bitPOS Card Writer Android app to link each card to your account in seconds." },
                { step: "3", title: "Hand them out", body: "Give cards to customers or staff. They tap to pay - funds settle to your bitPOS wallet instantly." },
              ].map(({ step, title, body }) => (
                <div key={step} className="flex gap-5 items-start">
                  <div className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-primary font-bold text-sm">
                    {step}
                  </div>
                  <div>
                    <h4 className="font-semibold mb-0.5">{title}</h4>
                    <p className="text-sm text-muted-foreground">{body}</p>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Card Writer Download Banner */}
      <section className="py-16 md:py-20 border-y border-white/5 overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_left,_var(--tw-gradient-stops))] from-primary/8 via-background to-background pointer-events-none" />
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="flex flex-col md:flex-row items-center justify-between gap-8"
          >
            <div className="flex items-start gap-5 max-w-xl">
              <div className="flex-shrink-0 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-primary">
                <Smartphone className="h-7 w-7" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-xl font-bold">bitPOS Card Writer</h3>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">Android</span>
                </div>
                <p className="text-muted-foreground">
                  Write and manage Bolt Cards directly from your Android phone. Program NFC cards in seconds - no PC required. Free and open source.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3 flex-shrink-0">
              <a
                href="https://github.com/bitPOS-app/bitpos/releases/latest"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-6 text-sm font-bold text-primary-foreground shadow-lg transition-all hover:bg-primary/90 hover:scale-105 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring gap-2"
              >
                <Download className="h-4 w-4" />
                Download APK
              </a>
              <a
                href="https://github.com/bitPOS-app/bitpos"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center justify-center rounded-md border border-white/10 bg-background px-6 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring gap-2"
              >
                <Github className="h-4 w-4" />
                View source
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Feature Deep Dive 2 */}
      <section className="py-24 md:py-32 bg-secondary/30 border-y border-white/5 overflow-hidden">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6 }}
              className="space-y-6"
            >
              <div className="inline-flex items-center rounded-full border border-white/10 bg-secondary px-3 py-1 text-sm font-medium">
                <Lock className="mr-2 h-4 w-4 text-primary" />
                Simple Pricing
              </div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Transparent fees. No surprises.</h2>
              <p className="text-lg text-muted-foreground">
                bitPOS is a custodial Lightning service - we manage your wallet so you don't have to run a node. No subscriptions, no hidden costs.
              </p>
              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="rounded-lg border border-white/5 bg-card p-4">
                  <h4 className="font-bold text-primary mb-1">3%</h4>
                  <p className="text-sm text-muted-foreground">Outbound payments</p>
                </div>
                <div className="rounded-lg border border-white/5 bg-card p-4">
                  <h4 className="font-bold text-primary mb-1">0%</h4>
                  <p className="text-sm text-muted-foreground">In-network payments</p>
                </div>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6 }}
              className="relative"
            >
              <div className="aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                 <img src={lnImg} alt="Lightning Network" className="object-cover w-full h-full" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 md:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background pointer-events-none" />
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex flex-col items-center text-center space-y-8 max-w-3xl mx-auto"
          >
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">Ready to opt out?</h2>
            <p className="text-xl text-muted-foreground">
              Join merchants accepting the hardest money on earth. No permission required.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto mt-4">
              <a
                href="/app/"
                className="inline-flex h-14 items-center justify-center rounded-md bg-primary px-8 text-base font-bold text-primary-foreground shadow-lg transition-all hover:bg-primary/90 hover:scale-105 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                Launch bitPOS Terminal
                <ArrowRight className="ml-2 h-5 w-5" />
              </a>
              <a
                href="https://github.com/bitPOS-app/bitpos"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-14 items-center justify-center rounded-md border border-white/10 bg-background px-8 text-base font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <Github className="mr-2 h-5 w-5" />
                Self-host for free
              </a>
            </div>
            <p className="text-sm text-muted-foreground">
              3% on outbound · 0% between bitPOS users · No subscription ·{" "}
              <a href="https://github.com/bitPOS-app/bitpos" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-primary transition-colors">
                AGPLv3 open source
              </a>
            </p>
          </motion.div>
        </div>
      </section>
    </div>
  );
}