import { handleNewMemberJoin } from '../utils/inviteTracker.js';

export default {
    name: 'guildMemberAdd',
    async execute(member, client) {
        await handleNewMemberJoin(member, client);
    }
};
