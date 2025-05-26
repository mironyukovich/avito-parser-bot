const axios = require('axios');
const qs = require('querystring');

class AvitoAuth {
  constructor(clientId, clientSecret, redirectUri) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.tokenCache = {
      accessToken: null,
      refreshToken: null,
      expiresAt: 0
    };
  }

  getAuthUrl(scopes = ['items:info']) {
    const params = {
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: scopes.join(','),
      state: this.generateState()
    };
    return `https://avito.ru/oauth?${qs.stringify(params)}`;
  }

  generateState() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  async getToken(code) {
    try {
      const response = await axios.post('https://api.avito.ru/token', qs.stringify({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: code,
        redirect_uri: this.redirectUri
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      this.tokenCache = {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresAt: Date.now() + (response.data.expires_in * 1000)
      };

      return this.tokenCache;
    } catch (error) {
      console.error('Avito token error:', error.response?.data || error.message);
      throw error;
    }
  }

  async refreshToken() {
    if (!this.tokenCache.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await axios.post('https://api.avito.ru/token', qs.stringify({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.tokenCache.refreshToken
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      this.tokenCache = {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresAt: Date.now() + (response.data.expires_in * 1000)
      };

      return this.tokenCache;
    } catch (error) {
      console.error('Avito refresh token error:', error.response?.data || error.message);
      throw error;
    }
  }

  async getValidToken() {
    if (!this.tokenCache.accessToken || Date.now() >= this.tokenCache.expiresAt - 60000) {
      if (this.tokenCache.refreshToken) {
        await this.refreshToken();
      } else {
        throw new Error('No valid token available. Please authenticate first.');
      }
    }
    return this.tokenCache.accessToken;
  }

  async hasValidToken() {
    try {
      await this.getValidToken();
      return true;
    } catch (e) {
      return false;
    }
  }
}

module.exports = AvitoAuth;
