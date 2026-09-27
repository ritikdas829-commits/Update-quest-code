import fs from 'fs';

const INVITES_FILE = 'invites.json';
const clientInvites = new Map(); // guildId -> Map(inviteCode -> uses)

export async function cacheGuildInvites(guild) {
    try {
        const invites = await guild.invites.fetch();
        const codeUses = new Map();
        invites.forEach(inv => codeUses.set(inv.code, inv.uses));
        clientInvites.set(guild.id, codeUses);
    } catch (err) {
        console.error(`Could not fetch invites for guild ${guild.name}:`, err);
    }
}

export async function handleNewMemberJoin(member) {
    const guild = member.guild;
    if (!clientInvites.has(guild.id)) return;

    const oldInvites = clientInvites.get(guild.id);
    let usedInvite = null;

    try {
        const newInvites = await guild.invites.fetch();
        for (const [code, inv] of newInvites) {
            const oldUses = oldInvites.get(code) || 0;
            if (inv.uses > oldUses) {
                usedInvite = inv;
                break;
            }
        }
        // Update cache
        const codeUses = new Map();
        newInvites.forEach(inv => codeUses.set(inv.code, inv.uses));
        clientInvites.set(guild.id, codeUses);
    } catch (err) {
        console.error('Error tracking invite:', err);
    }

    if (!usedInvite || !usedInvite.inviter) return;

    const inviterId = usedInvite.inviter.id;

    // Load invites.json
    let invitesData = {};
    try {
        if (fs.existsSync(INVITES_FILE)) {
            invitesData = JSON.parse(fs.readFileSync(INVITES_FILE, 'utf8'));
        }
    } catch {
        invitesData = {};
    }

    if (!invitesData[inviterId]) {
        invitesData[inviterId] = { invites: 0, invitedUsers: [] };
    }

    // Agar user pehle count nahi hua hai
    if (!invitesData[inviterId].invitedUsers.includes(member.id)) {
        invitesData[inviterId].invites += 1;
        invitesData[inviterId].invitedUsers.push(member.id);
        fs.writeFileSync(INVITES_FILE, JSON.stringify(invitesData, null, 2));
    }

    // Check if invites reach 2
    if (invitesData[inviterId].invites >= 2) {
        let serverConfig = {};
        try {
            if (fs.existsSync('servers.json')) {
                serverConfig = JSON.parse(fs.readFileSync('servers.json', 'utf8'));
            }
        } catch {}

        const roleId = serverConfig[guild.id]?.questRoleId;
        const inviterMember = await guild.members.fetch(inviterId).catch(() => null);

        if (inviterMember && roleId) {
            await inviterMember.roles.add(roleId).catch(() => {});
        }
    }
}
