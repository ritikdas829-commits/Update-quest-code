import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import fs from 'fs';

const SERVERS_FILE = 'servers.json';

export default {
    data: new SlashCommandBuilder()
        .setName('setrole')
        .setDescription('Set the Quest Access Role for this server')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role required to use the quest bot')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild), // Sirf admins hi use kar payenge

    async execute(interaction) {
        const role = interaction.options.getRole('role');
        const guildId = interaction.guild.id;

        let serverConfig = {};
        try {
            if (fs.existsSync(SERVERS_FILE)) {
                serverConfig = JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf8'));
            }
        } catch {
            serverConfig = {};
        }

        // Server ID ke mutabiq role ID save karein
        serverConfig[guildId] = {
            questRoleId: role.id,
            roleName: role.name
        };

        fs.writeFileSync(SERVERS_FILE, JSON.stringify(serverConfig, null, 2));

        await interaction.client.deployCommands?.(); // Agar auto-deploy setup hai

        await interaction.reply({
            content: `✨ Success! The Quest Access Role for this server has been set to **${role.name}**.`,
            ephemeral: true
        });
    },
};
