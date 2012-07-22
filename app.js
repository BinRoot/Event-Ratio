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
		'mutuals_query': 'SELECT uid1, uid2 FROM friend WHERE uid1 = me() AND uid2 IN (SELECT uid FROM #rsvp_query WHERE rsvp_status = \'attending\')',
		'my_info_query': 'SELECT birthday_date FROM user WHERE uid = me()'
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
			var attending = 0, maybe = 0, declined = 0, invited = 0, male = 0, female = 0, mutuals = 0, myAge;
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


						var age = calcAge(currUser['birthday_date']);
						if(age !== null) {
							ages.push(age);
						}
					}
				} else if(currResultsName === 'basic_info_query') {
					// basic info
					name = currResults[0]['name'];
					time = currResults[0]['start_time'];
					location = currResults[0]['location'];
				} else if(currResultsName === 'mutuals_query') {
					// mutuals
					mutuals = currResults.length;
				} else if(currResultsName === 'my_info_query') {
					// my info
					var myAge = calcAge(currResults[0]['birthday_date']);
				}
			}

			// average out age
			var averageAge = 0;
			if(ages.length > 0) {
				for(var i = 0; i < ages.length; i++) {
					averageAge += ages[i];
				}
				averageAge = Math.round(averageAge / ages.length);
			}

			/*** BADGES ***/
			var badges = [];

			// gender ratio
			var genderRatio = female/male;
			if(genderRatio < .5) {
				badges.push({
					'id': 'sausageFest',
					'name': 'Sausagefest',
					'description': 'Do you work at a tech company? There are '+male+' dudes and only '+female+' chicks at this event.'
				});
			} else if(genderRatio > 1.5) {
				badges.push({
					'id': 'girlsNight',
					'name': 'Girl\'s Night!',
					'description': 'All the single ladies... now put your hands up! There are '+female+' girls and only '+male+' boys coming to this event.'
				});
			}

			// cougar/pedobar
			if(myAge !== null && averageAge !== 0) {
				var ageDiff = averageAge - myAge;
				if(ageDiff > 3) {
					badges.push({
						'id': 'cougar',
						'name': 'Cougar Alert!',
						'description': 'Be on the lookout! The average age at this event is ' + ageDiff + ' years more than your age.'
					});
				} else if(ageDiff < -3) {
					badges.push({
						'id': 'pedobear',
						'name': 'Pedobear',
						'description': 'Why don\'t you take a seat right over there? The average age at this event is ' + ageDiff + ' years younger than you.'
					});
				}
			}

			// social butterfly/SAP
			if(attending !== 0) {
				var mutualRatio = mutuals/attending;
				if(mutualRatio > .75) {
					badges.push({
						'id': 'socialButterfly',
						'name': 'Social Butterfly',
						'description': 'Are\'t you gonna be popular! ' + Math.floor(mutualRatio * 100) + '% of the attendees are your friends.'
					});
				} else if(mutualRatio < .25) {
					badges.push({
						'id': 'SAP',
						'name': 'Socially Awkward Penguin',
						'description': 'Get your one-liners ready. You\'re only friends with ' + Math.floor(mutualRatio * 100) + '% of the attendees.'
					});
				}
			}

			// intimate/rager
			if(invited <= 15) {
				badges.push({
					'id': 'intimiateGathering',
					'name': 'Intimiate Gathering',
					'description': 'Sometimes you just gotta get away from the hubbub. There are only ' + invited + ' guests invited to this event.'
				});
			} else if(invited > 200) {
				badges.push({
					'id': 'rager',
					'name': 'Rager',
					'description': 'Get ready to rage! There are ' + invited + ' people invited to this event!'
				});
			}

			// maybe
			if(invited !== 0) {
				var maybeRatio = maybe/invited;
				if(maybeRatio > .5) {
					badges.push({
						'id': 'attendingMaybe',
						'name': 'Attending Maybe?',
						'description': 'Hey I just met you, and this is crazy... But here\'s my event, some come to it maybe? ' + maybeRatio + '% of those invited have responded with "Maybe."'
					});
				}
			}


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
				'averageAge': averageAge,
				'badges': badges
			});

			// response.send(result);
		})
	}).end();

});

function calcAge(birthdate) {
	if(birthdate !== null) {
		var bdaySplit = birthdate.split('/');
		if(bdaySplit.length === 3) {
			var thenDate = new Date(bdaySplit[2], bdaySplit[0], bdaySplit[1]);
			var nowDate = Date.now();
			var age = Math.floor((nowDate - thenDate) / 31557600000);
			return age;
		}
	}
	return null;
}

app.get('/fetch', function(req, res) {

});

var port = process.env.PORT || 5000;
app.listen(port, function() {
	console.log("Listening on " + port);
});