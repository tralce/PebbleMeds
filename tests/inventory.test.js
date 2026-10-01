'use strict';

test('Taken decrements tracked stock once and leaves calendar schedule fixed', function () {
  var handlers = {};
  var data = {};
  var sent = [];
  global.localStorage = {
    getItem: function (key) { return data[key] || null; },
    setItem: function (key, value) { data[key] = value; }
  };
  global.Pebble = {
    addEventListener: function (name, callback) { handlers[name] = callback; },
    sendAppMessage: function (message, success) { sent.push(message); success(); },
    insertTimelinePin: function (pin, success) { success(); },
    deleteTimelinePin: function () {}
  };
  var cfg = { meds: [{ medId: 'one', name: 'A', taker: 'Self', scheduleType: 'calendar', startDate: '2025-01-01', startHour: 9, startMinute: 0, intervalDays: 2, inventory: 2, lowThreshold: 1 }], settings: {} };
  data.pebble_meds_config = JSON.stringify(cfg);
  require('../src/pkjs/app');
  var event = { payload: { 10003: 'taken', 10004: 0, 10005: 1735894800 } };
  handlers.appmessage(event);
  handlers.appmessage(event);
  expect(JSON.parse(data.pebble_meds_config).meds[0]).toMatchObject({ inventory: 1, startDate: '2025-01-01', intervalDays: 2 });
  cfg.meds[0].medId = 'replacement';
  cfg.meds[0].inventory = 2;
  data.pebble_meds_config = JSON.stringify(cfg);
  handlers.appmessage(event);
  expect(JSON.parse(data.pebble_meds_config).meds[0].inventory).toBe(1);
  var longest = Object.assign({}, cfg.meds[0], { taker: '界'.repeat(24), name: '界'.repeat(32), dose: '界'.repeat(24) });
  data.pebble_meds_config = JSON.stringify({ meds: Array(16).fill(longest), settings: {} });
  sent.length = 0;
  handlers.ready();
  var payloads = [], current = '';
  sent.forEach(function (chunk) {
    if (chunk[10001] === 0) current = '';
    current += chunk[10000];
    if (chunk[10001] + 1 === chunk[10002]) payloads.push(current);
  });
  expect(payloads).toHaveLength(17);
  expect(Math.max.apply(null, payloads.map(function (json) { return Buffer.byteLength(json); }))).toBeLessThan(1024);
  expect(JSON.parse(payloads[16]).count).toBe(16);
  delete global.Pebble;
  delete global.localStorage;
});
