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
      var transactionAmount = parseInt(splitMessageText[0].replace(/[^0-9\.]/g, ''), 10);

      if (isNaN(transactionAmount)){
        console.log('user did not include a valid amount to save in message: ' + messageText);
        sendTextMessage(senderID, "Bad request. Format for sending money is: \n send amount-of-money to bank-account-number");
        return;
      } else {
        transactionAmount = transactionAmount.toString();
      }

      var recipientAccountNo = parseInt(splitMessageText[1].replace(/[^0-9\.]/g, ''), 10);

      if (isNaN(recipientAccountNo)) {
        for (var facebookKey in users) {
          if (users.hasOwnProperty(facebookKey)) {
            for (var accountProp in users[facebookKey]) {
              if (users[facebookKey][accountProp].slice(0,5) == recipientAccountNo.slice(0,5)) {
                recipientAccountNo = users[facebookKey]["currentAccountNumber"];
              }
            }
          }
        }
      } else {
        sendTextMessage(senderID, "Bad request. Format for sending money is: \n send amount-of-money to bank-account-number");
        return;
      }

      recipientAccountNo = recipientAccountNo.toString();

      var paymentReference = "received " + transactionAmount + " GBP from " + users[senderID]["givenName"] + " " + users[senderID]["familyName"];
      var serverFeedbackToUser = "Your request to send " + transactionAmount + " GBP to account : " + recipientAccountNo + " has been received.";
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
      case 'info':
      case 'information':
      case 'about ulster bank':
      case 'about':
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

    if (mm(messageAttachments[0].url, "https://l.facebook.com/l.php?*www.bing.com%2Fmaps*")) {
      sendTextMessage(senderID, "querying nearest ATMs");
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
  if (payload == "cancel"){
    sendTextMessage(senderID, "Transaction cancelled. Your account has NOT been deducted.");
  } else if (payload == "request callback") {
    sendTextMessage(senderID, "Thanks for your interests, we'll contact you shortly.");
  } else {
    var args = JSON.parse(payload);
    sendMoneyRequest.apply(this, args);
  }

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
            title: "Ulster Bank",
            subtitle: "",
            item_url: "http://digital.ulsterbank.ie/",
            image_url: "https://pbs.twimg.com/profile_images/481434724317945859/bspl1Agb_400x400.jpeg",
            buttons: [{
              type: "web_url",
              url: "http://digital.ulsterbank.ie/",
              title: "Open Web URL"
            }, {
              type: "phone_number",
              title: "Call Representative",
              payload: "1850211690",
            }],
          }, {
            title: "Mortgages",
            subtitle: "Your saving account looks great!",
            item_url: "http://digital.ulsterbank.ie/personal/mortgages.html",
            image_url: "http://www.irishhome.ie/wp-content/uploads/2015/08/a-mortgage-you-can-live-with-ulster-bank.jpg",
            buttons: [{
              type: "web_url",
              url: "http://digital.ulsterbank.ie/personal/mortgages.html",
              title: "Open Web URL"
            }, {
              type: "postback",
              title: "Request a callback",
              payload: "request callback",
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
        sendTextMessage(recipientId, "Sorry, no ATM info nearby.");
        return;
      }

      for (var i = 0; i < parsedBody.length; i++) {
        var atm = parsedBody[i];
        var messageText = atm.brand + " ATM: " + atm.atmName + "\n" + "Address: " + atm.streetAddress + ", " + atm.city + ", " + atm.postCode;
        sendTextMessage(recipientId, messageText);
      }

    } else {
      console.error("Unable to inquire account balance");
      console.error(response);
      console.error(error);

      sendTextMessage(recipientId, "Sorry, failed to query nearby ATMs.");
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

      var transactionHistoryMessageText = "You don't have any transactions on your" + accountType + " account yet.";

      if (parsedBody.length > 0) {
         transactionHistoryMessageText = "That is your " + accountType + " account recent transaction history.";
      }

      sendTextMessage(customerId, transactionHistoryMessageText);

      for (var i = 0; i < parsedBody.length; i++) {
        var transactionTimestamp = parsedBody[i]["transactionDateTime"].split("T");
        var transactionTimeStr = transactionTimestamp[0] + " " + transactionTimestamp[1].slice(0,8);
        var transactionInfoStr = parsedBody[i]["transactionAmount"] + "\n" + parsedBody[i]["transactionDescription"] + "\n" + transactionTimeStr;

        sendTextMessage(customerId, transactionInfoStr);
      }
    } else {
      console.error("Unable to inquire transaction history");
      console.error(response);
      console.error(error);

      var failedMessageText = "Failed to inquire transaction history on your " + accountType + " account. Try again later or contact the page admin.";
      sendTextMessage(customerId, failedMessageText);
    }
  });
}

function sendMoney(senderId, recipientAccountNo, transactionAmount, messageText, serverFeedbackToUser) {
  var recipientId = "";
  var recipientAccountType = "";

  for (var facebookKey in users) {
    if (users.hasOwnProperty(facebookKey)) {
      for (var accountProp in users[facebookKey]) {
        if (users[facebookKey][accountProp] == recipientAccountNo) {
          recipientId = facebookKey;
          recipientAccountType = accountProp.split("Account")[0];
        }
      }
    }
  }

  if (recipientId == senderId) {
    confirmSavingMoney(senderId, recipientAccountNo, transactionAmount, messageText, serverFeedbackToUser);
  } else if (recipientId != "") {
    confirmSendingMoneyWithRecipientFacebook(senderId, recipientAccountNo, transactionAmount, messageText, serverFeedbackToUser, recipientId, recipientAccountType);
  } else {
    confirmSendingMoney(senderId, recipientAccountNo, transactionAmount, messageText, serverFeedbackToUser);
  }
}

function sendMoneyRequest(senderId, recipientAccountNo, transactionAmount, messageText, serverFeedbackToUser, recipientId, recipientAccountType) {
  var queryUrl = 'https://bluebank.azure-api.net/api/v0.6.3/accounts/' + users[senderId]["currentAccountId"] +'/payments';
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

      sendTextMessage(senderId, serverFeedbackToUser);

      if (recipientId != "") {
        setTimeout(function () {
          if (recipientId != senderId) {
            sendTextMessage(recipientId, "You have received " + transactionAmount + " GBP in your " + recipientAccountType + " account "  + " from " + users[senderId]["givenName"] + " " + users[senderId]['familyName'] + "\n https://www.facebook.com/" + users[senderId]["facebookHandler"]);
            sendTextMessage(senderId, "Your earlier request to send " + transactionAmount + " GBP to "+ users[recipientId]["givenName"] + " " + users[recipientId]['familyName'] + "\n https://www.facebook.com/" + users[recipientId]["facebookHandler"] + " has been processed successfully.");
          } else {
            sendTextMessage(recipientId, "Your request to save " + transactionAmount + " GBP into your saving account has been processed.");
          }
        }, 20000)
      }

    } else {
      console.error("Unable to carry out transaction");
      console.error(response);
      console.error(error);

      var parsedBody = JSON.parse(body);

      var errorMessage = "unknown error";

      if (parsedBody.errorMessage) {
        errorMessage = parsedBody.errorMessage;
      }

      var failedMessageText = "Transaction failed due to error: " + errorMessage + ".";

      sendTextMessage(senderId, failedMessageText);
    }
  });
}

function confirmSendingMoney(senderId, recipientAccountNo, transactionAmount, messageText, serverFeedbackToUser) {
    var messageData = {
    recipient: {
      id: senderId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: "Send " + transactionAmount + " GBP to account: " + recipientAccountNo,
            subtitle: "",
            item_url: "",
            image_url: "",
            buttons: [{
              type: "postback",
              title: "Confirm",
              payload: JSON.stringify([senderId, recipientAccountNo, transactionAmount, messageText, serverFeedbackToUser, "", ""])
            }, {
              type: "postback",
              title: "Cancel",
              payload: "cancel",
            }]
          }]
        }
      }
    }
  };

  callSendAPI(messageData);
}

function confirmSavingMoney(senderId, recipientAccountNo, transactionAmount, messageText, serverFeedbackToUser) {
    var messageData = {
    recipient: {
      id: senderId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: "Save " + transactionAmount + " GBP to saving account.",
            subtitle: "",
            item_url: "",
            image_url: "",
            buttons: [{
              type: "postback",
              title: "Confirm",
              payload: JSON.stringify([senderId, recipientAccountNo, transactionAmount, messageText, serverFeedbackToUser, senderId, "saving"])
            }, {
              type: "postback",
              title: "Cancel",
              payload: "cancel",
            }]
          }]
        }
      }
    }
  };

  callSendAPI(messageData);
}

function confirmSendingMoneyWithRecipientFacebook(senderId, recipientAccountNo, transactionAmount, messageText, serverFeedbackToUser, recipientId, recipientAccountType) {
    var messageData = {
    recipient: {
      id: senderId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: "Send " + transactionAmount + " GBP to " + users[recipientId]["givenName"] + " " + users[recipientId]["familyName"],
            subtitle: "",
            item_url: "https://www.facebook.com/" + users[recipientId]["facebookHandler"],
            image_url: "",
            buttons: [{
              type: "postback",
              title: "Confirm",
              payload: JSON.stringify([senderId, recipientAccountNo, transactionAmount, messageText, serverFeedbackToUser, recipientId, recipientAccountType])
            }, {
              type: "postback",
              title: "Cancel",
              payload: "cancel",
            }]
          }]
        }
      }
    }
  };

  callSendAPI(messageData);
}

function saveMoney(recipientId, amountToSave, messageText) {
  var savingAccountNo = users[recipientId]["savingAccountNumber"];
  var serverFeedbackToUser = "Your request to save " + amountToSave + " GBP into your saving account has been received.";
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

      sendTextMessage(recipientId, accountBalanceMessage);
    } else {
      console.error("Unable to inquire account balance");
      console.error(response);
      console.error(error);

      sendTextMessage(recipientId, "Failed to inquire account balance.");
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

