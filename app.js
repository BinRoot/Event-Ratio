var express = require('express');

var app = express.createServer(express.logger());
app.use(express.static(__dirname + '/public'));

app.get('/', function(request, response) {
	response.send('sup event handler');
});

app.get('/test', function(req, res) {
	res.send('testing');
});

app.get('/fetch', function(req, res) {

});

var port = process.env.PORT || 5000;
app.listen(port, function() {
	console.log("Listening on " + port);
});