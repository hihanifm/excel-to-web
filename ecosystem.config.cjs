const fs = require('fs');
const version = fs.readFileSync('./VERSION', 'utf8').trim();

module.exports = {
  apps: [
    {
      name: 'excel-to-web',
      version,
      cwd: './server',
      script: 'src/server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 36000,
        DB_PATH: './data/excel-app.db',
      },
      env_file: '.env',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      out_file: 'logs/pm2-out.log',
      error_file: 'logs/pm2-error.log',
      merge_logs: true,
    },
  ],
};
