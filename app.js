var express = require('express');
var http = require('https');
var qs = require('querystring');
var access_token = '';

var HEROKU_URL = 'http://aqueous-cove-9179.herokuapp.com/allevents';
var LOCAL_URL = 'http://localhost:5000/allevents';

var app = express.createServer(express.logger());
app.use(express.static(__dirname + '/public'));

app.get('/', function(request, response) {
	response.send('<strong>testing</strong>');
});

app.get('/allevents', function(request, response) {
	var code = request.query['code'];	
	var fbPath = '/oauth/access_token?' + 
   				'client_id=453762924657294' +
   				'&redirect_uri=' + LOCAL_URL +
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
			access_token = returns['access_token'];
			
			// actually grab all events from fb graph
			var graphOptions = {
				host: 'graph.facebook.com',
				port: 443,
				path: '/me/events?access_token=' + access_token
			};
			http.request(graphOptions, function(graphRes) {
				var graphResult = '';
				graphRes.on('data', function(chunk) {
					graphResult += chunk;
				});

				graphRes.on('end', function() {
					console.log('graph result ended, result is '+graphResult);
					var events = JSON.parse(graphResult).data;
					var eventsResponse = { 'events': [] };

					for(var i = 0; i < events.length; i++) {
						eventsResponse['events'].push(events[i].id);
					}
					response.send(eventsResponse);
				});
			}).end();
		});
	}).end();
});

app.get('/event/:id', function(request, response) {
	console.log('inside event, access_token is '+access_token);
	var id = request.params['id'];
	var output = {};

	// FQL query
	var fqlQueries = {
		'query1': 'SELECT uid, rsvp_status FROM event_member WHERE eid=' + id,
		'query2': 'SELECT sex FROM user WHERE uid IN (SELECT uid FROM #query1)',
	};
	var eventReqOption = {
		host: 'graph.facebook.com',
		port: 443,
		path: '/fql?q=' + (JSON.stringify(fqlQueries)).replace(/\ /g, '+') + 
				'&access_token=' + access_token
	};
	console.log('path is '+eventReqOption.path);
	http.request(eventReqOption, function(res) {
		var result = '';
		res.on('data', function(chunk) {
			result += chunk;
		});
		res.on('end', function() {
			console.log('fqlresult is '+result);
			var data = JSON.parse(result).data;
			var results1 = data[0].fql_result_set;
			var results2 = data[1].fql_result_set;

			// male/female 
			var male = 0;
			var female = 0;
			for(var i = 0; i < results2.length; i++) {
				var gender = results2[i].sex;
				if(gender === 'male') {
					male++;
				} else if(gender === 'female') {
					female++;
				}
			}

			// invited/attending/maybe

			response.send({
				'male': male,
				'female': female
			});
		})
	}).end();

	// var eventReqOption = {
	// 	host: 'graph.facebook.com',
	// 	port: 443,
	// 	path: '/' + id + '?access_token=' + access_token
	// };
	// // get name, start time, location
	// http.request(eventReqOption, function(res) {
	// 	var graphResult = '';
	// 	res.on('data', function(chunk) {
	// 		graphResult += chunk;
	// 	});
	// 	res.on('end', function() {
	// 		var eventData = JSON.parse(graphResult);
	// 		output['name'] = eventData['name'];
	// 		output['time'] = eventData['start_time'];
	// 		output['location'] = eventData['location'];

	// 		// get attending list
	// 		var attendingReqOption = {
	// 			host: 'graph.facebook.com',
	// 			port: 443,
	// 			path: '/' + id + '/attending?access_token=' + access_token
	// 		};
	// 		http.request(attendingReqOption, function(attendingResponse) {
	// 			var attendingResult = '';
	// 			attendingResponse.on('data', function(chunk) {
	// 				attendingResult += chunk;
	// 			});
	// 			attendingResponse.on('end', function() {
	// 				console.log('after attendingResult ends, attendingResult is '+attendingResult);
	// 				var attending = JSON.parse(attendingResult);
	// 				parseAttendingData(attending, response);
	// 			});
	// 		}).end();
	// 	});
	// }).end();
});

function parseAttendingData(data, response) {
	var people = data.data;
	var batch = [];
	for(var i = 0; i < people.length; i++) {
		batch.push({
			'method': 'GET',
			'relative_url': people[i].id
		});
	}
	var options = {
		host: 'graph.facebook.com',
		port: 443,
		path: '/?access_token=' + access_token,
		method: 'POST'
	};
	var postData = 'batch='+JSON.stringify(batch);
	console.log('batch data is '+postData);
	// get batch data for attending list
	var httpRequest = http.request(options, function(postResponse) {
		var result = '';
		postResponse.on('data', function(chunk) {
			result += chunk;
		});
		// actually get the male/female counts
		postResponse.on('end', function() {
			console.log('attendees list is '+result);
			var attendees = JSON.parse(result);

			var male = 0;
			var female = 0;
			for(var i = 0; i < attendees.length; i++) {
				var currAttendee = attendees[i];
				var info = JSON.parse(currAttendee.body);
				if(info['gender'] === 'male') {
					male++;
				} else if(info['gender'] === 'female') {
					female++;
				}
			}
			var output = {
				'male': male,
				'female': female
			};
			response.send(output);
		});
	});
	httpRequest.write(postData);
	httpRequest.end();
} 

app.get('/fetch', function(req, res) {

});

var port = process.env.PORT || 5000;
app.listen(port, function() {
	console.log("Listening on " + port);
});