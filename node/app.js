var app = require('express').createServer();

app.get('/', function(req, res){
  res.send('sup event handler');
});

app.listen(3000);