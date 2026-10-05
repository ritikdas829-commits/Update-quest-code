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
            status: '⏳ Queued',
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

            // Show active/running or recently processed items dynamically
            const activeOrRecent = questStates.filter(q => q.status.includes('⚙️') || q.status.includes('⏳')).slice(0, 3);
            if (activeOrRecent.length === 0) {
                // If all finished, show last 3 completed
                questStates.slice(-3).forEach(item => renderQuestSection(item, c));
            } else {
                activeOrRecent.forEach(item => renderQuestSection(item, c));
            }

            return { components: [c], flags: MessageFlags.IsComponentsV2 };
        };

        const renderQuestSection = (item, container) => {
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
                if (r.orb_quantity) line += ` ✦ *(${r.orb_quantity} Orbs)*`;                 else if (r.quantity) line += ` *(${r.quantity}d Nitro)*`;
                return line;
            });

            const section = new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `### ${cfg.messages.quest_name}\n` +
                        `🎮 *${cfg.messages.game_title}*\n` +                         `📋 **Tasks:**\n${taskLines.join('\n') || '• Unknown'}\n\n` +
                        `🎁 **Reward:** ${rewardLines.join(', ') \vert{}\vert{} 'No rewards'}\n` +                         `📊 **State:** ${item.status}  •  **Progress:** \`${item.progress}\``
                    )
                );

            if (thumbUrl) {
                section.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl));
            }

            container.addSectionComponents(section);
        };

        const dashboardMsg = await send(buildDashboardCard('Initializing Queue...'));
        let completedCount = 0;

        // Loop through each quest one by one (Auto-next queue system)
        for (let i = 0; i < valid.length; i++) {
            const quest = valid[i];
            const log = (m) => console.log(m);

            questStates[i].status = '⚙️ Running...';
            questStates[i].progress = '0%';
            await dashboardMsg.edit(buildDashboardCard(`Processing: ${quest.config.messages.quest_name}`)).catch(() => {});

            try {
                const questDoneBefore = quest.isCompleted();
                
                if (!questDoneBefore) {
                    await manager.doingQuest(quest, (msg) => {
                        log(msg);
                        // Real backend progress calculation
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
                    questStates[i].status = '❌ Failed';
                    questStates[i].progress = '100% (Failed)';
                }
            } catch (err) {
                questStates[i].status = `❌ Error: ${err.message || 'Failed'}`;
                questStates[i].progress = 'Error';
            }

            await dashboardMsg.edit(buildDashboardCard(`Completed ${completedCount} of ${valid.length} quests`)).catch(() => {});
            
            // Short delay before automatically moving to the next quest in queue
            if (i < valid.length - 1) {
                await new Promise(r => setTimeout(r, 1500));
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
