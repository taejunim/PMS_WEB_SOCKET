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

var webSocketArray = [];
var CLIENTS = [];
var CLIENTS_ID = [];

//랜덤 ID 생성
wss.getUniqueID = function () {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    }

    return s4() + s4() + '-' + s4();
};

wss.on('connection', (ws) => {

    console.log("connection : " + ws);

    ws.on('message', (message) => {

        console.log("---------------------------------------------");

        //데이터 수신
        var receivedMessage = "";

        let id = "";
        let eventType = "";
        let deviceType = "";
        let dataType = "";
        let data = "";

        try {
            receivedMessage = JSON.parse(message);

            id = receivedMessage.id;
            eventType = receivedMessage.eventType;
            dataType = receivedMessage.dataType;

        } catch (exception) {
            console.log("Key Undefined : " + exception);

            ws.send(JSON.stringify({id: '', eventType: 'res', dataType: '', result: 'fail', message: '필수값 누락'}));

            return;
        }

        switch (eventType) {

            //전송
            case 'req':

                //접속
                if (dataType == 'connect') {
                    if (id.includes('PMS')) {
                        console.log("PMS 접속 -> " + id);
                    } else if (id.includes('M/W')) {
                        console.log("미들웨어 접속 -> " + id);
                    }

                    try {

                        //재접속시
                        if (webSocketArray.includes(ws)) {

                            console.log(ws.id + " 재접속 ");
                            removeClient(ws.id);
                        }

                        //기존 접속이 없을시
                        else {
                            CLIENTS.push(id);

                            let clientId = id + "_" + wss.getUniqueID();
                            CLIENTS_ID.push(clientId);

                            ws.id = clientId;

                            webSocketArray.push(ws);
                        }

                        ws.send(JSON.stringify({id: id, eventType: 'res', dataType: dataType, result: 'success', message: ''}));

                        printCurrentSession();

                        return;
                    } catch (exception) {
                        console.log("connected error : " + exception);

                        ws.send(JSON.stringify({id: id, eventType: 'res', dataType: 'connect', result: 'fail', message: '접속 오류'}));
                        removeClient(ws.id);

                        //ws.terminate();
                        return;
                    }
                }

                //데이터 수신
                else {
                    //전문 파싱
                    try {

                        deviceType = receivedMessage.deviceType;
                        data = receivedMessage.data;

                        console.log("id : " + id);
                        console.log("eventType : " + eventType);
                        console.log("deviceType : " + deviceType);
                        console.log("dataType : " + dataType);
                        console.log("data : " + data);

                    } catch (exception) {
                        console.log("필수 값 누락으로 인한 오류 : " + exception);

                        ws.send(JSON.stringify({id: '', eventType: 'res', dataType: '', result: 'fail', message: '필수 값 누락'}));
                        return;
                    }

                    printCurrentSession();


                    var controlClientId; //제어를 전송한 PMS 고유 ID -> 제어 전송한 브라우저에서만 응답을 받아야하므로 따로 관리

                    //받은 데이터를 PMS or M/W 로 다시 전송
                    try {
                        var tempClientId = "";
                        var tempClientIdArray = [];


                        switch (dataType) {

                            //상태 데이터
                            case 'status' :
                                tempClientId = id.replace('M/W', 'PMS'); // 데이터 전달(M/W1 -> Server -> PMS1 or PMS1 -> Server -> M/W1) 을 위해 뒤 끝자리 번호로 구분하여 전달

                                let index = CLIENTS.indexOf(tempClientId);

                                //M/W로 부터 받은 데이터를 n개의 PMS (ex. PMS1 이 n개 접속해 있을 경우) 로 전송하기 위해 세션 목록에서 해당하는 모든 index 찾기
                                while (index != -1) {
                                    tempClientIdArray.push(index);
                                    index = CLIENTS.indexOf(tempClientId, index + 1);
                                }

                                //PMS 또는 M/W 가 웹소켓서버와 연결중이면 M/W -> Server -> PMS 로 상태 데이터 전송
                                for (var i=0; i<tempClientIdArray.length; i++) {
                                    let index = tempClientIdArray[i];
                                    webSocketArray[index].send(JSON.stringify({
                                        id: id,
                                        eventType: eventType,
                                        deviceType: deviceType,
                                        dataType: dataType,
                                        data: data
                                    }));
                                }
                                break;

                            //제어 데이터
                            case 'control' :
                                tempClientId = id.replace('PMS', 'M/W');
                                controlClientId = ws.id

                                if (CLIENTS.includes(tempClientId)) {
                                    //PMS 로 전송
                                    let index = CLIENTS.indexOf(tempClientId);

                                    console.log("control index : " + index);

                                    webSocketArray[index].send(JSON.stringify({
                                        id: id,
                                        eventType: eventType,
                                        deviceType: deviceType,
                                        dataType: dataType,
                                        data: data
                                    }));
                                }
                                break;
                        }

                    } catch (exception) {
                        console.log("기타 오류 : " + exception);

                        ws.send(JSON.stringify({id: id, eventType: 'res', dataType: dataType, result: 'fail', message: '기타 오류 : 데이터 전송 실패'}));
                        return;
                    }

                    // M/W 또는 PMS 로 응답
                    try {

                        var resId;

                        if (dataType == 'control') {
                            resId = controlClientId;
                        } else {
                            resId = id;
                        }
                        ws.send(JSON.stringify({id: resId, eventType: 'res', dataType: dataType, result: 'success', message: ''}));
                    } catch (exception) {
                        console.log("기타 오류 : 데이터 응답 실패 (" + exception + ")");

                        ws.send(JSON.stringify({
                            id: receivedMessage.id == undefined ? '' : receivedMessage.id,
                            eventType: 'res',
                            dataType: receivedMessage.dataType == undefined ? '' : receivedMessage.dataType.length,
                            result: 'fail',
                            message: '기타 오류 : 데이터 응답 실패'
                        }));
                    }

                    console.log("---------------------------------------------\n\n");
                }

                break;

            //받은 응답 데이터
            case 'res':

                //데이터 수신
                if (dataType == 'control') {

                    //전문 파싱
                    try {
                        let result = receivedMessage.result;
                        let message = receivedMessage.message;

                        console.log("id : " + id);
                        console.log("eventType : " + eventType);
                        console.log("dataType : " + dataType);
                        console.log("result : " + result);
                        console.log("message : " + message);

                    } catch (exception) {
                        console.log("필수 값 누락으로 인한 오류 : " + exception);
                    }

                    printCurrentSession();

                    console.log("---------------------------------------------\n\n");
                }
                break;
        }
    });

    ws.on('error', (error) => {
        console.log("오류로 인해 " + ws.id + " 의 연결이 종료되었습니다.\nerror : " + error);

        if (CLIENTS_ID.includes(ws.id)) {
            removeClient(ws.id);
        }

        printCurrentSession();
    });

    ws.on('close', () => {
        console.log(ws.id + " 의 연결이 종료되었습니다.");

        if (CLIENTS_ID.includes(ws.id)) {
            removeClient(ws.id);
        }

        printCurrentSession();
    });
});

//클라이언트 종료된 후 세션 리스트에서 제거
function removeClient(wsId) {

    webSocketArray = webSocketArray.filter(function (item) { return item.id !== wsId; });

    let index = CLIENTS_ID.indexOf(wsId);
    CLIENTS.splice(index,1);

    CLIENTS_ID = CLIENTS_ID.filter(function (item) { return item !== wsId; });
}

//현재 접속된 세션 리스트 출력
function printCurrentSession() {
    console.log("\n--------------- 현재 연결된 CLIENT 고유 ID ---------------");

    for (var i = 0; i < webSocketArray.length; i++) {
        console.log("[ " + CLIENTS_ID[i] + " ]");
    }
    console.log("--------------------------------------------\n");

    console.log("\n--------------- 현재 연결된 CLIENT ---------------");

    for (var i = 0; i < webSocketArray.length; i++) {
        console.log("[ " + CLIENTS[i] + " ]");
    }
    console.log("--------------------------------------------\n");
}

module.exports = app;