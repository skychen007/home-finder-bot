import TelegramBot from 'node-telegram-bot-api';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const userStates = {};

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || msg.from.first_name;

  // ========================
  // 📷 处理照片
  // ========================
  if (msg.photo) {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    const fileLink = await bot.getFileLink(fileId);

    await bot.sendMessage(chatId, "📸 正在识别物品，请稍等...");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "请告诉我这张图片里最主要的物品名称，只回答物品名。" },
            { type: "image_url", image_url: { url: fileLink } }
          ]
        }
      ]
    });

    const detectedItem = response.choices[0].message.content.trim();

    userStates[userId] = { pendingItem: detectedItem };

    await bot.sendMessage(chatId, `我识别到：${detectedItem} 📦\n它放在哪里？`);

    return;
  }

  const text = msg.text;
  if (!text) return;

  // ========================
  // 等待用户输入位置
  // ========================
  if (userStates[userId]?.pendingItem) {
    const item = userStates[userId].pendingItem;
    const location = text.trim();

    await supabase.from('items').insert([
      { item, location, user_id: userId, username }
    ]);

    delete userStates[userId];

    await bot.sendMessage(chatId, `已记录：${item} 在 ${location} ✅`);
    return;
  }

  // ========================
  // 查询逻辑
  // ========================
  if (text.includes("在哪")) {
    const item = text.replace("在哪", "").replace("在哪里", "").trim();

    const { data } = await supabase
      .from('items')
      .select('*')
      .ilike('item', `%${item}%`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      bot.sendMessage(chatId, `${item} 在 ${data[0].location} 📍`);
    } else {
      bot.sendMessage(chatId, "没有找到记录 🤔");
    }
    return;
  }

  // ========================
  // 文字存储（更灵活）
  // ========================
  const match = text.match(/(.+?)在(.+)/);

  if (match) {
    const item = match[1].trim();
    const location = match[2].trim();

    await supabase.from('items').insert([
      { item, location, user_id: userId, username }
    ]);

    bot.sendMessage(chatId, `已记录：${item} 在 ${location} ✅`);
    return;
  }

  bot.sendMessage(chatId, "可以说：钥匙在抽屉 / 钥匙在哪 / 或直接拍照 📷");
});
