import TelegramBot from 'node-telegram-bot-api';
import { createClient } from '@supabase/supabase-js';

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// 清理文本
function cleanText(text) {
  return text
    .replace(/[？?]/g, "")
    .replace(/好像|可能|刚刚|觉得|大概|应该/g, "")
    .trim();
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (!msg.text) return;

  let text = cleanText(msg.text);

  // ================= 查询 =================
  if (text.includes("在哪")) {

    const item = text
      .replace("在哪里", "")
      .replace("在哪", "")
      .trim();

    const { data } = await supabase
      .from('items')
      .select('*')
      .ilike('item', `%${item}%`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      bot.sendMessage(chatId,
        `📍 ${data[0].item}\n位置：${data[0].location}\n分类：${data[0].category || "未分类"}`
      );
    } else {
      bot.sendMessage(chatId, "没有找到记录 🤔");
    }

    return;
  }

  // ================= 列表 =================
  if (text.includes("有什么") || text.includes("列出")) {

    const { data } = await supabase
      .from('items')
      .select('*')
      .order('created_at', { ascending: false });

    if (!data || data.length === 0) {
      bot.sendMessage(chatId, "目前没有记录 🤔");
      return;
    }

    const list = data.map(item =>
      `• ${item.item} 在 ${item.location}`
    ).join("\n");

    bot.sendMessage(chatId, `📦 当前物品清单：\n${list}`);
    return;
  }

  // ================= 删除 =================
  if (text.startsWith("删除")) {

    const item = text.replace("删除", "").trim();

    await supabase
      .from('items')
      .delete()
      .ilike('item', `%${item}%`);

    bot.sendMessage(chatId, `${item} 已删除 🗑`);
    return;
  }

  // ================= 分类 =================
  if (text.startsWith("分类")) {

    // 格式：分类 钥匙 日用品
    const parts = text.split(" ");

    if (parts.length >= 3) {
      const item = parts[1];
      const category = parts[2];

      await supabase
        .from('items')
        .update({ category })
        .ilike('item', `%${item}%`);

      bot.sendMessage(chatId, `${item} 已归类为 ${category} 🏷`);
    }

    return;
  }

  // ================= 存储或更新 =================
  if (text.includes("在")) {

    const parts = text.split("在");

    if (parts.length >= 2) {

      let item = parts[0]
        .replace("我把", "")
        .replace("把", "")
        .replace("我", "")
        .replace("放", "")
        .trim();

      const location = parts.slice(1).join("在").trim();

      if (!item || !location) {
        bot.sendMessage(chatId, "格式不完整 🤔");
        return;
      }

      // 删除旧记录
      await supabase
        .from('items')
        .delete()
        .ilike('item', `%${item}%`);

      // 插入新记录
      const { error } = await supabase
        .from('items')
        .insert([{
          item,
          location,
          category: null
        }]);

      if (error) {
        bot.sendMessage(chatId, "保存失败 ❌");
      } else {
        bot.sendMessage(chatId, `已记录：${item} 在 ${location} ✅`);
      }

      return;
    }
  }

  // ================= 默认提示 =================
  bot.sendMessage(chatId, `
你可以这样说：
🔹 钥匙在抽屉
🔹 车钥匙在哪
🔹 删除 钥匙
🔹 分类 钥匙 日用品
🔹 列出所有物品
`);
});
