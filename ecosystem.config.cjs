module.exports = {
  apps: [{
    name: 'shree-olympiad-api',
    script: 'src/index.js',
    cwd: './server',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '300M',
    env: { NODE_ENV: 'production', PORT: 5000 }
  }]
};
