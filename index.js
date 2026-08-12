const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ] 
});

const TOKEN = process.env.TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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
        console.log('Gemini Response:', JSON.stringify(data, null, 2));
        
        let reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!reply || reply.trim() === '') {
            const fallbacks = [
                "That's a great question! 😊",
                "Hmm, let me think about that... 🤔",
                "Interesting! Tell me more about that! 😄",
                "I'm not sure, but I'd love to hear your thoughts! 💭",
                "That's a good one! I need to process that for a moment. 😅"
            ];
            reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
        }
        
        return reply;
        
    } catch (error) {
        console.error('Error:', error);
        const fallbacks = [
            "I'm having a moment, but I'm still here! 😄",
            "My bad! But let's keep going! 💪",
            "Oops! Try asking again? I promise I'm smarter than this! 😅"
        ];
        return fallbacks[Math.floor(Math.random() * fallbacks.length)];
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

const http = require('http');
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Alice is alive!');
});
server.listen(process.env.PORT || 10000);

client.login(TOKEN);