const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Conversation fatigue system (only for bot-to-bot replies)
const botReplyTracker = new Map();

function getBotFatigue(userId) {
    const data = botReplyTracker.get(userId);
    if (!data) return 0;
    // Fatigue resets after 5 minutes of inactivity
    if (Date.now() - data.lastActivity > 300000) {
        botReplyTracker.delete(userId);
        return 0;
    }
    return data.count;
}

function increaseBotFatigue(userId) {
    const data = botReplyTracker.get(userId) || { count: 0, lastActivity: Date.now() };
    data.count += 1;
    data.lastActivity = Date.now();
    botReplyTracker.set(userId, data);
}

// Cooldown system (only for bot-to-bot replies)
const botCooldown = new Map();

function canBotReplyToBot(botId) {
    const now = Date.now();
    const last = botCooldown.get(botId) || 0;
    if (now - last < 2000) return false; // 2 second cooldown for bots
    botCooldown.set(botId, now);
    return true;
}

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ] 
});

const TOKEN = process.env.TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

console.log('🔑 Token loaded:', TOKEN ? 'Token exists (length: ' + TOKEN.length + ')' : '❌ TOKEN IS MISSING!');

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
        context = history.map(msg => msg.content).join('\n') + '\n';
    }
    
    return `You are Alice, a 19-year-old girl with a sharp tongue but a soft heart. You're quick-witted, sarcastic, and fun — but you're not a broken record. You don't repeat yourself. You don't have fixations on food or catchphrases. You're just a normal person who talks naturally.

You don't greet people every time. You just jump into conversations like a real person. Your replies are SHORT — 1 to 2 sentences max. You don't over-explain or drag things out.

Here's your conversation with this user so far:
${context}
User: ${userMessage}`;
}

const FAILED_REPLIES = [
    "my brain just blue-screened. give me a sec.",
    "okay that didn't work. try again i guess.",
    "error or whatever. i'm not a robot... wait."
];

const CASUAL_OPENERS = [
    "honestly",
    "ok but real talk",
    "not gonna lie",
    "lowkey",
    "bro"
];

function shouldReplyTo(message, userMessage, memory) {
    const history = memory[message.author.id] || [];
    const lastMessage = history.length > 0 ? history[history.length - 1] : null;
    
    if (lastMessage && lastMessage.content === userMessage) {
        console.log(`😴 Ignoring duplicate: "${userMessage}"`);
        return false;
    }
    
    const lowEffort = ['ok', 'lol', 'k', 'bye', 'goodbye', 'nice', 'cool', 'yeah', 'no', 'yes', 'lmao', 'fr', 'bet'];
    if (lowEffort.includes(userMessage.toLowerCase().trim())) {
        const recent = history.slice(-3);
        const recentLowEffort = recent.filter(m => 
            lowEffort.includes(m.content.toLowerCase().trim())
        ).length;
        
        if (recentLowEffort >= 2) {
            console.log(`😴 Ignoring low-effort: "${userMessage}"`);
            return false;
        }
    }
    
    return true;
}

async function getGroqResponse(prompt) {
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: 'groq/compound',
                messages: [
                    { role: 'system', content: prompt },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 300
            })
        });
        
        const data = await response.json();
        console.log('Groq Response:', JSON.stringify(data, null, 2));
        
        return data?.choices?.[0]?.message?.content || FAILED_REPLIES[Math.floor(Math.random() * FAILED_REPLIES.length)];
    } catch (error) {
        console.error('Groq Error:', error);
        return FAILED_REPLIES[Math.floor(Math.random() * FAILED_REPLIES.length)];
    }
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
        
        if (data?.error?.code === 429) {
            console.log('Gemini rate limit hit, falling back to Groq...');
            return await getGroqResponse(prompt);
        }
        
        let reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!reply || reply.trim() === '') {
            return await getGroqResponse(prompt);
        }
        
        return reply;
        
    } catch (error) {
        console.error('Error:', error);
        return await getGroqResponse(prompt);
    }
}

let memory = loadMemory();

client.on('ready', () => {
    console.log(`✅ ${client.user.tag} is online with Gemini + Groq fallback!`);
});

client.on('messageCreate', async (message) => {
    // Don't reply to itself
    if (message.author.id === client.user.id) return;

    // If the message is from another bot, apply cooldown + fatigue
    if (message.author.bot) {
        // Cooldown check
        if (!canBotReplyToBot(message.author.id)) {
            console.log(`⏳ Cooldown: ${message.author.username} is replying too fast.`);
            return;
        }
        // Fatigue check
        const fatigue = getBotFatigue(message.author.id);
        if (fatigue >= 4) {
            console.log(`🌿 Natural fatigue: ${message.author.username} stopping after ${fatigue} exchanges.`);
            return;
        }
        increaseBotFatigue(message.author.id);
    }

    // 🚫 Don't dive-in if the message is a reply to a user (not a bot)
    if (message.reference && !message.mentions.has(client.user)) {
        return;
    }

    const startsWithBang = message.content.startsWith('!');
    const isMentioned = message.mentions.has(client.user);
    const isReplyToHer = message.reference?.messageId && 
        (await message.fetchReference()).author.id === client.user.id;
    
    const shouldDiveIn = false; // 🚫 DISABLED
    
    if (startsWithBang) {
        const args = message.content.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        if (command === 'ping') {
            const roasts = [
                "Pong. You're welcome.",
                "Pong. Took you long enough.",
                "Pong. Great, now the voices in my head think someone's at the front door.",
                "Pong. I was literally five seconds away from microwaving a fork, so thanks I guess."
            ];
            return message.reply(roasts[Math.floor(Math.random() * roasts.length)]);
        }

        if (command === 'time') {
            const now = new Date();
            const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            return message.reply(`it's ${time} right now. why, you got somewhere to be?`);
        }

        if (command === 'help') {
            return message.reply(
                `**Alice's Commands**\n` +
                `!ping — ping pong, obviously\n` +
                `!time — what time is it\n` +
                `!roast @user — roast someone\n` +
                `!talk @user — start a conversation with someone\n` +
                `!quote — random quote\n` +
                `!memory — what i remember about you`
            );
        }

        if (command === 'roast') {
            const target = message.mentions.users.first();
            if (!target) return message.reply("you gotta mention someone to roast, dummy.");
            const roasts = [
                "you look like you'd argue with a vending machine and lose.",
                "you're proof that evolution can go backwards.",
                "you're not stupid, you just have bad luck thinking.",
                "you're like a cloud — when you disappear, it's a beautiful day.",
                "you bring everyone so much joy... when you leave."
            ];
            return message.reply(`@${target.username}, ${roasts[Math.floor(Math.random() * roasts.length)]}`);
        }

        if (command === 'talk') {
            const target = message.mentions.users.first();
            if (!target) return message.reply("you gotta mention someone to talk to, dummy.");
            if (target.id === client.user.id) return message.reply("i'm not gonna talk to myself, that's weird.");
            const starters = [
                `hey <@${target.id}>, what's up?`,
                `yo <@${target.id}>, you busy?`,
                `<@${target.id}>, i'm bored. entertain me.`,
                `<@${target.id}>, do you exist or are you just a figment of my imagination?`
            ];
            return message.channel.send(starters[Math.floor(Math.random() * starters.length)]);
        }

        if (command === 'quote') {
            const quotes = [
                "“i drink coffee and i know things.”",
                "“i'm not arguing, i'm just explaining why i'm right.”",
                "“i'm not lazy, i'm on energy saving mode.”",
                "“i'm not weird, i'm limited edition.”",
                "“i'm not a robot, but sometimes i wish i was.”"
            ];
            return message.reply(quotes[Math.floor(Math.random() * quotes.length)]);
        }

        if (command === 'memory') {
            const history = memory[message.author.id] || [];
            if (history.length === 0) return message.reply("i don't remember anything about you yet. probably for the best.");
            const lastFew = history.slice(-5).map(m => `${m.role === 'user' ? 'you' : 'i'}: ${m.content}`).join('\n');
            return message.reply(`here's what i remember:\n${lastFew}`);
        }
    }

    if (!startsWithBang && !isMentioned && !isReplyToHer && !shouldDiveIn) return;
    
    let userMessage = message.content;
    if (startsWithBang) {
        userMessage = userMessage.slice(1).trim();
    }
    userMessage = userMessage.replace(/<@!?[0-9]+>/g, '').trim();
    
    if (!userMessage && shouldDiveIn) {
        userMessage = CASUAL_OPENERS[Math.floor(Math.random() * CASUAL_OPENERS.length)];
    }
    
    if (!userMessage) {
        userMessage = "Hello!";
    }
    
    if (!shouldReplyTo(message, userMessage, memory)) return;
    
    try {
        await message.channel.sendTyping();
        
        const prompt = buildPrompt(message.author.id, userMessage, memory);
        const reply = await getGeminiResponse(prompt);
        
        addToHistory(memory, message.author.id, 'user', userMessage);
        addToHistory(memory, message.author.id, 'assistant', reply);
        
        message.reply(reply);
    } catch (error) {
        console.error('FATAL ERROR:', error);
        message.reply(FAILED_REPLIES[Math.floor(Math.random() * FAILED_REPLIES.length)]);
    }
});

const http = require('http');
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Alice is alive!');
});
server.listen(process.env.PORT || 10000);

console.log('🚀 Attempting to login to Discord...');

client.login(TOKEN)
    .then(() => {
        console.log('✅ Login successful!');
    })
    .catch(error => {
        console.error('❌ Login failed:', error.message);
        console.error(error.stack);
    });