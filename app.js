var express = require('express');
var http = require('https');
var qs = require('querystring');

var HEROKU_URL = 'http://aqueous-cove-9179.herokuapp.com/allevents';
var LOCAL_URL = 'http://localhost:5000/allevents';

var app = express.createServer(express.logger());
app.use(express.static(__dirname + '/public'));

app.get('/', function(request, response) {
	response.send('<strong>testing</strong>');
});

app.get('/allevents', function(request, response) {
	var token_query = request.query['access_token'];
	console.log('token_query is '+token_query);
	if(token_query === undefined) {
		var code = request.query['code'];	
		var fbPath = '/oauth/access_token?' + 
	   				'client_id=453762924657294' +
	   				'&redirect_uri=' + HEROKU_URL +
	 				'&client_secret=6c7d0f487d6b8916552a2d890d776e48' +
	 				'&code=' + code;
		var options = {
		    host: 'graph.facebook.com',
		    port: 443,
		    path: fbPath
		};

		// get access token from FB
		http.request(options, function(res) {
			var str = '';
			res.on('data', function(chunk) {
				str += chunk;
			});
			res.on('end', function() {
				var returns = qs.parse(str);
				var access_token = returns['access_token'];
				getEvents(access_token, response);
			});
		}).end();
	} else {
		getEvents(token_query, response);
	}
});

function getEvents(access_token, response) {
	// actually grab all events from fb graph
	var graphOptions = {
		host: 'graph.facebook.com',
		port: 443,
		path: '/me/events?access_token=' + access_token
	};
	console.log('access token in getEvents is '+access_token);
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
}

app.get('/event/:id', function(request, response) {
	var id = request.params['id'];
	var access_token = request.query['access_token'];
	var output = {};

	// FQL query
	var fqlQueries = {
		'rsvp_query': 'SELECT uid, rsvp_status FROM event_member WHERE eid=' + id,
		'person_info_query': 'SELECT sex, birthday_date FROM user WHERE uid IN (SELECT uid FROM #rsvp_query WHERE rsvp_status = \'attending\')',
		'basic_info_query': 'SELECT name, start_time, location FROM event WHERE eid=' + id,
		'mutuals_query': 'SELECT uid1, uid2 FROM friend WHERE uid1 = me() AND uid2 IN (SELECT uid FROM #rsvp_query WHERE rsvp_status = \'attending\')'
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

			var name, time, location;
			var attending = 0, maybe = 0, declined = 0, invited = 0, male = 0, female = 0, mutuals = 0;
			var ages = [];

			for(var k = 0; k < data.length; k++) {
				var currResultsName = data[k].name;
				var currResults = data[k].fql_result_set;
				if(currResultsName === 'rsvp_query') {
					// invited/attending/maybe
					for(var i = 0; i < currResults.length; i++) {
						var currResponse = currResults[i].rsvp_status;
						if(currResponse === 'attending') {
							attending++;
						} else if(currResponse === 'unsure') {
							maybe++;
						} else if(currResponse === 'declined') {
							declined++;
						}
						invited++;
					}
				} else if(currResultsName === 'person_info_query') {
					// male/female/age
					for(var i = 0; i < currResults.length; i++) {
						var currUser = currResults[i];
						var gender = currUser['sex'];
						if(gender === 'male') {
							male++;
						} else if(gender === 'female') {
							female++;
						}

						var birthdate = currUser['birthday_date'];
						if(birthdate !== null) {
							var bdaySplit = birthdate.split('/');
							if(bdaySplit.length === 3) {
								var thenDate = new Date(bdaySplit[2], bdaySplit[0], bdaySplit[1]);
								var nowDate = Date.now();
								var age = Math.floor((nowDate - thenDate) / 31557600000);
								ages.push(age);
							}
						}
					}
				} else if(currResultsName === 'basic_info_query') {
					// basic info
					name = currResults[0]['name'];
					time = currResults[0]['start_time'];
					location = currResults[0]['location'];
				} else if(currResultsName === 'mutuals_query') {
					mutuals = currResults.length;
				}
			}

			// average out age
			var averageAge = 0;
			for(var i = 0; i < ages.length; i++) {
				averageAge += ages[i];
			}
			averageAge = Math.round(averageAge / ages.length);

			// send final result object
			response.send({
				'name': name,
				'time': time,
				'location': location,
				'male': male,
				'female': female,
				'invited': invited,
				'attending': attending,
				'maybe': maybe,
				'declined': declined,
				'mutuals': mutuals,
				'ages': ages,
				'averageAge': averageAge
			});

			// response.send(result);
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