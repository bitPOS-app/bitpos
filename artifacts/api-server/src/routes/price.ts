import { Router, type IRouter } from "express";
import { getBtcPrice, getBtcPriceFor, getSupportedCurrencies, applyRateModifier, RateSource } from "../lib/price";

const router: IRouter = Router();

router.get("/price/currencies", async (req, res): Promise<void> => {
  const source = (req.query.source as string)?.toLowerCase() === "binance" ? "binance" : "coingecko";
  const list = await getSupportedCurrencies(source as RateSource);
  res.json(list);
});

router.get("/price", async (req, res): Promise<void> => {
  const vs = req.query.vs_currency;
  const source = (req.query.source as string)?.toLowerCase() === "binance" ? "binance" : "coingecko";
  const modifier = req.query.modifier as string | undefined;

  if (vs && typeof vs === "string" && vs.trim()) {
    const currency = vs.trim().toLowerCase();
    let price = await getBtcPriceFor(currency, source as RateSource);
    if (modifier) {
      price = applyRateModifier(price, modifier);
    }
    res.json({ currency, price, source, modified: !!modifier });
    return;
  }
  const price = await getBtcPrice();
  res.json(price);
});

export default router;
