import { Router, type IRouter } from "express";
import { getBtcPrice, getBtcPriceFor, getSupportedCurrencies } from "../lib/price";

const router: IRouter = Router();

// GET /price/currencies - full list of CoinGecko vs_currencies (+ sats/btc)
router.get("/price/currencies", async (_req, res): Promise<void> => {
  const list = await getSupportedCurrencies();
  res.json(list);
});

// GET /price?vs_currency=xau - price of 1 BTC in the requested currency
// GET /price - backward-compat: returns { usd, eur, gbp }
router.get("/price", async (req, res): Promise<void> => {
  const vs = req.query.vs_currency;
  if (vs && typeof vs === "string" && vs.trim()) {
    const currency = vs.trim().toLowerCase();
    const price = await getBtcPriceFor(currency);
    res.json({ currency, price });
    return;
  }
  const price = await getBtcPrice();
  res.json(price);
});

export default router;
