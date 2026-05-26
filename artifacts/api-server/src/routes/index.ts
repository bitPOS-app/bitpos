import { Router, type IRouter } from "express";
import healthRouter from "./health";
import versionRouter from "./version";
import authRouter from "./auth";
import entitiesRouter from "./entities";
import accountsRouter from "./accounts";
import priceRouter from "./price";
import cardsRouter from "./cards";
import provisionRouter from "./provision";
import wipeRouter from "./wipe";
import shopRouter from "./shop";
import changelogRouter from "./changelog";

const router: IRouter = Router();

router.use(healthRouter);
router.use(versionRouter);
router.use(changelogRouter);
router.use(authRouter);
router.use(entitiesRouter);
router.use(accountsRouter);
router.use(priceRouter);
router.use(cardsRouter);
router.use(provisionRouter);
router.use(wipeRouter);
router.use(shopRouter);

export default router;
