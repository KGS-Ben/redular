const { expect } = require('chai');
var redular = require('../index');

/**
 * All test cases should have a unique event
 * to minimize previous test case interactions.
 */
describe('Redular', function () {
    var options = {
        autoConfig: true,
    };

    var Redular1 = new redular(options);
    var Redular2 = new redular(options);

    this.afterEach(function () {
        Redular1.deleteAllHandlers();
        Redular2.deleteAllHandlers();
        setTimeout(() => {}, 2000);
    });

    it('should be able to define a handler', function (done) {
        Redular1.defineHandler('testHandler', function () {});
        var handlers = Redular1.getHandlers();
        if (handlers.hasOwnProperty('testHandler')) {
            done();
        } else {
            throw 'Handler not defined';
        }
    });

    it('should be able to schedule and handle an event', function (done) {
        Redular1.defineHandler('scheduleTestEvent', function () {
            done();
        });

        var now = new Date();
        Redular1.scheduleEvent('scheduleTestEvent', now.setSeconds(now.getSeconds() + 2));
    });

    it('should not handle events with different names', function (done) {
        Redular1.defineHandler('invalidNameTestEvent', function () {
            throw 'Invalid name';
        });

        var now = new Date();
        Redular1.scheduleEvent('differentNameTestEvent', now.setSeconds(now.getSeconds() + 2));

        setTimeout(function () {
            done();
        }, 1500);
    });

    it('should not handle events for other Redular instances', function (done) {
        Redular1.defineHandler('otherInstanceTestEvent', function () {
            done();
        });

        Redular2.defineHandler('otherInstanceTestEvent', function () {
            throw 'Wrong instance';
        });

        var now = new Date();
        Redular1.scheduleEvent('otherInstanceTestEvent', now.setSeconds(now.getSeconds() + 2));
    });

    it('should generate unique ids for all instances', function (done) {
        if (Redular1.getClientId() != Redular2.getClientId) {
            done();
        } else {
            throw 'Ids should not match';
        }
    });

    it('should not be able to define multiple handlers with the same name', function (done) {
        Redular1.defineHandler('sameNameTestEvent', function () {});
        try {
            Redular1.defineHandler('sameNameTestEvent', function () {});
        } catch (e) {
            done();
        }
    });

    it('should handle global events from other instances', function (done) {
        Redular2.defineHandler('globalTestEvent', function () {
            done();
        });

        var now = new Date();
        Redular1.scheduleEvent('globalTestEvent', now.setSeconds(now.getSeconds() + 2), true);
    });

    it('should be able to pass data to events', function (done) {
        Redular1.defineHandler('dataTestEvent', function (data) {
            if (data?.test == 'Hello') {
                done();
            } else {
                throw 'No data';
            }
        });

        var now = new Date();
        Redular1.scheduleEvent('dataTestEvent', now.setSeconds(now.getSeconds() + 2), false, { test: 'Hello' });
    });

    it('should be able to handle an instant event', function (done) {
        Redular1.defineHandler('instantTestEvent', function () {
            done();
        });

        Redular1.instantEvent('instantTestEvent');
    });

    it('should be able to name events', function (done) {
        var eventKeys = Redular1.createEventKeys('namingTestEvent', false);
        expect(eventKeys).to.be.a('object');
        expect(eventKeys).keys(['event', 'data']);
        expect(eventKeys.event)
            .be.a('string')
            .satisfies((eventKey) => {
                return eventKey.startsWith('redular:') && eventKey.includes('namingTestEvent');
            });
        expect(eventKeys.data)
            .be.a('string')
            .satisfies((dataKey) => {
                return dataKey.startsWith('redular-data:') && dataKey.includes('namingTestEvent');
            });

        eventKeys = Redular1.createEventKeys('namingTestEvent2', true, 'testId');
        expect(eventKeys.event)
            .be.a('string')
            .satisfies((eventKey) => {
                return eventKey.startsWith('redular:') && eventKey.includes('namingTestEvent2') && eventKey.includes('global') && eventKey.includes('testId');
            });
        expect(eventKeys.data)
            .be.a('string')
            .satisfies((dataKey) => {
                return dataKey.startsWith('redular-data:') && dataKey.includes('namingTestEvent2') && dataKey.includes('global') && dataKey.includes('testId');
            });
        done();
    });

    it('should return the event keys after scheduling an event', function (done) {
        Redular1.defineHandler('eventKeyTestEvent', function () {});

        var now = new Date();
        now.setSeconds(now.getSeconds() + 2);
        var eventKeys = Redular1.scheduleEvent('eventKeyTestEvent', now, false);
        expect(eventKeys).to.be.a('object');
        expect(eventKeys).keys(['event', 'data']);
        expect(eventKeys.event).to.be.a('string');
        expect(eventKeys.data).to.be.a('string');
        done();
    });

    it('should be able to return the expiry date of an event', async function () {
        Redular1.defineHandler('peekExpiryTestEvent', function () {});

        var eventDate = new Date();
        eventDate.setSeconds(eventDate.getSeconds() + 2);

        var eventKeys = Redular1.scheduleEvent('peekExpiryTestEvent', eventDate, false);
        try {
            var expiryDate = await Redular1.getEventExpiry(eventKeys.event);

            var expectedExpiry = new Date();
            expectedExpiry.setSeconds(expectedExpiry.getSeconds() + 2);

            expect(expiryDate).to.be.within(eventDate, expectedExpiry);
        } catch (err) {
            throw new Error('Failed to get event expiration');
        }
    });

    it("should be able to overwrite an event and it's data", function (done) {
        Redular1.defineHandler('overwriteEvent', function (data) {
            if (data.valid) {
                done();
            } else {
                throw new Error('Incorrect handler called');
            }
        });

        var now = new Date();
        Redular1.scheduleEvent('overwriteEvent', now.setHours(now.getHours() + 1), false, { valid: false }, 'tester');

        now = new Date();
        id = Redular1.scheduleEvent('overwriteEvent', now.setSeconds(now.getSeconds() + 2), false, { valid: true }, 'tester');
    });

    it("should be able to delete an event and it's data", function (done) {
        Redular1.defineHandler('deleteEvent', function (data) {
            throw new Error('Handler should not be called');
        });

        var now = new Date();
        var eventKeys = Redular1.scheduleEvent('deleteEvent', now.setSeconds(now.getSeconds() + 2), false, { valid: true }, 'tester');
        Redular1.deleteEvent(eventKeys.event);

        setTimeout(() => {
            done();
        }, 3000);
    });

    it('should be able to prune all data without a matching event', async function () {
        Redular1.redis.set('redular-data:pruneTest', JSON.stringify({ valid: false }));
        await Redular1.pruneData();
        let data = await Redular1.redis.get('redular-data:pruneTest', function (error, data) {
            if (data) {
                throw new Error('Data should have been pruned!');
            }
        });
    });

    it('should not prune data with matching event keys', async function () {
        Redular1.defineHandler('pruneTestEvent', function (data) {
            if (!data.valid) {
                throw new Error('Incorrect handler called');
            }
        });

        var now = new Date();
        let eventId = Redular1.scheduleEvent('pruneTestEvent', now.setSeconds(now.getSeconds() + 1), false, { valid: true }, 'tester');
        await Redular1.pruneData();
        Redular1.deleteEvent(eventId.event);
    });

    it('should be able to retrieve events that are within a date range', async function() {
        let validEventIds = []
        var startDate = new Date();

        var now = new Date();
        validEventIds.push(Redular1.scheduleEvent('validDateRangeTestEvent', now.setSeconds(now.getSeconds() + 1), false, { valid: true }).event);
        validEventIds.push(Redular1.scheduleEvent('validDateRangeTestEvent', now.setSeconds(now.getSeconds() + 1), false, { valid: true }).event);

        var endDate = new Date();
        endDate.setSeconds(endDate.getSeconds() + 2);

        let eventsInRange = await Redular1.getEvents(startDate, endDate);
        expect(eventsInRange).to.be.an('array');
        validEventIds.sort();
        eventsInRange.sort();
        
        expect(eventsInRange).to.have.deep.members(validEventIds);
        // Expire long events from this test
        setTimeout(() => {}, 4);
    });

    it('should not return dates which are not within a date range', async function () {
        let invalidEvents = [];
        let validEvents = [];
        var startDate = new Date();

        var now = new Date();
        validEvents.push(Redular1.scheduleEvent('invalidDateRangeTestEvent', now.setSeconds(now.getSeconds() + 10), false, null, 'valid').event);

        // This event will expire before retrieving events
        now = new Date();
        invalidEvents.push(Redular1.scheduleEvent('invalidDateRangeTestEvent', now.setSeconds(now.getSeconds() + 1), false, null, 'expire').event);
        
        // This event should be out of range
        now = new Date();
        invalidEvents.push(Redular1.scheduleEvent('invalidDateRangeTestEvent', now.setHours(now.getHours() + 10), false, null, 'future').event);

        var endDate = new Date();
        endDate.setMinutes(endDate.getMinutes() + 1);

        setTimeout(async () => {
            let eventsInRange = await Redular1.getEvents(startDate, endDate);
            expect(eventsInRange).to.have.deep.members(validEvents);
        }, 1500)
    });
});
