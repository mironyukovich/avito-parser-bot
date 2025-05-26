const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

module.exports = {
  parse: async (rawQuery) => {
    // 1. Очищаем запрос (удаляем лишний текст)
    const query = rawQuery.replace(/.*Выберите платформы для поиска: "/, '').replace(/"$/, '').trim();

    let browser;
    try {
      // 2. Подключаемся к Browserless
      browser = await puppeteer.connect({
        browserWSEndpoint: `wss://chrome.browserless.io?token=${process.env.BROWSERLESS_TOKEN}`,
        headless: true,
        defaultViewport: { width: 1280, height: 720 }
      });

      const page = await browser.newPage();

      // 3. Настройка User-Agent
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // 4. Переход на страницу
      console.log(`Ищем на BUKOM: "${query}"`);
      await page.goto(`https://www.bukom.ru/search/?q=${encodeURIComponent(query)}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      // 5. Ждём загрузки (новые селекторы)
      await page.waitForSelector('.product-card', { timeout: 15000 });

      // 6. Парсим результаты
      const results = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.product-card')).map(item => ({
          source: 'BUKOM',
          title: item.querySelector('.product-title')?.textContent.trim() || 'Без названия',
          price: item.querySelector('.product-price')?.textContent.trim() || 'Цена не указана',
          url: 'https://www.bukom.ru' + (item.querySelector('a')?.getAttribute('href') || ''),
          inStock: true
        }));
      });

      return results.filter(item => item.title.includes(query)).slice(0, 5);

    } catch (error) {
      console.error('BUKOM Error:', error.message);
      return [];
    } finally {
      if (browser) await browser.close();
    }
  }
};
