const http = require('http');
const axios = require('axios');
const dotenv = require('dotenv').config();

console.log(dotenv);

const server = http.createServer((req, res) => {
  if (req.headers.origin !== 'http://127.0.0.1:8080') {
    console.error('bad origin');
    res.writeHead(500, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('{ "message": "bad origin" }');
    res.end();
  } else if (req.url === '/client-id') {
    console.log('client-id');
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(`{ "clientId": "${process.env.client_id}" }`);
    res.end();
  } else if (req.url === '/auth-token') {
    console.log('auth-token');
    // const authUrl = 'https://github.com/login/oauth/authorize'
    const tokenUrl = 'https://github.com/login/oauth/access_token';
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
    });

    const submitCode = async () => {
      const fetchTokenUrl = `${tokenUrl}?client_id=${process.env.client_id}&client_secret=${process.env.client_secret}&code=${req.headers.code}&redirect_uri=${req.headers.redirect}`;
      const fetchedAuth = await axios.get(fetchTokenUrl, { headers: { Accept: 'application/json' } });

      res.write(JSON.stringify(fetchedAuth.data));
      res.end();
      return fetchTokenUrl;
    };
    submitCode();
  } else {
    console.log('invalid');
    res.end('Invalid Request!');
  }
});

server.listen(5000); // 6 - listen for any incoming requests

console.log('Node.js web server at port 5000 is running..');
