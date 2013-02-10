#!/bin/env node

var express = require('express');
var fs      = require('fs');
var mongodb = require('mongodb');

var App = function(){

  // Scope

  var self = this;

  // Setup
  
  self.dbServer = new mongodb.Server(process.env.OPENSHIFT_MONGODB_DB_HOST,
                            parseInt(process.env.OPENSHIFT_MONGODB_DB_PORT));
  self.db = new mongodb.Db(process.env.OPENSHIFT_APP_NAME, self.dbServer, {auto_reconnect: true});
  self.dbUser = process.env.OPENSHIFT_MONGODB_DB_USERNAME;
  self.dbPass = process.env.OPENSHIFT_MONGODB_DB_PASSWORD;

  self.ipaddr  = process.env.OPENSHIFT_INTERNAL_IP;
  self.port    = parseInt(process.env.OPENSHIFT_INTERNAL_PORT) || 8080;

  if (typeof self.ipaddr === "undefined") {
    console.warn('No OPENSHIFT_INTERNAL_IP environment variable');
  };

  self.coll = 'zips';

  // Web app logic
  self.routes = {};
  self.routes['health'] = function(req, res){ res.send('1'); };

  self.routes['nearZip'] = function(req, res) {

	// Fuquay record
	// db.zips.find({loc: {$near: [ 35.579952, 78.780807 ]}}) -->
	
	var zipCode = req.params.zip;
	
	self.db.collection( self.coll ).find( {zip: zipCode}).toArray( function( err, center)  {
		if (center !== undefined && center.length > 0){
			var record = center[0];
			var y =  record.loc.y;
			var x =  record.loc.x;
			res.redirect("/near/lat/"+y+"/lon/"+x);
		} else {
			res.redirect("/");
		}
	});
	
  };

  self.routes['nearLatLon'] = function(req, res) {
	
	var limit = 25;
	var lat =  Number(req.params.lat);
	var lon =  Number(req.params.lon);
	var query = {loc: {$near: [ lat, lon ] } };

	self.db.collection( self.coll ).find( query ).limit( limit ).toArray( function( err, locations ) {
		if (locations === undefined) {
			res.send("Nothing found");
		} else {
			var s = '<p>Query '+ JSON.stringify( query ) +'</p><ol>';
			s += '<p>&nbsp;|&nbsp;<a href="/">Home</a>&nbsp;|&nbsp;</p>';
			for (var i = 0; i < locations.length; i++) {
				var rec = locations[i];
				s += '<li>' + rec.city + ', ' + rec.state + ', ' + 
				      rec.zip + ' (' + rec.loc.y + ', ' + rec.loc.x + ' )</li>';
			}
			s += '</ol>';
			res.send(s);
		}
	});	
  };

  // Web app URLs
  
  self.app  = express();
  self.app.get('/health', self.routes['health']);
  self.app.get('/near/zip/:zip', self.routes['nearZip']);
  self.app.get('/near/lat/:lat/lon/:lon', self.routes['nearLatLon']);
  self.app.use(express.static(__dirname + '/html'));
 
  // Open a database connection. We call this outside of app so it is available to all our functions inside.

  self.connectDb = function(callback){
    self.db.open(function(err, db){
      if(err){ throw err };
      self.db.authenticate(self.dbUser, self.dbPass, {authdb: "admin"},  function(err, res){
        if(err){ throw err };
        callback();
      });
    });
  };
  
  // Start nodejs server with express

  self.startServer = function(){
    self.app.listen(self.port, self.ipaddr, function(){
      console.log('%s: Node server started on %s:%d ...', Date(Date.now()), self.ipaddr, self.port);
    });
  }

  // Destructors

  self.terminator = function(sig) {
    if (typeof sig === "string") {
      console.log('%s: Received %s - terminating Node server ...', Date(Date.now()), sig);
      process.exit(1);
    };
    console.log('%s: Node server stopped.', Date(Date.now()) );
  };

  process.on('exit', function() { self.terminator(); });

  self.terminatorSetup = function(element, index, array) {
    process.on(element, function() { self.terminator(element); });
  };

  ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT', 'SIGBUS', 
   'SIGFPE', 'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGPIPE', 'SIGTERM'].forEach(self.terminatorSetup);
};

// Initialization:

// Create an express app
var app = new App();

// Call the connectDb function and pass in the start server command
app.connectDb(app.startServer);
