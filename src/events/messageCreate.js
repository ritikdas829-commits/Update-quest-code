import { getEmoji } from '../handlers/emoji.js';
import { PREFIX } from '../utils/config.js';
import { checkQuestAccess } from '../utils/checkQuestAccess.js';

export default {
  name: 'messageCreate',
  once: false,
  async execute(message, client) {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();

    const command = client.prefixCommands.get(commandName);
    if (!command) return;

    // Check if the user has access before executing the command
    const hasAccess = await checkQuestAccess(message, client);
    if (!hasAccess) return; // Stops execution and sends the invite requirement message if they don't have access

    try {
      await command.prefixExecute(message, args, client);
    } catch (err) {
      console.error(err);
      await message.reply(`${getEmoji('error')} Something went wrong.`).catch(() => {});
    }
  },
};
