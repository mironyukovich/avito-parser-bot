const axios = require('axios');
const cheerio = require('cheerio');
const { randomDelay } = require('./utils'); // Задержка между запросами

const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 10; SM-A505FN) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
];

async function parseWildberries(query) {
    try {
        await randomDelay(1000, 3000); // Случайная задержка 1-3 сек

        const url = `https://www.wildberries.ru/catalog/0/search.aspx?sort=popular&search=${encodeURIComponent(query)}`;

        const response = await axios.get(url, {
            headers: {
                'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'ru-RU,ru;q=0.9',
                'Referer': 'https://www.wildberries.ru/',
            },
            timeout: 10000
        });

        if (response.status === 200) {
            const $ = cheerio.load(response.data);
            const results = [];

            $('.product-card__main').each((i, element) => {
                const title = $(element).find('.product-card__name').text().trim();
                const price = $(element).find('.price__lower-price').text().trim();
                const link = 'https://www.wildberries.ru' + $(element).find('a').attr('href');

                if (title && price) {
                    results.push({
                        title,
                        price,
                        link,
                        source: 'Wildberries'
                    });
                }
            });

            return results.slice(0, 5); // Возвращаем первые 5 результатов
        }
        return [];
    } catch (error) {
        console.error('Wildberries parser error:', error.message);
        return [];
    }
}

module.exports = parseWildberries;
