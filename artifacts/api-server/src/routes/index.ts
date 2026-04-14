import { Router, type IRouter } from "express";
import healthRouter from "./health";
import botRouter from "./bot";
import usersRouter from "./users";
import shopRouter from "./shop";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botRouter);
router.use(usersRouter);
router.use(shopRouter);

export default router;
