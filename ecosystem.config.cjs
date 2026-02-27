/**
 * PM2 Ecosystem Configuration
 * 用于管理 AI Company 的所有服务
 */

module.exports = {
  apps: [
    {
      name: 'ai-gateway',
      script: './scripts/start-gateway.sh',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
      },
      error_file: './logs/gateway-error.log',
      out_file: './logs/gateway-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
    },
  ],
};

/**
 * 使用说明：
 *
 * 1. 安装 PM2
 *    npm install -g pm2
 *
 * 2. 启动服务
 *    pm2 start ecosystem.config.js
 *
 * 3. 查看状态
 *    pm2 list
 *    pm2 monit
 *
 * 4. 查看日志
 *    pm2 logs
 *    pm2 logs ai-gateway
 *
 * 5. 重启服务
 *    pm2 restart ai-gateway
 *    pm2 reload ai-gateway  # 零停机重启
 *
 * 6. 停止服务
 *    pm2 stop ai-gateway
 *
 * 7. 删除服务
 *    pm2 delete ai-gateway
 *
 * 8. 保存配置（开机自启）
 *    pm2 save
 *    pm2 startup
 */
