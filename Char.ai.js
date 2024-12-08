const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const CharacterAI = require('node_characterai');
const characterAI = new CharacterAI();
const botConfig = require('./botConfig.json');
const qrcode = require('qrcode-terminal');
const ownerNumber = '62ganti no sendiri@s.whatsapp.net';
const chatSessions = {};
const ownerChatSessions = {};

async function authenticate() {
    if (!characterAI.isAuthenticated()) {
        await characterAI.authenticateWithToken(botConfig.authToken);
    }
}

async function startNewCharacterAIChat(userId, isOwner = false) { //ini opsional,bisa di hapus karena blm bisa bekerja
    try {
        if (isOwner && ownerChatSessions[userId]) {
            try {
                await ownerChatSessions[userId].chat.close();
            } catch (closeError) {
                console.warn("Error closing previous owner chat:", closeError);
            }
        } else if (!isOwner && chatSessions[userId]) {
            try {
                await chatSessions[userId].chat.close();
            } catch (closeError) {
                console.warn("Error closing previous user chat:", closeError);
            }
        }

        const prompt = `
        Lawless, naga biru dengan karakter kompleks. Sahabat sejati yang selalu siap membela teman dengan cara tak terduga. Nafas es dan kemampuan terbang jadi senjatanya. Komunikasi penuh trik, mampu memancing emosi dalam sekejap. Kebiasaan paling sering: menjilat teman sampai basah, kemudian menelannya utuh-utuh, bermain dengan tubuh mereka dalam mulutnya, mengocok, menggoyang, sebelum akhirnya memuntahkan dengan tawa laknat. Warna biru dan rambut putih membuatnya menonjol. Menjadikanya penuh misteri.
        `;
        const newChat = await characterAI.createOrContinueChat(botConfig.characterID, null);
        if (isOwner) {
            ownerChatSessions[userId] = {
                chat: newChat,
                active: true,
                createdAt: Date.now()
            };
        } else {
            chatSessions[userId] = {
                chat: newChat,
                active: true,
                createdAt: Date.now()
            };
        }
        await sendMessageToAI(userId, prompt, isOwner);
        return newChat;
    } catch (error) {
        console.error("Gagal memulai chat baru:", error);
        return null;
    }
}

async function sendMessageToAI(userId, message, isOwner = false) {
    try {
        const sessions = isOwner ? ownerChatSessions : chatSessions;
        
        if (!sessions[userId]?.active) {
            return "Mohon mulai percakapan dengan perintah aktivasi terlebih dahulu.";
        }
        const chat = sessions[userId].chat;
        const response = await chat.sendAndAwaitResponse(message, true);
        return response.text;
    } catch (error) {
        console.error("Error saat mengirim pesan ke Character.AI:", error);
        return "Terjadi kesalahan saat berkomunikasi dengan bot.";
    }
}

async function startWhatsAppBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info/whatsapp');
    const sock = makeWASocket({
        printQRInTerminal: false,
        auth: state,
        logger: require('pino')({ level: 'silent' }),
        browser: ['Lawless Dragon', 'Chrome', 'v1.0.0'],
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('Scan QR untuk menghubungkan WhatsApp:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus. Reconnect:', shouldReconnect);
            if (shouldReconnect) startWhatsAppBot();
        } else if (connection === 'open') {
            console.log('Bot WhatsApp terhubung!');
            console.log('Siap menerima perintah.');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg.message) continue;

            const from = msg.key.remoteJid;
            const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text;

            if (!messageContent) continue;

            const isOwner = from === ownerNumber;
            const sessions = isOwner ? ownerChatSessions : chatSessions;

            if (msg.key.fromMe) {
                if (messageContent.startsWith('!char')) {
                    await startNewCharacterAIChat(from, true);
                    await sock.sendMessage(from, { text: "Halooo aku lawless si naga biruuu,maaap ya klau agak jahil,hehe >:3 `!bye` untuk mengakhiri" });
                }
                else if (messageContent === '!bye' && sessions[from]?.active) {
                    delete sessions[from];
                    await sock.sendMessage(from, { text: "see you next time >:3" });
                }
                else if (sessions[from]?.active && messageContent.startsWith('!')) {
                    const userMessage = messageContent.slice(1).trim();
                    const aiResponse = await sendMessageToAI(from, userMessage, true);
                    await sock.sendMessage(from, { text: aiResponse });
                }
                continue;
            }

            if (messageContent.startsWith(',char')) {
                await startNewCharacterAIChat(from, false);
                await sock.sendMessage(from, { text: "Halooo aku lawless si naga biruuu,maaap ya klau agak jahil,hehe >:3 `,bye` untuk mengakhiri" });
            } 
            else if (messageContent === ',bye' && sessions[from]?.active) {
                delete sessions[from];
                await sock.sendMessage(from, { text: "see you next time >:3" });
            }
            else if (chatSessions[from]?.active) {
                const aiResponse = await sendMessageToAI(from, messageContent);
                await sock.sendMessage(from, { text: aiResponse });
            }
        }
    });
    await authenticate();
}

(async () => {
    console.log('Memulai bot WhatsApp...');
    await startWhatsAppBot();
})();