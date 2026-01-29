module.exports = {
  apps: [
    {
      name: 'excel-to-web',
      cwd: './server',
      script: 'src/server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        DB_PATH: './data/excel-app.db',
      },
      env_file: '.env',
      instances: 1,
      autorestart: true,
      watch: false,
    },
  ],
};
