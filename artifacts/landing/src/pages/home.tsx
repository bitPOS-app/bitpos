import { motion } from "framer-motion";
import { ArrowRight, ArrowLeft, Bitcoin, CreditCard, Shield, Zap, QrCode, Lock, BarChart3, Github, Download, Smartphone, ShoppingCart, Package, CheckCircle2, Code, ShieldCheck, GitPullRequest, Building2, Store, Layers, Wifi, Check } from "lucide-react";
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
    transition: { staggerChildren: 0.15 }
  }
};

export default function Home() {
  return (
    <div className="flex flex-col">

      {/* Hero */}
      <section className="relative overflow-hidden pt-24 pb-32 md:pt-36 md:pb-44">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-background to-background pointer-events-none" />
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="flex flex-col items-center text-center space-y-8 max-w-4xl mx-auto"
          >
            <motion.div variants={fadeInUp} className="relative inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary overflow-hidden">
              <motion.span
                className="pointer-events-none absolute inset-0 -skew-x-12"
                style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)", width: "55%" }}
                animate={{ x: ["-110%", "320%"] }}
                transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.8, ease: "easeInOut" }}
              />
              <img src="/icon-192.png" alt="bitPOS" className="mr-2 h-4 w-4 rounded-sm" />
              Lightning Fast Payments
            </motion.div>

            <div className="space-y-5">
              <motion.h1 variants={fadeInUp} className="text-5xl font-extrabold tracking-tight sm:text-6xl xl:text-7xl/none">
                The Bitcoin POS<br />
                <span className="text-primary">In Your Pocket.</span>
              </motion.h1>
              <motion.p variants={fadeInUp} className="max-w-[680px] mx-auto text-xl text-muted-foreground md:text-2xl leading-relaxed">
                Lightning payments from any browser. Tap-to-pay cards your customers already know how to use. Revenue that settles before the receipt prints.
              </motion.p>
            </div>

            <motion.div variants={fadeInUp} className="flex flex-col gap-3 min-[400px]:flex-row justify-center">
              <a
                href="/app/"
                className="inline-flex h-13 items-center justify-center rounded-md bg-primary px-9 text-sm font-bold text-primary-foreground shadow-lg transition-all hover:bg-primary/90 hover:scale-105 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                Launch App
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
              <a
                href="#roles"
                className="inline-flex h-13 items-center justify-center rounded-md border border-input bg-background px-9 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                How it works
              </a>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Three Roles - the core positioning */}
      <section id="roles" className="py-20 md:py-28 border-y border-white/5 bg-secondary/40">
        <div className="container mx-auto px-4 md:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="flex flex-col items-center text-center space-y-4 mb-16"
          >
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">Built for the way money moves now.</h2>
            <p className="max-w-[620px] text-muted-foreground md:text-xl">
              One account. The terminal, the cards, and the infrastructure to run both.
            </p>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-3 max-w-5xl mx-auto">
            {[
              {
                icon: <QrCode className="h-8 w-8" />,
                role: "THE TERMINAL",
                headline: "Any device. Any browser. Open now.",
                body: "Point-of-sale that lives in a URL. No hardware to lease, no card reader to pair. Generate an invoice in two taps. Lightning settles before the customer puts their card away.",
                accent: "from-primary/20 to-primary/5",
              },
              {
                icon: <CreditCard className="h-8 w-8" />,
                role: "THE CARD",
                headline: "Tap to pay. Just like they've always done.",
                body: "Issue NFC Bolt Cards your customers and staff tap at checkout. Same gesture as any bank card. The payment routes over Lightning, lands in your bitPOS account, and doesn't come back.",
                accent: "from-orange-500/20 to-orange-500/5",
              },
              {
                icon: <Code className="h-8 w-8" />,
                role: "THE CODE",
                headline: "Read what runs on your money.",
                body: "We manage your Lightning balance. The software that does it is published on GitHub under AGPL-3.0. Audit every route, check every fee calculation. Every build ships with the commit that produced it.",
                accent: "from-blue-500/20 to-blue-500/5",
              },
            ].map((item, i) => (
              <motion.div
                key={item.role}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                variants={{
                  hidden: { opacity: 0, y: 24 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.55, delay: i * 0.12 } }
                }}
                className="relative rounded-2xl border border-white/8 bg-card overflow-hidden p-8 flex flex-col gap-5"
              >
                <div className={`absolute inset-0 bg-gradient-to-b ${item.accent} opacity-40 pointer-events-none`} />
                <div className="relative">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">{item.role}</p>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 border border-white/10 text-primary mb-5">
                    {item.icon}
                  </div>
                  <h3 className="text-xl font-bold mb-3">{item.headline}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{item.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 md:py-32">
        <div className="container mx-auto px-4 md:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="flex flex-col items-center justify-center space-y-4 text-center mb-16"
          >
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">Everything you need to run on Bitcoin.</h2>
            <p className="max-w-[680px] text-muted-foreground md:text-xl">
              A browser. An NFC reader. That's the hardware list. bitPOS handles everything else.
            </p>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: <QrCode className="h-8 w-8" />,
                title: "Point of Sale",
                description: "Calculate totals, take orders, generate Lightning invoices. Designed for one-handed counter use on any device with a browser."
              },
              {
                icon: <CreditCard className="h-8 w-8" />,
                title: "Bolt Card NFC",
                description: "Issue NTAG 424 DNA cards your customers tap to pay. Sub-second settlement, cryptographic authentication on every tap, no app needed at the till."
              },
              {
                icon: <Lock className="h-8 w-8" />,
                title: "Managed Lightning Node",
                description: "We run the Lightning node. Funds land in your account the moment a payment confirms. No channels to manage, no liquidity to juggle."
              },
              {
                icon: <BarChart3 className="h-8 w-8" />,
                title: "Full Transaction History",
                description: "Every payment, every card tap, every settlement - logged with status, amount, counterparty, and failure reason when things go wrong."
              },
              {
                icon: <Shield className="h-8 w-8" />,
                title: "PIN-Protected Accounts",
                description: "Staff can take payments and view their shift. They cannot touch settings, move funds out, or access business reports."
              },
              {
                icon: <Bitcoin className="h-8 w-8" />,
                title: "Price in Any Currency",
                description: "Quote items in 40+ fiat currencies. Customers pay in sats. Your totals convert at the live rate, automatically."
              }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08 } }
                }}
                className="group relative overflow-hidden rounded-xl border border-white/5 bg-card p-6 shadow-sm transition-colors hover:border-primary/50"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {feature.icon}
                </div>
                <h3 className="mb-2 text-xl font-bold">{feature.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
                <div className="absolute inset-0 border-2 border-transparent transition-colors group-hover:border-primary/20 rounded-xl pointer-events-none" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* NFC Deep Dive */}
      <section className="py-24 md:py-32 overflow-hidden bg-secondary/30 border-y border-white/5">
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
                Tap to Pay
              </div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">The familiar card experience. On Bitcoin.</h2>
              <p className="text-lg text-muted-foreground">
                bitPOS brings the tap-to-pay experience the world already knows to Lightning. Program NFC Bolt Cards and hand them to your customers or staff - they tap, the payment routes, it settles. Done.
              </p>
              <ul className="space-y-4 mt-6">
                {[
                  "Cryptographic authentication on every single tap",
                  "Sub-second settlement over Lightning",
                  "Programmable spend limits per card",
                  "Payments are final. No reversals, no disputes.",
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary shrink-0">
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

      {/* Bolt Card Payment Flow */}
      <section className="py-20 md:py-28 overflow-hidden">
        <div className="container mx-auto px-4 md:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="flex flex-col items-center text-center space-y-4 mb-16"
          >
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">How a tap-to-pay works.</h2>
            <p className="max-w-[600px] text-muted-foreground md:text-lg">
              Four messages. Under a second. The full Bolt Card payment protocol, from tap to confirmation.
            </p>
          </motion.div>

          <div className="max-w-4xl mx-auto">
            {/* Two-column layout: Customer | Merchant */}
            <div className="grid grid-cols-[1fr_auto_1fr] gap-0 items-stretch">

              {/* Customer column header */}
              <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}
                className="flex flex-col items-center pb-6">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Customer</span>
              </motion.div>
              <div />
              {/* Merchant column header */}
              <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}
                className="flex flex-col items-center pb-6">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Merchant (bitPOS)</span>
              </motion.div>

              {/* Row 1 - Tap */}
              <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.1 }}
                className="flex flex-col items-center">
                <div className="rounded-2xl border border-primary/30 bg-primary/10 px-5 py-4 flex flex-col items-center gap-2 w-full max-w-[180px]">
                  <Wifi className="h-7 w-7 text-primary" />
                  <span className="text-sm font-semibold text-white">Bolt Card</span>
                  <span className="text-xs text-muted-foreground text-center">NFC chip tap</span>
                </div>
                <div className="w-px flex-1 bg-white/10 mt-3" />
              </motion.div>

              {/* Arrow 1 → */}
              <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.2 }}
                className="flex flex-col items-center justify-start pt-7 px-2 gap-1">
                <div className="flex items-center gap-1 text-primary">
                  <div className="h-px w-10 md:w-16 bg-primary/60" />
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                </div>
                <span className="text-[10px] font-mono text-primary text-center leading-tight">lnurlw://</span>
                <span className="text-[9px] text-muted-foreground text-center leading-tight">NFC</span>
              </motion.div>

              {/* Merchant box (spans all 4 rows on the right) */}
              <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.15 }}
                className="row-span-4 flex flex-col items-center">
                <div className="rounded-2xl border border-white/10 bg-card w-full max-w-[180px] flex flex-col items-center gap-3 px-5 py-6 h-full justify-center">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
                    <QrCode className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-bold text-white text-center">bitPOS Terminal</span>
                  <span className="text-xs text-muted-foreground text-center">Point of sale + Bolt Card acquirer</span>
                </div>
              </motion.div>

              {/* Row 2 - Bolt Card service */}
              <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.25 }}
                className="flex flex-col items-center">
                <div className="w-px h-5 bg-white/10" />
                <div className="rounded-2xl border border-white/10 bg-card px-5 py-4 flex flex-col items-center gap-2 w-full max-w-[180px]">
                  <img src="/icon-192.png" alt="bitPOS" className="h-6 w-6 rounded-sm" />
                  <span className="text-sm font-semibold text-white">bitPOS Service</span>
                  <span className="text-xs text-muted-foreground text-center">Authenticates card, validates spend limit</span>
                </div>
                <div className="w-px flex-1 bg-white/10 mt-3" />
              </motion.div>

              {/* Arrow 2 ← */}
              <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.3 }}
                className="flex flex-col items-center justify-start pt-10 px-2 gap-1">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
                  <div className="h-px w-10 md:w-16 bg-white/20" />
                </div>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">Payment</span>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">Request</span>
              </motion.div>

              {/* Row 3 - Lightning Node */}
              <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.4 }}
                className="flex flex-col items-center">
                <div className="w-px h-5 bg-white/10" />
                <div className="rounded-2xl border border-white/10 bg-card px-5 py-4 flex flex-col items-center gap-2 w-full max-w-[180px]">
                  <Bitcoin className="h-6 w-6 text-orange-400" />
                  <span className="text-sm font-semibold text-white">Lightning Node</span>
                  <span className="text-xs text-muted-foreground text-center">Routes payment over the network</span>
                </div>
                <div className="w-px flex-1 bg-white/10 mt-3" />
              </motion.div>

              {/* Arrow 3 → */}
              <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.45 }}
                className="flex flex-col items-center justify-start pt-10 px-2 gap-1">
                <div className="flex items-center gap-1 text-primary">
                  <div className="h-px w-10 md:w-16 bg-primary/60" />
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                </div>
                <span className="text-[10px] text-primary text-center leading-tight">Lightning</span>
                <span className="text-[10px] text-primary text-center leading-tight">Payment</span>
              </motion.div>

              {/* Row 4 - Complete */}
              <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.55 }}
                className="flex flex-col items-center">
                <div className="w-px h-5 bg-white/10" />
                <div className="rounded-2xl border border-green-500/30 bg-green-500/10 px-5 py-4 flex flex-col items-center gap-2 w-full max-w-[180px]">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500/20 border border-green-500/30">
                    <Check className="h-5 w-5 text-green-400" />
                  </div>
                  <span className="text-sm font-semibold text-green-400">Confirmed</span>
                  <span className="text-xs text-muted-foreground text-center">Funds in wallet. Done.</span>
                </div>
              </motion.div>

              {/* Arrow 4 ← */}
              <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.6 }}
                className="flex flex-col items-center justify-start pt-10 px-2 gap-1">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
                  <div className="h-px w-10 md:w-16 bg-white/20" />
                </div>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">Payment</span>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">Complete</span>
              </motion.div>

            </div>

            {/* Interoperability note */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.7 }}
              className="mt-12 rounded-xl border border-white/10 bg-card/60 px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white mb-0.5">Open protocol. Interoperable by design.</p>
                <p className="text-sm text-muted-foreground">
                  Bolt Cards issued by bitPOS follow the open LNURL-withdraw standard. They work at any compatible Bolt Card terminal - Breez, BTCPay Server, VoltPay, ZapBox, CoinCorner PoS - not just bitPOS. And any Bolt Card issued elsewhere works at a bitPOS terminal.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Buy Cards */}
      <section className="py-24 md:py-32 overflow-hidden">
        <div className="container mx-auto px-4 md:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="flex flex-col items-center text-center space-y-4 mb-14"
          >
            <motion.div variants={fadeInUp} className="inline-flex items-center rounded-full border border-white/10 bg-secondary px-3 py-1 text-sm font-medium">
              <Layers className="mr-2 h-4 w-4 text-primary" />
              Card Shop
            </motion.div>
            <motion.h2 variants={fadeInUp} className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              Hardware you can hold.
            </motion.h2>
            <motion.p variants={fadeInUp} className="max-w-[560px] text-lg text-muted-foreground">
              Genuine NXP NTAG 424 DNA - the cryptographic chip used in passports. Order, program with the free Android app, deploy in days.
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
                <p className="text-muted-foreground text-sm">ISO/IEC 14443 compliant. Factory-new. Compatible with any NFC-capable Android phone.</p>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Available styles</h4>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-secondary px-3 py-1 text-xs font-medium text-white/80">Plain white</span>
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-secondary px-3 py-1 text-xs font-medium text-white/80">Branded</span>
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-secondary px-3 py-1 text-xs font-medium text-white/80">Custom</span>
                  <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">Bitcoin Art · coming soon</span>
                </div>
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
                { step: "1", title: "Order your cards", body: "Choose a quantity. Genuine NXP NTAG 424 DNA cards ship direct to your door." },
                { step: "2", title: "Program with Card Writer", body: "Open the free Android app, hold the phone over the card, done. Linked to your account in seconds." },
                { step: "3", title: "Deploy", body: "Hand them out. Each tap settles to your bitPOS account before the customer's hand is back at their side." },
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

      {/* Card Writer Download */}
      <section className="py-16 md:py-20 border-y border-white/5 overflow-hidden relative bg-secondary/30">
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
                  Program and manage Bolt Cards from your Android phone. Link an NFC chip to your account in seconds - no PC, no cables. Free and open source.
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

      {/* Built in the open */}
      <section className="py-24 md:py-32 overflow-hidden">
        <div className="container mx-auto px-4 md:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeInUp}
            className="flex flex-col items-center justify-center space-y-4 text-center mb-14"
          >
            <div className="inline-flex items-center rounded-full border border-white/10 bg-secondary px-3 py-1 text-sm font-medium">
              <Github className="mr-2 h-4 w-4 text-primary" />
              Open Source
            </div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">Built in the open.</h2>
            <p className="max-w-[640px] text-muted-foreground md:text-lg">
              We hold your Lightning balance. The code that does it is on GitHub, every line, under AGPL-3.0. Read it before you trust it.
            </p>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
            {[
              {
                icon: <Code className="h-7 w-7" />,
                title: "Read every line",
                description: "AGPL-3.0 source on GitHub. Frontend, API server, card writer, infra config. No proprietary backdoors - ever.",
                href: "https://github.com/bitPOS-app/bitpos",
                cta: "Browse the repo",
              },
              {
                icon: <ShieldCheck className="h-7 w-7" />,
                title: "Verify what's running",
                description: "Every page shows the exact commit that produced it. Click it and read the code that's running on your money right now.",
                href: "/api/version",
                cta: "Check this build",
              },
              {
                icon: <GitPullRequest className="h-7 w-7" />,
                title: "Improve it with us",
                description: "Issues, pull requests, and discussions are public. Ship a fix, propose a feature, or fork the entire stack.",
                href: "https://github.com/bitPOS-app/bitpos/issues",
                cta: "Open an issue",
              },
            ].map((card, i) => (
              <motion.a
                key={card.title}
                href={card.href}
                target={card.href.startsWith("http") ? "_blank" : undefined}
                rel={card.href.startsWith("http") ? "noopener noreferrer" : undefined}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.1 } },
                }}
                className="group relative overflow-hidden rounded-xl border border-white/5 bg-card p-6 shadow-sm transition-colors hover:border-primary/50 flex flex-col"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {card.icon}
                </div>
                <h3 className="mb-2 text-xl font-bold">{card.title}</h3>
                <p className="text-muted-foreground flex-1 text-sm leading-relaxed">{card.description}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                  {card.cta}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
                <div className="absolute inset-0 border-2 border-transparent transition-colors group-hover:border-primary/20 rounded-xl pointer-events-none" />
              </motion.a>
            ))}
          </div>
        </div>
      </section>

      {/* Transparent Fees */}
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
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">Transparent fees. No surprises.</h2>
              <p className="text-lg text-muted-foreground">
                We run the Lightning infrastructure. You pay a flat 3% when funds move out - nothing when you pay another bitPOS user. No monthly fee. No minimum.
              </p>
              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="rounded-lg border border-white/5 bg-card p-5">
                  <h4 className="font-bold text-primary text-2xl mb-1">3%</h4>
                  <p className="text-sm text-muted-foreground">Outbound payments</p>
                </div>
                <div className="rounded-lg border border-white/5 bg-card p-5">
                  <h4 className="font-bold text-primary text-2xl mb-1">0%</h4>
                  <p className="text-sm text-muted-foreground">In-network transfers</p>
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

      {/* CTA */}
      <section className="py-24 md:py-36 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background pointer-events-none" />
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex flex-col items-center text-center space-y-8 max-w-3xl mx-auto"
          >
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">Open a tab the bank can't close.</h2>
            <p className="text-xl text-muted-foreground max-w-xl">
              The terminal runs in any browser. The cards ship in a week. Start tonight.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto mt-4">
              <a
                href="/app/"
                className="inline-flex h-14 items-center justify-center rounded-md bg-primary px-10 text-base font-bold text-primary-foreground shadow-lg transition-all hover:bg-primary/90 hover:scale-105 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                Launch bitPOS
                <ArrowRight className="ml-2 h-5 w-5" />
              </a>
              <a
                href="https://github.com/bitPOS-app/bitpos"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-14 items-center justify-center rounded-md border border-white/10 bg-background px-10 text-base font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <Github className="mr-2 h-5 w-5" />
                Read the source
              </a>
            </div>
            <p className="text-sm text-muted-foreground">
              3% on outbound · 0% between bitPOS users ·{" "}
              <a href="https://github.com/bitPOS-app/bitpos" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-primary transition-colors">
                Code on GitHub
              </a>
            </p>
          </motion.div>
        </div>
      </section>

    </div>
  );
}
