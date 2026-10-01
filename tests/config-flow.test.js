'use strict';

var fs = require('fs');

test('WebView removal is confirmed in-page and saved without the medication', function () {
  var html = fs.readFileSync(__dirname + '/../src/pkjs/config.html', 'utf8');
  var script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  var elements = {};
  global.document = {
    addEventListener: function () {},
    createElement: function () { return { style: {}, children: [], appendChild: function (child) { this.children.push(child); } }; },
    getElementById: function (id) {
      if (!elements[id]) elements[id] = { classList: { add: function () {}, remove: function () {} }, addEventListener: function () {} };
      return elements[id];
    },
    location: ''
  };
  global.location = { search: '' };
  var page = new Function(script + '\nrenderMedList=function(){}; return {setMeds:function(value){meds=value},deleteMed:deleteMed,saveConfig:saveConfig,buildMedItem:buildMedItem};')();
  page.setMeds([{ name: 'Keep' }, { name: 'Remove' }]);
  page.deleteMed(1);
  expect(elements['delete-title'].textContent).toBe('Remove Remove?');
  elements['delete-confirm'].onclick();
  document.getElementById('snooze-mins').value = '15';
  document.getElementById('privacy-mode').checked = false;
  document.getElementById('quiet-sleep').checked = false;
  page.saveConfig();
  var saved = JSON.parse(decodeURIComponent(document.location.split('#')[1]));
  expect(saved.meds.map(function (med) { return med.name; })).toEqual(['Keep']);
  var row = page.buildMedItem({ name: 'A', taker: 'Self', scheduleType: 'calendar', intervalDays: 2, startDate: '2025-01-01', inventory: 1, lowThreshold: 1 }, 0);
  expect(row.children[1].children[1].textContent).toContain('Low supply');
  delete global.document;
  delete global.location;
});
