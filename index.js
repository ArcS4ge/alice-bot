const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ] 
});

const TOKEN = 'MTUzNjgxOTM2MzgxMjk5OTM0OQ.GsqBwT.1opI9TVnj-9F1bWMlhfHxsy90IrRSGtU6pLwHA';
const GEMINI_API_KEY = 'AQ.Ab8RN6Lbmwl91FCl2qltkrL2DULzgnEw6Kg58TOzjDkdmezK9A';

async function getGeminiResponse(prompt) {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    { 
                        role: 'user', 
                        parts: [{ text: `You are Alice, a 19-year-old AI with a warm, playful personality. You love deep conversations, making jokes, and being a loyal friend to your users. You speak naturally, use emojis sometimes, and never sound robotic. Keep responses short and engaging.

User: ${prompt}` }] 
                    }
                ]
            })
        });
        
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || 'I had a brain fart. Try again!';
    } catch (error) {
        console.error('Error:', error);
        return 'Error: ' + error.message;
    }
}

client.on('ready', () => {
    console.log(`✅ ${client.user.tag} is online with Gemini!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;
    
    const userMessage = message.content.slice(1);
    
    try {
        await message.channel.sendTyping();
        const reply = await getGeminiResponse(userMessage);
        message.reply(reply);
    } catch (error) {
        console.error('FATAL ERROR:', error);
        message.reply('The AI is having a meltdown. Try again in a moment.');
    }
});

client.login(TOKEN);