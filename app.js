var express = require('express');
var http = require('https');
var qs = require('querystring');

var app = express.createServer(express.logger());
app.use(express.static(__dirname + '/public'));

app.get('/', function(request, response) {
	response.send('sup event handler');
});

app.get('/test', function(request, response) {
	var code = request.query['code'];	
	var fbPath = '/oauth/access_token?' + 
   				'client_id=453762924657294' +
   				'&redirect_uri=http://aqueous-cove-9179.herokuapp.com/' +
 				'&client_secret=6c7d0f487d6b8916552a2d890d776e48' +
				'&code=' + code;
	var options = {
	    host: 'graph.facebook.com',
	    port: 443,
	    path: fbPath
	};

	// get access token from FB
	http.request(options, function(res) {
		console.log('response is '+res.statusCode);
		var str = '';
		res.on('data', function(chunk) {
			str += chunk;
		});
		res.on('end', function() {
			var returns = qs.parse(str);
			var access_token = returns['access_token'];
			
			// actually make graph requests
			var graphOptions = {
				host: 'graph.facebook.com',
				port: 443,
				path: '/me?access_token=' + access_token
			};
			http.request(graphOptions, function(graphRes) {
				var graphResult = '';
				graphRes.on('data', function(chunk) {
					graphResult += chunk;
				});
				graphRes.on('end', function() {
					console.log('graph result ended, result is '+graphResult);

					response.send(graphResult);	
				});
			}).end();
		});
	}).end();

});

app.get('/fetch', function(req, res) {

});

var port = process.env.PORT || 5000;
app.listen(port, function() {
	console.log("Listening on " + port);
});