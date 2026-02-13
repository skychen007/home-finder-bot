import TelegramBot from 'node-telegram-bot-api';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;

  // ======================
  // 📸 图片识别
  // ======================
  if (msg.photo) {
    const photo = msg.photo[msg.photo.length - 1];
    const file = await bot.getFile(photo.file_id);
    const imageUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file.file_path}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "这张图片里最主要的物品是什么？只回答物品名称。" },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }
      ]
    });

    const itemName = response.choices[0].message.content.trim();

    await supabase
      .from('items')
      .insert([{ item: itemName, location: "未指定位置", user_id: userId }]);

    bot.sendMessage(chatId, `📸 识别到：${itemName}，已记录。`);
    return;
  }

  if (!text) return;

  // ======================
  // 🧠 AI 理解自然语言
  // ======================

  const ai = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
你是一个家庭物品管理助手。
如果用户是在询问物品位置，请返回 JSON:
{"type":"query","item":"物品名称"}

如果用户是在说明物品位置，请返回:
{"type":"save","item":"物品名称","location":"位置"}

不要返回解释，只返回 JSON。
`
      },
      { role: "user", content: text }
    ]
  });

  let parsed;
  try {
    parsed = JSON.parse(ai.choices[0].message.content);
  } catch {
    bot.sendMessage(chatId, "我没理解 🤔 可以换种说法试试。");
    return;
  }

  // ======================
  // 查询
  // ======================
  if (parsed.type === "query") {
    const { data } = await supabase
      .from('items')
      .select('*')
      .eq('user_id', userId)
      .ilike('item', `%${parsed.item}%`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      bot.sendMessage(chatId, `📍 ${parsed.item} 在 ${data[0].location}`);
    } else {
      bot.sendMessage(chatId, "没有找到记录 🤔");
    }
  }

  // ======================
  // 保存
  // ======================
  if (parsed.type === "save") {
    await supabase
      .from('items')
      .insert([{ item: parsed.item, location: parsed.location, user_id: userId }]);

    bot.sendMessage(chatId, `✅ 已记录：${parsed.item} 在 ${parsed.location}`);
  }
});
