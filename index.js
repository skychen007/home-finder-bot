import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import { createClient } from '@supabase/supabase-js';

const token = process.env.TELEGRAM_TOKEN;
const app = express();

app.use(express.json());

const bot = new TelegramBot(token);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ===== 核心逻辑 =====
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;

  const cleanText = text.trim();

  // 查询
  if (cleanText.includes("在哪") || cleanText.includes("在哪里")) {

    const item = cleanText
      .replace(/在哪里|在哪/g, "")
      .replace(/[？?]/g, "")
      .trim();

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

  // 存储（自动识别）
  const match = cleanText.match(/^(.+?)(在|放在|放到|放在了)(.+)$/);

  if (match) {
    const item = match[1].trim();
    const location = match[3].trim();

    const { error } = await supabase
      .from('items')
      .insert([{ item, location }]);

    if (error) {
      bot.sendMessage(chatId, "保存失败 ❌");
    } else {
      bot.sendMessage(chatId, `已记录：${item} 在 ${location} ✅`);
    }

    return;
  }

  bot.sendMessage(chatId, "可以说：钥匙在抽屉 / 钥匙放在鞋架 / 钥匙在哪里");
});

// ===== webhook 路由 =====
app.post(`/webhook/${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Railway 会自动给 PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
