import fs from 'fs';

export default {
    name: 'guildMemberAdd',
    async execute(member, client) {
        // Yahan aap Discord ke invite cache ya API se track kar sakte hain ki kisne invite kiya
        // Example logic:
        const inviterId = 'INVITER_DISCORD_ID'; // Yeh invite tracker logic se nikalega
        
        if (!inviterId) return;

        let invitesData = {};
        try {
            if (fs.existsSync('invites.json')) {
                invitesData = JSON.parse(fs.readFileSync('invites.json', 'utf8'));
            }
        } catch {
            invitesData = {};
        }

        if (!invitesData[inviterId]) {
            invitesData[inviterId] = { invites: 0, invitedUsers: [] };
        }

        // Add invite if not already counted for this user
        if (!invitesData[inviterId].invitedUsers.includes(member.id)) {
            invitesData[inviterId].invites += 1;
            invitesData[inviterId].invitedUsers.push(member.id);
            fs.writeFileSync('invites.json', JSON.stringify(invitesData, null, 2));
        }

        // Check if invites reach 2
        if (invitesData[inviterId].invites >= 2) {
            const guild = member.guild;
            const inviterMember = await guild.members.fetch(inviterId).catch(() => null);
            
            // servers.json se role ID nikal kar role assign karein
            let serverConfig = {};
            try {
                if (fs.existsSync('servers.json')) {
                    serverConfig = JSON.parse(fs.readFileSync('servers.json', 'utf8'));
                }
            } catch {}

            const roleId = serverConfig[guild.id]?.questRoleId;
            if (inviterMember && roleId) {
                await inviterMember.roles.add(roleId).catch(() => {});
            }
        }
    }
};
