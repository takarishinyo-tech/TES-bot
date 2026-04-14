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

function buildShopEmbed(balance: string, botAvatarUrl: string) {
  return new EmbedBuilder()
    .setTitle("🍀 TES MARKET")
    .setDescription(
      `─────────────────────\n` + `💰 Your balance: **${balance} 🍀**`
    )
    .setColor(THEME_COLOR)
    .setThumbnail(botAvatarUrl)
    .setFooter({
      text: "Click a button below to purchase. Session expires in 30s.",
    });
}

function buildExpiredEmbed(botAvatarUrl: string) {
  return new EmbedBuilder()
    .setTitle("🍀 TES MARKET")
    .setDescription("─────────────────────\n❌ Session expired")
    .setColor(THEME_COLOR)
    .setThumbnail(botAvatarUrl);
}

function buildShopButtons() {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const item of SHOP_ITEMS) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`buy_${item.id}`)
        .setLabel(item.label)
        .setStyle(ButtonStyle.Primary)
    );
  }
  return row;
}

function buildDisabledButtons() {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const item of SHOP_ITEMS) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`buy_${item.id}`)
        .setLabel(item.label)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );
  }
  return row;
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

    if (subcommand === "add") {
      const target = message.mentions.users.first();
      if (!target) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(
                "❌ Please mention a user.\nExample: `TES!module add @User 100`"
              )
              .setColor(THEME_COLOR),
          ],
        });
      }

      const amount = parseInt(args[args.length - 1], 10);
      if (isNaN(amount) || amount <= 0) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(
                "❌ Please provide a valid positive number.\nExample: `TES!module add @User 100`"
              )
              .setColor(THEME_COLOR),
          ],
        });
      }

      const user = await getOrCreateUser(target.id, target.username);
      const newBalance =
        parseFloat(user.balance?.toString() ?? "0") + amount;

      await db
        .update(usersTable)
        .set({
          balance: newBalance.toString(),
          updatedAt: new Date(),
        })
        .where(eq(usersTable.discordId, target.id));

      await db.insert(activityTable).values({
        type: "token_add",
        userId: target.id,
        username: target.username,
        description: `Admin added ${amount} tokens`,
        amount: amount.toString(),
      });

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅ Tokens Added")
            .setDescription(
              `Added **${amount} 🍀** to ${target}.\n` +
                `New balance: **${newBalance} 🍀**`
            )
            .setColor(THEME_COLOR)
            .setThumbnail(discordClient.user!.displayAvatarURL()),
        ],
      });
    }

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setDescription(
            "❌ Unknown subcommand. Usage: `TES!module add @User <amount>`"
          )
          .setColor(THEME_COLOR),
      ],
    });
  }

  if (command === "shop") {
    const user = await getOrCreateUser(
      message.author.id,
      message.author.username
    );

    const botAvatar = discordClient.user!.displayAvatarURL();

    const sent = await message.reply({
      embeds: [buildShopEmbed(user.balance?.toString() ?? "0", botAvatar)],
      components: [buildShopButtons()],
    });

    activeSessions.add(sent.id);

    setTimeout(async () => {
      if (!activeSessions.has(sent.id)) return;
      activeSessions.delete(sent.id);
      try {
        await sent.edit({
          embeds: [buildExpiredEmbed(botAvatar)],
          components: [buildDisabledButtons()],
        });
      } catch {
        // message deleted, ignore
      }
    }, SESSION_TIMEOUT_MS);
  }
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
