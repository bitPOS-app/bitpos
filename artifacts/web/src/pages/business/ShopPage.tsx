import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Loader2, RefreshCw, Copy, List, Upload, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useFiatCurrency, FIAT_SYMBOLS } from "@/hooks/use-fiat-currency";
import QRCodeDisplay from "@/components/QRCodeDisplay";

const API = "/api";

function authFetch(token: string, path: string, opts: RequestInit = {}) {
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
  });
}

interface Design {
  id: string;
  name: string;
  description?: string;
  artist?: string;
  previewUrl?: string;
  priceEurCents: number; // stored as USD cents (column name kept for compat)
}

interface Quote {
  quantity: number;
  cardEurCentsPerUnit: number;
  shippingEurCentsPerUnit: number;
  baseEurCents: number;
  shippingEurCents: number;
  totalEurCents: number;
  totalSats: number;
  btcEurRate: number;
  btcUsdRate: number;
  priceUpdatedAt: number;
  userBalanceSats: number;
  shortfallSats: number;
}

interface InvoiceInfo {
  bolt11: string;
  paymentHash: string;
  amountSats: number;
  totalSats: number;
  userBalanceSats: number;
  expiresAt: string;
}

const COUNTRIES = [
  { code: "AF", name: "Afghanistan" },
  { code: "AL", name: "Albania" },
  { code: "DZ", name: "Algeria" },
  { code: "AD", name: "Andorra" },
  { code: "AO", name: "Angola" },
  { code: "AG", name: "Antigua and Barbuda" },
  { code: "AR", name: "Argentina" },
  { code: "AM", name: "Armenia" },
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "AZ", name: "Azerbaijan" },
  { code: "BS", name: "Bahamas" },
  { code: "BH", name: "Bahrain" },
  { code: "BD", name: "Bangladesh" },
  { code: "BB", name: "Barbados" },
  { code: "BY", name: "Belarus" },
  { code: "BE", name: "Belgium" },
  { code: "BZ", name: "Belize" },
  { code: "BJ", name: "Benin" },
  { code: "BT", name: "Bhutan" },
  { code: "BO", name: "Bolivia" },
  { code: "BA", name: "Bosnia and Herzegovina" },
  { code: "BW", name: "Botswana" },
  { code: "BR", name: "Brazil" },
  { code: "BN", name: "Brunei" },
  { code: "BG", name: "Bulgaria" },
  { code: "BF", name: "Burkina Faso" },
  { code: "BI", name: "Burundi" },
  { code: "CV", name: "Cabo Verde" },
  { code: "KH", name: "Cambodia" },
  { code: "CM", name: "Cameroon" },
  { code: "CA", name: "Canada" },
  { code: "CF", name: "Central African Republic" },
  { code: "TD", name: "Chad" },
  { code: "CL", name: "Chile" },
  { code: "CN", name: "China" },
  { code: "CO", name: "Colombia" },
  { code: "KM", name: "Comoros" },
  { code: "CG", name: "Congo" },
  { code: "CD", name: "Congo (DRC)" },
  { code: "CR", name: "Costa Rica" },
  { code: "CI", name: "Côte d'Ivoire" },
  { code: "HR", name: "Croatia" },
  { code: "CU", name: "Cuba" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czech Republic" },
  { code: "DK", name: "Denmark" },
  { code: "DJ", name: "Djibouti" },
  { code: "DM", name: "Dominica" },
  { code: "DO", name: "Dominican Republic" },
  { code: "EC", name: "Ecuador" },
  { code: "EG", name: "Egypt" },
  { code: "SV", name: "El Salvador" },
  { code: "GQ", name: "Equatorial Guinea" },
  { code: "ER", name: "Eritrea" },
  { code: "EE", name: "Estonia" },
  { code: "SZ", name: "Eswatini" },
  { code: "ET", name: "Ethiopia" },
  { code: "FJ", name: "Fiji" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GA", name: "Gabon" },
  { code: "GM", name: "Gambia" },
  { code: "GE", name: "Georgia" },
  { code: "DE", name: "Germany" },
  { code: "GH", name: "Ghana" },
  { code: "GR", name: "Greece" },
  { code: "GD", name: "Grenada" },
  { code: "GT", name: "Guatemala" },
  { code: "GN", name: "Guinea" },
  { code: "GW", name: "Guinea-Bissau" },
  { code: "GY", name: "Guyana" },
  { code: "HT", name: "Haiti" },
  { code: "HN", name: "Honduras" },
  { code: "HU", name: "Hungary" },
  { code: "IS", name: "Iceland" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IR", name: "Iran" },
  { code: "IQ", name: "Iraq" },
  { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" },
  { code: "IT", name: "Italy" },
  { code: "JM", name: "Jamaica" },
  { code: "JP", name: "Japan" },
  { code: "JO", name: "Jordan" },
  { code: "KZ", name: "Kazakhstan" },
  { code: "KE", name: "Kenya" },
  { code: "KI", name: "Kiribati" },
  { code: "KW", name: "Kuwait" },
  { code: "KG", name: "Kyrgyzstan" },
  { code: "LA", name: "Laos" },
  { code: "LV", name: "Latvia" },
  { code: "LB", name: "Lebanon" },
  { code: "LS", name: "Lesotho" },
  { code: "LR", name: "Liberia" },
  { code: "LY", name: "Libya" },
  { code: "LI", name: "Liechtenstein" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MG", name: "Madagascar" },
  { code: "MW", name: "Malawi" },
  { code: "MY", name: "Malaysia" },
  { code: "MV", name: "Maldives" },
  { code: "ML", name: "Mali" },
  { code: "MT", name: "Malta" },
  { code: "MH", name: "Marshall Islands" },
  { code: "MR", name: "Mauritania" },
  { code: "MU", name: "Mauritius" },
  { code: "MX", name: "Mexico" },
  { code: "FM", name: "Micronesia" },
  { code: "MD", name: "Moldova" },
  { code: "MC", name: "Monaco" },
  { code: "MN", name: "Mongolia" },
  { code: "ME", name: "Montenegro" },
  { code: "MA", name: "Morocco" },
  { code: "MZ", name: "Mozambique" },
  { code: "MM", name: "Myanmar" },
  { code: "NA", name: "Namibia" },
  { code: "NR", name: "Nauru" },
  { code: "NP", name: "Nepal" },
  { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" },
  { code: "NI", name: "Nicaragua" },
  { code: "NE", name: "Niger" },
  { code: "NG", name: "Nigeria" },
  { code: "MK", name: "North Macedonia" },
  { code: "NO", name: "Norway" },
  { code: "OM", name: "Oman" },
  { code: "PK", name: "Pakistan" },
  { code: "PW", name: "Palau" },
  { code: "PA", name: "Panama" },
  { code: "PG", name: "Papua New Guinea" },
  { code: "PY", name: "Paraguay" },
  { code: "PE", name: "Peru" },
  { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "QA", name: "Qatar" },
  { code: "RO", name: "Romania" },
  { code: "RU", name: "Russia" },
  { code: "RW", name: "Rwanda" },
  { code: "KN", name: "Saint Kitts and Nevis" },
  { code: "LC", name: "Saint Lucia" },
  { code: "VC", name: "Saint Vincent and the Grenadines" },
  { code: "WS", name: "Samoa" },
  { code: "SM", name: "San Marino" },
  { code: "ST", name: "São Tomé and Príncipe" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SN", name: "Senegal" },
  { code: "RS", name: "Serbia" },
  { code: "SC", name: "Seychelles" },
  { code: "SL", name: "Sierra Leone" },
  { code: "SG", name: "Singapore" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "SB", name: "Solomon Islands" },
  { code: "SO", name: "Somalia" },
  { code: "ZA", name: "South Africa" },
  { code: "SS", name: "South Sudan" },
  { code: "ES", name: "Spain" },
  { code: "LK", name: "Sri Lanka" },
  { code: "SD", name: "Sudan" },
  { code: "SR", name: "Suriname" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "SY", name: "Syria" },
  { code: "TW", name: "Taiwan" },
  { code: "TJ", name: "Tajikistan" },
  { code: "TZ", name: "Tanzania" },
  { code: "TH", name: "Thailand" },
  { code: "TL", name: "Timor-Leste" },
  { code: "TG", name: "Togo" },
  { code: "TO", name: "Tonga" },
  { code: "TT", name: "Trinidad and Tobago" },
  { code: "TN", name: "Tunisia" },
  { code: "TR", name: "Turkey" },
  { code: "TM", name: "Turkmenistan" },
  { code: "TV", name: "Tuvalu" },
  { code: "UG", name: "Uganda" },
  { code: "UA", name: "Ukraine" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "UY", name: "Uruguay" },
  { code: "UZ", name: "Uzbekistan" },
  { code: "VU", name: "Vanuatu" },
  { code: "VE", name: "Venezuela" },
  { code: "VN", name: "Vietnam" },
  { code: "YE", name: "Yemen" },
  { code: "ZM", name: "Zambia" },
  { code: "ZW", name: "Zimbabwe" },
];

export default function ShopPage() {
  const { token, account } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [designs, setDesigns] = useState<Design[]>([]);
  const [selectedDesignId, setSelectedDesignId] = useState<string>("plain-white");
  const [quantity, setQuantity] = useState(1);
  const [btcEurRate, setBtcEurRate] = useState<number | null>(null);
  const [btcUsdRate, setBtcUsdRate] = useState<number | null>(() => {
    try { const v = Number(localStorage.getItem("bitpos_btc_usd")); return v > 0 ? v : null; } catch { return null; }
  });
  const [rateUpdatedAt, setRateUpdatedAt] = useState<number>(0);

  const { currency: displayCurrency, label: displayLabel } = useFiatCurrency();
  const displaySymbol = FIAT_SYMBOLS[displayCurrency] ?? displayLabel + " ";
  const [btcDisplayRate, setBtcDisplayRate] = useState<number | null>(null);
  const [displayRateAt, setDisplayRateAt] = useState<number>(0);

  const fetchDisplayPrice = useCallback(() => {
    const c = displayCurrency === "sats" || displayCurrency === "btc" ? "usd" : displayCurrency;
    fetch(`/api/price?vs_currency=${encodeURIComponent(c)}`)
      .then((r) => r.json())
      .then((d: { price?: number }) => {
        if (d.price && d.price > 0) {
          setBtcDisplayRate(d.price);
          setDisplayRateAt(Date.now());
        }
      })
      .catch(() => {});
  }, [displayCurrency]);

  useEffect(() => { fetchDisplayPrice(); }, [fetchDisplayPrice]);


  const SAVED_ADDRESS_KEY = "bitpos_saved_shipping";

  function loadSavedAddress() {
    try { return JSON.parse(localStorage.getItem(SAVED_ADDRESS_KEY) ?? "null"); } catch { return null; }
  }

  const [savedAddress, setSavedAddress] = useState<Record<string, string> | null>(loadSavedAddress);

  const [form, setForm] = useState({
    shippingName: "",
    shippingEmail: "",
    shippingPhone: "",
    shippingAddress1: "",
    shippingAddress2: "",
    shippingCity: "",
    shippingPostalCode: "",
    shippingCountry: "US",
  });
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [attempted, setAttempted] = useState(false);

  function markTouched(key: string) {
    setTouched((prev) => new Set(prev).add(key));
  }

  function fieldError(key: string, value: string): string | null {
    if (!touched.has(key) && !attempted) return null;
    if (key === "shippingName")
      return value.trim().length > 0 ? null : "Full name is required";
    if (key === "shippingEmail")
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? null : "Enter a valid email address";
    if (key === "shippingAddress1")
      return value.trim().length >= 3 ? null : "Street address is required";
    if (key === "shippingCity")
      return value.trim().length >= 3 ? null : "City is required";
    if (key === "shippingPostalCode")
      return value.trim().length >= 2 ? null : "Postal code is required";
    if (key === "shippingPhone")
      return value.trim().length >= 5 ? null : "Phone number is required";
    return null;
  }

  function isFormValid() {
    return (
      !!form.shippingName.trim() &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.shippingEmail.trim()) &&
      form.shippingPhone.trim().length >= 5 &&
      form.shippingAddress1.trim().length >= 3 &&
      form.shippingCity.trim().length >= 3 &&
      form.shippingPostalCode.trim().length >= 2 &&
      !!form.shippingCountry
    );
  }

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState(false);
  const [quoteTs, setQuoteTs] = useState<number>(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceInfo | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pollStatus, setPollStatus] = useState<"waiting" | "paying" | "error">("waiting");
  const payingRef = useRef(false);

  const [step, setStep] = useState<"design" | "shipping" | "payment">("design");

  const [customFrontFileId, setCustomFrontFileId] = useState<string | null>(null);
  const [customBackFileId, setCustomBackFileId] = useState<string | null>(null);
  const [customFrontPreview, setCustomFrontPreview] = useState<string | null>(null);
  const [customBackPreview, setCustomBackPreview] = useState<string | null>(null);
  const [uploadingFront, setUploadingFront] = useState(false);
  const [uploadingBack, setUploadingBack] = useState(false);
  const [customUploadError, setCustomUploadError] = useState<string | null>(null);
  const [isDraggingFront, setIsDraggingFront] = useState(false);
  const [isDraggingBack, setIsDraggingBack] = useState(false);

  const ALLOWED_MIME = ["image/png", "image/jpeg", "image/jpg"];
  const DISALLOWED_EXTS = [".pdf", ".bmp", ".gif", ".tiff", ".tif", ".pict"];

  async function uploadCustomFile(file: File, side: "front" | "back") {
    setCustomUploadError(null);
    const mime = file.type.toLowerCase();
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    if (!ALLOWED_MIME.includes(mime) || DISALLOWED_EXTS.includes(ext)) {
      setCustomUploadError("Only PNG and JPG files are accepted. PDF, BMP, GIF, and TIFF are not supported.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setCustomUploadError("File is too large. Maximum size is 20 MB.");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    if (side === "front") {
      setCustomFrontPreview(previewUrl);
      setCustomFrontFileId(null);
      setUploadingFront(true);
    } else {
      setCustomBackPreview(previewUrl);
      setCustomBackFileId(null);
      setUploadingBack(true);
    }

    try {
      const formData = new FormData();
      formData.append("file", file);
      const r = await authFetch(token!, "/shop/upload", { method: "POST", body: formData });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Upload failed");
      if (side === "front") setCustomFrontFileId(data.fileId);
      else setCustomBackFileId(data.fileId);
    } catch (err: unknown) {
      setCustomUploadError(String(err instanceof Error ? err.message : err));
      if (side === "front") { setCustomFrontPreview(null); setCustomFrontFileId(null); }
      else { setCustomBackPreview(null); setCustomBackFileId(null); }
    } finally {
      if (side === "front") setUploadingFront(false);
      else setUploadingBack(false);
    }
  }

  function clearCustomUploads() {
    setCustomFrontFileId(null);
    setCustomBackFileId(null);
    setCustomFrontPreview(null);
    setCustomBackPreview(null);
    setCustomUploadError(null);
  }

  const fetchPrice = useCallback(() => {
    fetch("/api/price")
      .then((r) => r.json())
      .then((p: { eur: number; usd: number }) => {
        if (p.eur > 0) setBtcEurRate(p.eur);
        if (p.usd > 0) { setBtcUsdRate(p.usd); setRateUpdatedAt(Date.now()); try { localStorage.setItem("bitpos_btc_usd", String(p.usd)); } catch {} }
      })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchPrice(); }, [fetchPrice]);

  useEffect(() => {
    if (!token) return;
    authFetch(token, "/shop/designs")
      .then((r) => r.json())
      .then(setDesigns)
      .catch(() => {});
  }, [token]);

  const fetchQuote = useCallback(
    (country: string, designId: string, qty: number) => {
      if (!token) return;
      setQuoteLoading(true);
      setQuoteError(false);
      const isCustom = designId === "custom-upload";
      const params = new URLSearchParams({ country, hasCustomFile: String(isCustom), designId: isCustom ? "" : designId, quantity: String(qty) });
      authFetch(token, `/shop/quote?${params}`)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((q: Quote) => {
          setQuote(q);
          setQuoteTs(Date.now());
        })
        .catch(() => setQuoteError(true))
        .finally(() => setQuoteLoading(false));
    },
    [token],
  );

  const fetchCurrentQuote = useCallback(() => {
    fetchQuote(form.shippingCountry, selectedDesignId, quantity);
  }, [fetchQuote, form.shippingCountry, selectedDesignId, quantity]);

  useEffect(() => {
    if (step !== "shipping" && step !== "payment") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchQuote(form.shippingCountry, selectedDesignId, quantity);
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [form.shippingCountry, selectedDesignId, quantity, step, fetchQuote]);

  const handleSubmitOrder = async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      const isCustomUpload = selectedDesignId === "custom-upload";
      const body: Record<string, unknown> = {
        ...form,
        shippingAddress2: form.shippingAddress2 || undefined,
        designId: isCustomUpload ? undefined : selectedDesignId,
        printFileId: isCustomUpload ? customFrontFileId : undefined,
        printFileIdBack: isCustomUpload && customBackFileId ? customBackFileId : undefined,
        quantity,
      };

      const r = await authFetch(token, "/shop/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Order failed");

      setOrderId(data.orderId);
      // Persist shipping details for easy reorder
      try {
        localStorage.setItem(SAVED_ADDRESS_KEY, JSON.stringify(form));
        setSavedAddress(form);
      } catch { /* ignore */ }
      if (data.paid) {
        navigate(`/business/shop/orders/${data.orderId}`);
      } else {
        setInvoice(data.invoice);
        setStep("payment");
      }
    } catch (err: unknown) {
      toast({ title: "Order failed", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryPayment = useCallback(async () => {
    if (!token || !orderId || payingRef.current) return;
    payingRef.current = true;
    setPollStatus("paying");
    setSubmitting(true);
    try {
      const r = await authFetch(token, `/shop/orders/${orderId}/pay`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Payment failed");
      if (data.paid) navigate(`/business/shop/orders/${orderId}`);
    } catch (err: unknown) {
      toast({ title: "Payment failed", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
      setPollStatus("error");
      payingRef.current = false;
    } finally {
      setSubmitting(false);
    }
  }, [token, orderId, navigate, toast]);

  // Poll order status every 3s while waiting for Lightning invoice payment.
  // Navigates automatically when the backend settles the order.
  useEffect(() => {
    if (step !== "payment" || !orderId || !token) return;
    if (payingRef.current) return;

    const poll = async () => {
      if (payingRef.current) return;
      try {
        const r = await authFetch(token, `/shop/orders/${orderId}`);
        if (!r.ok) return;
        const data = await r.json();
        if (data.status && data.status !== "awaiting_payment") {
          payingRef.current = true;
          setPollStatus("paying");
          navigate(`/business/shop/orders/${orderId}`);
        }
      } catch { /* silent */ }
    };

    const interval = setInterval(poll, 1000);
    return () => clearInterval(interval);
  }, [step, orderId, token, navigate]);

  const handleCopy = () => {
    if (!invoice) return;
    navigator.clipboard.writeText(invoice.bolt11);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const satsLabel = (n: number) => n.toLocaleString() + " sats";


  return (
    <div className="flex flex-col min-h-full pb-8 safe-top">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-4">
        <button
          type="button"
          onClick={() => step === "design" ? navigate("/business") : setStep(step === "shipping" ? "design" : "shipping")}
          className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Card Shop</h1>
          <p className="text-xs text-muted-foreground">
            {step === "design" && "Choose a design"}
            {step === "shipping" && "Shipping details"}
            {step === "payment" && "Complete payment"}
          </p>
        </div>
        {step === "design" && (
          <button
            type="button"
            onClick={() => navigate("/business/shop/orders")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-xl px-3 py-2 bg-card"
          >
            <List className="w-3.5 h-3.5" />
            My Orders
          </button>
        )}
      </div>
      {/* Steps */}
      <div className="flex px-5 gap-1.5 mb-6">
        {(["design", "shipping", "payment"] as const).map((s, i) => (
          <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${
            i <= ["design", "shipping", "payment"].indexOf(step) ? "bg-primary" : "bg-border"
          }`} />
        ))}
      </div>
      <div className="px-5 flex-1">
        {/* ── Step 1: Design ── */}
        {step === "design" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Physical NTAG424 DNA Bolt Card. Ships blank — you activate it in the app after delivery.</p>

            <div className="grid grid-cols-2 gap-3">
              {/* Plain White */}
              <button
                type="button"
                onClick={() => { clearCustomUploads(); setSelectedDesignId("plain-white"); }}
                className={`relative rounded-2xl border-2 p-4 text-left transition-all ${
                  selectedDesignId === "plain-white"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-border/80"
                }`}
              >
                {selectedDesignId === "plain-white" && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-3 h-3 text-primary-foreground" />
                  </div>
                )}
                <img src={`${import.meta.env.BASE_URL}plain-white-card.jpg`} alt="Plain White NFC card" className="w-full aspect-video object-cover rounded-lg mb-3" />
                <p className="font-semibold text-sm">Plain White</p>
                <p className="text-xs text-muted-foreground mt-0.5">Blank NTAG424 DNA</p>
                <p className="text-xs text-primary font-medium mt-1">
                  {btcEurRate
                    ? satsLabel(Math.ceil(((designs.find((d) => d.id === "plain-white")?.priceEurCents ?? 675) / 100 / btcEurRate) * 1e8))
                    : "···"}
                </p>
              </button>

              {/* Artist / extra designs (incl. bitPOS Branded) */}
              {designs
                .filter((d) => d.id !== "plain-white")
                .map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => { clearCustomUploads(); setSelectedDesignId(d.id); }}
                    className={`relative rounded-2xl border-2 p-4 text-left transition-all ${
                      selectedDesignId === d.id
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-border/80"
                    }`}
                  >
                    {selectedDesignId === d.id && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-3 h-3 text-primary-foreground" />
                      </div>
                    )}
                    {d.previewUrl ? (
                      <img src={`${import.meta.env.BASE_URL}${d.previewUrl.replace(/^\//, "")}`} alt={d.name} className="w-full aspect-video object-cover rounded-lg mb-3" />
                    ) : (
                      <div className="w-full aspect-video rounded-lg bg-primary/5 mb-3" />
                    )}
                    <p className="font-semibold text-sm">{d.name}</p>
                    {d.artist && <p className="text-xs text-muted-foreground mt-0.5">by {d.artist}</p>}
                    {d.id === "bitpos-branded" && !d.artist && (
                      <p className="text-xs text-muted-foreground mt-0.5">Official design</p>
                    )}
                    <p className="text-xs text-primary font-medium mt-1">
                      {btcEurRate
                        ? satsLabel(Math.ceil((d.priceEurCents / 100 / btcEurRate) * 1e8))
                        : "···"}
                    </p>
                  </button>
                ))}

              {/* Custom Upload */}
              <button
                type="button"
                onClick={() => {
                  if (selectedDesignId !== "custom-upload") clearCustomUploads();
                  setSelectedDesignId("custom-upload");
                }}
                className={`relative rounded-2xl border-2 p-4 text-left transition-all ${
                  selectedDesignId === "custom-upload"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-border/80"
                }`}
              >
                {selectedDesignId === "custom-upload" && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-3 h-3 text-primary-foreground" />
                  </div>
                )}
                <div className="w-full aspect-video rounded-lg bg-primary/5 mb-3 flex items-center justify-center border border-dashed border-primary/20">
                  <Upload className="w-6 h-6 text-primary/50" />
                </div>
                <p className="font-semibold text-sm">Custom Artwork</p>
                <p className="text-xs text-muted-foreground mt-0.5">Upload your design</p>
                <p className="text-xs text-primary font-medium mt-1">
                  {btcEurRate
                    ? satsLabel(Math.ceil((975 / 100 / btcEurRate) * 1e8))
                    : "···"}
                </p>
              </button>

              {/* Coming Soon - Bitcoin Art */}
              <div className="rounded-2xl border-2 border-dashed border-border/50 bg-card/30 p-4 opacity-40">
                <div className="w-full aspect-video rounded-lg bg-muted/20 mb-3 flex items-center justify-center">
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Soon</span>
                </div>
                <p className="font-semibold text-sm text-muted-foreground">Bitcoin Art</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">Coming soon</p>
              </div>
            </div>

            {/* ── Custom Artwork Upload Panel ── */}
            {selectedDesignId === "custom-upload" && (
              <div className="space-y-4">

                {/* Print Specifications */}
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-muted/30">
                    <p className="text-sm font-semibold">Print specifications</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Your file must meet these exact requirements before uploading</p>
                  </div>

                  {/* Dimension diagram — native SVG, front & back are identical */}
                  <div className="px-5 pt-5 pb-4 border-b border-border">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4 text-center">Front & Back — same dimensions</p>
                    <svg viewBox="0 0 310 200" className="w-full" xmlns="http://www.w3.org/2000/svg">
                      {/* ── Card with bleeds (outer) ── */}
                      <rect x="62" y="34" width="180" height="116" fill="rgba(120,120,120,0.07)" stroke="#52525b" strokeWidth="1" />

                      {/* ── Final cut line (rounded, primary orange) ── */}
                      <rect x="66.3" y="38.3" width="171.4" height="107.4" rx="8" fill="none" stroke="#f97316" strokeWidth="1.5" />

                      {/* ── Safe design area (dashed, 2mm inside cut) ── */}
                      <rect x="70.6" y="42.6" width="162.8" height="98.8" rx="6" fill="none" stroke="#52525b" strokeWidth="0.9" strokeDasharray="4 3" />

                      {/* ══════════════ ANNOTATION LINES ══════════════ */}

                      {/* Top: 85.6mm spanning cut width */}
                      <line x1="66.3" y1="22" x2="237.7" y2="22" stroke="#52525b" strokeWidth="0.8" />
                      <line x1="66.3" y1="22" x2="66.3" y2="34" stroke="#52525b" strokeWidth="0.8" />
                      <line x1="237.7" y1="22" x2="237.7" y2="34" stroke="#52525b" strokeWidth="0.8" />
                      {/* tick marks */}
                      <line x1="64.3" y1="19" x2="68.3" y2="19" stroke="#52525b" strokeWidth="0.8" />
                      <line x1="235.7" y1="19" x2="239.7" y2="19" stroke="#52525b" strokeWidth="0.8" />
                      {/* label bg + text */}
                      <rect x="126" y="14" width="52" height="13" rx="3" fill="#18181b" />
                      <text x="152" y="23.5" textAnchor="middle" fontSize="9.5" fill="#a1a1aa" fontFamily="ui-monospace,monospace" fontWeight="600">85.6 mm</text>

                      {/* Bottom: 89.6mm spanning bleed width */}
                      <line x1="62" y1="164" x2="242" y2="164" stroke="#52525b" strokeWidth="0.8" />
                      <line x1="62" y1="150" x2="62" y2="164" stroke="#52525b" strokeWidth="0.8" />
                      <line x1="242" y1="150" x2="242" y2="164" stroke="#52525b" strokeWidth="0.8" />
                      <line x1="60" y1="167" x2="64" y2="167" stroke="#52525b" strokeWidth="0.8" />
                      <line x1="240" y1="167" x2="244" y2="167" stroke="#52525b" strokeWidth="0.8" />
                      <rect x="124" y="168" width="56" height="13" rx="3" fill="#18181b" />
                      <text x="152" y="177.5" textAnchor="middle" fontSize="9.5" fill="#a1a1aa" fontFamily="ui-monospace,monospace" fontWeight="600">89.6 mm</text>

                      {/* Left: 57.98mm spanning bleed height */}
                      <line x1="46" y1="34" x2="46" y2="150" stroke="#52525b" strokeWidth="0.8" />
                      <line x1="46" y1="34" x2="62" y2="34" stroke="#52525b" strokeWidth="0.8" />
                      <line x1="46" y1="150" x2="62" y2="150" stroke="#52525b" strokeWidth="0.8" />
                      <line x1="43" y1="34" x2="43" y2="38" stroke="#52525b" strokeWidth="0.8" />
                      <line x1="43" y1="148" x2="43" y2="152" stroke="#52525b" strokeWidth="0.8" />
                      <rect x="2" y="86" width="40" height="13" rx="3" fill="#18181b" />
                      <text x="22" y="95.5" textAnchor="middle" fontSize="9.5" fill="#a1a1aa" fontFamily="ui-monospace,monospace" fontWeight="600">57.98</text>
                      <text x="22" y="107" textAnchor="middle" fontSize="7.5" fill="#71717a" fontFamily="ui-monospace,monospace">mm</text>

                      {/* Right: 53.98mm spanning cut height */}
                      <line x1="264" y1="38.3" x2="264" y2="145.7" stroke="#52525b" strokeWidth="0.8" />
                      <line x1="237.7" y1="38.3" x2="264" y2="38.3" stroke="#52525b" strokeWidth="0.8" />
                      <line x1="237.7" y1="145.7" x2="264" y2="145.7" stroke="#52525b" strokeWidth="0.8" />
                      <line x1="267" y1="38.3" x2="267" y2="42.3" stroke="#52525b" strokeWidth="0.8" />
                      <line x1="267" y1="143.7" x2="267" y2="147.7" stroke="#52525b" strokeWidth="0.8" />
                      <rect x="268" y="86" width="40" height="13" rx="3" fill="#18181b" />
                      <text x="288" y="95.5" textAnchor="middle" fontSize="9.5" fill="#f97316" fontFamily="ui-monospace,monospace" fontWeight="600">53.98</text>
                      <text x="288" y="107" textAnchor="middle" fontSize="7.5" fill="#f97316" fontFamily="ui-monospace,monospace">mm</text>

                      {/* ══════════════ CORNER CALLOUTS ══════════════ */}

                      {/* Top-left: "With bleeds" → outer rect corner */}
                      <line x1="62" y1="34" x2="56" y2="26" stroke="#52525b" strokeWidth="0.7" />
                      <text x="2" y="13" fontSize="8" fill="#71717a" fontFamily="system-ui,sans-serif">With bleeds</text>

                      {/* Top-right: "Final cut" → cut rect corner */}
                      <line x1="237.7" y1="38.3" x2="248" y2="26" stroke="#f97316" strokeWidth="0.7" />
                      <text x="252" y="13" fontSize="8" fill="#f97316" fontFamily="system-ui,sans-serif">Final cut</text>

                      {/* Bottom-right: "Safe area 2mm" → safe zone corner */}
                      <line x1="233.4" y1="141.4" x2="242" y2="153" stroke="#52525b" strokeWidth="0.7" strokeDasharray="2 2" />
                      <text x="161" y="193" textAnchor="middle" fontSize="8" fill="#71717a" fontFamily="system-ui,sans-serif">Safe design area (2 mm)</text>
                    </svg>
                  </div>

                  {/* Dimension numbers */}
                  <div className="px-4 py-3 border-b border-border grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">With bleeds</p>
                      <p className="text-sm font-bold mt-0.5">89.6 × 57.98</p>
                      <p className="text-[10px] text-muted-foreground">mm</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Final cut</p>
                      <p className="text-sm font-bold mt-0.5">85.6 × 53.98</p>
                      <p className="text-[10px] text-muted-foreground">mm</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Safe zone</p>
                      <p className="text-sm font-bold mt-0.5">2 mm</p>
                      <p className="text-[10px] text-muted-foreground">from all edges</p>
                    </div>
                  </div>

                  {/* Technical requirements */}
                  <div className="px-4 py-3 space-y-2.5">
                    {/* Formats */}
                    <div className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-green-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-green-500" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold">Accepted formats</p>
                        <p className="text-xs text-muted-foreground mt-0.5">PNG, JPG only</p>
                      </div>
                    </div>

                    {/* Not accepted */}
                    <div className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-destructive/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <X className="w-3 h-3 text-destructive" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-destructive">Not accepted</p>
                        <p className="text-xs text-destructive/80 mt-0.5">PDF, PICT, BMP, GIF, TIFF — these cannot be printed</p>
                      </div>
                    </div>

                    {/* CMYK warning */}
                    <div className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-amber-500 text-[10px] font-bold">!</span>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Colors convert RGB → CMYK</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Bright or neon RGB colors may shift when converted to CMYK for printing. Design in CMYK where possible.</p>
                      </div>
                    </div>

                    {/* Resolution */}
                    <div className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-primary text-[9px] font-bold">dpi</span>
                      </div>
                      <div>
                        <p className="text-xs font-semibold">Resolution</p>
                        <p className="text-xs text-muted-foreground mt-0.5">72 dpi minimum (original web file) up to 300 dpi with 5:1 scale while respecting bleed instructions</p>
                      </div>
                    </div>

                    {/* Text size */}
                    <div className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-primary text-[9px] font-bold">Aa</span>
                      </div>
                      <div>
                        <p className="text-xs font-semibold">Minimum text size</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Equivalent to 4.5 pts in Myriad Roman — smaller text will not be legible after printing</p>
                      </div>
                    </div>

                    {/* Software */}
                    <div className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-primary text-[8px] font-bold">AI</span>
                      </div>
                      <div>
                        <p className="text-xs font-semibold">Recommended software</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Adobe Illustrator CS3+ or Adobe Photoshop CS3+</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Upload zones */}
                <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Upload your artwork</p>

                    {/* Front side */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold">Front side</p>
                        <span className="text-[10px] bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-medium">Required</span>
                      </div>
                      {customFrontPreview ? (
                        <div className="relative rounded-xl overflow-hidden border border-border">
                          <img src={customFrontPreview} alt="Front side preview" className="w-full aspect-video object-cover" />
                          {uploadingFront && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 gap-2">
                              <Loader2 className="w-6 h-6 animate-spin text-white" />
                              <span className="text-white text-xs font-medium">Uploading to print service…</span>
                            </div>
                          )}
                          {customFrontFileId && !uploadingFront && (
                            <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-green-500 text-white text-[10px] font-semibold px-2 py-1 rounded-full shadow-sm">
                              <Check className="w-3 h-3" />
                              Uploaded
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => { setCustomFrontPreview(null); setCustomFrontFileId(null); setCustomUploadError(null); }}
                            className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
                          >
                            <X className="w-3.5 h-3.5 text-white" />
                          </button>
                        </div>
                      ) : (
                        <label
                          className={`flex flex-col items-center justify-center w-full py-8 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                            isDraggingFront
                              ? "border-primary bg-primary/10 scale-[0.99]"
                              : "border-border hover:border-primary/50 hover:bg-primary/5"
                          }`}
                          onDragOver={(e) => { e.preventDefault(); setIsDraggingFront(true); }}
                          onDragLeave={() => setIsDraggingFront(false)}
                          onDrop={(e) => { e.preventDefault(); setIsDraggingFront(false); const f = e.dataTransfer.files[0]; if (f) uploadCustomFile(f, "front"); }}
                        >
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 transition-colors ${isDraggingFront ? "bg-primary text-primary-foreground" : "bg-primary/10"}`}>
                            <Upload className={`w-5 h-5 ${isDraggingFront ? "text-primary-foreground" : "text-primary"}`} />
                          </div>
                          <p className="text-sm font-medium">{isDraggingFront ? "Drop to upload" : "Drag & drop or tap to browse"}</p>
                          <p className="text-xs text-muted-foreground mt-1">PNG or JPG · 89.6 × 57.98 mm · max 20 MB</p>
                          <input
                            type="file"
                            accept="image/png,image/jpeg"
                            className="sr-only"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCustomFile(f, "front"); e.target.value = ""; }}
                          />
                        </label>
                      )}
                    </div>

                    {/* Back side */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold">Back side</p>
                        <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">Optional</span>
                      </div>
                      {customBackPreview ? (
                        <div className="relative rounded-xl overflow-hidden border border-border">
                          <img src={customBackPreview} alt="Back side preview" className="w-full aspect-video object-cover" />
                          {uploadingBack && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 gap-2">
                              <Loader2 className="w-6 h-6 animate-spin text-white" />
                              <span className="text-white text-xs font-medium">Uploading to print service…</span>
                            </div>
                          )}
                          {customBackFileId && !uploadingBack && (
                            <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-green-500 text-white text-[10px] font-semibold px-2 py-1 rounded-full shadow-sm">
                              <Check className="w-3 h-3" />
                              Uploaded
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => { setCustomBackPreview(null); setCustomBackFileId(null); setCustomUploadError(null); }}
                            className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
                          >
                            <X className="w-3.5 h-3.5 text-white" />
                          </button>
                        </div>
                      ) : (
                        <label
                          className={`flex flex-col items-center justify-center w-full py-6 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                            isDraggingBack
                              ? "border-primary bg-primary/10 scale-[0.99]"
                              : "border-border hover:border-primary/50 hover:bg-primary/5"
                          }`}
                          onDragOver={(e) => { e.preventDefault(); setIsDraggingBack(true); }}
                          onDragLeave={() => setIsDraggingBack(false)}
                          onDrop={(e) => { e.preventDefault(); setIsDraggingBack(false); const f = e.dataTransfer.files[0]; if (f) uploadCustomFile(f, "back"); }}
                        >
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center mb-2.5 transition-colors ${isDraggingBack ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                            <Upload className={`w-4 h-4 ${isDraggingBack ? "text-primary-foreground" : "text-muted-foreground"}`} />
                          </div>
                          <p className="text-xs font-medium text-muted-foreground">{isDraggingBack ? "Drop to upload" : "Drag & drop or tap to browse"}</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">PNG or JPG · 89.6 × 57.98 mm · max 20 MB</p>
                          <input
                            type="file"
                            accept="image/png,image/jpeg"
                            className="sr-only"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCustomFile(f, "back"); e.target.value = ""; }}
                          />
                        </label>
                      )}
                    </div>

                    {customUploadError && (
                      <div className="mt-3 flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5">
                        <X className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-destructive">{customUploadError}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground text-center pt-1">
              {btcDisplayRate
                ? <>1 BTC = {displaySymbol}{Math.round(btcDisplayRate).toLocaleString()} · refreshes in <CountdownRefresh from={displayRateAt} onExpire={fetchDisplayPrice} /></>
                : `Loading live BTC/${displayLabel} rate…`}
            </div>

            {/* Quantity picker */}
            <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Quantity</p>
                <p className="text-xs text-muted-foreground mt-0.5">Max 10 per order</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="w-9 h-9 rounded-xl bg-secondary border border-border text-lg font-semibold flex items-center justify-center disabled:opacity-30 active:scale-95 transition-transform"
                >
                  −
                </button>
                <span className="text-lg font-bold w-8 text-center tabular-nums">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                  disabled={quantity >= 10}
                  className="w-9 h-9 rounded-xl bg-secondary border border-border text-lg font-semibold flex items-center justify-center disabled:opacity-30 active:scale-95 transition-transform"
                >
                  +
                </button>
              </div>
            </div>

            {selectedDesignId === "custom-upload" && !customFrontFileId && (
              <p className="text-xs text-muted-foreground text-center">Upload your front-side artwork to continue</p>
            )}
            <button
              type="button"
              disabled={selectedDesignId === "custom-upload" && (!customFrontFileId || uploadingFront || uploadingBack)}
              onClick={() => setStep("shipping")}
              className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold disabled:opacity-40 active:scale-[0.99] transition-transform"
            >
              Continue to shipping
            </button>
          </div>
        )}

        {/* ── Step 3: Shipping ── */}
        {step === "shipping" && (
          <div className="space-y-4">
            {savedAddress && (
              <button
                type="button"
                onClick={() => {
                  setForm((f) => ({ ...f, ...savedAddress }));
                  setTouched(new Set());
                  setAttempted(false);
                }}
                className="w-full flex items-center justify-between bg-primary/8 border border-primary/20 rounded-xl px-4 py-2.5 text-sm hover:bg-primary/12 transition-colors"
              >
                <span className="flex items-center gap-2 text-primary font-medium">
                  <span className="text-base">↩</span>
                  Use saved address
                </span>
                <span className="text-xs text-muted-foreground truncate max-w-[55%] text-right">
                  {savedAddress.shippingName} · {savedAddress.shippingCity}
                </span>
              </button>
            )}
            <div className="space-y-3">
              {[
                { label: "Full name", key: "shippingName", placeholder: "Satoshi Nakamoto", type: "text", required: true },
                { label: "Email address", key: "shippingEmail", placeholder: "satoshi@bitcoin.org", type: "email", required: true },
                { label: "Phone number", key: "shippingPhone", placeholder: "+1 305 000 0000", type: "tel", required: true },
                { label: "Address line 1", key: "shippingAddress1", placeholder: "123 Bitcoin St", type: "text", required: true },
                { label: "Address line 2", key: "shippingAddress2", placeholder: "Apt 21", type: "text", required: false },
                { label: "City", key: "shippingCity", placeholder: "Miami", type: "text", required: true },
                { label: "Postal code", key: "shippingPostalCode", placeholder: "33101", type: "text", required: true },
              ].map(({ label, key, placeholder, type, required }) => {
                const err = fieldError(key, form[key as keyof typeof form]);
                return (
                  <div key={key}>
                    <label className="text-xs font-medium block mb-1.5">
                      <span className="text-muted-foreground">{label}</span>
                      {required
                        ? <span className="text-destructive ml-0.5">*</span>
                        : <span className="text-muted-foreground/60 ml-1 font-normal">(optional)</span>}
                    </label>
                    <input
                      type={type}
                      value={form[key as keyof typeof form]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      onBlur={() => markTouched(key)}
                      placeholder={placeholder}
                      className={`w-full bg-card border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/50 ${err ? "border-destructive focus:ring-destructive/40" : "border-border"}`}
                    />
                    {err && <p className="text-xs text-destructive mt-1 flex items-center gap-1">⚠ {err}</p>}
                  </div>
                );
              })}

              <div>
                <label className="text-xs font-medium block mb-1.5">
                  <span className="text-muted-foreground">Country</span>
                  <span className="text-destructive ml-0.5">*</span>
                </label>
                <select
                  value={form.shippingCountry}
                  onChange={(e) => setForm((f) => ({ ...f, shippingCountry: e.target.value }))}
                  onBlur={() => markTouched("shippingCountry")}
                  className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quote */}
            {quote && (
              <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {quote.quantity > 1 ? `${quote.quantity} × Card` : "Card"}
                  </span>
                  <span>
                    {satsLabel(eurCentsToSatsDisplay(quote.baseEurCents, quote.btcEurRate))}
                    {quote.quantity > 1 && (
                      <span className="text-muted-foreground text-xs ml-1">({satsLabel(eurCentsToSatsDisplay(quote.cardEurCentsPerUnit, quote.btcEurRate))} each)</span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {quote.quantity > 1 ? `${quote.quantity} × Shipping` : "Shipping"}
                  </span>
                  <span>
                    {satsLabel(eurCentsToSatsDisplay(quote.shippingEurCents, quote.btcEurRate))}
                    {quote.quantity > 1 && (
                      <span className="text-muted-foreground text-xs ml-1">({satsLabel(eurCentsToSatsDisplay(quote.shippingEurCentsPerUnit, quote.btcEurRate))} each)</span>
                    )}
                  </span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between font-semibold">
                  <span>Total</span>
                  <span className="text-primary">{satsLabel(quote.totalSats)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                  <span>1 BTC = {btcDisplayRate ? `${displaySymbol}${Math.round(btcDisplayRate).toLocaleString()}` : `$${quote.btcUsdRate.toLocaleString()}`}</span>
                  <button type="button" onClick={() => fetchQuote(form.shippingCountry, selectedDesignId, quantity)} className="flex items-center gap-1 hover:text-foreground">
                    <RefreshCw className="w-3 h-3" />
                    {quoteLoading ? "Updating..." : <>Refreshes in <CountdownRefresh from={quoteTs} onExpire={fetchCurrentQuote} /></>}
                  </button>
                </div>
              </div>
            )}

            {quoteLoading && !quote && (
              <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Fetching live price...
              </div>
            )}

            {quoteError && !quoteLoading && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 flex items-center justify-between text-sm">
                <span className="text-destructive">Could not fetch price</span>
                <button
                  type="button"
                  onClick={() => fetchQuote(form.shippingCountry, selectedDesignId, quantity)}
                  className="flex items-center gap-1 text-destructive hover:text-destructive/80 font-medium"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry
                </button>
              </div>
            )}

            <div className="space-y-2">
              <button
                type="button"
                disabled={submitting || !quote}
                onClick={() => {
                  if (!isFormValid()) { setAttempted(true); return; }
                  handleSubmitOrder();
                }}
                className="w-full bg-primary text-primary-foreground rounded-xl py-4 font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {quote ? `Pay ${satsLabel(quote.totalSats)}` : "Calculating price..."}
              </button>
              {attempted && !isFormValid() && (
                <p className="text-xs text-destructive text-center">⚠ Please fill in all required fields above</p>
              )}
            </div>
          </div>
        )}

        {/* ── Step 4: Invoice Payment ── */}
        {step === "payment" && invoice && (
          <div className="space-y-5">
            {/* Amount summary */}
            <div className="bg-card border border-border rounded-2xl p-4 space-y-1 text-sm">
              <div className="flex justify-between items-baseline">
                <span className="text-muted-foreground">Pay via Lightning</span>
                <span className="text-xl font-bold text-primary">{satsLabel(invoice.amountSats)}</span>
              </div>
              {invoice.userBalanceSats > 0 && (
                <p className="text-xs text-muted-foreground">
                  Your balance covers {satsLabel(invoice.userBalanceSats)} - only {satsLabel(invoice.amountSats)} remaining needed.
                </p>
              )}
            </div>

            {/* QR code */}
            <div className="flex justify-center">
              <QRCodeDisplay value={invoice.bolt11} size={240} />
            </div>

            {/* Copy button */}
            <button
              type="button"
              onClick={handleCopy}
              className="w-full bg-card border border-border rounded-xl py-3.5 font-medium text-sm flex items-center justify-center gap-2 hover:bg-card/80 active:scale-[0.98] transition-transform"
            >
              {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy Lightning invoice"}
            </button>

            {/* Status indicator */}
            {pollStatus === "paying" || submitting ? (
              <div className="flex items-center justify-center gap-2 text-sm text-primary font-medium py-1">
                <Loader2 className="w-4 h-4 animate-spin" />
                Payment received - confirming order…
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-1">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Waiting for payment · order confirms automatically
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function eurCentsToSatsDisplay(eurCents: number, btcEurRate: number): number {
  if (!btcEurRate || btcEurRate <= 0) return 0;
  return Math.ceil((eurCents / 100 / btcEurRate) * 100_000_000);
}

function CountdownRefresh({ from, onExpire }: { from: number; onExpire: () => void }) {
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const [remaining, setRemaining] = useState(
    () => Math.max(0, 60 - Math.floor((Date.now() - from) / 1000)),
  );

  useEffect(() => {
    setRemaining(Math.max(0, 60 - Math.floor((Date.now() - from) / 1000)));
  }, [from]);

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setTimeout(() => onExpireRef.current(), 0);
          return 60;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return <>{remaining}s</>;
}
