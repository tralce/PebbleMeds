// PebbleMeds — PebbleKit JS entry point
//
// Responsibilities:
//   - Launch the HTML config page when the user opens settings
//   - Receive config from the page and forward it to the watch via AppMessage
//   - Receive action events from the watch (Taken/Skipped/Snooze) and log them
//   - Periodically push Timeline pins for the next 48 hours
//   - Sync medication list to watch on app launch

'use strict';

console.log('PebbleMeds JS starting');

// ---------------------------------------------------------------------------
// Constants and Globals
// ---------------------------------------------------------------------------
var CONFIG_URL = 'http://172.21.2.3:8000/src/pkjs/config.html';
var CHUNK_SIZE = 200;

var KEY_CONFIG_JSON  = 10000;
var KEY_CHUNK_INDEX  = 10001;
var KEY_CHUNK_TOTAL  = 10002;
var KEY_ACTION       = 10003;
var KEY_MED_INDEX    = 10004;
var KEY_DOSE_TS      = 10005;
var KEY_REQUEST_SYNC = 10006;

try {
  if (typeof Pebble !== 'undefined' && Pebble.MessageKey) {
    KEY_CONFIG_JSON  = Pebble.MessageKey.ConfigJson  || KEY_CONFIG_JSON;
    KEY_CHUNK_INDEX  = Pebble.MessageKey.ChunkIndex  || KEY_CHUNK_INDEX;
    KEY_CHUNK_TOTAL  = Pebble.MessageKey.ChunkTotal  || KEY_CHUNK_TOTAL;
    KEY_ACTION       = Pebble.MessageKey.Action       || KEY_ACTION;
    KEY_MED_INDEX    = Pebble.MessageKey.MedIndex    || KEY_MED_INDEX;
    KEY_DOSE_TS      = Pebble.MessageKey.DoseTs      || KEY_DOSE_TS;
    KEY_REQUEST_SYNC = Pebble.MessageKey.RequestSync || KEY_REQUEST_SYNC;
  }
} catch (e) {
  console.log('Error initializing message keys: ' + e.message);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function saveConfig(cfg) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.setItem) {
      localStorage.setItem('pebble_meds_config', JSON.stringify(cfg));
    }
  } catch (e) {
    console.log('localStorage: saveConfig failed: ' + e.message);
  }
}

function loadConfig() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem) {
      var raw = localStorage.getItem('pebble_meds_config');
      if (!raw) return null;
      return JSON.parse(raw);
    }
  } catch (e) {
    console.log('localStorage: loadConfig failed: ' + e.message);
  }
  return null;
}

function logDoseAction(action, medIndex, ts, medId) {
  var key = 'pebble_meds_log';
  var log = [];
  try {
    if (typeof localStorage !== 'undefined') {
      var raw = localStorage.getItem(key);
      if (raw) { try { log = JSON.parse(raw); } catch (e) {} }
      if (action === 'taken' && log.some(function (entry) {
        return entry.ts === ts && entry.status === 'taken' &&
          (medId ? entry.medId === medId : entry.medIndex === medIndex);
      })) return false;
      log.push({ medIndex: medIndex, medId: medId, ts: ts, status: action });
      if (log.length > 500) log = log.slice(log.length - 500);
      localStorage.setItem(key, JSON.stringify(log));
    }
  } catch (e) {
    console.log('localStorage: logDoseAction failed: ' + e.message);
  }
  return true;
}

function getConfigUrl() {
  try {
    var cfg = loadConfig();
    if (cfg) {
      return CONFIG_URL + '#' + encodeURIComponent(JSON.stringify(cfg));
    }
  } catch (e) {
    console.log('Error building config URL: ' + e.message);
  }
  return CONFIG_URL;
}

function sendConfigToWatch(cfg) {
  try {
    var fields = { taker: 'a', name: 'n', dose: 'd', scheduleType: 's', times: 't',
      intervalHours: 'H', startHour: 'h', startMinute: 'm', lastTakenTs: 'L',
      weekMask: 'w', shape: 'p', color: 'c', vibePattern: 'v',
      intervalDays: 'I', startDate: 'D', inventory: 'i', lowThreshold: 'l' };
    var watchMeds = (cfg.meds || []).slice(0, 16).map(function (med) {
      var copy = {};
      Object.keys(fields).forEach(function (key) {
        if (med[key] !== undefined) copy[fields[key]] = key === 'times'
          ? med.times.map(function (time) { return time.h * 60 + time.m; }) : med[key];
      });
      return copy;
    });
    var settings = cfg.settings || {};
    var finalMessage = { count: watchMeds.length, settings: {
      snoozeMins: settings.snoozeMins, privacyMode: settings.privacyMode,
      quietDuringSleep: settings.quietDuringSleep
    } };
    var messages = watchMeds.map(function (med, index) { return { index: index, med: med }; });
    messages.push(finalMessage);
    var chunks = [];
    messages.forEach(function (message) {
      var json = JSON.stringify(message);
      var total = Math.ceil(json.length / CHUNK_SIZE);
      for (var i = 0; i < json.length; i += CHUNK_SIZE) {
        chunks.push({ text: json.slice(i, i + CHUNK_SIZE), index: i / CHUNK_SIZE, total: total });
      }
    });
    console.log('Sending config in ' + chunks.length + ' chunk(s)');

    var sendChunk = function(idx) {
      if (idx >= chunks.length) {
        console.log('Config send complete');
        return;
      }
      var msg = {};
      msg[KEY_CONFIG_JSON] = chunks[idx].text;
      msg[KEY_CHUNK_INDEX] = chunks[idx].index;
      msg[KEY_CHUNK_TOTAL] = chunks[idx].total;
      Pebble.sendAppMessage(
        msg,
        function () { sendChunk(idx + 1); },
        function (err) { console.log('Chunk ' + idx + ' failed: ' + JSON.stringify(err)); }
      );
    };

    sendChunk(0);
  } catch (e) {
    console.log('sendConfigToWatch failed: ' + e.message);
  }
}

// ---------------------------------------------------------------------------
// App Events
// ---------------------------------------------------------------------------
Pebble.addEventListener('ready', function () {
  console.log('PebbleMeds JS ready');
  try {
    var cfg = loadConfig();
    if (cfg) {
      sendConfigToWatch(cfg);
      var timeline = require('./timeline');
      if (timeline && timeline.pushTimelinePins) {
        timeline.pushTimelinePins(cfg);
      }
    }
  } catch (e) {
    console.log('Ready handler failed: ' + e.message);
  }
});

Pebble.addEventListener('showConfiguration', function () {
  console.log('showConfiguration event');
  try {
    var url = getConfigUrl();
    console.log('Opening config URL: ' + url);
    Pebble.openURL(url);
  } catch (e) {
    console.log('Failed to open configuration: ' + e.message);
  }
});

Pebble.addEventListener('webviewclosed', function (e) {
  console.log('webviewclosed event');
  if (!e.response || e.response === 'CANCELLED') return;

  var cfg;
  try {
    var response = e.response;
    if (typeof response === 'string' && response.indexOf('%') !== -1) {
      response = decodeURIComponent(response);
    }
    cfg = (typeof response === 'string') ? JSON.parse(response) : response;
  } catch (err) {
    console.log('Failed to parse config response: ' + err);
    return;
  }

  if (cfg) {
    saveConfig(cfg);
    sendConfigToWatch(cfg);
    try {
      var timeline = require('./timeline');
      if (timeline && timeline.pushTimelinePins) {
        timeline.pushTimelinePins(cfg);
      }
    } catch (e) {
      console.log('Timeline error: ' + e.message);
    }
  }
});

Pebble.addEventListener('appmessage', function (e) {
  console.log('appmessage event');
  try {
    var msg = e.payload;
    if (msg.hasOwnProperty(KEY_REQUEST_SYNC)) {
      var cfg = loadConfig();
      if (cfg) sendConfigToWatch(cfg);
      return;
    }

    if (msg.hasOwnProperty(KEY_ACTION)) {
      var action   = msg[KEY_ACTION];
      var medIndex = msg[KEY_MED_INDEX];
      var doseTs   = msg[KEY_DOSE_TS] || Math.floor(Date.now() / 1000);

      var cfg = loadConfig();
      var med = cfg && cfg.meds && cfg.meds[medIndex];
      var firstAction = logDoseAction(action, medIndex, doseTs, med && med.medId);

      if (action === 'taken' && firstAction) {
        if (med) {
          if (med.scheduleType === 'interval') med.lastTakenTs = Math.floor(Date.now() / 1000);
          if (med.inventory > 0) med.inventory--;
          saveConfig(cfg);
          sendConfigToWatch(cfg);
          try {
            var timeline = require('./timeline');
            if (timeline && timeline.pushTimelinePins) {
              timeline.pushTimelinePins(cfg);
            }
          } catch (e) {}
        }
      }
    }
  } catch (e) {
    console.log('AppMessage handler failed: ' + e.message);
  }
});
