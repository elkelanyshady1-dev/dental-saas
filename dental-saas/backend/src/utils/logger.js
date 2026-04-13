const pino = require('pino');

const isProd = process.env.NODE_ENV === 'production';

const logger = pino({
    level: isProd ? 'info' : 'debug',
    redact: {
        paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            'payload.stripe_secret',
            'payload.jwt',
            'details.stripe_secret',
            'details.jwt'
        ],
        remove: true
    },
    ...(isProd ? {} : {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
            },
        }
    })
});

module.exports = logger;
