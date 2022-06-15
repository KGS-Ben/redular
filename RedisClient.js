const redis = require('redis');

/**
 * Promisfies the execution of a Redis command.
 * @param  {...any} args - Args to pass redis.createClient
 * @returns {Object} - A Redis client
 */
var RedisClient = function (...args) {
    var self = redis.createClient(...args);

    if (!self.hasOwnProperty('promisfyCommand')) {
        self.promisfyCommand = function (command, args) {
            return new Promise((resolve, reject) => {
                self.sendCommand(command, args, function (err, ...args) {
                    if (err) {
                        reject(err);
                    }
                    resolve(...args);
                });
            });
        };
    }

    return self;
};

module.exports = RedisClient;
