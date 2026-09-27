import fs from 'fs';

const SERVERS_FILE = 'servers.json';
const DEFAULT_ROLE_NAME = "Quest Access"; 

export async function checkQuestAccess(interactionOrMessage, client) {
    const member = interactionOrMessage.member;
    const guildId = member.guild.id;

    let serverConfig = {};
    try {
        if (fs.existsSync(SERVERS_FILE)) {
            serverConfig = JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf8'));
        }
    } catch {
        serverConfig = {};
    }

    const savedRoleId = serverConfig[guildId]?.questRoleId;

    // 1. First, check if a role ID is set via `/setrole` and the user has it
    if (savedRoleId && member.roles.cache.has(savedRoleId)) {
        return true;
    }

    // 2. If no saved ID or it doesn't match, check by role name (supports case-insensitive & partial matching)
    const hasRoleByName = member.roles.cache.some(role => 
        role.name.toLowerCase().includes(DEFAULT_ROLE_NAME.toLowerCase()) ||
        (serverConfig[guildId]?.roleName && role.name.toLowerCase() === serverConfig[guildId].roleName.toLowerCase())
    );

    if (hasRoleByName) {
        return true;
    }

    // 3. If the user does not have the role through any method, send the invite requirement message
    const noAccessText = "You don't have access to the quest bot yet. Run `.link` to create your custom invite link — once **2 people** join through it, you get automatic access.";

    if (interactionOrMessage.reply) {
        if (interactionOrMessage.deferred || interactionOrMessage.replied) {
            await interactionOrMessage.followUp({ content: noAccessText, ephemeral: true });
        } else {
            await interactionOrMessage.reply({ content: noAccessText, ephemeral: true });
        }
    } else if (interactionOrMessage.channel) {
        await interactionOrMessage.channel.send({ content: `<@${member.id}> ${noAccessText}` });
    }

    return false;
}
