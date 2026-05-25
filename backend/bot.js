import { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, TextChannel, EmbedBuilder } from "discord.js";
import crypto from "crypto";
import { preAuthTokens } from "./state.js";

export const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel],
});

export async function initBot() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.warn("[Bot] DISCORD_TOKEN is missing. Bot is offline.");
    return;
  }
  await client.login(token);
}

// Bot Startup Handler
client.once(Events.ClientReady, async (c) => {
  console.log(`[Bot] Active! Logged in as ${c.user.tag}`);

  const whitelistChannelId = process.env.WHITELIST_CHANNEL_ID;
  if (whitelistChannelId) {
    try {
      const channel = await client.channels.fetch(whitelistChannelId);
      if (channel && channel.isTextBased()) {
        // Retrieve last 10 messages to see if the whitelist button already exists
        const messages = await channel.messages.fetch({ limit: 10 });
        const hasButton = messages.some(
          (m) => m.author.id === client.user.id && m.components.length > 0
        );

        if (!hasButton) {
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("apply_whitelist")
              .setLabel("Apply for Whitelist")
              .setStyle(ButtonStyle.Success)
              .setEmoji("📝")
          );

          const welcomeEmbed = new EmbedBuilder()
            .setColor(0x58cc02)
            .setTitle("🐱 Meowcraft Survival Gateway")
            .setDescription(
              "Welcome to the official **Meowcraft Whitelist Gateway**!\n\n" +
              "To join our survival community, you must verify your account and register your Minecraft nickname using our automated portal.\n\n" +
              "**How to register:**\n" +
              "1️⃣ Click the **Apply for Whitelist** button below.\n" +
              "2️⃣ Follow the temporary verification link sent ephemerally to your screen.\n" +
              "3️⃣ Enter your Minecraft Username, select **Java** or **Bedrock**, and view connection details.\n\n" +
              "⚡ *Our staff will manually review and approve your submission shortly after.*"
            )
            .setThumbnail("https://cdn.discordapp.com/icons/1361877511624982659/a_0b904d9c7ad6e6ee.png")
            .setFooter({ text: "Meowcraft Gateway • Secure Verification" })
            .setTimestamp();

          await channel.send({
            embeds: [welcomeEmbed],
            components: [row],
          });
          console.log("[Bot] Posted new whitelist application embed.");
        } else {
          console.log("[Bot] Whitelist registration button already exists. Skipping duplication.");
        }
      }
    } catch (err) {
      console.error("[Bot] Failed to post button to whitelist channel:", err);
    }
  }
});

// Button Interaction Handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton() || interaction.customId !== "apply_whitelist") return;

  const discordId = interaction.user.id;

  // Whitelist single account protection check
  if (interaction.guild) {
    try {
      const member = await interaction.guild.members.fetch(discordId).catch(() => null);
      if (member) {
        const whitelistRoleId = process.env.WHITELIST_ROLE_ID;
        const bypassRoleId = process.env.BYPASS_LIMITS_ROLE_ID;

        const hasWhitelistRole = whitelistRoleId ? member.roles.cache.has(whitelistRoleId) : false;
        const hasBypassRole = bypassRoleId ? member.roles.cache.has(bypassRoleId) : false;

        if (hasWhitelistRole && !hasBypassRole) {
          const limitEmbed = new EmbedBuilder()
            .setColor(0xff3b30)
            .setTitle("❌ Whitelist Limit Exceeded")
            .setDescription(
              `Your Discord account is already whitelisted on **Meowcraft**.\n\n` +
              `To maintain a fair survival environment, each user is restricted to whitelisting exactly **one** Minecraft nickname.\n\n` +
              `*If you need to update your registered username or transfer accounts, please contact our moderation team.*`
            )
            .setTimestamp();

          return interaction.reply({
            embeds: [limitEmbed],
            ephemeral: true,
          });
        }
      }
    } catch (err) {
      console.error("[Bot] Security role verification failed:", err);
    }
  }

  // Generate secure 32-character token
  const token = crypto.randomBytes(16).toString("hex");

  // Save to preAuthTokens memory
  preAuthTokens.set(token, {
    discordId,
    createdAt: Date.now(),
  });

  // Automatically expire token after 30 minutes
  setTimeout(() => {
    preAuthTokens.delete(token);
  }, 30 * 60 * 1000);

  let baseUrl = process.env.BASE_URL || "http://localhost:4000";
  if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
    baseUrl = `https://${baseUrl}`;
  }
  const registerUrl = `${baseUrl}/?discord=${discordId}&token=${token}`;

  const sessionEmbed = new EmbedBuilder()
    .setColor(0x58cc02)
    .setTitle("🔐 Whitelist Session Generated")
    .setDescription(
      `We have successfully initiated a whitelist verification session for your account.\n\n` +
      `👉 **[Click here to complete your application](${registerUrl})**\n\n` +
      `*⚠️ This link is unique to you and will expire in **30 minutes**. Do not share it.*`
    )
    .setTimestamp();

  await interaction.reply({
    embeds: [sessionEmbed],
    ephemeral: true,
  });
});

// Whitelist Application Approval Action Handler
export async function approveUser(discordId, username, edition) {
  let finalUsername = username;

  console.log(`[Bot] Executing approval for ${finalUsername} (${edition}) linked to Discord ID: ${discordId}`);

  // 1. Send console command to the DiscordSRV console channel
  const consoleChannelId = process.env.DISCORD_CONSOLE_CHANNEL_ID;
  if (consoleChannelId) {
    try {
      const channel = await client.channels.fetch(consoleChannelId);
      if (channel instanceof TextChannel) {
        // Send add whitelist command (uw add <username>)
        await channel.send(`uw add ${finalUsername}`);
        console.log(`[Bot] Dispatched console command for: ${finalUsername}`);
      }
    } catch (err) {
      console.error("[Bot] Error dispatching Minecraft console command:", err);
    }
  }

  // 2. Assign the whitelist role in the guild
  const guildId = process.env.GUILD_ID;
  const roleId = process.env.WHITELIST_ROLE_ID;
  if (guildId && roleId) {
    try {
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(discordId);
      if (member) {
        await member.roles.add(roleId);
        console.log(`[Bot] Successfully assigned role ${roleId} to user ${discordId}`);
      }
    } catch (err) {
      console.error(`[Bot] Error assigning roles to member ${discordId}:`, err);
    }
  }

  // 3. DM user that they are approved
  try {
    const user = await client.users.fetch(discordId);
    if (user) {
      const approvalEmbed = new EmbedBuilder()
        .setColor(0x58cc02)
        .setTitle("🎉 Whitelist Application Approved!")
        .setDescription(
          `Congratulations! Your survival registration application for **Meowcraft** has been reviewed and **approved** by our moderation staff.\n\n` +
          `You are now clear to join the server!`
        )
        .addFields(
          { name: "Platform", value: edition === "bedrock" ? "Bedrock Edition" : "Java Edition", inline: true },
          { name: "Minecraft Username", value: `\`${finalUsername}\``, inline: true },
          { name: "Server Address", value: edition === "bedrock" ? "`51.79.228.170`" : "`play.studentio.xyz`", inline: false }
        );

      if (edition === "bedrock") {
        approvalEmbed.addFields({ name: "Bedrock Port", value: "`25566`", inline: true });
      }

      approvalEmbed.setFooter({ text: "See you in-game! Have fun!" })
        .setTimestamp();

      await user.send({ embeds: [approvalEmbed] });
      console.log(`[Bot] DM dispatched successfully to user: ${discordId}`);
    }
  } catch (err) {
    console.error(`[Bot] Failed to direct message user ${discordId}:`, err);
  }
}

// Whitelist Revocation Action Handler
export async function revokeUser(discordId, username, edition) {
  let finalUsername = username;

  console.log(`[Bot] Revoking whitelist for ${finalUsername} (${edition}) linked to Discord ID: ${discordId}`);

  // 1. Send console command to the DiscordSRV console channel to remove
  const consoleChannelId = process.env.DISCORD_CONSOLE_CHANNEL_ID;
  if (consoleChannelId) {
    try {
      const channel = await client.channels.fetch(consoleChannelId);
      if (channel instanceof TextChannel) {
        // Send remove whitelist command (uw remove <username>)
        await channel.send(`uw remove ${finalUsername}`);
        console.log(`[Bot] Dispatched remove console command for: ${finalUsername}`);
      }
    } catch (err) {
      console.error("[Bot] Error dispatching Minecraft remove console command:", err);
    }
  }

  // 2. Remove the whitelist role in the guild
  const guildId = process.env.GUILD_ID;
  const roleId = process.env.WHITELIST_ROLE_ID;
  if (guildId && roleId) {
    try {
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(discordId).catch(() => null);
      if (member) {
        await member.roles.remove(roleId);
        console.log(`[Bot] Successfully removed role ${roleId} from user ${discordId}`);
      }
    } catch (err) {
      console.error(`[Bot] Error removing roles from member ${discordId}:`, err);
    }
  }

  // 3. DM user that they are revoked
  try {
    const user = await client.users.fetch(discordId).catch(() => null);
    if (user) {
      const revokeEmbed = new EmbedBuilder()
        .setColor(0xff3b30)
        .setTitle("⚠️ Whitelist Access Revoked")
        .setDescription(
          `Hello, your whitelisted account **\`${finalUsername}\`** (${edition === "bedrock" ? "Bedrock" : "Java"}) has been **revoked** from the survival server by a staff administrator.\n\n` +
          `You have also had the server's Whitelisted role removed.\n\n` +
          `*If you believe this is a mistake or wish to appeal, please contact a staff moderator.*`
        )
        .setTimestamp();

      await user.send({ embeds: [revokeEmbed] }).catch(() => null);
      console.log(`[Bot] Revoke DM dispatched to user: ${discordId}`);
    }
  } catch (err) {
    console.error(`[Bot] Failed to direct message user ${discordId}:`, err);
  }
}

