const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const WebSocketServer = require('ws').Server;

const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');

const log = require('./config/winston')

const app = express();

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

const wss = new WebSocketServer({port: 3100});

let webSocketArray = [];
let CLIENTS = [];
let CLIENTS_ID = [];

//랜덤 ID 생성
wss.getUniqueID = function () {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    }

    return s4() + s4() + '-' + s4();
};

wss.on('connection', (ws) => {

    ws.on('message', (message) => {

        //데이터 수신
        let receivedMessage = "";

        let id = "";
        let eventType = "";
        let deviceType = "";
        let deviceCategory = "";
        let deviceCategorySub = "";
        let deviceCode = "";
        let dataType = "";
        let data = "";

        try {
            receivedMessage = JSON.parse(message);

            id = receivedMessage.id;
            eventType = receivedMessage.eventType;
            dataType = receivedMessage.dataType;

            if (id == undefined) {
                throw new Error("id 누락")
            }

            if (eventType == undefined) {
                throw new Error("eventType 누락")
            }

            if (eventType != undefined) {
                if (dataType == undefined) {
                    throw new Error("dataType 누락")
                }
            }

        } catch (exception) {
            log.error("필수 값 누락으로 인한 오류 - " + exception);

            ws.send(JSON.stringify({id: '', eventType: 'res', dataType: '', result: 'fail', message: '필수값 누락'}));

            return;
        }

        switch (eventType) {

            //전송
            case 'req':

                //접속
                if (dataType == 'connect') {

                    try {

                        //M/W 접속
                        if (id.includes('M/W')) {

                            var tempMWIndexArray = [];

                            //M/W로 부터 받은 데이터를 n개의 PMS (ex. PMS1 이 n개 접속해 있을 경우) 로 전송하기 위해 클라이언트 목록에서 해당하는 모든 index 찾기
                            CLIENTS.filter( (client, index, array) => {
                                if (client.indexOf(id) != -1) {
                                    tempMWIndexArray.push(index);
                                }
                            })

                            //재접속시 기존 접속 종료 및 클라이언트 목록에서 제거
                            if (tempMWIndexArray.length > 0) {

                                for (var i=0; i<tempMWIndexArray.length; i++) {

                                    CLIENTS.splice(tempMWIndexArray[i],1);
                                    CLIENTS_ID.splice(tempMWIndexArray[i],1);
                                    webSocketArray.splice(tempMWIndexArray[i],1);
                                }
                            }

                            CLIENTS.push(id);

                            let clientId = id + "_" + wss.getUniqueID();
                            CLIENTS_ID.push(clientId);

                            ws.id = clientId;

                            webSocketArray.push(ws);
                        }

                        //PMS 접속
                        else if (id.includes('E') || id.includes('JD')) {

                            //재접속시
                            if (webSocketArray.includes(ws)) {

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
                        }

                        ws.send(JSON.stringify({id: id, eventType: 'res', dataType: dataType, result: 'success', message: ''}));

                        //printCurrentSession();

                        return;
                    } catch (exception) {
                        log.error("connected error : " + exception);

                        ws.send(JSON.stringify({id: id, eventType: 'res', dataType: 'connect', result: 'fail', message: '접속 오류'}));
                        removeClient(ws.id);

                        //ws.terminate();
                        return;
                    }
                }

                //데이터 수신
                else {

                    var controlClientId; //제어를 전송한 PMS 고유 ID -> 제어 전송한 브라우저에서만 응답을 받아야하므로 따로 관리
                    var tempClientId = "";
                    var tempClientIndexArray = [];

                    //전문 파싱
                    try {

                        // 충전기 충전 시작/종료
                        if (receivedMessage.deviceType == 'charger') {
                            deviceType = receivedMessage.deviceType;
                        }

                        // 그 외 제어
                        else {
                            deviceCategory = receivedMessage.deviceCategory;
                            deviceCategorySub = receivedMessage.deviceCategorySub;
                            deviceCode = receivedMessage.deviceCode;

                            if (deviceCategory == undefined || deviceCategory == '') {
                                throw new Error("deviceCategory 누락")
                            }

                            if (deviceCategorySub == undefined || deviceCategorySub == '') {
                                throw new Error("deviceCategorySub 누락")
                            }

                            if (deviceCode == undefined || deviceCode == '') {
                                throw new Error("deviceCode 누락")
                            }
                        }

                        data = receivedMessage.data;

                        if (data == undefined || data == '' || Object.keys(data).length === 0) {
                            throw new Error("data 누락")
                        }


                    } catch (exception) {
                        log.error("필수 값 누락으로 인한 오류 - " + exception);

                        ws.send(JSON.stringify({id: '', eventType: 'res', dataType: '', result: 'fail', message: '필수 값 누락'}));
                        return;
                    }

                    //printCurrentSession();

                    //받은 데이터를 PMS or M/W 로 다시 전송
                    try {

                        switch (dataType) {

                            //상태 데이터
                            case 'status' :

                                //내부센서 데이터일 경우
                                tempClientId = id.replace('M/W', 'E'); // 데이터 전달(M/W001 -> Server -> PMS001 or PMS001 -> Server -> M/W001) 을 위해 뒤 끝자리 번호로 구분하여 전달

                                //M/W로 부터 받은 데이터를 n개의 PMS (ex. PMS1 이 n개 접속해 있을 경우) 로 전송하기 위해 클라이언트 목록에서 해당하는 모든 index 찾기
                                CLIENTS.filter( (client, index, array) => {
                                    if (client.indexOf(tempClientId) != -1) {
                                        tempClientIndexArray.push(index);
                                    }
                                })

                                //M/W 와 매칭된 PMS가 웹소켓 서버와 접속되어 있으면 데이터 전송
                                if (tempClientIndexArray.length > 0) {
                                    //PMS 또는 M/W 가 웹소켓서버와 연결중이면 M/W -> Server -> PMS 로 상태 데이터 전송
                                    for (var i=0; i<tempClientIndexArray.length; i++) {
                                        let index = tempClientIndexArray[i];

                                        webSocketArray[index].send(JSON.stringify({
                                            id: id,
                                            eventType: eventType,
                                            deviceCategory: deviceCategory,
                                            deviceCategorySub: deviceCategorySub,
                                            deviceCode: deviceCode,
                                            dataType: dataType,
                                            data: data
                                        }));
                                    }
                                }

                                break;

                            //제어 데이터
                            case 'control' :

                                let controlData;

                                // 충전기 충전 시작/종료
                                if (receivedMessage.deviceType == 'charger') {

                                    //제어 요청을 보낼 데이터를 n개의 M/W (ex. 아마 M/W 는 무조건 1대일 것으로 추정) 로 전송하기 위해 클라이언트 목록에서 해당하는 모든 index 찾기
                                    CLIENTS.filter( (client, index, array) => {
                                        if (client.indexOf('M/W') != -1) {
                                            tempClientIndexArray.push(index);
                                        }
                                    })

                                    controlData = {
                                        id: id,
                                        eventType: eventType,
                                        deviceType: deviceType,
                                        dataType: dataType,
                                        data: data
                                    };
                                }

                                // 그 외 제어
                                else {
                                    controlClientId = ws.id;

                                    //그 외 충/방전, 시작/정지, 긴급정지 제어
                                    tempClientId = id.replace('E', 'M/W'); //제어 요청을 보낼 M/W ID

                                    //제어 요청을 보낼 데이터를 n개의 M/W (ex. 아마 M/W 는 무조건 1대일 것으로 추정) 로 전송하기 위해 클라이언트 목록에서 해당하는 모든 index 찾기
                                    CLIENTS.filter( (client, index, array) => {
                                        if (client.indexOf(tempClientId) != -1) {
                                            tempClientIndexArray.push(index);
                                        }
                                    })

                                    controlData = {
                                        id: controlClientId,
                                        eventType: eventType,
                                        deviceCategory: deviceCategory,
                                        deviceCategorySub: deviceCategorySub,
                                        deviceCode: deviceCode,
                                        dataType: dataType,
                                        data: data
                                    };
                                }

                                //접속된 M/W가 있으면 제어 전송
                                if (tempClientIndexArray.length > 0) {
                                    for (var i=0; i<tempClientIndexArray.length; i++) {
                                        //M/W 로 전송
                                        let index = tempClientIndexArray[i];

                                        webSocketArray[index].send(JSON.stringify(controlData));
                                    }
                                }

                                break;
                        }

                    } catch (exception) {
                        log.error("기타 오류 - " + exception);

                        ws.send(JSON.stringify({id: id, eventType: 'res', dataType: dataType, result: 'fail', message: '기타 오류 : 데이터 전송 실패'}));
                        return;
                    }

                    // M/W 또는 PMS 로 응답
                    try {
                        //제어가 아닌 경우에만 응답 => 제어는 미들웨어단 까지 갔다온 후 응답함

                        var responseData = {id: id, eventType: 'res', dataType: dataType, result: 'success', message: ''};

                        switch (dataType) {

                            case 'connect' :
                                ws.send(JSON.stringify(responseData));
                                break;

                            case 'status' :

                                //M/W 와 매칭된 PMS가 웹소켓 서버와 접속되어 있으면 M/W에 응답데이터 전송
                                if (tempClientIndexArray.length > 0) {
                                    ws.send(JSON.stringify(responseData));
                                }

                                break;

                            case 'control' :
                                //M/W 미접속시 PMS 로 에러 응답 보내기
                                if (tempClientIndexArray.length == 0) {
                                    ws.send(JSON.stringify({
                                            id: id,
                                            eventType: 'connectionFail',
                                            deviceCategory: '90',
                                            deviceCategorySub: '9001',
                                            deviceCode: '900101',
                                            message: 'M/W 미접속'
                                        }
                                    ));
                                }

                                break;
                        }

                    } catch (exception) {
                        log.error("기타 오류 : 데이터 응답 실패 - " + exception + ")");

                        var resId = '';
                        if (dataType == 'control') {
                            resId = ws.id;
                        } else {
                            resId = id;
                        }

                        ws.send(JSON.stringify({
                            id: resId == '' ? '' : resId,
                            eventType: 'res',
                            dataType: receivedMessage.dataType == undefined ? '' : receivedMessage.dataType.length,
                            result: 'fail',
                            message: '기타 오류 : 데이터 응답 실패'
                        }));
                    }
                }

                break;

            //받은 응답 데이터
            case 'res':

                //데이터 수신
                if (dataType == 'control') {

                    //전문 파싱
                    try {
                        // let result = receivedMessage.result;
                        let deviceCode = receivedMessage.deviceCode;
                        let data = receivedMessage.data;

                        if (deviceCode == undefined || deviceCode == '') {
                            throw new Error("deviceCode 누락")
                        }

                        var responseData = {
                            id: id,
                            eventType: eventType,
                            dataType: dataType,
                            deviceCode: deviceCode,
                            data : data
                        };

                        if (CLIENTS_ID.includes(id)) {
                            //PMS 로 전송
                            let index = CLIENTS_ID.indexOf(id);

                            webSocketArray[index].send(JSON.stringify(responseData));
                        }

                    } catch (exception) {
                        log.error("필수 값 누락으로 인한 오류 - " + exception);
                    }

                    //printCurrentSession();
                }

                break;
        }
    });

    ws.on('error', (error) => {
        log.error("오류로 인해 " + ws.id + " 의 연결이 종료되었습니다.\nerror : " + error);

        if (CLIENTS_ID.includes(ws.id)) {
            removeClient(ws.id);
        }

        //printCurrentSession();
    });

    ws.on('close', () => {

        if (CLIENTS_ID.includes(ws.id)) {
            removeClient(ws.id);
        }

        //printCurrentSession();
    });
});

//클라이언트 종료된 후 세션 리스트에서 제거
function removeClient(wsId) {

    //M/W 가 종료될 경우 PMS 로 종료 이벤트 전송
    if (wsId.indexOf("M/W") != -1) {
        sendCloseEvent(wsId);
    }

    webSocketArray = webSocketArray.filter(function (item) { return item.id !== wsId; });

    let index = CLIENTS_ID.indexOf(wsId);
    CLIENTS.splice(index,1);

    CLIENTS_ID = CLIENTS_ID.filter(function (item) { return item !== wsId; });
}

//M/W 가 종료될 경우 PMS 로 종료 이벤트 전송
function sendCloseEvent(wsId) {

    let wsIdArray = wsId.split("_");

    var tempClientIndexArray = [];

    try {
        var tempClientId = "";

        tempClientId = wsIdArray[0].replace('M/W', 'E'); // 데이터 전달(M/W001 -> Server -> PMS001 or PMS001 -> Server -> M/W001) 을 위해 뒤 끝자리 번호로 구분하여 전달

        //n개의 PMS (ex. PMS1 이 n개 접속해 있을 경우) 로 전송하기 위해 클라이언트 목록에서 해당하는 모든 index 찾기
        CLIENTS.filter( (client, index, array) => {
            if (client.indexOf(tempClientId) != -1) {
                tempClientIndexArray.push(index);
            }
        })

        //M/W 와 매칭된 PMS가 웹소켓 서버와 접속되어 있으면 데이터 전송
        if (tempClientIndexArray.length > 0) {
            //PMS 가 웹소켓서버와 연결중이면 PMS 로 상태 데이터 전송
            let data = {id: wsIdArray[0], eventType: 'connectionFail', deviceCategory: '90', deviceCategorySub: '9001', deviceCode: '900101',message: 'M/W 미접속'}

            for (var i=0; i<tempClientIndexArray.length; i++) {
                let index = tempClientIndexArray[i];

                webSocketArray[index].send(JSON.stringify(data));
            }
        }

    } catch (exception) {
        log.error("sendCloseEvent 오류 - " + exception);
    }
}

//현재 접속된 세션 리스트 출력
function printCurrentSession() {

    log.info("\n--------------- 현재 연결된 webSocketArray ---------------");

    for (var i = 0; i < webSocketArray.length; i++) {
        log.info("[ " + webSocketArray[i].id + " ]");
    }
    log.info("---------------------------------------------------");

    log.info("\n--------------- 현재 연결된 CLIENT_ID ---------------");

    for (var i = 0; i < CLIENTS_ID.length; i++) {
        log.info("[ " + CLIENTS_ID[i] + " ]");
    }
    log.info("---------------------------------------------------");

    log.info("\n--------------- 현재 연결된 CLIENT ---------------");

    for (var i = 0; i < CLIENTS.length; i++) {
        log.info("[ " + CLIENTS[i] + " ]");
    }
    log.info("---------------------------------------------------\n");
}

module.exports = app;