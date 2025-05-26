const axios = require('axios');
const cheerio = require('cheerio');

module.exports = {
  parse: async (article) => {
    try {
      const { data } = await axios.get(`https://3delectronics.ru/search?search=${encodeURIComponent(article)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
      });

      const $ = cheerio.load(data);
      const results = [];

      $('.product-thumb').each((i, el) => {
        const title = $(el).find('.caption a').text().trim();
        const price = $(el).find('.price').text().trim();
        const inStock = $(el).find('.stock').text().includes('В наличии');
        const url = `https://3delectronics.ru${$(el).find('a').attr('href')}`;

        if (title && title.includes(article)) {
          results.push({
            source: '3D Electronics',
            title,
            price,
            inStock,
            url
          });
        }
      });

      return results.slice(0, 5);
    } catch (error) {
      console.error('3D Electronics parser error:', error);
      return [];
    }
  }
};
