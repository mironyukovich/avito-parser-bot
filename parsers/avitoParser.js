const axios = require('axios');
const AvitoAuth = require('./avitoAuth');

// Функция для безопасного получения переменных (из Secrets или .env)
function getConfigValue(key) {
  // В Replit Secrets доступны через process.env
  return process.env[key];
}

// Инициализация авторизации с проверкой наличия обязательных переменных
const requiredVars = ['AVITO_CLIENT_ID', 'AVITO_CLIENT_SECRET'];
const missingVars = requiredVars.filter(varName => !getConfigValue(varName));

if (missingVars.length > 0) {
  console.error('❌ Отсутствуют обязательные переменные для Avito API:', missingVars.join(', '));
  console.info('ℹ️ Убедитесь, что добавили их в Secrets:');
  console.info('1. Откройте вкладку "Secrets" в Replit');
  console.info('2. Добавьте ключи AVITO_CLIENT_ID и AVITO_CLIENT_SECRET');
  console.info('3. Перезапустите приложение');
  throw new Error('Не настроены ключи Avito API');
}

const auth = new AvitoAuth(
  getConfigValue('AVITO_CLIENT_ID'),
  getConfigValue('AVITO_CLIENT_SECRET'),
  getConfigValue('AVITO_REDIRECT_URI') || 'https://avito-parser-bot.mironyukovich.repl.co/auth'
);

module.exports = {
  parse: async (query) => {
    try {
      const token = await auth.getValidToken();

      const searchResponse = await axios.get('https://api.avito.ru/core/v1/items', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params: {
          q: query,
          limit: 5,
          region_id: 637640,
          sort: 'date'
        },
        timeout: 10000
      });

      return searchResponse.data.items.map(item => ({
        source: 'Avito (API)',
        title: item.title,
        price: `${item.price} ₽` || 'Цена не указана',
        url: `https://www.avito.ru${item.path}`,
        inStock: item.status === 'active',
        location: item.location?.name || ''
      }));

    } catch (error) {
      console.error('Avito API error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });

      // Дополнительная диагностика для 403 ошибки
      if (error.response?.status === 403) {
        console.error('⚠️ Возможные причины 403 ошибки:');
        console.error('- Неправильные Client ID/Secret');
        console.error('- Недостаточно прав у приложения');
        console.error('- Токен устарел (должен автоматически обновляться)');
        console.error('- Не подтверждено приложение в кабинете Avito');
      }

      return [];
    }
  },

  getAuthUrl: () => auth.getAuthUrl(),
  handleCallback: async (code) => await auth.getToken(code),
  hasValidToken: async () => await auth.hasValidToken(),

  // Новая функция для проверки конфигурации
  checkConfig: () => {
    return {
      clientId: !!getConfigValue('AVITO_CLIENT_ID'),
      clientSecret: !!getConfigValue('AVITO_CLIENT_SECRET'),
      redirectUri: !!getConfigValue('AVITO_REDIRECT_URI'),
      allRequired: !missingVars.length
    };
  }
};
