import { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, TextChannel, EmbedBuilder } from "discord.js";
import crypto from "crypto";
import { preAuthTokens, pendingApplications } from "./state.js";
import { readDb, writeDb } from "./database.js";

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

  const whitelistChannelIds = (process.env.WHITELIST_CHANNEL_ID || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  for (const channelId of whitelistChannelIds) {
    try {
      const channel = await client.channels.fetch(channelId);
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
          console.log(`[Bot] Posted new whitelist application embed to channel: ${channelId}`);
        } else {
          console.log(`[Bot] Whitelist registration button already exists in channel ${channelId}. Skipping duplication.`);
        }
      }
    } catch (err) {
      console.error(`[Bot] Failed to post button to whitelist channel ${channelId}:`, err);
    }
  }
});

// Button Interaction Handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  const customId = interaction.customId;

  // ── Staff quick-review buttons ──────────────────────────────────────────
  if (customId.startsWith("approve_wl_") || customId.startsWith("reject_wl_")) {
    const isApprove = customId.startsWith("approve_wl_");
    const appId = customId.replace(isApprove ? "approve_wl_" : "reject_wl_", "");

    const appRecord = pendingApplications.get(appId);
    if (!appRecord) {
      return interaction.reply({
        content: "⚠️ This application no longer exists in the queue (already processed or expired).",
        ephemeral: true,
      });
    }

    // Remove from pending queue
    pendingApplications.delete(appId);

    const db = readDb();
    if (isApprove) {
      db.stats.approvedCount++;
      db.whitelisted.push({
        id: `wl_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        username: appRecord.username,
        discordId: appRecord.discordId,
        discordUsername: appRecord.discordUsername || "Unknown",
        edition: appRecord.edition,
        ipAddress: appRecord.ipAddress || "Unknown",
        whitelistedAt: new Date().toISOString(),
      });
    } else {
      db.stats.rejectedCount++;
    }

    if (!db.logs) db.logs = [];
    db.logs.push({
      username: appRecord.username,
      discordId: appRecord.discordId,
      discordUsername: appRecord.discordUsername || "Unknown",
      edition: appRecord.edition,
      action: isApprove ? "approve" : "reject",
      processedAt: new Date().toISOString(),
      ipAddress: appRecord.ipAddress,
    });
    if (db.logs.length > 50) db.logs.shift();
    writeDb(db);

    // Update the staff embed to show result
    const staffId = interaction.user.id;
    const staffTag = interaction.user.tag;
    const resultEmbed = new EmbedBuilder()
      .setColor(isApprove ? 0x58cc02 : 0xff3b30)
      .setTitle(isApprove ? "✅ Application Approved" : "❌ Application Rejected")
      .addFields(
        { name: "Minecraft Username", value: `\`${appRecord.username}\``, inline: true },
        { name: "Platform", value: appRecord.edition === "bedrock" ? "Bedrock" : "Java", inline: true },
        { name: "Discord", value: `<@${appRecord.discordId}> (${appRecord.discordUsername || "Unknown"})`, inline: false },
        { name: "Reviewed By", value: `<@${staffId}> (${staffTag})`, inline: true },
        { name: "Reviewed At", value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
      )
      .setFooter({ text: `App ID: ${appId}` })
      .setTimestamp();

    await interaction.update({ embeds: [resultEmbed], components: [] });

    // Run bot side-effects asynchronously
    if (isApprove) {
      approveUser(appRecord.discordId, appRecord.username, appRecord.edition).catch((err) =>
        console.error(`[Bot] Error during Discord approval for ${appRecord.username}:`, err)
      );
    }
    return;
  }

  // ── Apply whitelist button ───────────────────────────────────────────────
  if (customId !== "apply_whitelist") return;

  const discordId = interaction.user.id;

  // Generate secure 32-character token
  const token = crypto.randomBytes(16).toString("hex");

  // Save to preAuthTokens memory
  preAuthTokens.set(token, {
    discordId,
    discordUsername: interaction.user.tag,
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
  const db = readDb();
  const dbConfig = db.config || {};
  const guildId = process.env.GUILD_ID;
  const roleId = dbConfig.whitelistRoleId || process.env.WHITELIST_ROLE_ID;
  const additionalRoleId = dbConfig.additionalRoleId || process.env.ADDITIONAL_ROLE_ID;
  if (guildId) {
    try {
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(discordId);
      if (member) {
        if (roleId) {
          await member.roles.add(roleId);
          console.log(`[Bot] Successfully assigned role ${roleId} to user ${discordId}`);
        }
        if (additionalRoleId) {
          await member.roles.add(additionalRoleId);
          console.log(`[Bot] Successfully assigned additional role ${additionalRoleId} to user ${discordId}`);
        }

        // Set their guild nickname to match their Minecraft username
        try {
          await member.setNickname(finalUsername);
          console.log(`[Bot] Successfully updated guild nickname for ${discordId} to "${finalUsername}"`);
        } catch (nickErr) {
          console.warn(`[Bot] Could not set nickname for ${discordId} (likely hierarchy or server owner):`, nickErr.message);
        }
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
  const db = readDb();
  const dbConfig = db.config || {};
  const guildId = process.env.GUILD_ID;
  const roleId = dbConfig.whitelistRoleId || process.env.WHITELIST_ROLE_ID;
  const additionalRoleId = dbConfig.additionalRoleId || process.env.ADDITIONAL_ROLE_ID;
  if (guildId) {
    try {
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(discordId).catch(() => null);
      if (member) {
        if (roleId) {
          await member.roles.remove(roleId);
          console.log(`[Bot] Successfully removed role ${roleId} from user ${discordId}`);
        }
        if (additionalRoleId) {
          await member.roles.remove(additionalRoleId);
          console.log(`[Bot] Successfully removed additional role ${additionalRoleId} from user ${discordId}`);
        }
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

// Notify Staff Channel with new pending application
export async function notifyStaffChannel(appRecord) {
  const db = readDb();
  const staffChannelId = db.config?.staffChannelId || "";
  if (!staffChannelId) return;

  try {
    const channel = await client.channels.fetch(staffChannelId);
    if (!channel || !channel.isTextBased()) return;

    const staffPingRoleId = db.config?.staffPingRoleId || "";
    const pingContent = staffPingRoleId ? `<@&${staffPingRoleId}>` : null;

    const editionLabel = appRecord.edition === "bedrock" ? "Bedrock" : "Java";
    const editionColor = appRecord.edition === "bedrock" ? 0x3b82f6 : 0x58cc02;

    const reviewEmbed = new EmbedBuilder()
      .setColor(editionColor)
      .setTitle("📋 New Whitelist Application")
      .addFields(
        { name: "Minecraft Username", value: `\`${appRecord.username}\``, inline: true },
        { name: "Platform", value: editionLabel, inline: true },
        { name: "Discord", value: `<@${appRecord.discordId}> (${appRecord.discordUsername || "Unknown"})`, inline: false },
        { name: "Submitted", value: `<t:${Math.floor(new Date(appRecord.submittedAt).getTime() / 1000)}:R>`, inline: true },
        { name: "IP Address", value: `\`${appRecord.ipAddress || "Unknown"}\``, inline: true },
      )
      .setFooter({ text: `App ID: ${appRecord.id}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_wl_${appRecord.id}`)
        .setLabel("Approve")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
      new ButtonBuilder()
        .setCustomId(`reject_wl_${appRecord.id}`)
        .setLabel("Reject")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("❌")
    );

    await channel.send({
      ...(pingContent ? { content: pingContent } : {}),
      embeds: [reviewEmbed],
      components: [row],
    });
    console.log(`[Bot] Staff review embed sent for application ${appRecord.id}`);
  } catch (err) {
    console.error("[Bot] Failed to send staff review embed:", err);
  }
}


export async function deployWelcomeEmbed(channelId) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error("Specified channel is invalid or not text-based.");
    }

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
      .setFooter({ text: "im a stinky bot" })
      .setTimestamp();

    await channel.send({
      embeds: [welcomeEmbed],
      components: [row],
    });

    console.log(`[Bot] Manually deployed welcome embed to channel: ${channelId}`);
    return { ok: true };
  } catch (err) {
    console.error(`[Bot] Failed manual embed deployment to channel ${channelId}:`, err);
    throw new Error(err.message || "Failed to deploy welcome embed.");
  }
}

