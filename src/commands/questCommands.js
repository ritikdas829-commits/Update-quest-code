import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { disableAutoquest } from '../quest/autoquestStore.js';
import { PREFIX } from '../utils/config.js';
import {
    buildLinkModal,
    buildLinkPrompt,
} from '../quest/questUI.js';
import {
    runQuestOne,
    runQuestAll,
    runQuestList,
    runTokenCheck,
    runAutoquestToggle,
} from '../quest/questRunners.js';

function sanitizeToken(raw) {
    return raw.trim()
        .replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '')
        .replace(/^`+|`+$/g, '')
        .replace(/^Bot\s+/i, '')
        .trim();
}

function isValidUserToken(token) {
    return token.length >= 50 && /^[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$/.test(token);
}

export const questCmd = {
    data: new SlashCommandBuilder().setName('quest').setDescription('Pick and complete one Discord quest'),
    prefix: 'quest',
    async execute(interaction, client) {
        const ts = client.tokenStore;
        await interaction.deferReply();
        await runQuestOne(interaction.user.id, ts, (opts) => interaction.followUp(opts));
    },
    async prefixExecute(message, _args, client) {
        await runQuestOne(message.author.id, client.tokenStore, (opts) => message.channel.send(opts));
    },
};

export const questAllCmd = {
    data: new SlashCommandBuilder().setName('questall').setDescription('Complete all quests sequentially'),
    prefix: 'questall',
    async execute(interaction, client) {
        await interaction.deferReply();
        await runQuestAll(interaction.user.id, client.tokenStore, (opts) => interaction.followUp(opts));
    },
    async prefixExecute(message, _args, client) {
        await runQuestAll(message.author.id, client.tokenStore, (opts) => message.channel.send(opts));
    },
};

export const questListCmd = {
    data: new SlashCommandBuilder().setName('questlist').setDescription('List all Discord quests and their status'),
    prefix: 'questlist',
    async execute(interaction, client) {
        await interaction.deferReply();
        await runQuestList(interaction.user.id, client.tokenStore, (opts) => interaction.followUp(opts));
    },
    async prefixExecute(message, _args, client) {
        await runQuestList(message.author.id, client.tokenStore, (opts) => message.channel.send(opts));
    },
};

export const tokenCheckCmd = {
    data: new SlashCommandBuilder().setName('tokencheck').setDescription('Check whether your saved Discord token is still valid'),
    prefix: 'tokencheck',
    async execute(interaction, client) {
        await interaction.deferReply({ flags: 64 });
        await runTokenCheck(interaction.user.id, client.tokenStore, (opts) => interaction.editReply(opts));
    },
    async prefixExecute(message, _args, client) {
        await runTokenCheck(message.author.id, client.tokenStore, (opts) => message.reply(opts));
    },
};

export const autoquestCmd = {
    data: new SlashCommandBuilder().setName('autoquest').setDescription('Auto-complete every new quest the moment it drops'),
    prefix: 'autoquest',
    async execute(interaction, client) {
        await interaction.deferReply({ flags: 64 });
        await runAutoquestToggle(interaction.user.id, client.tokenStore, (opts) => interaction.editReply(opts));
    },
    async prefixExecute(message, _args, client) {
        await runAutoquestToggle(message.author.id, client.tokenStore, (opts) => message.reply(opts));
    },
};

export const linkCmd = {
    data: new SlashCommandBuilder().setName('link').setDescription('Save your Discord token so you never have to enter it again'),
    prefix: 'link',

    async execute(interaction, client) {
        await interaction.showModal(buildLinkModal());
    },

    async prefixExecute(message, args, client) {
        const ts = client.tokenStore;
        const inlineToken = args.join('').trim();

        if (inlineToken) {
            try { await message.delete(); } catch {}
            const token = sanitizeToken(inlineToken);

            const sendDM = async (payload) => {
                const user = await client.users.fetch(message.author.id).catch(() => null);
                const dm = await user?.createDM().catch(() => null);
                await dm?.send(payload).catch(() => {});
            };

            if (!isValidUserToken(token)) {
                const { ContainerBuilder, TextDisplayBuilder } = await import('discord.js');
                const c = new ContainerBuilder().setAccentColor(0xED4245);
                c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ Invalid Token Format\nThat doesn't look like a valid Discord token. Copy the **Authorization** header value exactly.`));
                await sendDM({ components: [c], flags: MessageFlags.IsComponentsV2 });
                return;
            }

            let accountName = '', verifyOk = false;
            try {
                const res = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: token } });
                verifyOk = res.ok;
                if (res.ok) {
                    const data = await res.json();
                    accountName = data.global_name || data.username || '';
                }
            } catch {}

            if (!verifyOk) {
                const { ContainerBuilder, TextDisplayBuilder } = await import('discord.js');
                const c = new ContainerBuilder().setAccentColor(0xED4245);
                c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ Token Rejected by Discord\nMake sure you copied the \`Authorization\` header and try again.`));
                await sendDM({ components: [c], flags: MessageFlags.IsComponentsV2 });
                return;
            }

            ts.save(message.author.id, token);
            const { ContainerBuilder, TextDisplayBuilder } = await import('discord.js');
            const c = new ContainerBuilder().setAccentColor(0x57F287);
            c.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# ✅ Token Linked!\nLinked as **"${accountName}"**.\n\nYou can now use \`${PREFIX}quest\`, \`${PREFIX}questall\`, and \`${PREFIX}questlist\`.\nTo remove it, use \`${PREFIX}unlink\`.`,
                ),
            );
            await sendDM({ components: [c], flags: MessageFlags.IsComponentsV2 });
            return;
        }

        await message.reply(buildLinkPrompt());
    },
};

export const unlinkCmd = {
    data: new SlashCommandBuilder().setName('unlink').setDescription('Remove your saved Discord token'),
    prefix: 'unlink',

    async execute(interaction, client) {
        const ts = client.tokenStore;
        const removed = ts.remove(interaction.user.id);
        disableAutoquest(interaction.user.id);
        const { ContainerBuilder, TextDisplayBuilder } = await import('discord.js');
        const c = new ContainerBuilder().setAccentColor(removed ? 0xFEE75C : 0x4F545C);
        c.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                removed
                    ? `# 🔓 Token Unlinked\nYour saved token has been removed.`
                    : `# No Token Saved\nYou don't have a saved token.`,
            ),
        );
        await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    },

    async prefixExecute(message, _args, client) {
        const ts = client.tokenStore;
        const removed = ts.remove(message.author.id);
        disableAutoquest(message.author.id);
        const { ContainerBuilder, TextDisplayBuilder } = await import('discord.js');
        const c = new ContainerBuilder().setAccentColor(removed ? 0xFEE75C : 0x4F545C);
        c.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                removed
                    ? `# 🔓 Token Unlinked\nYour saved token has been removed.`
                    : `# No Token Saved\nYou don't have a saved token.`,
            ),
        );
        await message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    },
};

export async function handleLinkModal(interaction, client) {
    const ts = client.tokenStore;
    const raw = interaction.fields.getTextInputValue('link_token_input');
    const token = sanitizeToken(raw);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { ContainerBuilder, TextDisplayBuilder } = await import('discord.js');

    if (!isValidUserToken(token)) {
        const c = new ContainerBuilder().setAccentColor(0xED4245);
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ Invalid Token Format\nThat doesn't look like a valid Discord token. Copy the **Authorization** header value exactly.`));
        await interaction.editReply({ components: [c], flags: MessageFlags.IsComponentsV2 });
        return;
    }

    let accountName = '', verifyOk = false;
    try {
        const res = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: token } });
        verifyOk = res.ok;
        if (res.ok) {
            const data = await res.json();
            accountName = data.global_name || data.username || '';
        }
    } catch {}

    if (!verifyOk) {
        const c = new ContainerBuilder().setAccentColor(0xED4245);
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ Token Rejected by Discord\nMake sure you copied the \`Authorization\` header and try again.`));
        await interaction.editReply({ components: [c], flags: MessageFlags.IsComponentsV2 });
        return;
    }

    ts.save(interaction.user.id, token);
    const c = new ContainerBuilder().setAccentColor(0x57F287);
    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# ✅ Token Linked!\nLinked as **"${accountName}"**.\n\nYou can now use \`/quest\`, \`/questall\`, and \`/questlist\`.\nTo remove it, use \`/unlink\`.`,
        ),
    );
    await interaction.editReply({ components: [c], flags: MessageFlags.IsComponentsV2 });
}

export async function handleLinkPromptButton(interaction) {
    await interaction.showModal(buildLinkModal());
}

export async function runAutoquestForUser(userId, quest, tokenStore, discordClient) {
    const token = tokenStore.get(userId);
    if (!token) { disableAutoquest(userId); return; }

    const { QuestClient: QC } = await import('../quest/questClient.js');
    const { Quest: Q } = await import('../quest/quest.js');
    const qc = new QC(token);
    const logs = [];
    const log = (m) => { console.log(`[AutoQuest:${userId}]`, m); logs.push(m); };

    try {
        const manager = await qc.fetchQuests();
        let live = manager.get(quest.id);
        if (!live) {
            live = Q.create({ id: quest.id, config: quest.config, user_status: null, targeted_content: quest.targetedContent, preview: quest.preview });
        }
        if (live.isCompleted() || live.isExpired()) return;

        await manager.doingQuest(live, log);

        let claimManager = manager;
        try { claimManager = await qc.fetchQuests(); } catch { if (!manager.hasQuest(live.id)) manager.upsert(live); }

        const claimed = await claimManager.claimRewards(log).catch(() => 0);

        try {
            const user = await discordClient.users.fetch(userId);
            const dm = await user.createDM();
            const { ContainerBuilder, TextDisplayBuilder } = await import('discord.js');
            const c = new ContainerBuilder().setAccentColor(0x57F287);
            c.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# 🤖 Auto-Quest Complete!\n**${live.config.messages.quest_name}** has been completed automatically.\n${claimed > 0 ? `🎁 **${claimed}** reward(s) claimed.\n` : ''}\nUse \`${PREFIX}autoquest\` to disable.`,
                ),
            );
            await dm.send({ components: [c], flags: MessageFlags.IsComponentsV2 });
        } catch {}

    } catch (err) {
        const msg = err?.message ?? String(err);
        console.error(`[AutoQuest:${userId}] Error:`, msg);
        if (msg.includes('401')) {
            tokenStore.remove(userId);
            disableAutoquest(userId);
            try {
                const user = await discordClient.users.fetch(userId);
                const dm = await user.createDM();
                const { ContainerBuilder, TextDisplayBuilder } = await import('discord.js');
                const c = new ContainerBuilder().setAccentColor(0xED4245);
                c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🤖 Auto-Quest Paused\nYour saved token expired. Run \`${PREFIX}link\` to re-link, then \`${PREFIX}autoquest\` to re-enable.`));
                await dm.send({ components: [c], flags: MessageFlags.IsComponentsV2 });
            } catch {}
        }
    }
}
