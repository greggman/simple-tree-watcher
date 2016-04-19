'use strict';
const debug = require('../lib/debug')('event-recorder');

function EventRecorder(watcher) {
  var events;
  var checkFn;

  function record(event, name, stat, oldStat) {
    debug("event:", event, name, stat.size);
    //if (oldStat) {
    //  debug(oldStat.size === stat.size   ? "sizes same" : "sizes different");
    //  debug(oldStat.mtime === stat.mtime ? "mtime same" : "mtime different");
    //  debug("diff :", "oldsize:", oldStat.size, "newsize:", stat.size, "oldtime:", oldStat.mtime, "newtime:", stat.mtime);
    //}
    var e = {
      event: event,
      name: name,
      stat: stat,
      oldStat: oldStat,
      id: events.length,
    };
    events.push(e);
    checkFn(e);
  }

  function clear() {
    events = [];
    checkFn = () => {};
  }

  function setCheck(fn) {
    checkFn = fn;
  }

  function getEvents(type, filename) {
    if (type && filename) {
      return events.filter(function(e) {
        return e.event === type && e.name === filename;
      });
    } else if (type) {
      return events.filter(function(e) {
        return e.event === type;
      });
    }
    return events;
  }

  function showEvents() {
    events.forEach((e) => {
      debug(e.id, e.event, e.name);
    });
  }

  this.clear = clear;
  this.getEvents = getEvents;
  this.record = record;
  this.setCheck = setCheck;
  this.showEvents = showEvents;

  clear();

  watcher.on('add',    function(n, s, o) { record('add',    n, s, o); });  // eslint-disable-line
  watcher.on('create', function(n, s, o) { record('create', n, s, o); });  // eslint-disable-line
  watcher.on('change', function(n, s, o) { record('change', n, s, o); });  // eslint-disable-line
  watcher.on('remove', function(n, s, o) { record('remove', n, s, o); });  // eslint-disable-line
}

module.exports = EventRecorder;


