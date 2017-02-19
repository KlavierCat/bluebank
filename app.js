var PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
var MESSENGER_VALIDATION_TOKEN = process.env.MESSENGER_VALIDATION_TOKEN;
var SERVER_URL = 'https://hellopanpan.azurewebsites.net';

var express = require('express'),
    config = require('./config/config'),
    users = require('./config/users'),
    mm = require('minimatch'),
    bodyParser = require('body-parser'),
    request = require('request');

var app = express();
app.use(bodyParser.json());
var qr = require('qr-image');

app.get('/webhook', function(req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === MESSENGER_VALIDATION_TOKEN) {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
});

app.post('/webhook', function (req, res) {
  var data = req.body;

  // Make sure this is a page subscription
  if (data.object == 'page') {

    // Iterate over each entry - there may be multiple if batched
    data.entry.forEach(function(entry) {
      var pageID = entry.id;
      var timeOfEvent = entry.time;

      // Iterate over each messaging event
      entry.messaging.forEach(function(event) {
        if (event.message) {
          receivedMessage(event);
        } else if (event.postback) {
          receivedPostback(event);
        }else {
          console.log("Webhook received unknown event: ", event);
        }
      });
    });

    // Assume all went well.
    //
    // You must send back a 200, within 20 seconds, to let us know
    // you've successfully received the callback. Otherwise, the request
    // will time out and we will keep trying to resend.
    res.sendStatus(200);
  }
});

function receivedMessage(event) {
  // Putting a stub for now, we'll expand it in the following steps
  // console.log("Message data: ", event.message);

  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;

  console.log("Received message for user %d and page %d at %d with message:",
    senderID, recipientID, timeOfMessage);
  console.log(JSON.stringify(message));

  var messageId = message.mid;

  var messageText = message.text;
  var messageAttachments = message.attachments;

  if (messageText) {
    // If we receive a text message, check to see if it matches a keyword
    // and send back the example. Otherwise, just echo the text we received.

    messageText = messageText.toLowerCase();

    // user wants to save money
    if (mm(messageText, "save *")) {
      var amountToSave = parseInt(messageText.replace(/[^0-9\.]/g, ''), 10).toString();

      if (isNaN(amountToSave)){
        console.log('user did not include a valid amount to save in message: ' + messageText);
        // send message scolding them
        return;
      }

      console.log("User wants to save: " + amountToSave);
      saveMoney(senderID, amountToSave, messageText);

      return;

    } else if (mm(messageText, "send * to *")) {
      var splitMessageText = messageText.split("to");
      var transactionAmount = parseInt(splitMessageText[0].replace(/[^0-9\.]/g, ''), 10).toString();

      if (isNaN(transactionAmount)){
        console.log('user did not include a valid amount to save in message: ' + messageText);
        // send message scolding them
        return;
      }

      var recipientAccountNo = parseInt(splitMessageText[1].replace(/[^0-9\.]/g, ''), 10).toString();
      var paymentReference = "received " + transactionAmount + " from " + users[senderID]["givenName"];
      var serverFeedbackToUser = "Successfully sent " + transactionAmount + " to account : " + recipientAccountNo;
      sendMoney(senderID, recipientAccountNo, transactionAmount, paymentReference, serverFeedbackToUser);

      return;
    } else if (mm(messageText, "request *")){
		//Create the QrCOde and send to fb
		var amountToSend = parseInt(messageText.replace(/[^0-9\.]/g, ''), 10);
		console.log("generate qrCode: "+amountToSend);

    	createQrCode(senderID, amountToSend);
    	//senderID aqui
    	sendImageMessage(senderID);

        console.log("Seller generate qrCode: " + amountToSave);


		return;
    }

    switch (messageText) {
      case 'generic':
        sendGenericMessage(senderID);
        break;

      case 'current account history':
      case 'current account transactions':
      case 'current account transaction':
      case 'current account transaction history':
      case 'current account transactions history':
      case 'current account recent transactions':
      case 'current account recent transactions history':
        getTransactionsHistory(senderID, "current");
        break;

      case 'saving account history':
      case 'saving account transactions':
      case 'saving account transaction':
      case 'saving account transaction history':
      case 'saving account transactions history':
      case 'saving account recent transactions':
      case 'saving account recent transactions history':
        getTransactionsHistory(senderID, "saving");
        break;

      case 'current account balance':
      case 'current account':
      case 'check current account balance':
        console.log('user checking current account ' + users[senderID]["currentAccountId"]);
        var currentAccountID = users[senderID]["currentAccountId"];
        checkBalance(senderID, currentAccountID, "current");
        break;

      case 'saving account balance':
      case 'saving account':
      case 'check saving account balance':
        console.log('user checking saving account ' + users[senderID]["savingAccountId"]);
        var savingAccountID = users[senderID]["savingAccountId"];
        checkBalance(senderID, savingAccountID, "saving");
        break;

      case 'account balance':
      case 'accounts balance':
      case 'balance':
      case 'check account balance':
      case 'check accounts balance':
        var currentAccountID = users[senderID]["currentAccountId"];
        checkBalance(senderID, currentAccountID, "current");
        var savingAccountID = users[senderID]["savingAccountId"];
        checkBalance(senderID, savingAccountID, "saving");

      default:
        sendTextMessage(senderID, messageText);
    }
  } else if (messageAttachments) {

    sendTextMessage(senderID, "Message with attachment received");

    if (mm(messageAttachments[0].title, "*'s Location")) {
      var latitude = messageAttachments[0].payload.coordinates.lat.toString();
      var longitude = messageAttachments[0].payload.coordinates.long.toString();
      console.log('User ' + senderID + "looking for ATM near: " + latitude + ", " + longitude);
      getNearAtm(senderID, latitude, longitude);
    }

    console.log("messageAttachments: " + JSON.stringify(messageAttachments));
  }
}

/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 *
 */
function receivedPostback(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;

  // The 'payload' param is a developer-defined field which is set in a postback
  // button for Structured Messages.
  var payload = event.postback.payload;

  console.log("Received postback for user %d and page %d with payload '%s' " +
    "at %d", senderID, recipientID, payload, timeOfPostback);

  // When a postback is called, we'll send a message back to the sender to
  // let them know it was successful
  sendTextMessage(senderID, "Postback called");
}

/*
 * Send a Structured Message (Generic Message type) using the Send API.
 *
 */
function sendGenericMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: "rift",
            subtitle: "Next-generation virtual reality",
            item_url: "https://www.oculus.com/en-us/rift/",
            image_url: "http://messengerdemo.parseapp.com/img/rift.png",
            buttons: [{
              type: "web_url",
              url: "https://www.oculus.com/en-us/rift/",
              title: "Open Web URL"
            }, {
              type: "postback",
              title: "Call Postback",
              payload: "Payload for first bubble",
            }],
          }, {
            title: "touch",
            subtitle: "Your Hands, Now in VR",
            item_url: "https://www.oculus.com/en-us/touch/",
            image_url: "http://messengerdemo.parseapp.com/img/touch.png",
            buttons: [{
              type: "web_url",
              url: "https://www.oculus.com/en-us/touch/",
              title: "Open Web URL"
            }, {
              type: "postback",
              title: "Call Postback",
              payload: "Payload for second bubble",
            }]
          }]
        }
      }
    }
  };

  callSendAPI(messageData);
}

function sendTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText
    }
  };

  callSendAPI(messageData);
}

function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      console.log("Successfully sent generic message with id %s to recipient %s",
        messageId, recipientId);
    } else {
      console.error("Unable to send message.");
      console.error(response);
      console.error(error);
    }
  });
}

function getNearAtm(recipientId, latitude, longitude) {
  console.log('inside function getNEarAtm');
  var queryUrl = 'https://bluebank.azure-api.net/api/v0.6.3/atms/near?lat=' + latitude + '&long=' + longitude + '&radius=500';
  console.log("queryUrl: " + queryUrl);
  request({
    headers: {
      'Ocp-Apim-Subscription-Key': users[recipientId]['token']
    },
    uri: queryUrl,
    method: 'GET'

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log("Successfully sent atm inquiry for account for location Lat: %s, Long: %s",
        latitude, longitude);

      var parsedBody = JSON.parse(body);

      if (parsedBody.length == 0) {
        var messageData = {
          recipient: {
            id: recipientId
          },
          message: {
            text: "Sorry, no ATM info nearby."
          }
        };

        callSendAPI(messageData);
        return;
      }

      for (var i = 0; i < parsedBody.length; i++) {
        var atm = parsedBody[i];

        var messageData = {
          recipient: {
            id: customerId
          },
          message: {
            text: atm.brand + " ATM: " + atm.atmName + "\n" + "Address: " + atm.streetAddress + ", " + atm.city + ", " + atm.postCode
          }
        }

        callSendAPI(messageData);
      }

    } else {
      console.error("Unable to inquire account balance");
      console.error(response);
      console.error(error);

      var messageData = {
        recipient: {
          id: recipientId
        },
        message: {
          text: "Sorry, failed to query ATM info nearby."
        }
      };

      callSendAPI(messageData);

    }
  });
}

function getTransactionsHistory(customerId, accountType) {
  var accountTypeQueryStr = accountType + "AccountId";
  var accountId = users[customerId][accountTypeQueryStr];
  var queryUrl = 'https://bluebank.azure-api.net/api/v0.6.3/accounts/' + accountId + '/transactions?sortOrder=-transactionDateTime&limit=5'

  request({
    headers: {
      'Ocp-Apim-Subscription-Key': users[customerId]['token'],
      'bearer': users[customerId]['bearer']
    },
    uri: queryUrl,
    method: 'GET'

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log("Successfully inquire recenet transactions for account %s for user %s",
        accountId, customerId);

      console.log(body);

      var parsedBody = JSON.parse(body);

      var transactionHistoryMessageTest = "You don't have any transactions on your" + accountType + " account yet.";

      if (parsedBody.length > 0) {
         transactionHistoryMessageTest = "That is your " + accountType + " account recent transaction history.";
      }

      var transactionsHistoryMessage = {
        recipient: {
          id: customerId
        },
        message: {
          text: transactionHistoryMessageTest
        }
      }

      callSendAPI(transactionsHistoryMessage);

      for (var i = 0; i < parsedBody.length; i++) {
        var transactionTimestamp = parsedBody[i]["transactionDateTime"].split("T");
        var transactionTimeStr = transactionTimestamp[0] + " " + transactionTimestamp[1].slice(0,8);
        var transactionInfoStr = parsedBody[i]["transactionAmount"] + "\n" + parsedBody[i]["transactionDescription"] + "\n" + transactionTimeStr;

        var messageData = {
          recipient: {
            id: customerId
          },
          message: {
            text: transactionInfoStr
          }
        }

        callSendAPI(messageData);
      }
    } else {
      console.error("Unable to inquire transaction history");
      console.error(response);
      console.error(error);

      var transactionsHistoryMessage = {
        recipient: {
          id: customerId
        },
        message: {
          text: "Failed to inquire transaction history on your " + accountType + " account. Try again later or contact the page admin."
        }
      }

      callSendAPI(transactionsHistoryMessage);
    }
  });
}

function sendMoney(senderId, recipientAccountNo, transactionAmount, messageText, serverFeedbackToUser) {
  var senderAccountId = users[senderId]["currentAccountId"];
  var queryUrl = 'https://bluebank.azure-api.net/api/v0.6.3/accounts/' + senderAccountId +'/payments';
  var bodyStr = JSON.stringify({
      "toAccountNumber":recipientAccountNo,
      "toSortCode":"839999",
      "paymentReference":messageText + ", via Facebook MoneyTalk Page",
      "paymentAmount":transactionAmount
  });

  request.post({
    headers: {
      'Ocp-Apim-Subscription-Key': users[senderId]['token'],
      'bearer': users[senderId]['bearer'],
      'Content-Type': 'application/json'
    },
    uri: queryUrl,
    method: 'POST',
    body: bodyStr

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log("Successfully send: " + transactionAmount);

      var messageData = {
        recipient: {
          id: senderId
        },
        message: {
          text: serverFeedbackToUser
        }
      };

      callSendAPI(messageData);
    } else {
      console.error("Unable to carry out transaction");
      console.error(response);
      console.error(error);

      var parsedBody = JSON.parse(body);

      var errorMessage = "unknown error";

      if (parsedBody.errorMessage) {
        errorMessage = parsedBody.errorMessage;
      }

      var messageData = {
        recipient: {
          id: senderId
        },
        message: {
          text: "Transaction failed due to error: " + errorMessage + ". Please try again later or contact page admin."
        }
      };

      callSendAPI(messageData);
    }
  });
}

function saveMoney(recipientId, amountToSave, messageText) {
  var savingAccountNo = users[recipientId]["savingAccountNumber"];
  var serverFeedbackToUser = "Successfully saved " + amountToSave + " GBP to saving account.";
  sendMoney(recipientId, savingAccountNo, amountToSave, messageText, serverFeedbackToUser);
}


function checkBalance(recipientId, bankAccountId, accountType) {
  var queryUrl = 'https://bluebank.azure-api.net/api/v0.6.3/accounts/' + bankAccountId;

  request({
    headers: {
      'Ocp-Apim-Subscription-Key': users[recipientId]['token'],
      'bearer': users[recipientId]['bearer']
    },
    uri: queryUrl,
    method: 'GET'

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log("Successfully sent balance inquiry for account %s for user %s",
        bankAccountId, recipientId);

      console.log(body);

      var parsedBody = JSON.parse(body);

      var accountBalance = parsedBody.accountBalance;
      var accountCurrency = parsedBody.accountCurrency;

      var accountBalanceMessage = "Your " + accountType + " account balance is: " + accountBalance + " " + accountCurrency;

      var messageData = {
        recipient: {
          id: recipientId
        },
        message: {
          text: accountBalanceMessage
        }
      };

      callSendAPI(messageData);
    } else {
      console.error("Unable to inquire account balance");
      console.error(response);
      console.error(error);
    }
  });
}

function callBankAPI(accountId) {
  request({
    uri: 'https://bluebank.azure-api.net/api/v0.6.3/accounts/' + accountId,
    qs: { access_token: PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      console.log("Successfully sent generic message with id %s to recipient %s",
        messageId, recipientId);
    } else {
      console.error("Unable to send message.");
      console.error(response);
      console.error(error);
    }
  });
}

function createQrCode(sellerID, amountToSend) {
  	console.log('inside createQrCode');
  	//var queryUrl = 'https://bluebank.azure-api.net/api/v0.6.3/accounts/' + sellerID +'/payments?amount='+amountToSend;
  	var queryUrl = "{url:'https://bluebank.azure-api.net/api/v0.6.3/accounts/', seller:"+sellerID+", amount:"+amountToSend+"}";

 	var qr_png = qr.image(queryUrl, {type: 'png' });
	qr_png.pipe(require('fs').createWriteStream('public/img/qrcode'+sellerID+'.png'));
	console.log('generated qrcode name:qrcode'+sellerID+'.png');
 }

function sendImageMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment:{
      	type:"image",
      	payload:{
      		url:SERVER_URL+"/img/qrcode"+recipientId+".png"
      	}
      }
    }

  };

  callSendAPI(messageData);
}

//TODO test if this send image message is working
//sendImageMessage("1217825631647606", "./png_sample.png");
app.get('/imageMessageToMauricio', function(req, res) {
  sendImageMessage("1217825631647606", "./qrcode83787384783793840.png");
  res.status(200).send({"foo" : "bar"});
});

module.exports = require('./config/express')(app, config);

app.listen(config.port, function () {
  console.log('Express server listening on port ' + config.port);
});

