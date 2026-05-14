const express = require('express');
const path = require('path');
const { PORT } = require('./config');
const registerRoutes = require('./routes');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));
app.use('/static', express.static(path.join(__dirname, 'static'), { maxAge: '1d' }));

registerRoutes(app);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ 涨势通已启动！`);
  console.log(`   打开浏览器访问: http://localhost:${PORT}\n`);
});
