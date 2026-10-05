import { ComponentType, MessageFlags } from 'discord.js';
import { QuestClient } from './questClient.js';
import { enableAutoquest, disableAutoquest, isAutoquestEnabled } from './autoquestStore.js';
import { PREFIX } from '../utils/config.js';
import {
    buildLinkPrompt,
    buildNoQuestsCard,
    buildExpiredTokenCard,
    buildErrorCard,
    buildQuestSelectCard,
} from './questUI.js';

export async function runQuestOne(userId, tokenStore, send) {
    const token = await tokenStore.get(userId);
    if (!token) { await send(buildLinkPrompt()); return false; }

    const qc = new QuestClient(token);
    try {
        const manager = await qc.fetchQuests();
        const valid = manager.filterQuestsValid();
        if (valid.length === 0) { await send(buildNoQuestsCard()); return false; }

        const selMsg = await send(buildQuestSelectCard(valid));

        let selectedId;
        try {
            const interaction = await selMsg.awaitMessageComponent({
                filter: (i) => i.user.id === userId,
                time: 60_000,
                componentType: ComponentType.StringSelect,
            });
            await interaction.deferUpdate();
            selectedId = interaction.values[0];
        } catch {
            const { ContainerBuilder, TextDisplayBuilder } = await import('discord.js');
            const c = new ContainerBuilder().setAccentColor(0xED4245);
            c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ⏱️ Timed Out\nNo quest was selected within 60 seconds. Run \`${PREFIX}quest\` again.`));
            await selMsg.edit({ components: [c], flags: MessageFlags.IsComponentsV2 });
            return false;
        }

        await selMsg.edit({ components: [], flags: MessageFlags.IsComponentsV2 });

        const quest = valid.find((q) => q.id === selectedId);
        
        const { ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize } = await import('discord.js');
        const cfg = quest.config;
        
        const assetHash = cfg.assets?.game_tile || cfg.assets?.hero || cfg.assets?.quest_bar;
        const thumbUrl = assetHash ? `https://cdn.discordapp.com/app-assets/${cfg.application.id}/quest-assets/${assetHash}.png` : null;

        const TASK_META = {
            PLAY_ON_DESKTOP: { icon: '🖥️', label: 'Play on Desktop' },
            WATCH_VIDEO: { icon: '🎬', label: 'Watch Video' },
            STREAM_ON_DESKTOP: { icon: '📺', label: 'Stream on Desktop' },
            PLAY_ACTIVITY: { icon: '🎮', label: 'Play Activity' },
            WATCH_VIDEO_ON_MOBILE: { icon: '📱', label: 'Watch Video on Mobile' },
            WATCH_VIDEO_BY_STREAM: { icon: '📡', label: 'Watch Video by Stream' },
            LEARN_MORE: { icon: '📖', label: 'Learn More' },
            WATCH_VIDEO_EMBED: { icon: '🔗', label: 'Watch Video Embed' },
            PLAY_ON_XBOX: { icon: '🟩', label: 'Play on Xbox' },
            PLAY_ON_PLAYSTATION: { icon: '🟦', label: 'Play on PlayStation' },
            ACHIEVEMENT_IN_ACTIVITY: { icon: '🏆', label: 'Achievement in Activity' },
            PLAY_ON_NINTENDO_SWITCH: { icon: '🔴', label: 'Play on Nintendo Switch' },
            PLAY_ON_MOBILE: { icon: '📱', label: 'Play on Mobile' },
            WATCH_VIDEO_WEB: { icon: '🌐', label: 'Watch Video on Web' },
            STREAM_ON_MOBILE: { icon: '📲', label: 'Stream on Mobile' },
            PLAY_ON_VR: { icon: '🥽', label: 'Play on VR' },
            WATCH_STREAM: { icon: '👁️', label: 'Watch Stream' },
        };

        const buildSingleCard = (status, progress) => {
            const c = new ContainerBuilder().setAccentColor(status.includes('✅') ? 0x57F287 : status.includes('❌') ? 0xED4245 : 0x5865F2);
            c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🚀 Single Quest Runner`));
            c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
            
            const taskLines = Object.entries((cfg.task_config ?? cfg.task_config_v2)?.tasks ?? {}).map(([type, task]) => {
                const meta = TASK_META[type] ?? { icon: '⚙', label: type };
                let dur = '';
                if (task && typeof task.target === 'number') {
                    dur = task.target >= 60 ? ` (**${Math.ceil(task.target / 60)} min**)` : ` (**${task.target}s**)`;
                }
                return `${meta.icon} ${meta.label}${dur}`;
            });

            const section = new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `### ${cfg.messages.quest_name}\n` +
                        `🎮 *${cfg.messages.game_title}*\n` +
                        `📋 **Tasks:**\n${taskLines.join('\n') || '• Unknown'}\n\n` +
                        `📊 **Status:** ${status}  •  **Progress:** \`${progress}\``
                    )
                );

            if (thumbUrl) {
                section.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl));
            }

            c.addSectionComponents(section);
            return { components: [c], flags: MessageFlags.IsComponentsV2 };
        };

        const progressMsg = await send(buildSingleCard('⚙️ Solving...', '0%'));

        const log = (m) => console.log(m);
        const questDoneBefore = quest.isCompleted();

        if (!questDoneBefore) {
            await manager.doingQuest(quest, (msg) => {
                log(msg);
                const taskConfig = quest.config.task_config ?? quest.config.task_config_v2;
                const tasks = taskConfig?.tasks ?? {};
                const firstTaskKey = Object.keys(tasks)[0];
                const target = tasks[firstTaskKey]?.target || 100;

                const progressObj = quest.userStatus?.progress;
                const currentVal = Number(progressObj?.[firstTaskKey]?.value || progressObj?.[Object.keys(progressObj)[0]]?.value || 0);

                const calculatedPct = Math.min(100, Math.max(0, Math.floor((currentVal / target) * 100)));
                progressMsg.edit(buildSingleCard('⚙️ Solving...', `${calculatedPct}%`)).catch(() => {});
            });
        }

        if (quest.isCompleted() || questDoneBefore) {
            const claimed = await manager.claimRewards(log).catch(() => 0);
            await progressMsg.edit(buildSingleCard(`✅ Completed (+${claimed} Orbs)`, '100%'));
            return true;
        } else {
            await progressMsg.edit(buildSingleCard('❌ Failed', '100% (Failed)'));
            return false;
        }
    } catch (err) {
        const msg = err?.message ?? String(err);
        if (msg.includes('401') && (await tokenStore.has(userId))) {
            await tokenStore.remove(userId);
            disableAutoquest(userId);
            await send(buildExpiredTokenCard()).catch(() => {});
        } else {
            await send(buildErrorCard(err)).catch(() => {});
        }
        return false;
    }
}

export async function runQuestAll(userId, tokenStore, send, user = { username: 'User' }) {
    const token = await tokenStore.get(userId);
    if (!token) { await send(buildLinkPrompt()); return false; }

    const qc = new QuestClient(token);
    try {
        let manager = await qc.fetchQuests();
        let valid = manager.filterQuestsValid();

        if (valid.length === 0) {
            await new Promise(r => setTimeout(r, 2000));
            manager = await qc.fetchQuests();
            valid = manager.filterQuestsValid();
            if (valid.length === 0) { await send(buildNoQuestsCard()); return false; }
        }

        const { ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize } = await import('discord.js');

        const TASK_META = {
            PLAY_ON_DESKTOP: { icon: '🖥️', label: 'Play on Desktop' },
            WATCH_VIDEO: { icon: '🎬', label: 'Watch Video' },
            STREAM_ON_DESKTOP: { icon: '📺', label: 'Stream on Desktop' },
            PLAY_ACTIVITY: { icon: '🎮', label: 'Play Activity' },
            WATCH_VIDEO_ON_MOBILE: { icon: '📱', label: 'Watch Video on Mobile' },
            WATCH_VIDEO_BY_STREAM: { icon: '📡', label: 'Watch Video by Stream' },
            LEARN_MORE: { icon: '📖', label: 'Learn More' },
            WATCH_VIDEO_EMBED: { icon: '🔗', label: 'Watch Video Embed' },
            PLAY_ON_XBOX: { icon: '🟩', label: 'Play on Xbox' },
            PLAY_ON_PLAYSTATION: { icon: '🟦', label: 'Play on PlayStation' },
            ACHIEVEMENT_IN_ACTIVITY: { icon: '🏆', label: 'Achievement in Activity' },
            PLAY_ON_NINTENDO_SWITCH: { icon: '🔴', label: 'Play on Nintendo Switch' },
            PLAY_ON_MOBILE: { icon: '📱', label: 'Play on Mobile' },
            WATCH_VIDEO_WEB: { icon: '🌐', label: 'Watch Video on Web' },
            STREAM_ON_MOBILE: { icon: '📲', label: 'Stream on Mobile' },
            PLAY_ON_VR: { icon: '🥽', label: 'Play on VR' },
            WATCH_STREAM: { icon: '👁️', label: 'Watch Stream' },
        };

        const questStates = valid.map(q => ({
            quest: q,
            status: '⏳ Queued...',
            progress: '0%',
        }));

        const buildDashboardCard = (titleStatus = 'Running Quests...') => {
            const userName = user.displayName || user.globalName || user.username || 'User';
            const c = new ContainerBuilder().setAccentColor(0x5865F2);

            c.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# 👑 ${userName}'s Quest Dashboard\n` +
                    `*Status: ${titleStatus}* • Total Quests: **${valid.length}**`
                )
            );
            c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

            // SAFE LIMIT: Max 3 quests rendered at once to prevent exceeding Discord's components limit
            questStates.slice(0, 3).forEach((item) => {
                const cfg = item.quest.config;
                const assetHash = cfg.assets?.game_tile || cfg.assets?.hero || cfg.assets?.quest_bar;
                const thumbUrl = assetHash ? `https://cdn.discordapp.com/app-assets/${cfg.application.id}/quest-assets/${assetHash}.png` : null;
                
                const taskLines = Object.entries((cfg.task_config ?? cfg.task_config_v2)?.tasks ?? {}).map(([type, task]) => {
                    const meta = TASK_META[type] ?? { icon: '⚙️', label: type };
                    let dur = '';
                    if (task && typeof task.target === 'number') {
                        dur = task.target >= 60 ? ` (**${Math.ceil(task.target / 60)} min**)` : ` (**${task.target}s**)`;
                    }
                    return `${meta.icon} ${meta.label}${dur}`;
                });

                const rewardLines = cfg.rewards_config.rewards.map((r) => {
                    let line = `**${r.messages.name}**`;
                    if (r.orb_quantity) line += ` ✦ *(${r.orb_quantity} Orbs)*`;
                    else if (r.quantity) line += ` *(${r.quantity}d Nitro)*`;
                    return line;
                });

                const section = new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `### ${cfg.messages.quest_name}\n` +
                            `🎮 *${cfg.messages.game_title}*\n` +
                            `📋 **Tasks:**\n${taskLines.join('\n') || '• Unknown'}\n\n` +
                            `🎁 **Reward:** ${rewardLines.join(', ') || 'No rewards'}\n` +
                            `📊 **State:** ${item.status}  •  **Progress:** \`${item.progress}\``
                        )
                    );

                if (thumbUrl) {
                    section.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl));
                }

                c.addSectionComponents(section);
            });

            if (questStates.length > 3) {
                c.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`-# *...and ${questStates.length - 3} more quest(s) queued below.*`)
                );
            }

            return { components: [c], flags: MessageFlags.IsComponentsV2 };
        };

        const dashboardMsg = await send(buildDashboardCard('Initializing Sequential Run...'));
        let completedCount = 0;

        for (let i = 0; i < valid.length; i++) {
            const quest = valid[i];
            const log = (m) => console.log(m);

            questStates[i].status = '⚙️ Solving...';
            questStates[i].progress = '0%';
            await dashboardMsg.edit(buildDashboardCard(`Processing: ${quest.config.messages.quest_name}`)).catch(() => {});

            try {
                const questDoneBefore = quest.isCompleted();

                if (!questDoneBefore) {
                    await manager.doingQuest(quest, (msg) => {
                        log(msg);
                        const taskConfig = quest.config.task_config ?? quest.config.task_config_v2;
                        const tasks = taskConfig?.tasks ?? {};
                        const firstTaskKey = Object.keys(tasks)[0];
                        const target = tasks[firstTaskKey]?.target || 100;

                        const progressObj = quest.userStatus?.progress;
                        const currentVal = Number(progressObj?.[firstTaskKey]?.value || progressObj?.[Object.keys(progressObj)[0]]?.value || 0);

                        const calculatedPct = Math.min(100, Math.max(0, Math.floor((currentVal / target) * 100)));
                        questStates[i].progress = `${calculatedPct}%`;

                        dashboardMsg.edit(buildDashboardCard(`Processing: ${quest.config.messages.quest_name}`)).catch(() => {});
                    });
                }

                if (quest.isCompleted() || questDoneBefore) {
                    questStates[i].progress = '100%';
                    const claimed = await manager.claimRewards(log).catch(() => 0);
                    questStates[i].status = `✅ Completed (+${claimed} Orbs)`;
                    completedCount++;
                } else {
                    questStates[i].status = '❌ Failed / Manual Required';
                    questStates[i].progress = '100% (Failed)';
                }
            } catch (err) {
                questStates[i].status = `❌ Error: ${err.message || 'Failed'}`;
                questStates[i].progress = '100% (Error)';
            }

            await dashboardMsg.edit(buildDashboardCard(`Completed ${completedCount} of ${valid.length} quests`)).catch(() => {});
            
            if (i < valid.length - 1) {
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        await dashboardMsg.edit(buildDashboardCard('All Quests Processed ✅')).catch(() => {});
        return completedCount > 0;

    } catch (err) {
        const msg = err?.message ?? String(err);
        if (msg.includes('401') && (await tokenStore.has(userId))) {
            await tokenStore.remove(userId); 
            disableAutoquest(userId);
            await send(buildExpiredTokenCard()).catch(() => {});
        } else {
            await send(buildErrorCard(err)).catch(() => {});
        }
        return false;
    }
}

export async function runQuestList(userId, tokenStore, send) {
    const token = await tokenStore.get(userId);
    if (!token) { await send(buildLinkPrompt()); return; }

    const qc = new QuestClient(token);
    try {
        const manager = await qc.fetchQuests();
        const all = manager.list();
        if (all.length === 0) { await send(buildNoQuestsCard()); return; }

        const TASK_META = {
            PLAY_ON_DESKTOP: { icon: '🖥', label: 'Play on Desktop' },
            WATCH_VIDEO: { icon: '🎬', label: 'Watch Video' },
            STREAM_ON_DESKTOP: { icon: '📺', label: 'Stream on Desktop' },
            PLAY_ACTIVITY: { icon: '🎮', label: 'Play Activity' },
            WATCH_VIDEO_ON_MOBILE: { icon: '📱', label: 'Watch Video on Mobile' },
            WATCH_VIDEO_BY_STREAM: { icon: '📡', label: 'Watch Video by Stream' },
            LEARN_MORE: { icon: '📖', label: 'Learn More' },
            WATCH_VIDEO_EMBED: { icon: '🔗', label: 'Watch Video Embed' },
            PLAY_ON_XBOX: { icon: '🟩', label: 'Play on Xbox' },
            PLAY_ON_PLAYSTATION: { icon: '🟦', label: 'Play on PlayStation' },
            ACHIEVEMENT_IN_ACTIVITY: { icon: '🏆', label: 'Achievement in Activity' },
            PLAY_ON_NINTENDO_SWITCH: { icon: '🔴', label: 'Play on Nintendo Switch' },
            PLAY_ON_MOBILE: { icon: '📱', label: 'Play on Mobile' },
            WATCH_VIDEO_WEB: { icon: '🌐', label: 'Watch Video on Web' },
            STREAM_ON_MOBILE: { icon: '📲', label: 'Stream on Mobile' },
            PLAY_ON_VR: { icon: '🥽', label: 'Play on VR' },
            WATCH_STREAM: { icon: '👁️', label: 'Watch Stream' },
        };

        for (const q of all.slice(0, 5)) {
            const cfg = q.config;
            const msgs = cfg.messages;
            const assetHash = cfg.assets?.game_tile || cfg.assets?.hero || cfg.assets?.quest_bar;
            const thumbUrl = assetHash ? `https://cdn.discordapp.com/app-assets/${cfg.application.id}/quest-assets/${assetHash}.png` : null;
            const expiresEpoch = Math.floor(new Date(cfg.expires_at).getTime() / 1000);
            const daysLeft = Math.max(0, Math.ceil((new Date(cfg.expires_at).getTime() - Date.now()) / 86400000));

            const st = q.isCompleted() ? { color: 0x57F287, icon: '✅', label: 'Completed' }
                : q.isExpired() ? { color: 0xED4245, icon: '🔴', label: 'Expired' }
                : q.isEnrolledQuest() ? { color: 0xFEE75C, icon: '⏳', label: 'In Progress' }
                : { color: 0x5865F2, icon: '🔵', label: 'Available' };

            const taskLines = Object.entries((cfg.task_config ?? cfg.task_config_v2)?.tasks ?? {}).map(([type, task]) => {
                const meta = TASK_META[type] ?? { icon: '⚙️', label: type };
                let dur = '';
                if (task && typeof task.target === 'number') {
                    dur = task.target >= 60 ? `  •  **${Math.ceil(task.target / 60)} min**` : `  •  **${task.target}s**`;
                }
                return `${meta.icon} ${meta.label}${dur}`;
            });

            const rewardLines = cfg.rewards_config.rewards.map((r) => {
                let line = `**${r.messages.name}**`;
                if (r.orb_quantity) line += `  ✦ *(${r.orb_quantity} Orbs)*`;
                else if (r.quantity) line += `  *(${r.quantity}d Nitro)*`;
                return line;
            });

            const { ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize } = await import('discord.js');
            const c = new ContainerBuilder().setAccentColor(st.color);
            
            const section = new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# ${st.icon}  ${msgs.quest_name}\n*${msgs.game_title}*  •  ${msgs.game_publisher}`,
                    ),
                );

            if (thumbUrl) {
                section.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl));
            }

            c.addSectionComponents(section);
            c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
            c.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `📊 **Status:** ${st.label}   📅 **Expires:** <t:${expiresEpoch}:R> *(${daysLeft}d)*\n\n` +
                    `📋 **Task**\n${taskLines.join('\n') || '*Unknown*'}\n\n` +
                    `🎁 **Reward**\n${rewardLines.join('\n') || '*No rewards listed*'}`,
                ),
            );
            await send({ components: [c], flags: MessageFlags.IsComponentsV2 });
        }

    } catch (err) {
        await send(buildErrorCard(err)).catch(() => {});
    }
}

export async function runTokenCheck(userId, tokenStore, replyFn) {
    const token = await tokenStore.get(userId);
    const { ContainerBuilder, TextDisplayBuilder } = await import('discord.js');

    if (!token) {
        const c = new ContainerBuilder().setAccentColor(0xFEE75C);
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# No Token Saved\nYou don't have a saved token. Use \`${PREFIX}link\` to save one.`));
        await replyFn({ components: [c], flags: MessageFlags.IsComponentsV2 });
        return;
    }

    let valid = false, accountName = '';
    try {
        const res = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: token } });
        valid = res.ok;
        if (res.ok) {
            const data = await res.json();
            accountName = data.global_name || data.username || '';
        }
    } catch { valid = false; }

    const c = new ContainerBuilder().setAccentColor(valid ? 0x57F287 : 0xED4245);
    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            valid
                ? `# ✅ Token is Valid\nLinked as **"${accountName}"**.\n\nYour saved token is working correctly.`
                : `# ❌ Token Invalid or Expired\nYour saved token was rejected by Discord.\nUse \`${PREFIX}unlink\` then \`${PREFIX}link\` to save a fresh token.`,
        ),
    );
    await replyFn({ components: [c], flags: MessageFlags.IsComponentsV2 });
    if (!valid) await tokenStore.remove(userId);
}

export async function runAutoquestToggle(userId, tokenStore, replyFn) {
    const { ContainerBuilder, TextDisplayBuilder } = await import('discord.js');
    if (isAutoquestEnabled(userId)) {
        disableAutoquest(userId);
        const c = new ContainerBuilder().setAccentColor(0xFEE75C);
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🤖 Auto-Quest Disabled\nI'll no longer auto-run new quests for you.\nUse \`${PREFIX}autoquest\` again to turn it back on.`));
        await replyFn({ components: [c], flags: MessageFlags.IsComponentsV2 });
        return;
    }
    
    const hasToken = await tokenStore.has(userId);
    if (!hasToken) {
        const c = new ContainerBuilder().setAccentColor(0xED4245);
        c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ❌ No Saved Token\nAuto-Quest needs your Discord user token.\n\n**Use \`${PREFIX}link\` first**, then run \`${PREFIX}autoquest\` again.`));
        await replyFn({ components: [c], flags: MessageFlags.IsComponentsV2 });
        return;
    }
    
    enableAutoquest(userId);
    const c = new ContainerBuilder().setAccentColor(0x57F287);
    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# 🤖 Auto-Quest Enabled!\nEvery new Discord quest that drops will be **auto-completed for you** in the background.\n\nI'll DM you a summary once each quest finishes.\n\nUse \`${PREFIX}autoquest\` again to turn this off.\n\n-# Keep your saved token fresh with \`${PREFIX}tokencheck\`.`,
        ),
    );
    await replyFn({ components: [c], flags: MessageFlags.IsComponentsV2 });
}
