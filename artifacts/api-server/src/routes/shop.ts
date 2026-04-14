import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable, activityTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SHOP_ITEMS_EXPORT } from "../bot";

const router = Router();

router.get("/shop/items", (_req, res) => {
  res.json(SHOP_ITEMS_EXPORT);
});

router.get("/shop/orders", async (req, res) => {
  const { status } = req.query as { status?: string };
  const all = await db
    .select()
    .from(ordersTable)
    .orderBy(ordersTable.createdAt);

  let results = all;
  if (status) {
    results = all.filter((o) => o.status === status);
  }

  res.json(
    results
      .map((o) => ({ ...o, price: parseFloat(String(o.price)) }))
      .reverse()
  );
});

router.patch("/shop/orders/:orderId", async (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);
  const { status } = req.body as { status: string };

  const [existing] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const [updated] = await db
    .update(ordersTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(ordersTable.id, orderId))
    .returning();

  if (status === "completed") {
    await db.insert(activityTable).values({
      type: "order_completed",
      userId: existing.userId,
      username: existing.username,
      description: `Order for ${existing.itemLabel} completed`,
      amount: existing.price,
    });
  }

  res.json({ ...updated, price: parseFloat(String(updated?.price)) });
});

router.get("/shop/activity", async (_req, res) => {
  const events = await db
    .select()
    .from(activityTable)
    .orderBy(activityTable.createdAt)
    .limit(50);

  res.json(
    events
      .map((e) => ({
        ...e,
        amount: e.amount ? parseFloat(String(e.amount)) : null,
      }))
      .reverse()
  );
});

export default router;
