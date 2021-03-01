const http = require('http');

const hostname = '127.0.0.1';
const port = 3000;

const server = http.createServer((req, res) => {
    console.log(11, 'new req');
  req.on('data', () => {
      console.log(22, 'req receive data');
      res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Hello World of ondata');
  })
  req.on('end', () => {
      console.log(33, 'req end');
      res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Hello World of onend');
  })
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});