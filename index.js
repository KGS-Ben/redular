var redis = require('redis');
var RedisClient = require('./RedisClient');
var extras = require('./extras');
var RedisEvent = require('./RedisEvent');
var shortId = require('shortid');

/**
 * Node.js scheduling system powered by Redis Keyspace Notifications
 * @param {Object} options - Configuration for redular
 * @constructor
 */
var Redular = function (options) {
    var _this = this;

    this.handlers = {};

    if (!options) {
        options = {};
    }

    if (!options.redis) {
        options.redis = {};
    }

    this.options = {
        id: options.id || shortId.generate(),
        autoConfig: options.autoConfig || false,
        dataExpiry: options.dataExpiry || 30,
        redis: {
            port: options.redis.port || 6379,
            host: options.redis.host || '127.0.0.1',
            password: options.redis.password || null,
            redis: options.redis.options || {},
        },
    };

    //Create redis clients
    this.redisSub = RedisClient(this.options.redis.port, this.options.redis.host, this.options.redis.options);
    this.redis = RedisClient(this.options.redis.port, this.options.redis.host, this.options.redis.options);
    this.redisInstant = RedisClient(this.options.redis.port, this.options.redis.host, this.options.redis.options);

    if (this.options.redis.password) {
        this.redisSub.auth(this.options.redis.password);
        this.redis.auth(this.options.redis.password);
        this.redisInstant.auth(this.options.redis.password);
    }

    //Attempt auto config
    if (this.options.autoConfig) {
        var config = '';
        this.redis.config('GET', 'notify-keyspace-events', function (err, data) {
            if (data) {
                config = data[1];
            }
            if (config.indexOf('E') == -1) {
                config += 'E';
            }
            if (config.indexOf('x') == -1) {
                config += 'x';
            }
            _this.redis.config('SET', 'notify-keyspace-events', config);
        });
    }

    //Listen to key expiry notifications and handle events
    var expiryListener = new RedisEvent(this.redisSub, 'expired', /redular:(.+):(.+):(.+)/);
    expiryListener.defineHandler(function (key) {
        var clientId = key[1];
        var eventName = key[2];
        var eventId = key[3];

        _this.redis.get('redular-data:' + clientId + ':' + eventName + ':' + eventId, function (err, data) {
            if (data) {
                data = JSON.parse(data);
            }
            if (clientId == _this.options.id || clientId == 'global') {
                _this.handleEvent(eventName, data);
            }
        });
    });

    //Listen to instant events and handle them
    this.redisInstant.subscribe('redular:instant');
    this.redisInstant.on('message', function (channel, message) {
        try {
            var parsedMessage = JSON.parse(message);
        } catch (e) {
            throw e;
        }
        if (parsedMessage.client == _this.options.id || parsedMessage.client == 'global') {
            _this.handleEvent(parsedMessage.event, parsedMessage.data);
        }
    });
};

Redular.prototype = {};

/**
 * Generate an event's redis keys
 * @param {String} name - The name of the event
 * @param {Boolean} global Should this event be handled by all handlers
 * @param {String} id - Unique identifier of a scheduled event
 * @returns {Object} - Event and Data keys stored in redis
 */
Redular.prototype.createEventKeys = function (name, global, id) {
    var clientId = global ? 'global' : this.options.id;
    var eventId = id ?? shortId.generate();

    return {
        event: 'redular:' + clientId + ':' + name + ':' + eventId,
        data: 'redular-data:' + clientId + ':' + name + ':' + eventId,
    };
};

/**
 * Remove a scheduled event and it's data
 * @param {String} eventKey - Event key to delete
 * @returns {Boolean} - true if deleted
 */
Redular.prototype.deleteEvent = async function (eventKey) {
    let dataKey = eventKey.replace('redular:', 'redular-data:');
    try {
        await this.redis.del([eventKey, dataKey]);
        return true;
    } catch (err) {
        return false;
    }
};

/**
 * Prunes all data that no longer has a matching key
 * @returns {Boolean} - True on success
 */
Redular.prototype.pruneData = async function () {
    try {
        let dataKeys = await this.redis.promisfyCommand('KEYS', ['redular-data:*']);
        let deletePromises = [];
        for (dataKey of dataKeys) {
            let eventKey = dataKey.replace('redular-data:', 'redular:');
            let exists = await this.redis.promisfyCommand('EXISTS', [eventKey]);
            if (!exists) {
                deletePromises.push(this.deleteEvent(eventKey));
            }
        }

        await Promise.all(deletePromises);
        return true;
    } catch (err) {
        return false;
    }
};

/**
 * Schedules an event to occur some time in the future
 * @param {String} name - The name of the event
 * @param {Date} date - Javascript date object or string accepted by new Date(), must be in the future
 * @param {Boolean} global - Should this event be handled by all handlers
 * @param {Object} data - Data to be passed to handler
 * @param {String} [id] - Unique identifier of a scheduled event
 * @returns {String} - Event ID stored in redis
 */
Redular.prototype.scheduleEvent = function (name, date, global, data, id) {
    var now = new Date();
    date = new Date(date);

    if (extras.isBefore(date, now)) {
        return;
    }

    var diff = date.getTime() - now.getTime();
    var seconds = Math.floor(diff / 1000);
    var eventKeys = this.createEventKeys(name, global, id);

    if (data) {
        try {
            data = JSON.stringify(data);
        } catch (e) {
            throw e;
        }
        this.redis.set(eventKeys.data, data);
        this.redis.expire(eventKeys.data, seconds + this.options.dataExpiry);
    }

    this.redis.set(eventKeys.event, this.options.id);
    this.redis.expire(eventKeys.event, seconds);

    return eventKeys;
};

/**
 * Emit an event to be handled immediately
 * @param {String} name - The name of the event
 * @param {Boolean} global - Should this event be handled by all handlers
 * @param {Object} data - Data to be passed to handler
 */
Redular.prototype.instantEvent = function (name, global, data) {
    var _this = this;
    var clientId = _this.options.id;
    if (global) {
        clientId = 'global';
    }
    var payload = JSON.stringify({
        event: name,
        client: clientId,
        data: data,
    });
    this.redis.publish('redular:instant', payload);
};

/**
 * This is called when an event occurs, if no handler exists nothing happens
 * @param {string} name - Name of event
 * @param {Any} data - Data to pass to the event handler
 */
Redular.prototype.handleEvent = function (name, data) {
    if (this.handlers.hasOwnProperty(name)) {
        this.handlers[name](data);
    }
};

/**
 * Define a handler for an event name
 * @param {String} name - The event's name
 * @param {Function} action - The function to be called when the event is triggered
 * @returns {String} - Name of the event handler
 */
Redular.prototype.defineHandler = function (name, action) {
    if (!extras.isFunction(action)) {
        throw 'InvalidHandlerException';
    }
    if (this.handlers.hasOwnProperty(name)) {
        throw 'HandlerAlreadyExistsException';
    }
    this.handlers[name] = action;
    return name;
};

/**
 * Returns an object with currently defined handlers
 * @returns {{}|*} - The currently defined handlers
 */
Redular.prototype.getHandlers = function () {
    return this.handlers;
};

/**
 * Removes a handler from the Redular instance
 * @param {String} name - The name of an event handler to delete
 */
Redular.prototype.deleteHandler = function (name) {
    if (this.handlers.hasOwnProperty(name)) {
        delete this.handlers[name];
    }
};

/**
 * Removes all handlers from the Redular instance
 */
Redular.prototype.deleteAllHandlers = function () {
    this.handlers = [];
};

/**
 * Returns the instance ID
 * @returns {*} - Instance ID of this redis client
 */
Redular.prototype.getClientId = function () {
    return this.options.id;
};

/**
 * Gets the date that an event expires
 * @param {String} eventKey - Key of an event to retrieve the launch time
 * @returns {Date} - Expiry date, null on fail
 */
Redular.prototype.getEventExpiry = async function (eventKey) {
    try {
        let ttl = await this.redis.promisfyCommand('PEXPIRETIME', [eventKey]);
        return new Date(ttl);
    } catch (err) {
        return null;
    }
};

/**
 * Get events that fall in the inclusive range of startDate, endDate
 * @param {Date} startDate - Starting date of range (inclusive)
 * @param {Date} endDate - Ending date of range (inclusive)
 * @returns {Array<String>} - List of event keys
 */
Redular.prototype.getEvents = async function (startDate, endDate) {
    try {
        let datesInRange = [];

        // Scan to get keys
        while(true) {
            let scanResult = await this.redis.promisfyCommand('SCAN', ['0', 'MATCH', 'redular:*']);

            // Get event keys' expiry
            let keys = scanResult[1];
            for (let eventKey of keys) {
                // Store if in range
                try {
                    let expiry = await this.getEventExpiry(eventKey);
                    if (startDate.getTime() <= expiry.getTime() && expiry.getTime() <= endDate.getTime()) {
                        datesInRange.push(eventKey);
                    }
                } catch (err) {
                    // Couldn't get expiry, ignore.
                }
            }
            
            if (scanResult[0] == '0') {
                break;
            }
        }
        return datesInRange;
    } catch (err) {
        // Failed to scan
        return [];
    }
};
module.exports = Redular;
