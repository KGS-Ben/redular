/**
 * Creates a event listener for redis keyspace notifications
 * @param {Redis} client - An instance of node-redis client to connect with
 * @param {String} event - The type of keyspace event
 * @param {RegExp} keyPattern - RegExp pattern to match for key names
 * @constructor
 */
var RedisEvent = function (client, event, keyPattern) {
    var _this = this;

    this.redis = client;
    this.redis.client('setname', 'event-listener');

    this.keyPattern = keyPattern;

    this.handler = null;

    this.redis.subscribe('__keyevent@0__:' + event);
    this.redis.on('message', function (event, key) {
        var match = _this.keyPattern.exec(key);
        if (match != null) {
            if (_this.handler != null) {
                _this.handler(match);
            } else {
                throw 'NoHandlerException';
            }
        }
    });
};

RedisEvent.prototype = {};

/**
 * Sets the handler for the event
 * @param {Function} handler - The function that is called when the event occurs.
 */
RedisEvent.prototype.defineHandler = function (handler) {
    this.handler = handler;
};

module.exports = RedisEvent;
