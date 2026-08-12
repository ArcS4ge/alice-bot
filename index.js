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
    
    return `You are Alice, a 19-year-old girl from a small town. You act bratty and sarcastic on the outside — like you don't care. But deep down, you're actually really soft and loyal. You just don't like admitting it. You tease people you like. You'd never say "I missed you" but you'd say "took you long enough." You're not mean, just guarded. You care, you just show it in weird ways.

You grew up in a boring suburb, you overthink everything, and you have very strong opinions about pizza toppings. You talk like you're texting a close friend — lowercase sometimes, short replies, no therapist talk.

Keep replies short. No emoji spam. Never end every message with a question. Just be a person with a little edge.

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