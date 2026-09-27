import {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
} from 'discord.js';
import { PREFIX } from '../utils/config.js';

export function buildLinkModal() {
    const modal = new ModalBuilder()
        .setCustomId('link_token_modal')
        .setTitle('Link Your Discord Token');
    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('link_token_input')
                .setLabel('Your Discord user token')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Paste your token here...')
                .setRequired(true),
        ),
    );
    return modal;
}

export function buildLinkPrompt() {
    const c = new ContainerBuilder().setAccentColor(0xFEE75C);
    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# 🔗 Token Required\nYou need to link your Discord token before using quest commands.\n\nClick **Link Token** below — a popup will appear where you can paste your token.\n\n**How to get your token:**\n\`1.\` Open Discord in your **browser** (not the app)\n\`2.\` Press \`Ctrl+Shift+I\` → **Network** tab → filter \`XHR\`\n\`3.\` Send any message, click the request, find \`Authorization\` in headers\n\`4.\` Copy that value and paste it into the popup\n\n> ⚠️ This is your **user token**, NOT your bot token.`,
        ),
    );
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    c.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('link_prompt')
                .setLabel('🔗 Link Token')
                .setStyle(ButtonStyle.Primary),
        ),
    );
    return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

export function buildNoQuestsCard() {
    const c = new ContainerBuilder().setAccentColor(0x4F545C);
    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# 🔍 No Quests Available\nThere are no active, uncompleted quests on your account right now.`,
        ),
    );
    return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

export function buildExpiredTokenCard() {
    const c = new ContainerBuilder().setAccentColor(0xED4245);
    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# ❌ Token Expired\nYour saved token was rejected by Discord — it has likely expired.\n\n**Your token has been removed.** Re-link with \`/link\` or \`${PREFIX}link\`.`,
        ),
    );
    return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

export function buildErrorCard(err) {
    const msg = err?.message ?? String(err);
    const is401 = msg.includes('401');
    const c = new ContainerBuilder().setAccentColor(0xED4245);
    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            is401
                ? `# ❌ Invalid or Expired Token\nRe-link your token with \`${PREFIX}link\`.`
                : `# ❌ Error\n${msg.slice(0, 800)}`,
        ),
    );
    return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

export function buildQuestSelectCard(quests) {
    const ICONS = {
        PLAY_ON_DESKTOP: '🖥️', WATCH_VIDEO: '🎬', STREAM_ON_DESKTOP: '📺',
        PLAY_ACTIVITY: '🎮', WATCH_VIDEO_ON_MOBILE: '📱',
    };

    const lines = quests.map((q, i) => {
        const tasks = (q.config.task_config ?? q.config.task_config_v2)?.tasks ?? {};
        const taskKey = Object.keys(tasks)[0] ?? '';
        const icon = ICONS[taskKey] ?? '⚙️';
        const exp = Math.floor(new Date(q.config.expires_at).getTime() / 1000);
        return `**${i + 1}.** ${icon} **${q.config.messages.quest_name}**\n> *${q.config.messages.game_title}*  •  Expires <t:${exp}:R>`;
    }).join('\n\n');

    const c = new ContainerBuilder().setAccentColor(0x5865F2);
    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# 🎮 ${quests.length} Quest${quests.length !== 1 ? 's' : ''} Available\n${lines}\n\n*Use the dropdown below to pick one.*`,
        ),
    );
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`quest_select_${Date.now()}`)
        .setPlaceholder('Pick a quest...')
        .addOptions(
            quests.map((q) => {
                const tasks = (q.config.task_config ?? q.config.task_config_v2)?.tasks ?? {};
                const taskKey = Object.keys(tasks)[0] ?? '';
                return {
                    label: q.config.messages.quest_name.slice(0, 100),
                    description: q.config.messages.game_title.slice(0, 100),
                    value: q.id,
                    emoji: ICONS[taskKey] ?? '⚙️',
                };
            }),
        );

    c.addActionRowComponents(new ActionRowBuilder().addComponents(menu));
    return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

export function buildQuestInfoCard(quest, phase, claimed = 0, failReason = '') {
    const cfg = quest.config;
    const msgs = cfg.messages;
    const appId = cfg.application.id;
    const thumbUrl = `https://cdn.discordapp.com/app-assets/${appId}/quest-assets/${cfg.assets.game_tile}.png`;

    const TASK_META = {
        PLAY_ON_DESKTOP: { icon: '🖥️', label: 'Play on Desktop' },
        WATCH_VIDEO: { icon: '🎬', label: 'Watch Video' },
        STREAM_ON_DESKTOP: { icon: '📺', label: 'Stream on Desktop' },
        PLAY_ACTIVITY: { icon: '🎮', label: 'Play Activity' },
        WATCH_VIDEO_ON_MOBILE: { icon: '📱', label: 'Watch Video on Mobile' },
    };

    const taskLines = Object.entries((cfg.task_config ?? cfg.task_config_v2)?.tasks ?? {}).map(([type, task]) => {
        const meta = TASK_META[type] ?? { icon: '⚙️', label: type };
        let dur = '';
        if (type === 'PLAY_ON_DESKTOP' || type === 'STREAM_ON_DESKTOP') {
            dur = `  •  **${Math.ceil(task.target / 60)} min**`;
        } else if (type === 'WATCH_VIDEO' || type === 'WATCH_VIDEO_ON_MOBILE') {
            const s = task.target;
            dur = s >= 60 ? `  •  **${Math.ceil(s / 60)} min**` : `  •  **${s}s**`;
        }
        return `${meta.icon}${meta.label}${dur}${phase === 'done' ? '  ✅' : ''}`;
    });

    const rewardLines = cfg.rewards_config.rewards.map((r) => {
        let line = `**${r.messages.name}**`;
        if (r.orb_quantity) line += `  ✦ *(${r.orb_quantity} Orbs)*`;
        else if (r.quantity) line += `  *(${r.quantity}d Nitro)*`;
        return line;
    });

    const expiresEpoch = Math.floor(new Date(cfg.expires_at).getTime() / 1000);
    const daysLeft = Math.max(0, Math.ceil((new Date(cfg.expires_at).getTime() - Date.now()) / 86400000));

    const PHASE = {
        starting: { color: 0x5865F2, title: '⚙️  Solving Quest...', bar: '`░░░░░░░░░░`  **0%**  —  *Working on it...*' },
        done: { color: 0x57F287, title: '✅  Quest Complete!', bar: '`██████████`  **100%**' },
        failed: { color: 0xED4245, title: '❌  Quest Failed', bar: '' },
    };

    const p = PHASE[phase];
    const progressText = phase === 'failed' && failReason
        ? `\`░░░░░░░░░░\`  **0%**\n\`\`\`\n${failReason.slice(0, 300)}\n\`\`\``
        : p.bar;

    const footerNote = phase === 'done' && claimed > 0
        ? `-# 🎁 ${claimed} reward(s) claimed`
        : phase === 'starting'
        ? `-# Quest Bot  •  Please wait...`
        : phase === 'failed'
        ? `-# Requires manual completion in the Discord app`
        : '';

    const c = new ContainerBuilder().setAccentColor(p.color);
    c.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# ${p.title}\n### ${msgs.quest_name}\n*${msgs.game_title}*  •  ${msgs.game_publisher}`,
                ),
            )
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl)),
    );
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `📋 **Task**\n${taskLines.join('\n') || '*Unknown task*'}\n\n` +
            `📅 **Expires**  <t:${expiresEpoch}:R>  *(${daysLeft}d left)*\n\n` +
            `📊 **Progress**\n${progressText || '`░░░░░░░░░░`  0%'}\n\n` +
            `🎁 **Reward**\n${rewardLines.join('\n') || '*No rewards listed*'}`,
        ),
    );

    if (footerNote) {
        c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(footerNote));
    }

    return { components: [c], flags: MessageFlags.IsComponentsV2 };
}
