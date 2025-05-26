// Подавляем все предупреждения (но оставляем ошибки)
process.removeAllListeners('warning');

require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');

// Автоматический импорт всех парсеров из папки
const fs = require('fs');
const path = require('path');

const parsers = {};
const parsersDir = path.join(__dirname, 'parsers');

fs.readdirSync(parsersDir).forEach(file => {
  if (file.endsWith('Parser.js') || file.endsWith('parser.js')) {
    const name = file.replace(/Parser.js$/i, '').toLowerCase();
    parsers[name] = require(path.join(parsersDir, file));
  }
});

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const app = express();

// Улучшенная задержка с логгированием
const delay = (ms, reason = '') => {
  console.log(`[DELAY] ${ms}ms ${reason}`);
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Функция для извлечения поискового запроса
const extractSearchQuery = (text) => {
  const match = text.match(/\/search\s+(.+)|Выберите платформы для поиска:\s*"(.+)"/);
  return match ? (match[1] || match[2]).trim() : '';
};

// Генерация кнопок динамически из доступных парсеров
function getPlatformButtons() {
  const buttons = [];
  const parserNames = Object.keys(parsers);

  // Разбиваем на ряды по 2 кнопки
  for (let i = 0; i < parserNames.length; i += 2) {
    const row = parserNames.slice(i, i + 2).map(name => 
      Markup.button.callback(
        name.charAt(0).toUpperCase() + name.slice(1), // Первая буква заглавная
        name
      )
    );
    buttons.push(row);
  }

  buttons.push([Markup.button.callback('Все платформы', 'all')]);

  return Markup.inlineKeyboard(buttons);
}

// Добавляем обработку OAuth callback
app.get('/auth', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).send('Authorization code missing');
    }

    await parsers.avito.handleCallback(code);
    res.send('Авторизация Avito прошла успешно! Теперь вы можете использовать парсер.');
  } catch (error) {
    console.error('Auth callback error:', error);
    res.status(500).send('Ошибка авторизации');
  }
});

// Специальный обработчик для кнопки Avito с проверкой авторизации
bot.action('avito', async (ctx) => {
  const query = extractSearchQuery(ctx.callbackQuery.message.text);

  if (!(await parsers.avito.hasValidToken())) {
    const authUrl = parsers.avito.getAuthUrl();
    return ctx.replyWithMarkdown(
      `🔐 Для поиска на Avito требуется авторизация:\n\n` +
      `[Нажмите здесь чтобы авторизоваться](${authUrl})\n\n` +
      `После авторизации нажмите кнопку "Avito" снова.`,
      Markup.inlineKeyboard([
        Markup.button.callback('Повторить поиск', 'avito')
      ])
    );
  }

  await ctx.answerCbQuery(`Ищем на Avito...`);
  await performSearch(ctx, query, 'avito');
});

// Команда для ручной авторизации Avito
bot.command('auth_avito', (ctx) => {
  const authUrl = parsers.avito.getAuthUrl();
  ctx.replyWithMarkdown(
    `🔑 Для работы с Avito API необходимо авторизоваться:\n\n` +
    `[Нажмите здесь для авторизации](${authUrl})\n\n` +
    `После авторизации вы можете использовать поиск на Avito.`
  );
});

// Команда для проверки статуса Avito
bot.command('avito_status', (ctx) => {
  const config = parsers.avito.checkConfig();
  ctx.replyWithMarkdown(
    `⚙️ Конфигурация Avito API:\n` +
    `- Client ID: ${config.clientId ? '✅' : '❌'}\n` +
    `- Client Secret: ${config.clientSecret ? '✅' : '❌'}\n` +
    `- Redirect URI: ${config.redirectUri ? '✅' : '⚠️ (по умолчанию)'}\n` +
    `\nСостояние: ${config.allRequired ? 'Готов к работе' : 'Требуется настройка'}`
  );
});

// Автоматическая регистрация обработчиков для других платформ
Object.keys(parsers).forEach(platform => {
  if (platform !== 'avito') { // Для avito уже есть специальный обработчик
    bot.action(platform, async (ctx) => {
      const query = extractSearchQuery(ctx.callbackQuery.message.text);
      await ctx.answerCbQuery(`Ищем на ${platform}...`);
      await performSearch(ctx, query, platform);
    });
  }
});

bot.action('all', async (ctx) => {
  const query = extractSearchQuery(ctx.callbackQuery.message.text);
  await ctx.answerCbQuery('Ищем на всех платформах...');
  await performSearch(ctx, query);
});

// Команда поиска
bot.command('search', async (ctx) => {
  const query = extractSearchQuery(ctx.message.text);

  if (!query) {
    return ctx.replyWithMarkdown('ℹ️ Укажите запрос после команды `/search`\n*Пример:* `/search iPhone 13`');
  }

  await ctx.replyWithChatAction('typing');
  await delay(500); // Искусственная задержка для UX

  try {
    await ctx.replyWithMarkdown(
      `🔍 Выберите платформы для поиска: *"${query}"*`,
      getPlatformButtons()
    );
  } catch (error) {
    console.error('Search command error:', error);
    ctx.replyWithMarkdown('⚠️ Произошла ошибка. Попробуйте ещё раз.');
  }
});

// Улучшенная функция поиска
async function performSearch(ctx, query, platform = null) {
  try {
    await ctx.replyWithChatAction('typing');

    // Проверяем авторизацию только для Avito
    if (platform === 'avito' && !(await parsers.avito.hasValidToken())) {
      const authUrl = parsers.avito.getAuthUrl();
      return ctx.replyWithMarkdown(
        `🔐 Для поиска на Avito требуется авторизация:\n\n` +
        `[Нажмите здесь чтобы авторизоваться](${authUrl})\n\n` +
        `После авторизации повторите поиск.`
      );
    }

    const platformsToSearch = platform ? { [platform]: parsers[platform] } : parsers;
    const allResults = [];
    const startTime = Date.now();

    for (const [name, parser] of Object.entries(platformsToSearch)) {
      try {
        console.log(`[PARSER] Starting ${name} for "${query}"`);
        const results = await parser.parse(query);
        allResults.push(...results);
        console.log(`[PARSER] ${name} found ${results.length} items`);

        // Динамическая задержка в зависимости от количества результатов
        await delay(results.length > 0 ? 1000 : 500, `${name} delay`);
      } catch (e) {
        console.error(`[PARSER ERROR] ${name}:`, e.message);
      }
    }

    const duration = (Date.now() - startTime) / 1000;
    console.log(`[SEARCH] Completed in ${duration}s, found ${allResults.length} total`);

    if (allResults.length === 0) {
      return ctx.replyWithMarkdown(
        `🔎 По запросу *"${query}"* ничего не найдено\n\n` +
        `*Советы:*\n` +
        `- Упростите запрос\n` +
        `- Проверьте орфографию\n` +
        `- Попробуйте [вручную на Avito](${`https://www.avito.ru/all?q=${encodeURIComponent(query)}`})`
      );
    }

    // Группировка и отправка результатов
    const bySource = allResults.reduce((acc, item) => {
      acc[item.source] = acc[item.source] || [];
      acc[item.source].push(item);
      return acc;
    }, {});

    let totalSent = 0;
    for (const [source, items] of Object.entries(bySource)) {
      if (totalSent >= 15) break; // Лимит сообщений

      const limitedItems = items.slice(0, 5);
      totalSent += limitedItems.length;

      let message = `🏬 *${source}* (найдено: ${items.length})\n\n`;
      message += limitedItems.map(item => (
        `🔹 *${item.title}*\n` +
        `💰 ${item.price || 'Цена не указана'}\n` +
        (item.inStock !== undefined ? `📦 ${item.inStock ? '✅ В наличии' : '❌ Нет в наличии'}\n` : '') +
        `🔗 [Открыть](${item.url})\n`
      )).join('\n');

      await ctx.replyWithMarkdown(message, { 
        disable_web_page_preview: true,
        disable_notification: true
      });
      await delay(300);
    }

  } catch (error) {
    console.error('[SEARCH ERROR]', error);
    await ctx.replyWithMarkdown('⚠️ Произошла ошибка при поиске. Пожалуйста, попробуйте позже.');
  }
}

// Стартовая команда с кнопкой поиска
bot.start((ctx) => ctx.replyWithMarkdown(
  `🛍️ *Умный парсер товаров*\n\n` +
  `Я могу искать товары на ${Object.keys(parsers).length} площадках:\n` +
  `${Object.keys(parsers).map(p => `• ${p.charAt(0).toUpperCase() + p.slice(1)}`).join('\n')}\n\n` +
  `🔍 *Как искать:*\n` +
  `1. Нажмите кнопку ниже\n` +
  `2. Введите ваш запрос\n` +
  `3. Выберите площадки\n\n` +
  `*Пример:* "Ноутбук ASUS ROG"`,
  Markup.keyboard(['🔍 Начать поиск']).resize()
));

// Обработка текстового сообщения "🔍 Начать поиск"
bot.hears('🔍 Начать поиск', (ctx) => 
  ctx.replyWithMarkdown('Введите команду `/search [запрос]`\n*Пример:* `/search iPhone 13`'));

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  bot.launch()
    .then(() => console.log('🤖 Bot started successfully'))
    .catch(err => console.error('💥 Bot launch error:', err));
});

// Грациозное завершение
process.once('SIGINT', () => {
  console.log('🛑 Stopping bot...');
  bot.stop('SIGINT');
  process.exit();
});

process.once('SIGTERM', () => {
  console.log('🛑 Terminating bot...');
  bot.stop('SIGTERM');
  process.exit();
});
