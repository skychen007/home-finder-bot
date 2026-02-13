import TelegramBot from 'node-telegram-bot-api';
import { createClient } from '@supabase/supabase-js';

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;

  // ✅ 先判断查询逻辑
  if (text.includes("在哪")) {
    const item = text.replace("在哪", "").trim();

    const { data, error } = await supabase
      .from('items')
      .select('*')
      .eq('item', item)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      bot.sendMessage(chatId, "查询失败 ❌");
      return;
    }

    if (data && data.length > 0) {
      bot.sendMessage(chatId, `${item} 在 ${data[0].location} 📍`);
    } else {
      bot.sendMessage(chatId, "没有找到记录 🤔");
    }
  }

  // ✅ 再判断存储逻辑
  else if (text.includes("在")) {
    const parts = text.split("在");
    const item = parts[0].trim();
    const location = parts[1].trim();

    const { error } = await supabase
      .from('items')
      .insert([{ item, location }]);

    if (error) {
      bot.sendMessage(chatId, "保存失败 ❌");
    } else {
      bot.sendMessage(chatId, `已记录：${item} 在 ${location} ✅`);
    }
  }

  else {
    bot.sendMessage(chatId, "请用：物品 在 位置 或 物品在哪");
  }
});
