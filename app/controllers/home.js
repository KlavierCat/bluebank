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


router.get('/foo', function (req, res) {
  getCostumer(function(data) { res.send(data);  } )

});

function getCostumer(callback) {

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

      // TODO get account based on costumerID 
      callback({
        result: body
      });
    });
  });

};
