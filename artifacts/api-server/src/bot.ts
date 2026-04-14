import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { db } from "@workspace/db";
import { usersTable, ordersTable, activityTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./lib/logger";

const PREFIX = "TES!";
const MAX_INVENTORY_SLOTS = 5;
const SESSION_TIMEOUT_MS = 30_000;
const THEME_COLOR = 0xffa500;

const SHOP_ITEMS = [
  {
    id: "booster_role",
    label: "Booster Role",
    price: 10,
    type: "item" as const,
    description: "A shiny booster role for your profile",
  },
  {
    id: "headshot_art",
    label: "Headshot Art",
    price: 500,
    type: "service" as const,
    description: "A custom headshot art piece made for you",
  },
  {
    id: "full_body_art",
    label: "Full Body Art",
    price: 1200,
    type: "service" as const,
    description: "A custom full body art piece made for you",
  },
];

const activeSessions = new Set<string>();

// Tracks when a session last expired per user (for 15s reopen cooldown)
const shopCooldowns = new Map<string, number>();
const SHOP_COOLDOWN_MS = 15_000;

let botStartTime = Date.now();

export const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

async function getOrCreateUser(discordId: string, username: string) {
  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.discordId, discordId))
    .limit(1);

  if (existing.length > 0) {
    const u = existing[0];
    if (u.username !== username) {
      await db
        .update(usersTable)
        .set({ username, updatedAt: new Date() })
        .where(eq(usersTable.discordId, discordId));
    }
    return { ...u, username };
  }

  const [newUser] = await db
    .insert(usersTable)
    .values({ discordId, username, balance: "0", inventory: [], services: {} })
    .returning();
  return newUser;
}

type SoldOutMap = Record<string, boolean>;

function buildShopEmbed(balance: string, botAvatarUrl: string, soldOut: SoldOutMap) {
  const lines = SHOP_ITEMS.map((item) => {
    const status = soldOut[item.id] ? "Sold Out" : "Available";
    return `**${item.label}** — ${status} | ${item.price} 🍀`;
  });

  return new EmbedBuilder()
    .setTitle("🍀 TES MARKET")
    .setDescription(
      `─────────────────────\n` +
      lines.join("\n") +
      `\n\nYour balance: **${balance} 🍀**`
    )
    .setColor(THEME_COLOR)
    .setThumbnail(botAvatarUrl)
    .setFooter({
      text: "Session expires in 30s. Cannot reopen for 15s after.",
    });
}

function buildExpiredEmbed(botAvatarUrl: string, soldOut: SoldOutMap) {
  const lines = SHOP_ITEMS.map((item) => {
    const status = soldOut[item.id] ? "Sold Out" : "Available";
    return `**${item.label}** — ${status} | ${item.price} 🍀`;
  });

  return new EmbedBuilder()
    .setTitle("🍀 TES MARKET")
    .setDescription(
      `─────────────────────\n` +
      lines.join("\n") +
      `\n\n❌ Session expired`
    )
    .setColor(THEME_COLOR)
    .setThumbnail(botAvatarUrl);
}

function buildShopButtons(soldOut: SoldOutMap) {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const item of SHOP_ITEMS) {
    const isSoldOut = soldOut[item.id] ?? false;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`buy_${item.id}`)
        .setLabel(isSoldOut ? `${item.label} (Sold Out)` : item.label)
        .setStyle(isSoldOut ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setDisabled(isSoldOut)
    );
  }
  return row;
}

function buildDisabledButtons(soldOut: SoldOutMap) {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const item of SHOP_ITEMS) {
    const isSoldOut = soldOut[item.id] ?? false;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`buy_${item.id}`)
        .setLabel(isSoldOut ? `${item.label} (Sold Out)` : item.label)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );
  }
  return row;
}

/** Compute which items are "sold out" for a given user */
function computeSoldOut(user: { inventory: { id: string }[] | null; services: Record<string, boolean> | null; }): SoldOutMap {
  const inventory = Array.isArray(user.inventory) ? user.inventory : [];
  const services = user.services ?? {};
  const result: SoldOutMap = {};
  for (const item of SHOP_ITEMS) {
    if (item.type === "item") {
      result[item.id] = inventory.length >= MAX_INVENTORY_SLOTS;
    } else {
      result[item.id] = services[item.id] === true;
    }
  }
  return result;
}

discordClient.once("clientReady", () => {
  botStartTime = Date.now();
  logger.info({ tag: discordClient.user?.tag }, "Discord bot is online");
});

discordClient.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  if (command === "balance") {
    const user = await getOrCreateUser(
      message.author.id,
      message.author.username
    );
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("💰 Balance")
          .setDescription(
            `**${message.author.username}**, you have **${user.balance} 🍀**`
          )
          .setColor(THEME_COLOR)
          .setThumbnail(discordClient.user!.displayAvatarURL()),
      ],
    });
  }

  if (command === "module") {
    if (!message.member?.permissions.has("Administrator")) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription("❌ You do not have permission to use this command.")
            .setColor(THEME_COLOR),
        ],
      });
    }

    const subcommand = args.shift()?.toLowerCase();

    // ── Helper: resolve @mention and amount from remaining args ───
    const resolveTargetAndAmount = () => {
      const target = message.mentions.users.first();
      const amount = parseInt(args[args.length - 1], 10);
      return { target, amount };
    };

    // ── TES!module give @user <amount> ────────────────────────────
    if (subcommand === "give") {
      const { target, amount } = resolveTargetAndAmount();
      if (!target) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription("❌ Please mention a user.\nUsage: `TES!module give @User <amount>`")
              .setColor(THEME_COLOR),
          ],
        });
      }
      if (isNaN(amount) || amount <= 0) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription("❌ Provide a valid positive number.\nUsage: `TES!module give @User <amount>`")
              .setColor(THEME_COLOR),
          ],
        });
      }

      const user = await getOrCreateUser(target.id, target.username);
      const newBalance = parseFloat(user.balance?.toString() ?? "0") + amount;

      await db.update(usersTable)
        .set({ balance: newBalance.toString(), updatedAt: new Date() })
        .where(eq(usersTable.discordId, target.id));

      await db.insert(activityTable).values({
        type: "token_add",
        userId: target.id,
        username: target.username,
        description: `Admin gave ${amount} tokens`,
        amount: amount.toString(),
      });

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅ Tokens Given")
            .setDescription(
              `Gave **${amount} 🍀** to ${target}.\n` +
              `New balance: **${newBalance} 🍀**`
            )
            .setColor(THEME_COLOR)
            .setThumbnail(discordClient.user!.displayAvatarURL()),
        ],
      });
    }

    // ── TES!module take @user <amount> ────────────────────────────
    if (subcommand === "take") {
      const { target, amount } = resolveTargetAndAmount();
      if (!target) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription("❌ Please mention a user.\nUsage: `TES!module take @User <amount>`")
              .setColor(THEME_COLOR),
          ],
        });
      }
      if (isNaN(amount) || amount <= 0) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription("❌ Provide a valid positive number.\nUsage: `TES!module take @User <amount>`")
              .setColor(THEME_COLOR),
          ],
        });
      }

      const user = await getOrCreateUser(target.id, target.username);
      const current = parseFloat(user.balance?.toString() ?? "0");
      const newBalance = Math.max(0, current - amount);
      const taken = current - newBalance;

      await db.update(usersTable)
        .set({ balance: newBalance.toString(), updatedAt: new Date() })
        .where(eq(usersTable.discordId, target.id));

      await db.insert(activityTable).values({
        type: "token_add",
        userId: target.id,
        username: target.username,
        description: `Admin took ${taken} tokens`,
        amount: (-taken).toString(),
      });

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅ Tokens Taken")
            .setDescription(
              `Took **${taken} 🍀** from ${target}.\n` +
              `New balance: **${newBalance} 🍀**`
            )
            .setColor(THEME_COLOR)
            .setThumbnail(discordClient.user!.displayAvatarURL()),
        ],
      });
    }

    // ── TES!module add @user <item> <slots> ───────────────────────
    // Adds <slots> copies of an item directly into a user's inventory.
    if (subcommand === "add") {
      const target = message.mentions.users.first();
      if (!target) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(
                "❌ Please mention a user.\nUsage: `TES!module add @User <item> <slots>`\n" +
                "Items: `booster_role` · `headshot_art` · `full_body_art`"
              )
              .setColor(THEME_COLOR),
          ],
        });
      }

      // args = [<@id>, itemKeyword, slots]  — mention is consumed from content by Discord
      // After shift() for subcommand, args still contains mention + item + slots
      // Remove the mention token from args
      const cleanArgs = args.filter(a => !a.startsWith("<@"));
      const itemKeyword = cleanArgs[cleanArgs.length - 2]?.toLowerCase();
      const slots = parseInt(cleanArgs[cleanArgs.length - 1], 10);

      const item = SHOP_ITEMS.find(
        (i) =>
          i.id === itemKeyword ||
          i.label.toLowerCase().includes(itemKeyword ?? "") ||
          i.id.includes(itemKeyword ?? "")
      );

      if (!item) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(
                "❌ Unknown item.\nAvailable items: `booster_role` · `headshot_art` · `full_body_art`"
              )
              .setColor(THEME_COLOR),
          ],
        });
      }

      if (isNaN(slots) || slots <= 0) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription("❌ Provide a valid number of slots.\nUsage: `TES!module add @User <item> <slots>`")
              .setColor(THEME_COLOR),
          ],
        });
      }

      const user = await getOrCreateUser(target.id, target.username);
      const inventory = Array.isArray(user.inventory) ? user.inventory : [];
      const newItems = Array.from({ length: slots }, () => ({
        id: item.id,
        name: item.label,
        acquiredAt: new Date().toISOString(),
      }));
      const newInventory = [...inventory, ...newItems];

      await db.update(usersTable)
        .set({ inventory: newInventory, updatedAt: new Date() })
        .where(eq(usersTable.discordId, target.id));

      await db.insert(activityTable).values({
        type: "purchase",
        userId: target.id,
        username: target.username,
        description: `Admin added ${slots}x ${item.label} to inventory`,
        amount: null,
      });

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅ Item Added")
            .setDescription(
              `Added **${slots}x ${item.label}** to ${target}'s inventory.\n` +
              `📦 Inventory: **${newInventory.length} slots used**`
            )
            .setColor(THEME_COLOR)
            .setThumbnail(discordClient.user!.displayAvatarURL()),
        ],
      });
    }

    // ── TES!module remove @user <item> <slots> ────────────────────
    // Removes <slots> copies of an item from a user's inventory.
    if (subcommand === "remove") {
      const target = message.mentions.users.first();
      if (!target) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(
                "❌ Please mention a user.\nUsage: `TES!module remove @User <item> <slots>`\n" +
                "Items: `booster_role` · `headshot_art` · `full_body_art`"
              )
              .setColor(THEME_COLOR),
          ],
        });
      }

      const cleanArgs = args.filter(a => !a.startsWith("<@"));
      const itemKeyword = cleanArgs[cleanArgs.length - 2]?.toLowerCase();
      const slots = parseInt(cleanArgs[cleanArgs.length - 1], 10);

      const item = SHOP_ITEMS.find(
        (i) =>
          i.id === itemKeyword ||
          i.label.toLowerCase().includes(itemKeyword ?? "") ||
          i.id.includes(itemKeyword ?? "")
      );

      if (!item) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(
                "❌ Unknown item.\nAvailable items: `booster_role` · `headshot_art` · `full_body_art`"
              )
              .setColor(THEME_COLOR),
          ],
        });
      }

      if (isNaN(slots) || slots <= 0) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription("❌ Provide a valid number of slots.\nUsage: `TES!module remove @User <item> <slots>`")
              .setColor(THEME_COLOR),
          ],
        });
      }

      const user = await getOrCreateUser(target.id, target.username);
      const inventory = Array.isArray(user.inventory) ? user.inventory : [];

      let removed = 0;
      const newInventory = [...inventory];
      for (let i = newInventory.length - 1; i >= 0 && removed < slots; i--) {
        if (newInventory[i].id === item.id) {
          newInventory.splice(i, 1);
          removed++;
        }
      }

      if (removed === 0) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(`❌ ${target} has no **${item.label}** in their inventory.`)
              .setColor(THEME_COLOR),
          ],
        });
      }

      await db.update(usersTable)
        .set({ inventory: newInventory, updatedAt: new Date() })
        .where(eq(usersTable.discordId, target.id));

      await db.insert(activityTable).values({
        type: "purchase",
        userId: target.id,
        username: target.username,
        description: `Admin removed ${removed}x ${item.label} from inventory`,
        amount: null,
      });

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅ Item Removed")
            .setDescription(
              `Removed **${removed}x ${item.label}** from ${target}'s inventory.\n` +
              `📦 Inventory: **${newInventory.length} slots used**`
            )
            .setColor(THEME_COLOR)
            .setThumbnail(discordClient.user!.displayAvatarURL()),
        ],
      });
    }

    // ── Unknown module subcommand ──────────────────────────────────
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("📋 TES!module — Admin Commands")
          .setDescription(
            "**Token Management**\n" +
            "`TES!module give @User <amount>` — Give tokens to a user\n" +
            "`TES!module take @User <amount>` — Take tokens from a user\n\n" +
            "**Inventory Management**\n" +
            "`TES!module add @User <item> <slots>` — Add item slots to a user\n" +
            "`TES!module remove @User <item> <slots>` — Remove item slots from a user\n\n" +
            "**Items:** `booster_role` · `headshot_art` · `full_body_art`"
          )
          .setColor(THEME_COLOR),
      ],
    });
  }

  if (command === "shop") {
    // ── 15-second reopen cooldown ──────────────────────────────────
    const lastExpiry = shopCooldowns.get(message.author.id);
    if (lastExpiry) {
      const remaining = Math.ceil((lastExpiry + SHOP_COOLDOWN_MS - Date.now()) / 1000);
      if (remaining > 0) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(`❌ You must wait **${remaining}s** before reopening the shop.`)
              .setColor(THEME_COLOR),
          ],
        });
      }
    }

    const user = await getOrCreateUser(
      message.author.id,
      message.author.username
    );

    const soldOut = computeSoldOut(user as any);
    const botAvatar = discordClient.user!.displayAvatarURL();

    const sent = await message.reply({
      embeds: [buildShopEmbed(user.balance?.toString() ?? "0", botAvatar, soldOut)],
      components: [buildShopButtons(soldOut)],
    });

    activeSessions.add(sent.id);

    setTimeout(async () => {
      if (!activeSessions.has(sent.id)) return;
      activeSessions.delete(sent.id);
      shopCooldowns.set(message.author.id, Date.now());
      try {
        // Re-fetch user so sold-out reflects any purchases made during the session
        const freshUser = await getOrCreateUser(message.author.id, message.author.username);
        const freshSoldOut = computeSoldOut(freshUser as any);
        await sent.edit({
          embeds: [buildExpiredEmbed(botAvatar, freshSoldOut)],
          components: [buildDisabledButtons(freshSoldOut)],
        });
      } catch {
        // message deleted, ignore
      }
    }, SESSION_TIMEOUT_MS);
    return;
  }

  // ── Unknown command catch-all ──────────────────────────────────
  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("❌ Unknown Command")
        .setDescription(
          `\`TES!${command}\` is not a valid command.\n\n` +
          `**Available commands:**\n` +
          `\`TES!balance\` — Check your token balance\n` +
          `\`TES!shop\` — Open the TES Market\n` +
          `\`TES!module give @User <amount>\` — Give tokens *(Admin)*\n` +
          `\`TES!module take @User <amount>\` — Take tokens *(Admin)*\n` +
          `\`TES!module add @User <item> <slots>\` — Add items *(Admin)*\n` +
          `\`TES!module remove @User <item> <slots>\` — Remove items *(Admin)*`
        )
        .setColor(THEME_COLOR),
    ],
  });
});

discordClient.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith("buy_")) return;

  if (!activeSessions.has(interaction.message.id)) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setDescription(
            "❌ This shop session has expired. Run `TES!shop` again."
          )
          .setColor(THEME_COLOR),
      ],
      ephemeral: true,
    });
  }

  const itemId = interaction.customId.replace("buy_", "");
  const item = SHOP_ITEMS.find((i) => i.id === itemId);
  if (!item) {
    return interaction.reply({ content: "❌ Item not found.", ephemeral: true });
  }

  const user = await getOrCreateUser(
    interaction.user.id,
    interaction.user.username
  );
  const currentBalance = parseFloat(user.balance?.toString() ?? "0");

  if (currentBalance < item.price) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setDescription(
            `❌ Insufficient tokens.\n` +
              `💰 Your balance: **${currentBalance} 🍀**\n` +
              `💸 Item cost: **${item.price} 🍀**`
          )
          .setColor(THEME_COLOR),
      ],
      ephemeral: true,
    });
  }

  if (item.type === "item") {
    const inventory = Array.isArray(user.inventory) ? user.inventory : [];
    if (inventory.length >= MAX_INVENTORY_SLOTS) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              `❌ Full slots. You can hold a maximum of **${MAX_INVENTORY_SLOTS} items**.`
            )
            .setColor(THEME_COLOR),
        ],
        ephemeral: true,
      });
    }

    const newBalance = currentBalance - item.price;
    const newInventory = [
      ...inventory,
      { id: item.id, name: item.label, acquiredAt: new Date().toISOString() },
    ];

    await db
      .update(usersTable)
      .set({
        balance: newBalance.toString(),
        inventory: newInventory,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.discordId, interaction.user.id));

    await db.insert(activityTable).values({
      type: "purchase",
      userId: interaction.user.id,
      username: interaction.user.username,
      description: `Purchased ${item.label}`,
      amount: item.price.toString(),
    });

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("✅ Purchase Successful")
          .setDescription(
            `You purchased **${item.label}** for **${item.price} 🍀**!\n` +
              `📦 Inventory: **${newInventory.length}/${MAX_INVENTORY_SLOTS} slots**\n` +
              `💰 Remaining balance: **${newBalance} 🍀**`
          )
          .setColor(THEME_COLOR)
          .setThumbnail(discordClient.user!.displayAvatarURL()),
      ],
      ephemeral: true,
    });
  }

  if (item.type === "service") {
    const services = user.services ?? {};
    if (services[item.id]) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              `❌ Slot full. You already have an active order for **${item.label}**.\n` +
                `📊 Slots: **0/1 (Active Order)**`
            )
            .setColor(THEME_COLOR),
        ],
        ephemeral: true,
      });
    }

    const newBalance = currentBalance - item.price;
    const newServices = { ...services, [item.id]: true };

    await db
      .update(usersTable)
      .set({
        balance: newBalance.toString(),
        services: newServices,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.discordId, interaction.user.id));

    const [order] = await db
      .insert(ordersTable)
      .values({
        userId: interaction.user.id,
        username: interaction.user.username,
        itemId: item.id,
        itemLabel: item.label,
        price: item.price.toString(),
        status: "pending",
      })
      .returning();

    await db.insert(activityTable).values({
      type: "order_placed",
      userId: interaction.user.id,
      username: interaction.user.username,
      description: `Ordered ${item.label}`,
      amount: item.price.toString(),
    });

    const ordersChannel = interaction.guild?.channels.cache.find(
      (ch) => ch.name === "orders" && ch.isTextBased()
    );

    if (!ordersChannel) {
      await db
        .update(usersTable)
        .set({
          balance: currentBalance.toString(),
          services,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.discordId, interaction.user.id));

      if (order) {
        await db
          .delete(ordersTable)
          .where(eq(ordersTable.id, order.id));
      }

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              `⚠️ Could not place your order for **${item.label}**.\n` +
                `No **#orders** channel was found. Ask an admin to create it.\n` +
                `Your tokens have been refunded.`
            )
            .setColor(THEME_COLOR),
        ],
        ephemeral: true,
      });
    }

    if (ordersChannel.isTextBased()) {
      await ordersChannel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("📦 New Order")
            .setDescription(
              `👤 User: ${interaction.user}\n` +
                `🛍️ Item: **${item.label}**\n` +
                `📌 New order`
            )
            .setColor(THEME_COLOR),
        ],
      });
    }

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("✅ Order Placed")
          .setDescription(
            `Your order for **${item.label}** has been placed!\n` +
              `📬 Notification sent to **#orders**.\n` +
              `📊 Slots: **0/1 (Active Order)**\n` +
              `💰 Remaining balance: **${newBalance} 🍀**`
          )
          .setColor(THEME_COLOR)
          .setThumbnail(discordClient.user!.displayAvatarURL()),
      ],
      ephemeral: true,
    });
  }
});

discordClient.on("error", (err) => {
  logger.error({ err }, "Discord client error");
});

export function getBotStatus() {
  const isOnline = discordClient.isReady();
  return {
    online: isOnline,
    tag: isOnline ? (discordClient.user?.tag ?? null) : null,
    uptime: isOnline
      ? Math.floor((Date.now() - botStartTime) / 1000)
      : null,
    guildCount: isOnline ? discordClient.guilds.cache.size : 0,
    prefix: PREFIX,
  };
}

export const SHOP_ITEMS_EXPORT = SHOP_ITEMS;

export function startBot() {
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token) {
    logger.warn(
      "DISCORD_BOT_TOKEN not set. Bot will not connect to Discord. Set the secret to enable."
    );
    return;
  }
  discordClient.login(token).catch((err) => {
    logger.error({ err }, "Failed to log in to Discord");
  });
}
