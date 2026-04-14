import { Router } from "express";
import { getBotStatus, SHOP_ITEMS_EXPORT } from "../bot";
import { db } from "@workspace/db";
import { usersTable, ordersTable, activityTable } from "@workspace/db";
import { sql, desc } from "drizzle-orm";

const router = Router();

router.get("/bot/status", (_req, res) => {
  res.json(getBotStatus());
});

router.get("/bot/stats", async (_req, res) => {
  const [userStats] = await db
    .select({
      totalUsers: sql<number>`count(*)::int`,
      totalTokens: sql<number>`coalesce(sum(balance::numeric), 0)`,
    })
    .from(usersTable);

  const [orderStats] = await db
    .select({
      totalOrders: sql<number>`count(*)::int`,
      pendingOrders: sql<number>`count(*) filter (where status = 'pending')::int`,
    })
    .from(ordersTable);

  const topBalances = await db
    .select({
      userId: usersTable.discordId,
      username: usersTable.username,
      balance: sql<number>`balance::numeric`,
    })
    .from(usersTable)
    .orderBy(sql`balance::numeric desc`)
    .limit(5);

  res.json({
    totalUsers: userStats?.totalUsers ?? 0,
    totalTokensInCirculation: Number(userStats?.totalTokens ?? 0),
    totalOrders: orderStats?.totalOrders ?? 0,
    pendingOrders: orderStats?.pendingOrders ?? 0,
    topBalances,
  });
});

export default router;
