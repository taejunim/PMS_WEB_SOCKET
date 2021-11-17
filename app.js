var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var WebSocketServer = require('ws').Server;

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'node_modules')));

app.use('/', indexRouter);
app.use('/users', usersRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

var wss = new WebSocketServer({port: 3100});
var CLIENTS = [];
var CLIENTS_ID = [];

wss.getUniqueID = function () {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  }
  return s4() + s4() + '-' + s4();
};

wss.on('connection', (ws) => {

  console.log("connection : " + ws);

  ws.on('message', (message) => {

    console.log("시작");
    console.log("message: %s", message);

    var receivedMessage = JSON.parse(message);

    var id = receivedMessage.id;
    var event = receivedMessage.event;
    var data = receivedMessage.data;
    var fault = data.fault;

    console.log("id : " + id);
    console.log("event : " + event);
    console.log("data : " + data);
    console.log("fault : " + fault);


    if (id == 'pms') {
      console.log("PMS 접속 -> " + id);


    } else {
      console.log("미들웨어 접속 -> " + id);
    }

    if (CLIENTS_ID.includes(id)) {
      console.log(id + " 접속중 ");
    } else {
      CLIENTS.push(ws);
      CLIENTS_ID.push(id)
    }



    /*wss.clients.forEach(function each(client) {
      console.log('Client.ID: ' + client.id);
    });*/

    switch (id) {

      case 'M/W':

        CLIENTS[0].send(JSON.stringify({event: 'res', data: fault}));

        ws.send(JSON.stringify({event: 'res', data: fault}));

        break;
    }


    for (var i = 0; i < CLIENTS.length; i++) {
      console.log("CLIENTS_ID[i] : " + CLIENTS_ID[i])
    }


    if (event == 'req' && id == 'pms') {

      for (var i = 0; i < CLIENTS.length; i++) {

        console.log("CLIENTS_ID[i] : " + CLIENTS_ID[i])
        if (CLIENTS_ID[i] == 'M/W1') {
          CLIENTS[i].send(JSON.stringify({event: 'res', data: 'data test'}));
        }
      }

    }

    /*switch (message.event) {
      case 'onOpen':
        console.log("Received: %s", message.event);
        break;
      case "req":

        sendData.data = 'PMS response!!';
        CLIENTS[0].send(JSON.stringify(sendData));

        sendData.data = 'M/W response!!';
        ws.send(JSON.stringify(sendData));
        console.log("Received MSG : %s", message.data);
        break;

      case "Hello tjLim":
        CLIENTS[0].send(JSON.stringify(sendData));

      default:
    }*/
  });
});

module.exports = app;