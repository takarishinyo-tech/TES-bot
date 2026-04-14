import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, activityTable } from "@workspace/db";
import { eq, like, sql, asc, desc } from "drizzle-orm";

const router = Router();

router.get("/users", async (req, res) => {
  const { search, sortBy, order } = req.query as {
    search?: string;
    sortBy?: string;
    order?: string;
  };

  let query = db.select().from(usersTable);

  const results = await db.select().from(usersTable);

  let filtered = results;
  if (search) {
    const s = search.toLowerCase();
    filtered = results.filter(
      (u) =>
        u.discordId.toLowerCase().includes(s) ||
        u.username.toLowerCase().includes(s)
    );
  }

  if (sortBy === "balance") {
    filtered.sort((a, b) => {
      const diff =
        parseFloat(String(a.balance)) - parseFloat(String(b.balance));
      return order === "asc" ? diff : -diff;
    });
  } else if (sortBy === "username") {
    filtered.sort((a, b) => {
      const diff = a.username.localeCompare(b.username);
      return order === "asc" ? diff : -diff;
    });
  } else if (sortBy === "createdAt") {
    filtered.sort((a, b) => {
      const diff =
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return order === "asc" ? diff : -diff;
    });
  }

  res.json(
    filtered.map((u) => ({
      ...u,
      balance: parseFloat(String(u.balance)),
    }))
  );
});

router.get("/users/:userId", async (req, res) => {
  const { userId } = req.params;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.discordId, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ ...user, balance: parseFloat(String(user.balance)) });
});

router.patch("/users/:userId/balance", async (req, res) => {
  const { userId } = req.params;
  const { amount, operation } = req.body as {
    amount: number;
    operation: "add" | "subtract" | "set";
  };

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.discordId, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const current = parseFloat(String(user.balance));
  let newBalance: number;

  if (operation === "add") {
    newBalance = current + amount;
  } else if (operation === "subtract") {
    newBalance = Math.max(0, current - amount);
  } else {
    newBalance = amount;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ balance: newBalance.toString(), updatedAt: new Date() })
    .where(eq(usersTable.discordId, userId))
    .returning();

  await db.insert(activityTable).values({
    type: "token_add",
    userId: user.discordId,
    username: user.username,
    description: `Admin ${operation} ${amount} tokens (dashboard)`,
    amount: amount.toString(),
  });

  res.json({ ...updated, balance: parseFloat(String(updated?.balance)) });
});

export default router;
