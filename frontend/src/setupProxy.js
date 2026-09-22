const { createProxyMiddleware } = require('http-proxy-middleware');

// Solo npm start. En producción el mismo dominio ya sirve /api.
module.exports = function setupProxy(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: process.env.REACT_APP_API_URL
        ? process.env.REACT_APP_API_URL.replace(/\/api\/?$/, '')
        : 'http://localhost:5000',
      changeOrigin: true,
    })
  );
};
