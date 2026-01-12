/**
 * API Client - Shared HTTP request logic
 * Provides common functionality for making requests to Claude API
 */

const https = require('https');
const { URL } = require('url');
const { API_DEFAULTS, TIMEOUTS } = require('../utils/constants');

class APIClient {
  /**
   * Make an HTTP request to the API
   * @param {Object} apiConfig - API configuration
   * @param {string} endpoint - API endpoint (e.g., 'v1/messages', 'v1/models')
   * @param {Object} options - Request options
   * @param {string} options.method - HTTP method (default: 'GET')
   * @param {Object|null} options.body - Request body for POST requests
   * @param {number} options.globalTimeout - Global timeout in ms
   * @param {number} options.requestTimeout - Request timeout in ms
   * @returns {Promise<Object>} - Response object {success, data, message}
   */
  static async makeRequest(apiConfig, endpoint, options = {}) {
    const {
      method = 'GET',
      body = null,
      globalTimeout = TIMEOUTS.API_TEST_GLOBAL,
      requestTimeout = TIMEOUTS.API_TEST_REQUEST
    } = options;

    return new Promise((resolve) => {
      let isResolved = false;
      let globalTimer = null;
      let request = null;

      // Safe resolve function to prevent multiple resolves
      const safeResolve = (result) => {
        if (isResolved) return;
        isResolved = true;

        if (globalTimer) {
          clearTimeout(globalTimer);
          globalTimer = null;
        }

        if (request) {
          try {
            request.destroy();
          } catch (e) {
            // Ignore destroy errors
          }
        }

        resolve(result);
      };

      // Global timeout protection
      globalTimer = setTimeout(() => {
        console.error('[API Client] Global timeout');
        safeResolve({
          success: false,
          message: `连接超时（${globalTimeout / 1000}秒无响应）`
        });
      }, globalTimeout);

      try {
        // 1. Construct full URL
        const fullUrl = this._buildUrl(apiConfig.baseUrl || API_DEFAULTS.BASE_URL, endpoint);
        console.log('[API Client] Request URL:', fullUrl);

        const url = new URL(fullUrl);

        // 2. Build authentication header
        const authHeader = this._buildAuthHeader(apiConfig);

        // 3. Build request body if needed
        const postData = body ? JSON.stringify(body) : null;

        // 4. Build request options
        const requestOptions = {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          method,
          headers: {
            ...authHeader,
            'anthropic-version': API_DEFAULTS.ANTHROPIC_VERSION
          },
          timeout: requestTimeout
        };

        if (postData) {
          requestOptions.headers['Content-Type'] = 'application/json';
          requestOptions.headers['Content-Length'] = Buffer.byteLength(postData);
        }

        // 5. Configure proxy if needed
        if (apiConfig.useProxy && apiConfig.httpsProxy) {
          try {
            console.log('[API Client] Using proxy:', apiConfig.httpsProxy);
            const HttpsProxyAgent = require('https-proxy-agent');
            requestOptions.agent = new HttpsProxyAgent(apiConfig.httpsProxy);
          } catch (proxyError) {
            console.error('[API Client] Proxy configuration error:', proxyError);
            safeResolve({
              success: false,
              message: `代理配置错误: ${proxyError.message}`
            });
            return;
          }
        }

        // 6. Create and send request
        console.log('[API Client] Creating HTTPS request...');
        request = https.request(requestOptions, (res) => {
          console.log('[API Client] Received response, status code:', res.statusCode);

          let responseData = '';

          res.on('data', (chunk) => {
            responseData += chunk;
          });

          res.on('end', () => {
            console.log('[API Client] Response received completely');

            if (res.statusCode === 200) {
              try {
                const data = JSON.parse(responseData);
                safeResolve({
                  success: true,
                  data,
                  message: 'Request successful'
                });
              } catch (parseError) {
                console.error('[API Client] JSON parse error:', parseError);
                safeResolve({
                  success: false,
                  message: `解析响应失败: ${parseError.message}`
                });
              }
            } else {
              console.error('[API Client] HTTP error:', res.statusCode);
              console.error('[API Client] Response content:', responseData);
              safeResolve({
                success: false,
                message: `请求失败 (${res.statusCode})\n响应: ${responseData}`
              });
            }
          });
        });

        // 7. Error handling
        request.on('error', (error) => {
          console.error('[API Client] Request error:', error.message);
          safeResolve({
            success: false,
            message: `连接错误: ${error.message}`
          });
        });

        request.on('timeout', () => {
          console.error('[API Client] Request timeout');
          safeResolve({
            success: false,
            message: `连接超时（${requestTimeout / 1000}秒）`
          });
        });

        // 8. Send request
        if (postData) {
          console.log('[API Client] Sending request data...');
          request.write(postData);
        }
        request.end();
        console.log('[API Client] Request sent, waiting for response...');

      } catch (error) {
        console.error('[API Client] Exception:', error);
        safeResolve({
          success: false,
          message: `配置错误: ${error.message}`
        });
      }
    });
  }

  /**
   * Build full API URL
   * @private
   * @param {string} baseUrl - Base URL
   * @param {string} endpoint - API endpoint
   * @returns {string} - Full URL
   */
  static _buildUrl(baseUrl, endpoint) {
    let url = baseUrl.trim();
    if (!url.endsWith('/')) {
      url += '/';
    }
    return url + endpoint;
  }

  /**
   * Build authentication header
   * @private
   * @param {Object} apiConfig - API configuration
   * @returns {Object} - Auth header object
   */
  static _buildAuthHeader(apiConfig) {
    const authType = apiConfig.authType || API_DEFAULTS.AUTH_TYPE;

    if (authType === 'auth_token') {
      return { 'Authorization': `Bearer ${apiConfig.authToken}` };
    } else {
      return { 'x-api-key': apiConfig.authToken };
    }
  }
}

module.exports = APIClient;
