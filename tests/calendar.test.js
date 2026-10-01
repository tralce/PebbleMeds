'use strict';

var schedule = require('../src/pkjs/schedule');
function ts(y, m, d, h) { return Math.floor(new Date(y, m - 1, d, h).getTime() / 1000); }

test('calendar interval crosses month without moving after Taken', function () {
  var med = { scheduleType: 'calendar', startDate: '2025-01-30', startHour: 9, startMinute: 0, intervalDays: 3 };
  var from = ts(2025, 1, 30, 0), to = ts(2025, 2, 7, 0);
  expect(schedule.getNextDoseTimes(med, from, to)).toEqual([
    ts(2025, 1, 30, 9), ts(2025, 2, 2, 9), ts(2025, 2, 5, 9)
  ]);
  med.lastTakenTs = ts(2025, 2, 2, 16);
  expect(schedule.getNextDoseTimes(med, from, to)[2]).toBe(ts(2025, 2, 5, 9));
});

test('calendar interval keeps local clock time across DST', function () {
  var med = { scheduleType: 'calendar', startDate: '2025-03-08', startHour: 9, startMinute: 0, intervalDays: 1 };
  expect(schedule.getNextDoseTimes(med, ts(2025, 3, 8, 0), ts(2025, 3, 11, 0))).toEqual([
    ts(2025, 3, 8, 9), ts(2025, 3, 9, 9), ts(2025, 3, 10, 9)
  ]);
});
