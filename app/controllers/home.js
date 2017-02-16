var devKey="debe2258a2eb409c83d1a0ca6a9b7da6";
var bearer="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjdXN0b21lcklkIjoiNThhMTczMTIwNmQwZjllNzE4OWQxZGIyIiwicm9sZSI6InVzZXIiLCJwcmltYXJ5U3Vic2NyaWJlcktleSI6ImRlYmUyMjU4YTJlYjQwOWM4M2QxYTBjYTZhOWI3ZGE2IiwiaWF0IjoxNDg3MTkxNDc2fQ.903OULlUd4JAgDz34qDXkmtDYc95Pi4054d1Qa3od3s";
var params = {
  // Request parameters
};

var https = require('https');






var express = require('express'),
  router = express.Router(),
  Article = require('../models/article');

module.exports = function (app) {
  app.use('/', router);
  app.use('/webhook', router);
};

router.get('/', function (req, res, next) {
  var articles = [new Article(), new Article()];
    res.render('index', {
      title: 'Generator-Express MVC',
      articles: articles
    });
});

/*
 * Use your own validation token. Check that the token used in the Webhook
 * setup is the same token used here.
 *
 */
router.get('/webhook', function(req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === 'hellopanpan') {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
});

//TODO give the option to send an account name, we gonna use probably only two accounts in the demo so, can be only a hardcoded if
router.get('/account', function (req, res) {
  getAccountForDefaultCostumer(function(data) {
    console.log(data.accountBalance);
    //discover why accountBalance is not sent back but the entire object is
    res.send(data);
  });

});

function getAccountForDefaultCostumer(callback) {

  return https.get({
    host: 'bluebank.azure-api.net',
    path: '/api/v0.6.3/customers?',
    headers: {"Ocp-Apim-Subscription-Key": devKey, "bearer": bearer, accept: '*/*'}
  }, function(response) {
    // Continuously update stream with data
    var body = '';
    response.on('data', function(d) {
      body += d;
    });
    response.on('error', function(e) {
      console.log("Got error: " + e.message);
    });
    response.on('end', function() {
      console.log(body);
      var costumer = JSON.parse(body)[0];
      console.log(costumer.id);
      getAccount(costumer.id, callback);
    });
  });

};

function getAccount(costumerId, callback) {

  return https.get({
    host: 'bluebank.azure-api.net',
    path: '/api/v0.6.3/customers/' + costumerId +"/accounts?",
    headers: {"Ocp-Apim-Subscription-Key": devKey, "bearer": bearer, accept: '*/*'}
  }, function(response) {
    var body = '';
    response.on('data', function(d) {
      body += d;
    });
    response.on('error', function(e) {
      console.log("Got error: " + e.message);
    });
    response.on('end', function() {
      //prints to guarantee that all the data was flushed
      console.log(body);
      var account = JSON.parse(body)[0];
      console.log(account);
      //getAccount(costumer.id, callback);

      callback(account);
    });
  });

};
