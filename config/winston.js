const winston = require('winston');
const moment = require('moment');
require('winston-daily-rotate-file');
const { combine, timestamp, printf } = winston.format;

const customFormat = printf(info => {
    return `${info.timestamp} ${info.level}: ${info.message}`;
});

const directoryDate = moment().format('YYYYMM');

const logger = winston.createLogger({
    format: combine(
        timestamp({
            format: 'YYYY-MM-DD HH:mm:ss',
        }),
        customFormat,
    ),
    // 로그에 대한 형식을 정 할 수 있다.
    transports: [
        // new transports.Console(),
// 날짜별로 파일 관리할 떄 사용가능하다
        /*new winston.transports.DailyRotateFile({
            level: 'info',
            datePattern: 'YYYY-MM-DD',
            dirname: './logs',
            filename: `server_%DATE%.log`,
            maxSize: '128k',
            maxFiles: '10d',
            // maxFiles에서 벗어나서 지워질 파일을 압축파일로 변경할 것인가?
            zippedArchive: true,
        }),*/
        new winston.transports.DailyRotateFile({
            level: 'error',
            datePattern: 'YYYYMMDD',
            filename: `web-socket-error-log-%DATE%.txt`,
            dirname: 'C:\\PMS\\E002\\Logs\\WebSocket\\WebSocket-'+directoryDate,
            maxSize: '64m',
            maxFiles: '30d',
            zippedArchive: true,
        }),
    ],
});

// production 모드가 아닐 경우
// 기본 console.log 도 log파일에 남길 수 있다.
if (process.env.NODE_ENV !== 'production') {
    logger.add(
        new winston.transports.Console({
            format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
        }),
    );
}

module.exports = logger;
