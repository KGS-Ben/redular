# redular [![Build Status](https://github.com/KGS-Ben/redular/actions/workflows/main.yml/badge.svg)](https://github.com/KGS-Ben/redular/actions/workflows/main.yml)

Node.js event scheduling system powered by Redis keyspace notifications.

[![NPM](https://nodei.co/npm/@kgs-research/redular.png)](https://nodei.co/npm/@kgs-research/redular/)

Support is provided for the following:

-   Scheduling an event at a specified date
-   Scheduling an event immediately
-   Attaching data to an event
-   Instance specific event handling
-   Retrieving expiration date of an event
-   Overwriting an event
-   Deleting an event and it's data
-   Deletion of data with unmatched events
-   Event retrieval for a specified date range

# How it works

This sets keys in redis with expiry times, then using the keyspace notifications triggers handlers defined in your code.

This is useful because it means you can define handlers and trigger them from anywhere in your infrastructure.

This is an expansion upon [redular]](https://www.npmjs.com/package/redular)

# Installation

```
$ npm install redis-event-dispatcher
```

This module requires at least version 7.0 of Redis
You must enable Keyspace Notifications (Specifically expiry)

You can use the following command inside `redis-cli` to enable expiry keyspace notificaitons.

```
127.0.0.1:6379> config set notify-keyspace-events Ex
```

Alternatively you can set `autoConfig` to true in the Redular options to attempt to automatically
configure Redis.

# Options

| Key        | Value   | Default                      | Description                                                                                      |
| ---------- | ------- | ---------------------------- | ------------------------------------------------------------------------------------------------ |
| id         | String  | Random string                | The name of the Redular client, this enables events to only be handled by specific Redis clients |
| autoConfig | Boolean | false                        | When true Redular will attempt to automatically configure Redis                                  |
| dataExpiry | Number  | 30                           | Number of seconds to keep data in Redis for after event has been handled                         |
| redis      | Object  | port: 6379, host:'localhost' | See [here](https://github.com/mranney/node_redis#rediscreateclient) for more options             |

# Basic Usage

```javascript
var Redular = require('redular');

var options = {
    redis: {
        port: 6379,
        host: 'localhost',
    },
};

//Setup Redular
var myRedular = new Redular(options);

//Define a handler for an event
myRedular.defineHandler('test-event', function () {
    console.log('Test event!');
});

//Schedule the event to happen 5 seconds in the future
var date = new Date();
date.setSeconds(date.getSeconds() + 5);
myRedular.scheduleEvent('test', date);
```

# Global vs Non-Global Events

When scheduling an event you can pass in a boolean to specify if an event should be handled globally or not

```javascript
//This is a global event
myRedular.scheduleEvent('my-event', date, true);

//This is a non-global event
myRedular.scheduleEvent('my-event', date, false);
```

## Global

Global events are handled by all available handlers that match the event name and are listening for keyspace notifications.

## Non-global

This is the default event type, they are only processed by handlers defined by the same Redular instance that scheduled them.

# Passing data to handlers

It is possible to pass data to your handlers like so

```javascript
myRedular.defineHandler('greet', function (someData) {
    console.log('Hello ' + someData.name);
});

myRedular.scheduleEvent('greet', date, false, { name: 'Joe' });
```

There are a few caveats with this:  
The data is stored in Redis as a JSON string so you cannot send functions to handlers.  
Data is passed through a JSON.stringify() before being saved to Redis, bear this in mind.

# Instant events

You can send an event to Redular for immediate handling by using the instantEvent function

```javascript
myRedular.instantEvent('greet', false, { name: 'Joe' });
```

The options are the same as the scheduleEvent function but without passing a date object

# Delete a list of events

Deletion of events is done by key reference.

```js
var ids = myRedular.scheduleEvent('my-event', date, false);
await myRedular.deleteEvents([ids.event]);
```

# View an events expiration

An event's expiration can be retrieved through it's event id.

```js
var ids = myRedular.scheduleEvent('my-event', date, false);
var expiryDate = await Redular1.getEventExpiry(ids.event);
```

# View events in a specified date range

```js
myRedular.getEvents(startDate, endDate);
```

# Remove expired data

Events may expire while the application is offline, leading to data with unmatched events being stored. You may wish to run prune this data on startup.

```js
await myRedular.pruneData();
```

# Testing

```
$ npm install
$ npm test
```

Tests are built with mocha
