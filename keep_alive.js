const http = require('http');

http.createServer((req, res) => {
  res.write('Bot is alive!');
  res.end();
}).listen(3000);