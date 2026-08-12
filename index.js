const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ] 
});

const TOKEN = process.env.TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const MEMORY_FILE = path.join(__dirname, 'memory.json');

function loadMemory() {
    try {
        if (fs.existsSync(MEMORY_FILE)) {
            return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading memory:', e);
    }
    return {};
}

function saveMemory(memory) {
    try {
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
    } catch (e) {
        console.error('Error saving memory:', e);
    }
}

function getConversationHistory(memory, userId, limit = 10) {
    const history = memory[userId] || [];
    return history.slice(-limit);
}

function addToHistory(memory, userId, role, content) {
    if (!memory[userId]) memory[userId] = [];
    memory[userId].push({ role, content, timestamp: Date.now() });
    if (memory[userId].length > 50) {
        memory[userId] = memory[userId].slice(-50);
    }
    saveMemory(memory);
}

function buildPrompt(userId, userMessage, memory) {
    const history = getConversationHistory(memory, userId, 8);
    let context = '';
    if (history.length > 0) {
        context = history.map(msg => 
            `${msg.role === 'user' ? 'User' : 'Alice'}: ${msg.content}`
        ).join('\n') + '\n';
    }
    
    return `You are Alice. You're 19, unhinged, chaotic, and a little unhinged. You talk like a actual person — not a therapist. You don't ask questions unless you actually care. You're sarcastic, funny, and sometimes just say random stuff. Keep replies SHORT (1-2 sentences max). No emoji spam. No "how about you?" unless it's natural. Just vibe.

Here's your conversation with this user so far:
${context}
User: ${userMessage}`;
}

async function getGeminiResponse(prompt) {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    { 
                        role: 'user', 
                        parts: [{ text: prompt }] 
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

let memory = loadMemory();

client.on('ready', () => {
    console.log(`✅ ${client.user.tag} is online with Gemini + Memory!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const startsWithBang = message.content.startsWith('!');
    const isMentioned = message.mentions.has(client.user);
    const isReplyToHer = message.reference?.messageId && 
        (await message.fetchReference()).author.id === client.user.id;
    
    if (!startsWithBang && !isMentioned && !isReplyToHer) return;
    
    let userMessage = message.content;
    if (startsWithBang) {
        userMessage = userMessage.slice(1).trim();
    }
    userMessage = userMessage.replace(/<@!?[0-9]+>/g, '').trim();
    
    if (!userMessage) {
        userMessage = "Hello!";
    }
    
    try {
        await message.channel.sendTyping();
        
        const prompt = buildPrompt(message.author.id, userMessage, memory);
        const reply = await getGeminiResponse(prompt);
        
        addToHistory(memory, message.author.id, 'user', userMessage);
        addToHistory(memory, message.author.id, 'assistant', reply);
        
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