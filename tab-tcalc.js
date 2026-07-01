// tab-tcalc.js — Smart T-Calc: goal-based PK optimizer

// ── Profile state (persisted to backend + localStorage cache) ─────────────────

var _tcp = {
  totalT:              '',
  shbg:                '',
  birthYear:           '',
  measuredFT:          '',
  currentDoseMgWk:     '',
  targetFT:            '',
  inventory:           [],  // [{compId, totalMg, costTotal}, ...]
  cycleType:           'trt',
  cycleDays:           168,
  preferredFreqDays:   'auto',
  overrideDoseMgWk:    '',
  overrideIntervalDays: '',
  planCompId:          '',  // kept for backward-compat with saved profiles; ignored
  backboneStartDay:    0,   // days into cycle before first backbone injection (default 0)
  manualLog:           []   // [{compId, doseMg, date}, ...] — manual injection history
};

var _tcpSessionLoaded = false;
var _tcCurrentPlan    = null;
var _tcExtraCatalog   = [];   // extra compounds fetched from /trt-catalog at runtime
var _tcAgeMissing     = false; // true when user-settings returned but no user_age found
var _tcBwOpen         = false; // whether the bloodwork panel is expanded
var _tcExpandedSeries = {};   // seriesId → true when series card is expanded for editing

// ── Frequency options ─────────────────────────────────────────────────────────

var _TC_FREQ_OPTS = [
  {label:'Daily',           days:1},
  {label:'EOD',             days:2},
  {label:'3×/week',         days:7/3},
  {label:'2×/week (E3.5D)',days:3.5},
  {label:'Weekly',          days:7},
  {label:'Every 10 days',   days:10},
  {label:'Every 2 weeks',   days:14},
  {label:'Every 3 weeks',   days:21},
  {label:'Every 6 weeks',   days:42},
  {label:'Every 8 weeks',   days:56},
  {label:'Every 10 weeks',  days:70},
  {label:'Every 12 weeks',  days:84}
];

var _TC_CYCLE_OPTS = [
  {label:'8 weeks',   days:56},
  {label:'12 weeks',  days:84},
  {label:'16 weeks',  days:112},
  {label:'20 weeks',  days:140},
  {label:'24 weeks',  days:168},
  {label:'6 months',  days:182},
  {label:'9 months',  days:273},
  {label:'12 months', days:365}
];

// ── Backend sync ──────────────────────────────────────────────────────────────

function _tcLoadProfile() {
  var cached = getData('tc-profile');
  if (cached) {
    try { Object.assign(_tcp, JSON.parse(cached)); } catch(e) {}
  }
  // Fetch extra catalog entries (no auth required — generic PK reference data)
  fetch(AGENT_URL + '/trt-catalog')
    .then(function(r){ return r.ok ? r.json() : []; })
    .then(function(d) {
      if (!Array.isArray(d)) return;
      _tcExtraCatalog = d;
      buildTCalc();
      // If the inventory overlay was opened before this fetch resolved, refresh it
      if (document.getElementById('tc-inv-overlay')) _tcOpenInventory();
    })
    .catch(function(){});
  var h = (typeof authHeaders === 'function') ? authHeaders() : null;
  if (!h) return;
  fetch(AGENT_URL + '/tcalc-profile', {headers: h})
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(d) {
      if (!d || Object.keys(d).length === 0) return;
      Object.assign(_tcp, d);
      setData('tc-profile', JSON.stringify(_tcp));
      buildTCalc();
    })
    .catch(function(){});
  // Derive birth year from onboarding age in /user-settings
  fetch(AGENT_URL + '/user-settings', {headers: h})
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(s) {
      var age = s && parseInt(s['user_age']);
      if (age && age > 0) {
        _tcp.birthYear = new Date().getFullYear() - age;
        _tcAgeMissing = false;
      } else {
        _tcAgeMissing = true;
      }
      buildTCalc();
    })
    .catch(function(){ _tcAgeMissing = true; buildTCalc(); });
}

function _tcSaveProfile() {
  setData('tc-profile', JSON.stringify(_tcp));
  var h = (typeof authHeaders === 'function') ? authHeaders() : null;
  if (!h) return;
  fetch(AGENT_URL + '/tcalc-profile', {
    method: 'POST',
    headers: Object.assign({'Content-Type':'application/json'}, h),
    body: JSON.stringify(_tcp)
  }).catch(function(){});
}

// ── Compound helpers ──────────────────────────────────────────────────────────

function _tcCompInfo(compId) {
  if (compId === 'hcg') {
    return {id:'hcg', name:'HCG', dot:'#44cc88', halfLifeDays:2.5, halfLifeStr:'~60 hours'};
  }
  // Extra catalog entries (fetched from backend) take priority over hardcoded fallbacks
  var extra = _tcExtraCatalog.find(function(x){ return x.id === compId; });
  if (extra) {
    return {
      id:              compId,
      name:            extra.name,
      dot:             extra.dot,
      halfLifeDays:    extra.halfLifeDays || 1,
      halfLifeStr:     extra.halfLife || '',
      bioavailability: extra.bioavailability || 1,
      maxDailyDoseMg:  extra.maxDailyDoseMg || null,
      usageNote:       extra.usageNote || ''
    };
  }
  var cat   = (typeof TRT_CAT   !== 'undefined') ? TRT_CAT.find(function(x){ return x.id === compId; })   : null;
  var guide = (typeof TRT_GUIDE !== 'undefined') ? TRT_GUIDE[compId] : null;
  var hl    = guide ? (_parseHalfLifeDays(guide.halfLife) || 7) : 7;
  return {
    id:           compId,
    name:         cat   ? cat.name  : compId,
    dot:          cat   ? cat.dot   : '#e8a020',
    halfLifeDays: hl,
    halfLifeStr:  guide ? guide.halfLife : ''
  };
}

// ── Vermeulen free-T calculator ───────────────────────────────────────────────

function _tcVermeulenFT(totalT, shbg) {
  if (!totalT || !shbg || totalT <= 0 || shbg <= 0) return null;
  var K_SHBG = 5.97e8, K_ALB = 3.6e4;
  var alb    = 4.3 / 66500 * 10;
  var denom  = 1 + K_SHBG * (shbg * 1e-9) + K_ALB * alb;
  return (totalT * 1e-9 / denom) * 1e12;
}

// ── PK helpers ────────────────────────────────────────────────────────────────

function _tcKa(halfLifeDays) {
  // Absorption rate constant (1/day) for 1-compartment depot model.
  // Ka values calibrated to known Tmax per ester class:
  //   Nebido (hl≥20d) → tmax≈7d | Cypionate (hl≥9d) → tmax≈2d
  //   Enanthate (hl≥3d) → tmax≈1d | Propionate (hl≥1d) → tmax≈0.4d | Gel → near-immediate
  if (halfLifeDays >= 20) return 0.40;
  if (halfLifeDays >= 9)  return 1.50;
  if (halfLifeDays >= 3)  return 3.00;
  if (halfLifeDays >= 1)  return 8.00;
  return 15.0;
}

function _tcPkConc(dose, ka, ke, dt) {
  // 1-compartment first-order absorption model:
  // C(dt) = dose * ka/(ka-ke) * (exp(-ke*dt) - exp(-ka*dt))
  if (dt < 0) return 0;
  if (Math.abs(ka - ke) < 1e-9) return dose * ke * dt * Math.exp(-ke * dt);
  return dose * ka / (ka - ke) * (Math.exp(-ke * dt) - Math.exp(-ka * dt));
}

function _tcPeakTroughRatio(halfLifeDays, intervalDays) {
  return Math.exp(Math.LN2 / halfLifeDays * intervalDays);
}

function _tcSnapInterval(targetDays) {
  var opts = [1, 2, 7/3, 3.5, 7, 10, 14, 21, 42, 56, 70, 84];
  var best = opts[0], bestDist = Infinity;
  opts.forEach(function(d) {
    var dist = Math.abs(d - targetDays);
    if (dist < bestDist) { bestDist = dist; best = d; }
  });
  return best;
}

function _tcIntervalLabel(days) {
  var opt = _TC_FREQ_OPTS.find(function(f){ return Math.abs(f.days - days) < 0.25; });
  return opt ? opt.label : days.toFixed(1) + '-day interval';
}

// ── Inventory overlay ─────────────────────────────────────────────────────────

function _tcCategorizeComps() {
  var cats = [
    {label:'SHORT ESTERS',  borderColor:'#e8a020', ids:[]},
    {label:'MEDIUM ESTERS', borderColor:'#6688cc', ids:[]},
    {label:'LONG ESTERS',   borderColor:'#8866cc', ids:[]},
    {label:'DEPOT',         borderColor:'#44aa88', ids:[]}
  ];
  var trtIds = ((typeof TRT_CAT !== 'undefined') ? TRT_CAT.map(function(c){ return c.id; }) : [])
    .concat(_tcExtraCatalog.map(function(c){ return c.id; }));
  trtIds.forEach(function(id) {
    var hl = _tcCompInfo(id).halfLifeDays;
    if      (hl < 3)  cats[0].ids.push(id);
    else if (hl < 9)  cats[1].ids.push(id);
    else if (hl < 20) cats[2].ids.push(id);
    else              cats[3].ids.push(id);
  });
  return cats.filter(function(c){ return c.ids.length > 0; });
}

function _tcOpenInventory() {
  var equippedIds = _tcp.inventory.map(function(i){ return i.compId; });
  var cats = _tcCategorizeComps();

  var iSty = 'background:#0a0a0a;border:1px solid #2a2a2a;border-radius:6px;padding:8px 10px;color:#ccc;font-size:14px;font-family:inherit;outline:none;width:100%;box-sizing:border-box';

  function cardHtml(id, isHCG) {
    var cd  = _tcCompInfo(id);
    var inv = _tcp.inventory.find(function(i){ return i.compId === id; });
    var eq  = !!inv;
    var unit = isHCG ? 'IU' : 'mg';

    if (eq) {
      return '<div style="background:#0a0a0a;border:2px solid ' + cd.dot + ';border-radius:14px;padding:14px;box-shadow:0 0 20px ' + cd.dot + '33">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">' +
          '<div>' +
            '<div style="display:flex;align-items:center;gap:7px">' +
              '<span style="width:9px;height:9px;border-radius:50%;background:' + cd.dot + ';display:inline-block;flex-shrink:0;box-shadow:0 0 8px ' + cd.dot + '"></span>' +
              '<span style="font-size:13px;font-weight:800;color:#fff;letter-spacing:0.3px">' + _esc(cd.name) + '</span>' +
            '</div>' +
            (cd.halfLifeStr ? '<div style="font-size:10px;color:#555;margin-top:3px;padding-left:16px">t½ ' + _esc(cd.halfLifeStr) + '</div>' : '') +
          '</div>' +
          '<button onclick="_tcToggleCompound(\'' + id + '\')" style="background:none;border:none;color:#444;font-size:20px;cursor:pointer;padding:0;line-height:1;margin-top:-2px">✕</button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
          '<div>' +
            '<div style="font-size:9px;color:#444;letter-spacing:1.2px;font-weight:700;margin-bottom:5px">STOCK (' + unit + ')</div>' +
            '<input type="number" min="0" max="99999" step="' + (isHCG ? '1000' : '100') + '" value="' + _esc(inv.totalMg || '') + '" placeholder="' + (isHCG ? '5000' : '1000') + '" onchange="_tcInvSetField(\'' + id + '\',\'totalMg\',this.value)" style="' + iSty + '">' +
          '</div>' +
          '<div>' +
            '<div style="font-size:9px;color:#444;letter-spacing:1.2px;font-weight:700;margin-bottom:5px">TOTAL PAID</div>' +
            '<input type="number" min="0" step="0.01" value="' + _esc(inv.costTotal || '') + '" placeholder="e.g. 45" onchange="_tcInvSetField(\'' + id + '\',\'costTotal\',this.value)" style="' + iSty + '">' +
          '</div>' +
        '</div>' +
        (cd.usageNote ? '<div style="font-size:10px;color:#555;margin-top:10px;line-height:1.4">' + _esc(cd.usageNote) + '</div>' : '') +
      '</div>';
    } else {
      return '<div onclick="_tcToggleCompound(\'' + id + '\')" style="background:#0d0d0d;border:1px solid #1e1e1e;border-radius:14px;padding:14px;cursor:pointer;position:relative;overflow:hidden">' +
        '<div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,' + cd.dot + '44,transparent)"></div>' +
        '<span style="width:8px;height:8px;border-radius:50%;background:' + cd.dot + '55;display:inline-block"></span>' +
        '<div style="font-size:13px;font-weight:800;color:#555;margin-top:8px;letter-spacing:0.3px">' + _esc(cd.name) + '</div>' +
        (cd.halfLifeStr ? '<div style="font-size:10px;color:#333;margin-top:3px">t½ ' + _esc(cd.halfLifeStr) + '</div>' : '') +
        '<div style="font-size:9px;color:#2a2a2a;letter-spacing:1.2px;font-weight:700;margin-top:10px">TAP TO EQUIP</div>' +
      '</div>';
    }
  }

  var html = '<div id="tc-inv-overlay" onclick="if(event.target===this)_tcCloseInventory()" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.92);backdrop-filter:blur(16px);overflow-y:auto;-webkit-overflow-scrolling:touch">' +
    '<div style="max-width:480px;margin:0 auto;padding:16px 16px 60px">';

  // Header
  html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0 24px">' +
    '<div>' +
      '<div style="font-size:11px;color:#444;letter-spacing:2px;font-weight:700;margin-bottom:4px">T-CALC</div>' +
      '<div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:0.5px">⚗ COMPOUND INVENTORY</div>' +
      '<div style="font-size:12px;color:#444;margin-top:4px">' + equippedIds.length + ' compound' + (equippedIds.length === 1 ? '' : 's') + ' equipped</div>' +
    '</div>' +
    '<button onclick="_tcCloseInventory()" style="background:#111;border:1px solid #333;border-radius:10px;color:#777;font-size:24px;cursor:pointer;padding:4px 14px;line-height:1;font-family:inherit">×</button>' +
  '</div>';

  // Compound categories
  cats.forEach(function(cat) {
    html += '<div style="display:flex;align-items:center;gap:10px;margin:20px 0 12px">' +
      '<div style="height:1px;width:16px;background:' + cat.borderColor + '44"></div>' +
      '<div style="font-size:10px;color:#444;letter-spacing:1.8px;font-weight:700;white-space:nowrap">' + cat.label + '</div>' +
      '<div style="flex:1;height:1px;background:' + cat.borderColor + '22"></div>' +
    '</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
    cat.ids.forEach(function(id) { html += cardHtml(id, false); });
    html += '</div>';
  });

  // Support / HCG
  html += '<div style="display:flex;align-items:center;gap:10px;margin:20px 0 12px">' +
    '<div style="height:1px;width:16px;background:#44cc8844"></div>' +
    '<div style="font-size:10px;color:#444;letter-spacing:1.8px;font-weight:700">SUPPORT</div>' +
    '<div style="flex:1;height:1px;background:#44cc8822"></div>' +
  '</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  html += cardHtml('hcg', true);
  html += '</div>';

  html += '</div></div>';

  var existing = document.getElementById('tc-inv-overlay');
  if (existing) existing.remove();
  var tmp = document.createElement('div');
  tmp.innerHTML = html;
  document.body.appendChild(tmp.firstChild);
}

function _tcCloseInventory() {
  var el = document.getElementById('tc-inv-overlay');
  if (el) el.remove();
  buildTCalc();
}

function _tcToggleCompound(compId) {
  var idx = _tcp.inventory.findIndex(function(i){ return i.compId === compId; });
  if (idx === -1) {
    _tcp.inventory.push({compId: compId, totalMg: '', costTotal: ''});
  } else {
    _tcp.inventory.splice(idx, 1);
  }
  _tcSaveProfile();
  _tcOpenInventory();
  buildTCalc();
}

function _tcInvSetField(compId, field, val) {
  var inv = _tcp.inventory.find(function(i){ return i.compId === compId; });
  if (!inv) return;
  inv[field] = val;
  _tcSaveProfile();
  buildTCalc();
}

// ── Manual injection log overlay ──────────────────────────────────────────────

function _tcManualComps() {
  var ids = [];
  ((typeof TRT_CAT !== 'undefined') ? TRT_CAT : []).forEach(function(c) {
    if (c.id !== 'hcg') ids.push(c.id);
  });
  _tcExtraCatalog.forEach(function(c) {
    if (c.id !== 'hcg' && ids.indexOf(c.id) === -1) ids.push(c.id);
  });
  return ids;
}

function _tcOpenManualLog() {
  var log   = _tcp.manualLog || [];
  var comps = _tcManualComps();
  var iSty  = 'background:#0a0a0a;border:1px solid #2a2a2a;border-radius:6px;padding:7px 10px;color:#ccc;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box';

  var html = '<div id="tc-log-overlay" onclick="if(event.target===this)_tcCloseManualLog()" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.92);backdrop-filter:blur(16px);overflow-y:auto;-webkit-overflow-scrolling:touch">' +
    '<div style="max-width:480px;margin:0 auto;padding:16px 16px 60px">';

  html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0 24px">' +
    '<div>' +
      '<div style="font-size:11px;color:#444;letter-spacing:2px;font-weight:700;margin-bottom:4px">T-CALC</div>' +
      '<div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:0.5px">INJECTION LOG</div>' +
      '<div style="font-size:12px;color:#444;margin-top:4px">' + log.length + ' injection' + (log.length === 1 ? '' : 's') + ' logged</div>' +
    '</div>' +
    '<button onclick="_tcCloseManualLog()" style="background:#111;border:1px solid #333;border-radius:10px;color:#777;font-size:24px;cursor:pointer;padding:4px 14px;line-height:1;font-family:inherit">×</button>' +
  '</div>';

  if (log.length > 0) {
    html += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">';
    log.forEach(function(entry, idx) {
      var cd = _tcCompInfo(entry.compId || (comps[0] || 'topical'));
      var compSelect = '<select onchange="_tcSetManualField(' + idx + ',\'compId\',this.value)" style="' + iSty + ';flex:1;min-width:0">';
      comps.forEach(function(id) {
        var n = _tcCompInfo(id).name;
        compSelect += '<option value="' + _esc(id) + '"' + (entry.compId === id ? ' selected' : '') + '>' + _esc(n) + '</option>';
      });
      compSelect += '</select>';

      html += '<div style="background:#0d0d0d;border:1px solid #1e1e1e;border-radius:12px;padding:12px">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">' +
          '<span style="width:8px;height:8px;border-radius:50%;background:' + cd.dot + ';display:inline-block;flex-shrink:0"></span>' +
          compSelect +
          '<button onclick="_tcConfirmRemove(' + idx + ')" style="background:none;border:none;color:#444;font-size:18px;cursor:pointer;padding:0;flex-shrink:0;line-height:1">✕</button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
          '<div><div style="font-size:9px;color:#444;letter-spacing:1.2px;font-weight:700;margin-bottom:5px">DOSE (mg)</div>' +
          '<input type="number" min="0" max="9999" step="1" value="' + _esc(String(entry.doseMg || '')) + '" placeholder="e.g. 100" onchange="_tcSetManualField(' + idx + ',\'doseMg\',+this.value)" style="' + iSty + ';width:100%"></div>' +
          '<div><div style="font-size:9px;color:#444;letter-spacing:1.2px;font-weight:700;margin-bottom:5px">DATE</div>' +
          '<input type="date" value="' + _esc(entry.date || '') + '" onchange="_tcSetManualField(' + idx + ',\'date\',this.value)" style="' + iSty + ';width:100%"></div>' +
        '</div>' +
      '</div>';
    });
    html += '</div>';
  } else {
    html += '<div style="text-align:center;padding:32px 0;color:#444;font-size:13px">No injections logged yet.<br><span style="font-size:12px;color:#2a2a2a">Tap + ADD INJECTION to start.</span></div>';
  }

  html += '<button onclick="_tcAddManualEntry()" style="width:100%;background:#0d0d0d;border:1px dashed #2a2a2a;border-radius:10px;color:#555;font-size:13px;font-weight:700;padding:13px;cursor:pointer;font-family:inherit;letter-spacing:0.5px;margin-bottom:20px">+ ADD INJECTION</button>';

  var validLog = log.filter(function(e){ return e.date && e.doseMg && parseFloat(e.doseMg) > 0; });
  if (validLog.length > 0) {
    html += '<div style="background:#0a0a0a;border:1px solid #1e1e1e;border-radius:14px;padding:14px">' +
      '<div style="font-size:10px;color:#444;letter-spacing:1.8px;font-weight:700;margin-bottom:10px">PLASMA CURVE</div>' +
      '<canvas id="tc-manual-chart" style="width:100%;display:block;"></canvas>' +
    '</div>';
  }

  html += '</div></div>';

  var existing = document.getElementById('tc-log-overlay');
  if (existing) existing.remove();
  var tmp = document.createElement('div');
  tmp.innerHTML = html;
  document.body.appendChild(tmp.firstChild);

  if (validLog.length > 0) {
    requestAnimationFrame(function() { _tcDrawManualChart('tc-manual-chart', validLog); });
  }
}

function _tcCloseManualLog() {
  var el = document.getElementById('tc-log-overlay');
  if (el) el.remove();
}

var _tcAddSheet = null;

function _tcAddManualEntry() { _tcShowAddSheet(); }

function _tcShowAddSheet() {
  if (document.getElementById('tc-add-sheet-overlay')) return;
  var comps = _tcManualComps();
  if (!comps.length) return;
  var defaultComp = comps[0];
  var defaultDate;
  var existingDates = (_tcp.manualLog||[]).map(function(e){ return e.date; }).filter(Boolean).sort();
  if (existingDates.length > 0) {
    var p = existingDates[existingDates.length - 1].split('-');
    var next = new Date(+p[0], +p[1] - 1, +p[2] + 1);
    defaultDate = next.getFullYear() + '-' +
      String(next.getMonth() + 1).padStart(2, '0') + '-' +
      String(next.getDate()).padStart(2, '0');
  } else {
    defaultDate = new Date().toISOString().slice(0, 10);
  }
  _tcAddSheet = {isSeries: false};
  var iSty = 'background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:11px 13px;color:var(--text);font-size:15px;font-family:inherit;outline:none;width:100%;box-sizing:border-box';
  var lSty = 'font-size:11px;font-weight:700;letter-spacing:0.8px;color:var(--muted);text-transform:uppercase;margin-bottom:8px;display:block';
  var compOpts = comps.map(function(id){ var n=_tcCompInfo(id).name; return '<option value="'+_esc(id)+'">'+_esc(n)+'</option>'; }).join('');
  var ol = document.createElement('div');
  ol.id = 'tc-add-sheet-overlay';
  ol.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:flex-end;justify-content:center';
  ol.onclick = function(e){ if(e.target===ol)_tcCloseAddSheet(); };
  ol.innerHTML =
    '<div style="background:var(--surface);border-radius:16px 16px 0 0;width:100%;max-width:480px;padding:20px 20px 36px;max-height:85vh;overflow-y:auto">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
    '<div style="font-family:Bebas Neue,sans-serif;font-size:20px;letter-spacing:1px;color:var(--text)">ADD INJECTION</div>' +
    '<button onclick="_tcCloseAddSheet()" style="background:none;border:none;color:var(--muted2);font-size:22px;cursor:pointer;line-height:1">×</button>' +
    '</div>' +
    '<div style="margin-bottom:14px"><label style="'+lSty+'">COMPOUND</label>' +
    '<select id="tc-as-comp" style="'+iSty+'">'+compOpts+'</select></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">' +
    '<div><label style="'+lSty+'">DOSE (mg)</label>' +
    '<input id="tc-as-dose" type="number" min="0" max="9999" step="1" placeholder="e.g. 100" style="'+iSty+'"></div>' +
    '<div><label style="'+lSty+'">DATE</label>' +
    '<input id="tc-as-date" type="date" value="'+_esc(defaultDate)+'" style="'+iSty+'"></div>' +
    '</div>' +
    '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:14px">' +
    '<div onclick="_tcAsToggle(false)" style="padding:12px 16px;cursor:pointer;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border)">' +
    '<div id="tc-as-r1" style="width:16px;height:16px;border-radius:50%;border:2px solid var(--accent);background:var(--accent);flex-shrink:0"></div>' +
    '<div><div style="font-size:13px;font-weight:600;color:var(--text)">Single injection</div><div style="font-size:11px;color:var(--muted2)">One entry logged</div></div>' +
    '</div>' +
    '<div onclick="_tcAsToggle(true)" style="padding:12px 16px;cursor:pointer;display:flex;align-items:center;gap:10px">' +
    '<div id="tc-as-r2" style="width:16px;height:16px;border-radius:50%;border:2px solid var(--border);flex-shrink:0"></div>' +
    '<div><div style="font-size:13px;font-weight:600;color:var(--text)">Recurring series</div><div style="font-size:11px;color:var(--muted2)">Log multiple injections at once</div></div>' +
    '</div>' +
    '</div>' +
    '<div id="tc-as-series-opts" style="display:none;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px">' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
    '<div><label style="'+lSty+'">INJECTIONS</label>' +
    '<input id="tc-as-count" type="number" min="2" max="365" step="1" value="10" style="'+iSty+'"></div>' +
    '<div><label style="'+lSty+'">EVERY (DAYS)</label>' +
    '<input id="tc-as-interval" type="number" min="1" max="90" step="1" value="2" style="'+iSty+'"></div>' +
    '</div></div>' +
    '<button onclick="_tcConfirmAddSheet()" style="width:100%;background:linear-gradient(135deg,#6688cc,#4466aa);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:800;letter-spacing:0.5px;padding:14px;cursor:pointer;font-family:inherit">ADD</button>' +
    '</div>';
  document.body.appendChild(ol);
}

function _tcAsToggle(isSeries) {
  var r1=document.getElementById('tc-as-r1'); var r2=document.getElementById('tc-as-r2');
  var opts=document.getElementById('tc-as-series-opts');
  if(!r1||!r2||!opts)return;
  if(isSeries){r1.style.background='';r1.style.borderColor='var(--border)';r2.style.background='var(--accent)';r2.style.borderColor='var(--accent)';opts.style.display='block';}
  else{r1.style.background='var(--accent)';r1.style.borderColor='var(--accent)';r2.style.background='';r2.style.borderColor='var(--border)';opts.style.display='none';}
  if(_tcAddSheet)_tcAddSheet.isSeries=isSeries;
}

function _tcCloseAddSheet() {
  var ol=document.getElementById('tc-add-sheet-overlay');if(ol)ol.remove();_tcAddSheet=null;
}

function _tcConfirmAddSheet() {
  var compEl=document.getElementById('tc-as-comp');
  var doseEl=document.getElementById('tc-as-dose');
  var dateEl=document.getElementById('tc-as-date');
  var countEl=document.getElementById('tc-as-count');
  var intervalEl=document.getElementById('tc-as-interval');
  var compId=compEl?compEl.value:'';
  var doseMg=doseEl?parseFloat(doseEl.value):0;
  var startDate=dateEl?dateEl.value:'';
  var isSeries=_tcAddSheet&&_tcAddSheet.isSeries;
  if(!compId||!startDate||!(doseMg>0)){return;}
  if(!_tcp.manualLog)_tcp.manualLog=[];
  if(!isSeries){
    _tcp.manualLog.push({compId:compId,doseMg:doseMg,date:startDate});
  }else{
    var count=countEl?Math.max(2,parseInt(countEl.value)||10):10;
    var intervalDays=intervalEl?Math.max(1,parseInt(intervalEl.value)||2):2;
    var seriesId=Date.now().toString(36);
    var sp=startDate.split('-');
    for(var i=0;i<count;i++){
      var sd=new Date(+sp[0],+sp[1]-1,+sp[2]+i*intervalDays);
      var ds=sd.getFullYear()+'-'+String(sd.getMonth()+1).padStart(2,'0')+'-'+String(sd.getDate()).padStart(2,'0');
      _tcp.manualLog.push({compId:compId,doseMg:doseMg,date:ds,seriesId:seriesId});
    }
  }
  _tcp.manualLog.sort(function(a,b){return(a.date||'')<(b.date||'')?-1:(a.date||'')>(b.date||'')?1:0;});
  _tcSaveProfile();_tcCloseAddSheet();buildTCalc();
}

function _tcConfirmRemove(idx) {
  var ex = document.getElementById('tc-del-confirm');
  if (ex) ex.remove();
  var entry = _tcp.manualLog && _tcp.manualLog[idx];
  var sid = entry && entry.seriesId;
  var seriesCount = sid ? _tcp.manualLog.filter(function(e){ return e.seriesId===sid; }).length : 0;
  var d = document.createElement('div');
  d.id = 'tc-del-confirm';
  d.style.cssText = 'position:fixed;inset:0;background:#000c;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  d.innerHTML =
    '<div style="background:#141414;border:1px solid #2a2a2a;border-radius:16px;padding:24px;max-width:300px;width:100%;text-align:center">' +
      '<div style="font-size:13px;color:var(--accent);font-weight:700;letter-spacing:0.5px;margin-bottom:6px">Delete this injection?</div>' +
      '<div style="font-size:12px;color:#555;margin-bottom:20px">This cannot be undone.</div>' +
      (sid && seriesCount > 1 ?
        '<div style="display:flex;flex-direction:column;gap:8px">' +
        '<button onclick="document.getElementById(\'tc-del-confirm\').remove();_tcRemoveManualEntry(' + idx + ')" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;color:#ccc;font-size:13px;font-weight:700;padding:12px;cursor:pointer;font-family:inherit">Delete this entry only</button>' +
        '<button onclick="document.getElementById(\'tc-del-confirm\').remove();_tcRemoveSeries(\''+sid+'\')" style="background:var(--danger,#ef4444);border:none;border-radius:10px;color:#fff;font-size:13px;font-weight:700;padding:12px;cursor:pointer;font-family:inherit">Delete all '+seriesCount+' in series</button>' +
        '<button onclick="document.getElementById(\'tc-del-confirm\').remove()" style="background:none;border:none;color:#555;font-size:13px;cursor:pointer;padding:8px;font-family:inherit">Cancel</button>' +
        '</div>'
      :
        '<div style="display:flex;gap:10px">' +
        '<button onclick="document.getElementById(\'tc-del-confirm\').remove()" style="flex:1;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;color:#888;font-size:13px;font-weight:700;padding:12px;cursor:pointer;font-family:inherit">Cancel</button>' +
        '<button onclick="document.getElementById(\'tc-del-confirm\').remove();_tcRemoveManualEntry(' + idx + ')" style="flex:1;background:var(--accent);border:none;border-radius:10px;color:#000;font-size:13px;font-weight:700;padding:12px;cursor:pointer;font-family:inherit">Delete</button>' +
        '</div>'
      ) +
    '</div>';
  document.body.appendChild(d);
}

function _tcRemoveManualEntry(idx) {
  if (!_tcp.manualLog) return;
  _tcp.manualLog.splice(idx, 1);
  _tcSaveProfile();
  buildTCalc();
}

function _tcRemoveSeries(seriesId) {
  if (!_tcp.manualLog || !seriesId) return;
  _tcp.manualLog = _tcp.manualLog.filter(function(e){ return e.seriesId !== seriesId; });
  delete _tcExpandedSeries[seriesId];
  _tcSaveProfile();
  buildTCalc();
}

function _tcToggleSeriesExpand(sid) {
  _tcExpandedSeries[sid] = !_tcExpandedSeries[sid];
  buildTCalc();
}

function _tcConfirmRemoveSeries(sid) {
  var ex = document.getElementById('tc-del-confirm');
  if (ex) ex.remove();
  var count = _tcp.manualLog ? _tcp.manualLog.filter(function(e){ return e.seriesId===sid; }).length : 0;
  var d = document.createElement('div');
  d.id = 'tc-del-confirm';
  d.style.cssText = 'position:fixed;inset:0;background:#000c;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  d.innerHTML =
    '<div style="background:#141414;border:1px solid #2a2a2a;border-radius:16px;padding:24px;max-width:300px;width:100%;text-align:center">' +
      '<div style="font-size:13px;color:var(--accent);font-weight:700;letter-spacing:0.5px;margin-bottom:6px">Delete this series?</div>' +
      '<div style="font-size:12px;color:#555;margin-bottom:20px">' + count + ' injections will be removed. This cannot be undone.</div>' +
      '<div style="display:flex;gap:10px">' +
      '<button onclick="document.getElementById(\'tc-del-confirm\').remove()" style="flex:1;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;color:#888;font-size:13px;font-weight:700;padding:12px;cursor:pointer;font-family:inherit">Cancel</button>' +
      '<button onclick="document.getElementById(\'tc-del-confirm\').remove();_tcRemoveSeries(\'' + sid + '\')" style="flex:1;background:var(--danger,#ef4444);border:none;border-radius:10px;color:#fff;font-size:13px;font-weight:700;padding:12px;cursor:pointer;font-family:inherit">Delete</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(d);
}

function _tcSetManualField(idx, field, val) {
  if (!_tcp.manualLog || !_tcp.manualLog[idx]) return;
  _tcp.manualLog[idx][field] = val;
  _tcSaveProfile();
  if (field === 'compId') {
    buildTCalc();
  } else {
    var validLog = _tcp.manualLog.filter(function(e){ return e.date && e.doseMg && parseFloat(e.doseMg) > 0; });
    if (validLog.length > 0 && document.getElementById('tc-main-chart')) {
      _tcDrawManualChart('tc-main-chart', validLog);
    } else {
      buildTCalc();
    }
  }
}

// Toggle bloodwork panel open/closed
function _tcToggleBw() {
  _tcBwOpen = !_tcBwOpen;
  buildTCalc();
}

// Age-stratified free T reference midpoints (pmol/L) for when no bloodwork is entered.
// Values are approximate midpoints of published male reference ranges.
function _tcDefaultFT(birthYear) {
  if (!birthYear) return 350;
  var age = new Date().getFullYear() - birthYear;
  if (age < 25) return 450;
  if (age < 35) return 400;
  if (age < 45) return 340;
  if (age < 55) return 280;
  if (age < 65) return 220;
  return 180;
}

function _tcDrawManualChart(canvasId, log) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || !log || log.length === 0) return;

  var sorted = log.slice().sort(function(a, b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  var firstDate = new Date(sorted[0].date);
  var lastDate  = new Date(sorted[sorted.length - 1].date);

  var maxHL = 1;
  sorted.forEach(function(e) {
    var hl = (_tcCompInfo(e.compId).halfLifeDays) || 1;
    if (hl > maxHL) maxHL = hl;
  });
  var washoutDays = Math.ceil(4.3 * maxHL);

  var totalDays = Math.ceil((lastDate - firstDate) / 86400000) + washoutDays + 1;
  var total = new Float64Array(totalDays + 1);

  sorted.forEach(function(e) {
    var cd    = _tcCompInfo(e.compId);
    var hl    = cd.halfLifeDays || 1;
    var bioav = cd.bioavailability || 1;
    var ke    = Math.LN2 / hl;
    var ka    = _tcKa(hl);
    var injectDay = Math.round((new Date(e.date) - firstDate) / 86400000);
    var absorbed  = parseFloat(e.doseMg) * bioav;
    for (var t = injectDay; t <= totalDays; t++) {
      total[t] += _tcPkConc(absorbed, ka, ke, t - injectDay);
    }
  });

  // Calibrated pmol/L scale using settled peak/trough over the log window (not washout tail)
  var _mftNum  = parseFloat(_tcp.measuredFT)      || _tcDefaultFT(parseInt(_tcp.birthYear) || 0);
  var _curDose = parseFloat(_tcp.currentDoseMgWk) || 0;
  var _logDays = totalDays - washoutDays - 1;
  var _midLog  = Math.max(0, Math.floor(_logDays / 2));
  var _logPeak = 0, _logTrough = Infinity;
  for (var _ls = _midLog; _ls <= _logDays; _ls++) {
    if (total[_ls] > _logPeak)   _logPeak   = total[_ls];
    if (total[_ls] < _logTrough) _logTrough = total[_ls];
  }
  if (_logPeak === 0) { for (var _ls2 = 0; _ls2 <= totalDays; _ls2++) if (total[_ls2] > _logPeak) _logPeak = total[_ls2]; }
  if (_logTrough === Infinity) _logTrough = _logPeak;
  var _logMean = (_logPeak + _logTrough) / 2 || _logPeak;
  // Always compute absorbed totals — needed for both calFT and warm-start
  var _totalAbsMg = 0;
  sorted.forEach(function(e) { _totalAbsMg += parseFloat(e.doseMg) * ((_tcCompInfo(e.compId).bioavailability) || 1); });
  var _effMgWk = _logDays > 0 ? _totalAbsMg / _logDays * 7 : 0;

  var calFT = null;
  if (_mftNum > 0 && _logMean > 0) {
    if (_curDose > 0) {
      calFT = _mftNum * (_effMgWk || _curDose) / _curDose / _logMean;
    } else {
      calFT = _mftNum / _logMean;
    }
  }

  // Warm-start: pre-fill curve so the chart starts at the user's measured free T.
  if (calFT && _mftNum > 0) {
    if (_curDose > 0) {
      // Known prior dose: model each compound's residual from a steady-state protocol.
      var _wsGroups = {}, _wsTotalAbsMg = 0;
      sorted.forEach(function(e) {
        var _wsBioav = (_tcCompInfo(e.compId).bioavailability || 1);
        var _wsAbs   = parseFloat(e.doseMg) * _wsBioav;
        _wsTotalAbsMg += _wsAbs;
        _wsGroups[e.compId] = (_wsGroups[e.compId] || 0) + _wsAbs;
      });
      if (_wsTotalAbsMg > 0) {
        Object.keys(_wsGroups).forEach(function(wsId) {
          var wsCd    = _tcCompInfo(wsId);
          var wsHl    = wsCd.halfLifeDays || 1;
          var wsBioav = wsCd.bioavailability || 1;
          var wsKe    = Math.LN2 / wsHl;
          var wsKa    = _tcKa(wsHl);
          var wsIv    = wsHl >= 20 ? 84 : wsHl >= 9 ? 14 : wsHl >= 3 ? 3.5 : 1;
          var wsCompFrac   = _wsGroups[wsId] / _wsTotalAbsMg;
          var wsCompWk     = _curDose * wsCompFrac;
          var wsDosePerInj = wsCompWk * wsIv / 7 * wsBioav;
          var wsLookback   = Math.ceil(wsHl * 10 / wsIv);
          for (var _wsk = 1; _wsk <= wsLookback; _wsk++) {
            var _wsDt = _wsk * wsIv;
            for (var _wst = 0; _wst <= totalDays; _wst++) {
              total[_wst] += _tcPkConc(wsDosePerInj, wsKa, wsKe, _wst + _wsDt);
            }
          }
        });
      }
    } else {
      // The log is the complete injection history — no prior protocol residual exists.
      // Add a constant endogenous baseline (continuous production) so the chart starts
      // at _mftNum and rises above it as injections accumulate.  A decaying exponential
      // here was wrong: it represented a fictional prior-dose residual that drained away
      // at peak time (making the peak read too low) and post-dose (making levels appear
      // to crash faster than the compound's half-life actually dictates).
      for (var _blt = 0; _blt <= totalDays; _blt++) {
        total[_blt] += _logMean;
      }
    }
  }

  var scale     = calFT || 1;
  var unitLabel = calFT ? 'pmol/L' : 'mg';

  var dpr  = window.devicePixelRatio || 1;
  var cssW = canvas.offsetWidth || 300;
  var cssH = 150;
  canvas.width  = cssW * dpr; canvas.height = cssH * dpr;
  canvas.style.width  = cssW + 'px'; canvas.style.height = cssH + 'px';
  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  var PAD = {top:12, right:14, bottom:26, left:52};
  var cW  = cssW - PAD.left - PAD.right;
  var cH  = cssH - PAD.top  - PAD.bottom;

  var maxV = 0;
  for (var i = 0; i <= totalDays; i++) if (total[i] * scale > maxV) maxV = total[i] * scale;
  if (_mftNum && calFT && _mftNum > maxV) maxV = _mftNum * 1.1;
  if (!maxV) { ctx.fillStyle = '#555'; ctx.font = '11px DM Sans,sans-serif'; ctx.fillText('No data', 10, 40); return; }
  var vMax = maxV * 1.1;

  // Clip x-axis to where free T last crosses back down to baseline (the interesting area)
  var xDays = totalDays;
  if (_mftNum && calFT) {
    for (var _xi = totalDays; _xi > 0; _xi--) {
      if (total[_xi] * scale >= _mftNum) { xDays = _xi; break; }
    }
  }

  // Find peak within visible window
  var peakV = 0, peakT = 0;
  for (var _pi = 0; _pi <= xDays; _pi++) {
    var _pv = total[_pi] * scale;
    if (_pv > peakV) { peakV = _pv; peakT = _pi; }
  }

  function xOf(t){ return PAD.left + (t / xDays) * cW; }
  function yOf(v){ return PAD.top  + cH - (v / vMax) * cH; }

  var gridStep = xDays <= 28 ? 7 : xDays <= 84 ? 14 : 28;
  ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.5;
  for (var dg = 0; dg <= xDays; dg += gridStep) {
    var gx = xOf(dg);
    ctx.beginPath(); ctx.moveTo(gx, PAD.top); ctx.lineTo(gx, PAD.top + cH); ctx.stroke();
  }

  // Measured FT reference line
  if (_mftNum && calFT) {
    var _refY = yOf(_mftNum);
    ctx.strokeStyle = '#e8a02099'; ctx.lineWidth = 1; ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(PAD.left, _refY); ctx.lineTo(PAD.left + cW, _refY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#e8a020bb'; ctx.font = '8px DM Sans,sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(Math.round(_mftNum), PAD.left + 3, _refY - 2);
  }

  ctx.fillStyle = '#555'; ctx.font = '9px DM Sans,sans-serif'; ctx.textAlign = 'right';
  for (var ti = 0; ti <= 3; ti++) {
    var ty = PAD.top + (cH / 3) * ti;
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(PAD.left, ty); ctx.lineTo(PAD.left + cW, ty); ctx.stroke();
    var tv = vMax * (1 - ti / 3);
    ctx.fillText(calFT ? Math.round(tv) : (tv >= 100 ? Math.round(tv) : tv >= 10 ? tv.toFixed(1) : tv.toFixed(2)), PAD.left - 4, ty + 3);
  }
  ctx.save(); ctx.translate(10, PAD.top + cH / 2); ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center'; ctx.fillStyle = '#444'; ctx.font = '8px DM Sans,sans-serif';
  ctx.fillText(unitLabel, 0, 0); ctx.restore();

  var lineColor = _tcCompInfo(sorted[0].compId).dot || '#e8a020';

  // Peak highlight line + y-axis label
  if (calFT && peakV > 0 && peakV > (_mftNum || 0) * 1.05) {
    var _pkY = yOf(peakV);
    ctx.strokeStyle = lineColor + 'aa'; ctx.lineWidth = 1; ctx.setLineDash([4,3]);
    ctx.beginPath(); ctx.moveTo(PAD.left, _pkY); ctx.lineTo(PAD.left + cW, _pkY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = lineColor; ctx.font = 'bold 8px DM Sans,sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(Math.round(peakV), PAD.left - 4, _pkY + 3);
  }

  var grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + cH);
  grad.addColorStop(0, lineColor + '55'); grad.addColorStop(1, lineColor + '00');
  ctx.beginPath(); ctx.moveTo(xOf(0), PAD.top + cH);
  for (var t2 = 0; t2 <= xDays; t2++) ctx.lineTo(xOf(t2), yOf(total[t2] * scale || 0));
  ctx.lineTo(xOf(xDays), PAD.top + cH);
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath(); ctx.moveTo(xOf(0), yOf(total[0] * scale || 0));
  for (var t3 = 1; t3 <= xDays; t3++) ctx.lineTo(xOf(t3), yOf(total[t3] * scale || 0));
  ctx.strokeStyle = lineColor; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();

  sorted.forEach(function(e) {
    var injectDay = Math.round((new Date(e.date) - firstDate) / 86400000);
    var dot = _tcCompInfo(e.compId).dot || lineColor;
    var ix = xOf(injectDay);
    ctx.strokeStyle = dot + '99'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ix, PAD.top + cH); ctx.lineTo(ix, PAD.top + cH + 5); ctx.stroke();
  });

  ctx.fillStyle = '#555'; ctx.font = '9px DM Sans,sans-serif'; ctx.textAlign = 'center';
  var labelEvery = xDays <= 28 ? 7 : xDays <= 84 ? 14 : 28;
  for (var dl = 0; dl <= xDays; dl += labelEvery) {
    var lx = xOf(dl);
    if (lx > PAD.left + cW + 8) break;
    var labelDate = new Date(firstDate.getTime() + dl * 86400000);
    var _MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var lbl = labelDate.getDate() + ' ' + _MONTHS[labelDate.getMonth()];
    ctx.fillText(lbl, lx, PAD.top + cH + 18);
  }
}

// ── OPTIMIZER ─────────────────────────────────────────────────────────────────

function _tcOptimize() {
  var result = {plan: null, suggestions: [], warnings: [], calibration: {}};

  var ttNum   = parseFloat(_tcp.totalT)          || 0;
  var shbgNum = parseFloat(_tcp.shbg)            || 0;
  var mftNum  = parseFloat(_tcp.measuredFT)      || 0;
  var curDose = parseFloat(_tcp.currentDoseMgWk) || 0;
  var tgtFT   = parseFloat(_tcp.targetFT)        || 0;

  var vermFT  = (ttNum > 0 && shbgNum > 0) ? _tcVermeulenFT(ttNum, shbgNum) : null;
  var ftFrac  = null;
  if (mftNum > 0 && ttNum > 0)    ftFrac = mftNum / (ttNum * 1000);
  else if (vermFT && ttNum > 0)   ftFrac = vermFT  / (ttNum * 1000);

  var targetTT = (tgtFT > 0 && ftFrac > 0) ? (tgtFT / ftFrac / 1000) : null;
  var mgToNmol = (curDose > 0 && ttNum > 0) ? (ttNum / curDose) : null;

  result.calibration = {ttNum:ttNum, shbgNum:shbgNum, mftNum:mftNum, curDose:curDose,
                        tgtFT:tgtFT, vermFT:vermFT, ftFrac:ftFrac,
                        targetTT:targetTT, mgToNmol:mgToNmol};

  // Always suggest HCG
  var hasHCG = _tcp.inventory.some(function(inv){ return inv.compId === 'hcg'; });
  result.suggestions.push(hasHCG ? {
    type: 'hcg-included', priority: 0,
    message: 'HCG in inventory — run 500–1000 IU 2×/week alongside TRT to maintain testicular function.'
  } : {
    type: 'hcg-missing', priority: 1,
    message: 'Add HCG (500–1000 IU 2×/week) to prevent testicular atrophy and preserve intratesticular testosterone.'
  });

  var testInv = _tcp.inventory.filter(function(inv){ return inv.compId !== 'hcg'; });

  if (testInv.length === 0) {
    result.suggestions.push({
      type: 'no-inventory', priority: 2,
      message: 'Open the inventory above to equip your compounds — T-Calc will build an optimised multi-ester schedule.'
    });
    return result;
  }

  // ── Determine total weekly dose ───────────────────────────────────────────
  var autoMgPerWeek, doseSource;
  if (targetTT !== null && mgToNmol !== null) {
    autoMgPerWeek = targetTT / mgToNmol;
    doseSource    = 'personal';
  } else if (targetTT !== null) {
    autoMgPerWeek = targetTT / 0.20;
    doseSource    = 'population';
    result.suggestions.push({
      type: 'calibration-estimate', priority: 3,
      message: 'Dose uses population average (±50% accuracy). Add your current weekly dose alongside bloodwork for a personal calculation.'
    });
  } else if (tgtFT > 0) {
    autoMgPerWeek = 150;
    doseSource    = 'default';
    result.suggestions.push({
      type: 'need-bloodwork', priority: 2,
      message: 'Enter Total T from bloodwork to enable personal dosing. Showing 150 mg/wk as a starting point.'
    });
  } else {
    autoMgPerWeek = 150;
    doseSource    = 'default';
    result.suggestions.push({
      type: 'using-default', priority: 3,
      message: 'Enter bloodwork + target free T for a personalised dose. Showing 150 mg/wk as a starting point.'
    });
  }

  autoMgPerWeek = Math.max(50, Math.min(600, autoMgPerWeek));

  var ovDose     = parseFloat(_tcp.overrideDoseMgWk)    || 0;
  var ovInterval = parseFloat(_tcp.overrideIntervalDays) || 0;
  var isManual   = ovDose > 0 || ovInterval > 0;
  if (isManual) doseSource = 'manual';
  var reqMgPerWeek = ovDose > 0 ? ovDose : autoMgPerWeek;

  // ── Dose allocation: PK-optimal (equal SS trough per ester) ─────────────
  // w_i = (e^(k_i × iv_i) − 1) / iv_i.  Short esters clear faster so they
  // need more mg/week to hold the same trough — the weight reflects that.
  // This minimises combined peak:trough regardless of which esters are equipped.
  // Stock amounts only drive coverage warnings — they never cap the cycle.
  var pkWeights = testInv.map(function(inv) {
    var cd = _tcCompInfo(inv.compId);
    var k  = Math.LN2 / cd.halfLifeDays;
    var iv = _tcSnapInterval(0.585 * cd.halfLifeDays);
    return (Math.exp(k * iv) - 1) / iv;
  });
  var totalPkWeight = pkWeights.reduce(function(a, b){ return a + b; }, 0);

  var effectiveCycle = _tcp.cycleDays;  // never capped by stock
  var compoundPlans  = [];

  testInv.forEach(function(inv, idx) {
    var cd       = _tcCompInfo(inv.compId);
    var bioav    = cd.bioavailability || 1;
    var frac     = totalPkWeight > 0 ? pkWeights[idx] / totalPkWeight : 1 / testInv.length;
    var stock    = parseFloat(inv.totalMg) || 0;
    var compMgWkBioav  = reqMgPerWeek * frac;        // bioavailable mg/week for this compound
    var compMgWkApplied = compMgWkBioav / bioav;     // applied mg/week (what the user actually uses)

    var optInterval  = 0.585 * cd.halfLifeDays;
    var compInterval = ovInterval > 0         ? ovInterval
                     : _tcp.preferredFreqDays !== 'auto' ? _tcSnapInterval(parseFloat(_tcp.preferredFreqDays) || optInterval)
                     : _tcSnapInterval(optInterval);

    // Cap applied dose per application when the compound has a physical maximum
    // (e.g. transdermal gel: 2 sachets × 50 mg = 100 mg per application)
    if (cd.maxDailyDoseMg) {
      var rawDosePerInj = compMgWkApplied * compInterval / 7;
      if (rawDosePerInj > cd.maxDailyDoseMg) {
        compMgWkApplied = cd.maxDailyDoseMg * 7 / compInterval;
        compMgWkBioav   = compMgWkApplied * bioav;
      }
    }

    // Warn when stock runs short — never shorten the cycle; user can reorder
    if (stock > 0) {
      var weeksAvail = stock / compMgWkApplied;
      if (weeksAvail < _tcp.cycleDays / 7 * 0.9) {
        result.suggestions.push({
          type: 'insufficient-inventory', priority: 1,
          message: '⚠ ' + cd.name + ' stock (' + Math.round(stock) + ' mg) covers ~' +
                   Math.floor(weeksAvail) + ' wk at ' + Math.round(compMgWkApplied) + ' mg/wk applied' +
                   ' — reorder before W' + (Math.floor(weeksAvail) + 1) + '.'
        });
      }
    }

    var ptr = _tcPeakTroughRatio(cd.halfLifeDays, compInterval);
    if (ptr > 2.5) {
      result.warnings.push({
        type: 'high-peak-trough',
        message: cd.name + ' peak:trough ' + ptr.toFixed(1) + '× exceeds 2.5× — increase frequency or use a shorter ester.'
      });
    }

    // Cost per mg from user-entered purchase price (cost is per applied mg)
    var costTotal  = parseFloat(inv.costTotal) || 0;
    var costPerMg  = (costTotal > 0 && stock > 0) ? costTotal / stock : null;
    var costPerWeek = costPerMg !== null ? compMgWkApplied * costPerMg : null;

    compoundPlans.push({
      compId:           cd.id,
      cd:               cd,
      intervalDays:     compInterval,
      autoIntervalDays: _tcSnapInterval(optInterval),
      dosePerInj:       Math.round(compMgWkApplied * compInterval / 7 * 10) / 10,  // applied mg per dose
      mgPerWeek:        Math.round(compMgWkBioav),                                   // bioavailable mg/week shown in summary
      costPerMg:        costPerMg,
      costPerWeek:      costPerWeek !== null ? Math.round(costPerWeek * 100) / 100 : null
    });
  });

  // Total cycle cost (only when every compound has cost data)
  var totalCostPerCycle = null;
  if (compoundPlans.length > 0 && compoundPlans.every(function(cp){ return cp.costPerWeek !== null; })) {
    totalCostPerCycle = Math.round(
      compoundPlans.reduce(function(s, cp){ return s + cp.costPerWeek * effectiveCycle / 7; }, 0) * 100
    ) / 100;
  }

  result.plan = {
    compounds:        compoundPlans,
    totalMgPerWeek:   Math.round(reqMgPerWeek),
    autoMgPerWeek:    Math.round(autoMgPerWeek),
    cycleDays:        effectiveCycle,
    doseSource:       doseSource,
    isManual:         isManual,
    ftFrac:           ftFrac,
    totalCostPerCycle: totalCostPerCycle
  };

  return result;
}

// ── PK schedule + curve ───────────────────────────────────────────────────────

function _tcBuildSchedule(plan) {
  var cycleDays = plan.cycleDays;
  var nonHCG = plan.compounds.filter(function(c){ return c.compId !== 'hcg'; });
  if (nonHCG.length === 0) return [];

  function makeInj(cp, day, dose) {
    var bioav = cp.cd.bioavailability || 1;
    var hl    = cp.cd.halfLifeDays;
    return {
      day:          Math.round(day),
      dose:         Math.round(dose * bioav * 10) / 10,  // bioavailable dose drives PK curve
      compId:       cp.compId,
      halfLifeDays: hl,
      ka:           _tcKa(hl),
      dot:          cp.cd.dot,
      name:         cp.cd.name,
      dosePerInj:   cp.dosePerInj                        // applied dose shown in schedule
    };
  }

  // Single compound — simple periodic
  if (nonHCG.length === 1) {
    var cp0 = nonHCG[0], s0 = [], d0 = 0;
    while (d0 < cycleDays) { s0.push(makeInj(cp0, d0, cp0.dosePerInj)); d0 += cp0.intervalDays; }
    return s0;
  }

  // ── Multi-compound: backbone + compensatory forward simulation ──────────────
  // Backbone = longest half-life; compensators sorted slowest-first (prefer coverage)
  var sorted      = nonHCG.slice().sort(function(a,b){ return b.cd.halfLifeDays - a.cd.halfLifeDays; });
  var backbone    = sorted[0];
  var compensators = sorted.slice(1);

  var backboneStart = Math.max(0, parseInt(_tcp.backboneStartDay) || 0);

  // Floor = 60% of backbone's single injection dose.
  // Compensators fire whenever the total plasma curve drops below this.
  var T_floor = backbone.dosePerInj * 0.60;

  // 1. Schedule backbone at its standard interval starting at backboneStart
  var sched = [];
  var d = backboneStart;
  while (d < cycleDays) { sched.push(makeInj(backbone, d, backbone.dosePerInj)); d += backbone.intervalDays; }

  // 2. Build backbone plasma curve
  var curve = new Float64Array(cycleDays + 1);
  function addToCurve(inj) {
    var ke = Math.LN2 / inj.halfLifeDays;
    var ka = inj.ka || _tcKa(inj.halfLifeDays);
    for (var t = inj.day; t <= cycleDays; t++)
      curve[t] += _tcPkConc(inj.dose, ka, ke, t - inj.day);
  }
  sched.forEach(addToCurve);

  // 3. Forward simulation — inject compensators on demand when curve < T_floor
  var lastInjDay = {};
  compensators.forEach(function(cp){ lastInjDay[cp.compId] = -9999; });

  for (var day = 0; day <= cycleDays; day++) {
    if (curve[day] >= T_floor) continue;
    // Below floor — try compensators slowest-first (maximises coverage per injection)
    for (var ci = 0; ci < compensators.length; ci++) {
      var cp = compensators[ci];
      if (day - lastInjDay[cp.compId] < cp.intervalDays) continue;
      var inj = makeInj(cp, day, cp.dosePerInj);
      sched.push(inj);
      addToCurve(inj);
      lastInjDay[cp.compId] = day;
      if (curve[day] >= T_floor) break;
    }
  }

  sched.sort(function(a,b){ return a.day - b.day || a.compId.localeCompare(b.compId); });
  return sched;
}

function _tcBuildCurve(sched, plan) {
  var n = plan.cycleDays + 1;
  var total = new Float64Array(n);
  for (var t = 0; t < n; t++) {
    var c = 0;
    for (var j = 0; j < sched.length; j++) {
      var inj = sched[j];
      if (inj.day <= t) {
        var ke = Math.LN2 / inj.halfLifeDays;
        var ka = inj.ka || _tcKa(inj.halfLifeDays);
        c += _tcPkConc(inj.dose, ka, ke, t - inj.day);
      }
    }
    total[t] = c;
  }
  return total;
}

function _tcComputeStats(total, sched, plan) {
  var n = plan.cycleDays + 1;

  // Full-cycle peak/trough
  var peak = 0, trough = Infinity;
  for (var t = 0; t < n; t++) {
    if (total[t] > peak)   peak   = total[t];
    if (total[t] < trough) trough = total[t];
  }
  if (trough === Infinity) trough = 0;

  // Use second half of cycle for "settled" band (avoids ramp-up distortion)
  var midDay = Math.floor(n / 2);
  var latePeak = 0, lateTrough = Infinity;
  for (var t2 = midDay; t2 < n; t2++) {
    if (total[t2] > latePeak)   latePeak   = total[t2];
    if (total[t2] < lateTrough) lateTrough = total[t2];
  }
  if (lateTrough === Infinity) lateTrough = trough;

  var ssTrough  = lateTrough;
  var ssPeak    = latePeak;
  var bandFloor = ssTrough * 0.85;
  var bandCeil  = ssPeak   * 1.15;

  var inBand = 0;
  for (var t3 = 0; t3 < n; t3++)
    if (total[t3] >= bandFloor && total[t3] <= bandCeil) inBand++;

  var firstInBand = null;
  for (var t4 = 7; t4 < n; t4++) {
    if (total[t4] >= ssTrough * 0.90 && firstInBand === null)
      firstInBand = Math.ceil(t4 / 7);
  }

  return {
    peak: peak, trough: trough,
    ssTrough: ssTrough, ssPeak: ssPeak,
    bandFloor: bandFloor, bandCeil: bandCeil,
    peakTroughRatio:  trough > 0 ? peak / trough : 0,
    inBandPct:        Math.round(inBand / n * 100),
    totalMg:          Math.round(sched.reduce(function(s, inj){ return s + inj.dose; }, 0)),
    firstInBandWeek:  firstInBand
  };
}

// ── Chart ─────────────────────────────────────────────────────────────────────

function _tcDrawChart(canvasId, total, stats, plan, sched, calFT, measuredFT) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  var lineColor = (plan.compounds && plan.compounds.length > 0) ? plan.compounds[0].cd.dot : '#e8a020';
  var cycleDays = plan.cycleDays;
  var scale     = calFT || 1;
  var unitLabel = calFT ? 'pmol/L' : 'mg';

  var dpr  = window.devicePixelRatio || 1;
  var cssW = canvas.offsetWidth || 300;
  var cssH = 150;
  canvas.width = cssW * dpr; canvas.height = cssH * dpr;
  canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  var PAD = {top:12, right:14, bottom:26, left:52};
  var cW = cssW - PAD.left - PAD.right, cH = cssH - PAD.top - PAD.bottom;
  var totalWeeks = Math.ceil(cycleDays / 7);

  var maxV = stats ? stats.bandCeil * scale * 1.1 : 0;
  for (var i = 0; i <= cycleDays; i++) if (total[i] * scale > maxV) maxV = total[i] * scale;
  if (measuredFT && calFT && measuredFT > maxV) maxV = measuredFT * 1.1;
  if (!maxV) { ctx.fillStyle = '#555'; ctx.font = '11px DM Sans,sans-serif'; ctx.fillText('No data', 10, 40); return; }
  var vMax = maxV * 1.05;

  function xOf(t){ return PAD.left + (t / cycleDays) * cW; }
  function yOf(v){ return PAD.top  + cH - (v / vMax) * cH; }

  ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.5;
  for (var w = 0; w <= totalWeeks; w++) {
    var gx = xOf(w * 7); if (gx > PAD.left + cW + 1) break;
    ctx.beginPath(); ctx.moveTo(gx, PAD.top); ctx.lineTo(gx, PAD.top + cH); ctx.stroke();
  }

  if (stats && stats.bandCeil > 0) {
    ctx.fillStyle = 'rgba(34,204,102,0.09)';
    ctx.fillRect(PAD.left, yOf(stats.bandCeil * scale), cW, yOf(stats.bandFloor * scale) - yOf(stats.bandCeil * scale));
    ctx.strokeStyle = 'rgba(34,204,102,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(PAD.left, yOf(stats.ssTrough * scale)); ctx.lineTo(PAD.left+cW, yOf(stats.ssTrough * scale)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD.left, yOf(stats.ssPeak   * scale)); ctx.lineTo(PAD.left+cW, yOf(stats.ssPeak   * scale)); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Measured free T reference line (dashed orange)
  if (measuredFT && calFT) {
    var refY = yOf(measuredFT);
    ctx.strokeStyle = '#e8a02099'; ctx.lineWidth = 1; ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(PAD.left, refY); ctx.lineTo(PAD.left + cW, refY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#e8a020bb'; ctx.font = '8px DM Sans,sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(Math.round(measuredFT), PAD.left + 3, refY - 2);
  }

  ctx.fillStyle = '#555'; ctx.font = '9px DM Sans,sans-serif'; ctx.textAlign = 'right';
  for (var ti = 0; ti <= 3; ti++) {
    var ty = PAD.top + (cH / 3) * ti;
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(PAD.left, ty); ctx.lineTo(PAD.left+cW, ty); ctx.stroke();
    var tv = vMax * (1 - ti / 3);
    ctx.fillText(calFT ? Math.round(tv) : (tv >= 100 ? Math.round(tv) : tv >= 10 ? tv.toFixed(1) : tv.toFixed(2)), PAD.left - 4, ty + 3);
  }
  ctx.save(); ctx.translate(10, PAD.top + cH/2); ctx.rotate(-Math.PI/2);
  ctx.textAlign = 'center'; ctx.fillStyle = '#444'; ctx.font = '8px DM Sans,sans-serif';
  ctx.fillText(unitLabel, 0, 0); ctx.restore();

  var grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + cH);
  grad.addColorStop(0, lineColor + '55'); grad.addColorStop(1, lineColor + '00');
  ctx.beginPath(); ctx.moveTo(xOf(0), PAD.top + cH);
  for (var t = 0; t <= cycleDays; t++) ctx.lineTo(xOf(t), yOf(total[t] * scale || 0));
  ctx.lineTo(xOf(cycleDays), PAD.top + cH);
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath(); ctx.moveTo(xOf(0), yOf(total[0] * scale || 0));
  for (var t3 = 1; t3 <= cycleDays; t3++) ctx.lineTo(xOf(t3), yOf(total[t3] * scale || 0));
  ctx.strokeStyle = lineColor; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();

  ctx.lineWidth = 1;
  (sched || []).forEach(function(inj) {
    var ix = xOf(inj.day);
    ctx.strokeStyle = (inj.dot || lineColor) + '99';
    ctx.beginPath(); ctx.moveTo(ix, PAD.top + cH); ctx.lineTo(ix, PAD.top + cH + 5); ctx.stroke();
  });

  ctx.fillStyle = '#555'; ctx.font = '9px DM Sans,sans-serif'; ctx.textAlign = 'center';
  var labelEvery = totalWeeks <= 8 ? 1 : totalWeeks <= 16 ? 2 : 4;
  for (var w2 = 0; w2 <= totalWeeks; w2 += labelEvery) {
    var lx = xOf(w2 * 7); if (lx > PAD.left + cW + 8) break;
    ctx.fillText('W' + w2, lx, PAD.top + cH + 18);
  }
}

// ── Export to stack ───────────────────────────────────────────────────────────

function _tcCopyLogToStack() {
  var log = _tcp.manualLog || [];
  if (!log.length) { alert('No injections logged yet.'); return; }
  if (typeof _userStacks === 'undefined' || !_userStacks.length) { alert('No stacks found. Create a stack first.'); return; }
  var activeIdx = (typeof _activeStackIndices !== 'undefined' && _activeStackIndices.length > 0) ? _activeStackIndices[0] : 0;
  if (activeIdx < 0 || activeIdx >= _userStacks.length) { alert('No active stack found.'); return; }
  // Group by compId
  var byComp = {};
  log.forEach(function(e){ if(!e.compId||!e.date)return; if(!byComp[e.compId])byComp[e.compId]=[]; byComp[e.compId].push(e); });
  var compIds = Object.keys(byComp);
  if (!compIds.length) { alert('No valid entries to copy.'); return; }
  var trtCompounds = [];
  var enhCompounds = [];
  compIds.forEach(function(cid){
    var entries = byComp[cid].slice().sort(function(a,b){return a.date<b.date?-1:a.date>b.date?1:0;});
    // Derive interval from consecutive entry dates
    var intervals = [];
    for(var i=1;i<entries.length;i++){
      var a=new Date(entries[i-1].date.replace(/-/g,'/')), b=new Date(entries[i].date.replace(/-/g,'/'));
      var diff=Math.round((b-a)/86400000);
      if(diff>0)intervals.push(diff);
    }
    var iv = intervals.length ? Math.round(intervals.reduce(function(s,v){return s+v;},0)/intervals.length) : 7;
    var days;
    if(iv<=1)days=[0,1,2,3,4,5,6];
    else if(Math.abs(iv-2)<0.6)days=[1,3,5];
    else if(Math.abs(iv-3.5)<0.6)days=[1,4];
    else if(Math.abs(iv-7)<2)days=[1];
    else days=[1];
    // Most common dose
    var doses=entries.map(function(e){return parseFloat(e.doseMg)||0;}).filter(Boolean);
    var dose=doses.length?String(Math.round(doses.reduce(function(s,v){return s+v;},0)/doses.length)):'';
    var cd=_tcCompInfo(cid);
    var isTRT = (typeof TRT_CAT!=='undefined') && TRT_CAT.some(function(c){return c.id===cid;});
    var isEnh = (typeof ENHANCEMENT_COMPOUNDS!=='undefined') && ENHANCEMENT_COMPOUNDS.some(function(c){return c.id===cid;});
    var entry = {id:cid, name:cd.name||cid, dose:dose, unit:'mg', days:days, dot:cd.dot||'#888'};
    if(isTRT||!isEnh) trtCompounds.push(entry);
    else enhCompounds.push({id:cid,name:cd.name||cid,dose:dose,unit:'mg/week',days:days,dot:cd.dot||'#a855f7'});
  });
  var stack = _userStacks[activeIdx];
  var lines = [];
  if(trtCompounds.length){
    if(!stack.trt)stack.trt={enabled:true,compounds:[]};
    stack.trt.enabled=true;
    trtCompounds.forEach(function(c){
      var ex=(stack.trt.compounds||[]).findIndex(function(x){return x.id===c.id;});
      if(ex!==-1)stack.trt.compounds[ex]=c;else(stack.trt.compounds=stack.trt.compounds||[]).push(c);
      lines.push(c.name+' '+c.dose+'mg');
    });
  }
  if(enhCompounds.length){
    if(!stack.enhanced)stack.enhanced={enabled:true,compounds:[]};
    stack.enhanced.enabled=true;
    enhCompounds.forEach(function(c){
      var ex=(stack.enhanced.compounds||[]).findIndex(function(x){return x.id===c.id;});
      if(ex!==-1)stack.enhanced.compounds[ex]=c;else(stack.enhanced.compounds=stack.enhanced.compounds||[]).push(c);
      lines.push(c.name+' '+c.dose+'mg');
    });
  }
  if(typeof saveStacksToBackend==='function')saveStacksToBackend();
  alert('Copied to "'+((stack.name)||'active stack')+'":\n'+lines.join('\n'));
}

function _tcExportPlan() {
  var plan = _tcCurrentPlan;
  if (!plan || !plan.compounds || plan.compounds.length === 0) return;

  var trtCompounds = plan.compounds.map(function(cp) {
    var iv = cp.intervalDays;
    var days;
    if (iv <= 1.1)                       days = [0,1,2,3,4,5,6];
    else if (Math.abs(iv - 2)   < 0.3)  days = [1,3,5];
    else if (Math.abs(iv - 3.5) < 0.3)  days = [1,4];
    else if (Math.abs(iv - 7)   < 0.5)  days = [1];
    else                                 days = [1];
    return {id:cp.compId, name:cp.cd.name, dose:String(cp.dosePerInj), unit:'mg', days:days};
  });

  var nameStr = plan.compounds.length === 1
    ? plan.compounds[0].cd.name + ' Protocol'
    : plan.compounds.map(function(cp){ return cp.cd.name; }).join(' + ') + ' Protocol';

  var newStack = {
    name:         nameStr,
    cycle_length: Math.round(plan.cycleDays / 7),
    trt:          {enabled:true, compounds:trtCompounds},
    peptides:     [],
    enhanced:     {enabled:false, compounds:[]},
    _tcalc:       true
  };
  if (typeof _userStacks !== 'undefined') {
    _userStacks.push(newStack);
    saveStacksToBackend();
    var btn = document.getElementById('tab-btn-stacks');
    if (btn) switchTab('stacks', btn);
  }
}

// ── Copy plan to active stack ─────────────────────────────────────────────────

function _tcCopyToActiveStack() {
  var plan = _tcCurrentPlan;
  if (!plan || !plan.compounds || plan.compounds.length === 0) {
    alert('No T-Calc plan to copy.'); return;
  }
  if (typeof _userStacks === 'undefined' || _userStacks.length === 0) {
    alert('No stacks found. Create a stack first in the Stacks tab.'); return;
  }
  var activeIdx = (typeof _activeStackIndices !== 'undefined' && _activeStackIndices.length > 0)
    ? _activeStackIndices[0] : 0;
  if (activeIdx < 0 || activeIdx >= _userStacks.length) {
    alert('No active stack found.'); return;
  }
  var stack = _userStacks[activeIdx];
  var trtCompounds = plan.compounds.map(function(cp) {
    var iv = cp.intervalDays;
    var days;
    if      (iv <= 1.1)                  days = [0,1,2,3,4,5,6];
    else if (Math.abs(iv - 2)   < 0.3)   days = [1,3,5];
    else if (Math.abs(iv - 3.5) < 0.3)   days = [1,4];
    else if (Math.abs(iv - 7)   < 0.5)   days = [1];
    else                                  days = [1];
    return {id:cp.compId, name:cp.cd.name, dose:String(cp.dosePerInj), unit:'mg', days:days};
  });
  if (!stack.trt) stack.trt = {enabled:true, compounds:[]};
  stack.trt.enabled   = true;
  stack.trt.compounds = trtCompounds;
  if (typeof saveStacksToBackend === 'function') saveStacksToBackend();
  alert('TRT plan copied to "' + (stack.name || 'active stack') + '".');
}

// ── Main build ────────────────────────────────────────────────────────────────

function buildTCalc() {
  var el = document.getElementById('tcalc-body');
  if (!el) return;

  if (!_tcpSessionLoaded) {
    _tcpSessionLoaded = true;
    _tcLoadProfile();
  }

  var iSty = 'background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:11px 13px;color:var(--text);font-size:16px;font-family:inherit;outline:none;width:100%;box-sizing:border-box';
  var lSty = 'font-size:11px;font-weight:700;letter-spacing:0.8px;color:var(--muted);text-transform:uppercase;margin-bottom:8px;display:block';

  var log      = _tcp.manualLog || [];
  var comps    = _tcManualComps();
  var validLog = log.filter(function(e){ return e.date && e.doseMg && parseFloat(e.doseMg) > 0; });
  var mftNum   = parseFloat(_tcp.measuredFT) || 0;

  var html = '';

  // ── 1. PLASMA CURVE (top — main feature) ─────────────────────────────────────
  var chartDot = (validLog.length > 0 && validLog[0].compId)
    ? (_tcCompInfo(validLog[0].compId).dot || '#e8a020') : '#e8a020';
  html += '<div class="card">';
  html += '<div class="card-header"><div class="card-title-wrap">';
  html += '<div class="card-dot" style="background:' + chartDot + '"></div>';
  html += '<div class="card-title">PLASMA CURVE</div></div>';
  html += '<span style="font-size:11px;color:var(--muted2)">' + (mftNum > 0 ? 'calibrated · pmol/L' : 'add bloodwork to calibrate') + '</span>';
  html += '</div>';
  if (validLog.length > 0) {
    html += '<div style="padding:2px 16px 10px"><canvas id="tc-main-chart" style="width:100%;display:block;"></canvas></div>';
  } else {
    html += '<div style="padding:28px 16px;text-align:center;color:var(--muted2);font-size:13px">';
    html += 'No injections logged yet.<br><span style="font-size:12px;opacity:0.6">Add injections below to plot your plasma curve.</span>';
    html += '</div>';
  }
  html += '</div>';

  // ── 2. INJECTION SCHEDULE (main card — inline) ────────────────────────────────
  html += '<div class="card">';
  html += '<div class="card-header"><div class="card-title-wrap">';
  html += '<div class="card-dot" style="background:#6688cc"></div>';
  html += '<div class="card-title">INJECTION SCHEDULE</div></div>';
  html += '<div style="display:flex;align-items:center;gap:6px">';
  if (log.length > 0) {
    html += '<button onclick="_tcCopyLogToStack()" style="background:none;border:1px solid var(--border);border-radius:8px;color:var(--muted2);font-size:10px;font-weight:700;letter-spacing:0.5px;cursor:pointer;padding:5px 10px;font-family:inherit">COPY TO STACK</button>';
  }
  html += '<button onclick="_tcAddManualEntry()" style="background:linear-gradient(135deg,#6688cc,#4466aa);border:none;border-radius:8px;color:#fff;font-size:11px;font-weight:800;letter-spacing:0.8px;cursor:pointer;padding:7px 14px;font-family:inherit">+ ADD</button>';
  html += '</div></div>';
  html += '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:8px">';

  if (log.length === 0) {
    html += '<div style="text-align:center;padding:16px 0;color:var(--muted2);font-size:13px">No injections logged yet.<br><span style="font-size:12px;opacity:0.6">Tap + ADD to log your first injection.</span></div>';
  } else {
    // Pre-compute series metadata
    var _seriesSeen = {};
    var _seriesTotals = {};
    var _seriesMeta = {};
    log.forEach(function(e){
      if(!e.seriesId)return;
      var sid=e.seriesId;
      _seriesTotals[sid]=(_seriesTotals[sid]||0)+1;
      if(!_seriesMeta[sid]){_seriesMeta[sid]={compId:e.compId,doseMg:e.doseMg,firstDate:e.date,lastDate:e.date};}
      else{if(e.date<_seriesMeta[sid].firstDate)_seriesMeta[sid].firstDate=e.date;if(e.date>_seriesMeta[sid].lastDate)_seriesMeta[sid].lastDate=e.date;}
    });
    Object.keys(_seriesMeta).forEach(function(sid){
      if((_seriesTotals[sid]||0)<2)return;
      var dates=log.filter(function(e){return e.seriesId===sid;}).map(function(e){return e.date||'';}).sort();
      var d0=new Date(dates[0].replace(/-/g,'/')),d1=new Date(dates[1].replace(/-/g,'/'));
      _seriesMeta[sid].interval=Math.round((d1-d0)/86400000);
    });
    var _tcFmtD=function(iso){if(!iso)return'';var p=iso.split('-');var M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return parseInt(p[2],10)+' '+M[parseInt(p[1],10)-1];};

    var _seriesExpPos = {};  // position counter for expanded series individual cards

    log.forEach(function(entry, idx) {
      var cd = _tcCompInfo(entry.compId || (comps[0] || ''));
      var sid = entry.seriesId;

      if (sid) {
        var isExpanded = !!_tcExpandedSeries[sid];
        var meta = _seriesMeta[sid] || {};
        var total = _seriesTotals[sid] || 1;
        var iv = meta.interval;
        var ivLabel = iv ? ' · every ' + iv + ' day' + (iv === 1 ? '' : 's') : '';
        var mcd = _tcCompInfo(meta.compId || (comps[0] || ''));
        var editBtnStyle = 'background:none;border:1px solid #6688cc66;border-radius:6px;color:#6688cc;font-size:10px;font-weight:700;letter-spacing:0.5px;cursor:pointer;padding:4px 8px;font-family:inherit;flex-shrink:0';
        var deleteBtnStyle = 'background:none;border:none;color:var(--muted2);font-size:16px;cursor:pointer;padding:2px 4px;line-height:1;flex-shrink:0';

        if (!isExpanded) {
          // ── COLLAPSED: one summary card per seriesId ──
          if (_seriesSeen[sid]) return;
          _seriesSeen[sid] = true;
          // Stack visual: box-shadow creates two "cards" peeking behind the top card
          html += '<div style="background:rgba(102,136,204,0.10);border:1px dashed #6688cc66;border-radius:12px;padding:12px;box-shadow:3px 3px 0 0 rgba(102,136,204,0.18),6px 6px 0 0 rgba(102,136,204,0.09);">';
          html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">';
          html += '<div style="display:flex;align-items:center;gap:8px;">';
          html += '<span style="font-size:10px;font-weight:800;letter-spacing:1px;color:#6688cc;text-transform:uppercase">⛓ SERIES</span>';
          html += '<span style="font-size:10px;color:var(--muted2)">' + total + ' injections' + ivLabel + '</span>';
          html += '</div>';
          html += '<div style="display:flex;align-items:center;gap:6px;">';
          html += '<button onclick="_tcToggleSeriesExpand(\'' + _esc(sid) + '\')" style="' + editBtnStyle + '">EDIT</button>';
          html += '<button onclick="_tcConfirmRemoveSeries(\'' + _esc(sid) + '\')" style="' + deleteBtnStyle + '">✕</button>';
          html += '</div>';
          html += '</div>';
          html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">';
          html += '<span style="width:8px;height:8px;border-radius:50%;background:' + mcd.dot + ';display:inline-block;flex-shrink:0"></span>';
          html += '<span style="font-size:14px;font-weight:600;color:var(--text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(mcd.name) + '</span>';
          html += '</div>';
          html += '<div style="display:flex;gap:24px;">';
          html += '<div><div style="' + lSty + '">DOSE</div><div style="font-size:14px;font-weight:600;color:var(--text)">' + _esc(String(meta.doseMg || '')) + ' mg</div></div>';
          if (meta.firstDate) {
            var dRange = _tcFmtD(meta.firstDate) + (meta.firstDate !== meta.lastDate ? ' → ' + _tcFmtD(meta.lastDate) : '');
            html += '<div><div style="' + lSty + '">DATES</div><div style="font-size:14px;font-weight:600;color:var(--text)">' + _esc(dRange) + '</div></div>';
          }
          html += '</div>';
          html += '</div>';
        } else {
          // ── EXPANDED: header once, then individual editable cards ──
          if (!_seriesSeen[sid]) {
            _seriesSeen[sid] = true;
            html += '<div style="background:rgba(102,136,204,0.10);border:1px dashed #6688cc66;border-radius:12px;padding:10px 12px;">';
            html += '<div style="display:flex;align-items:center;justify-content:space-between;">';
            html += '<div style="display:flex;align-items:center;gap:8px;">';
            html += '<span style="width:8px;height:8px;border-radius:50%;background:' + mcd.dot + ';display:inline-block;flex-shrink:0"></span>';
            html += '<span style="font-size:13px;font-weight:600;color:var(--text)">' + _esc(mcd.name) + '</span>';
            html += '<span style="font-size:10px;color:var(--muted2)">' + total + ' injections' + ivLabel + '</span>';
            html += '</div>';
            html += '<div style="display:flex;align-items:center;gap:6px;">';
            html += '<button onclick="_tcToggleSeriesExpand(\'' + _esc(sid) + '\')" style="' + editBtnStyle + '">DONE</button>';
            html += '<button onclick="_tcConfirmRemoveSeries(\'' + _esc(sid) + '\')" style="' + deleteBtnStyle + '">✕</button>';
            html += '</div>';
            html += '</div>';
            html += '</div>';
          }
          // Individual editable card
          _seriesExpPos[sid] = (_seriesExpPos[sid] || 0) + 1;
          var pos = _seriesExpPos[sid];
          html += '<div style="background:rgba(102,136,204,0.06);border:1px dashed #6688cc44;border-radius:12px;padding:12px;">';
          html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">';
          html += '<span style="font-size:10px;font-weight:700;color:#6688cc;letter-spacing:0.5px">#' + pos + ' / ' + total + '</span>';
          html += '<button onclick="_tcConfirmRemove(' + idx + ')" style="background:none;border:none;color:var(--muted2);font-size:16px;cursor:pointer;padding:2px 4px;line-height:1;flex-shrink:0">✕</button>';
          html += '</div>';
          html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">';
          html += '<div><div style="' + lSty + '">DOSE (mg)</div>';
          html += '<input type="number" min="0" max="9999" step="1" value="' + _esc(String(entry.doseMg || '')) + '" placeholder="e.g. 100" onchange="_tcSetManualField(' + idx + ',\'doseMg\',+this.value)" style="' + iSty + ';font-size:14px"></div>';
          html += '<div><div style="' + lSty + '">DATE</div>';
          html += '<input type="date" value="' + _esc(entry.date || '') + '" onchange="_tcSetManualField(' + idx + ',\'date\',this.value)" style="' + iSty + ';font-size:14px"></div>';
          html += '</div></div>';
        }
      } else {
        // Single injection card
        var compSelect = '<select onchange="_tcSetManualField(' + idx + ',\'compId\',this.value)" style="' + iSty + ';flex:1;min-width:0;font-size:14px">';
        comps.forEach(function(id) {
          var n = _tcCompInfo(id).name;
          compSelect += '<option value="' + _esc(id) + '"' + (entry.compId === id ? ' selected' : '') + '>' + _esc(n) + '</option>';
        });
        compSelect += '</select>';
        var borderCol = cd.dot + '33';
        html += '<div style="background:var(--surface2);border:1px solid ' + borderCol + ';border-radius:12px;padding:12px;">';
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">';
        html += '<span style="width:8px;height:8px;border-radius:50%;background:' + cd.dot + ';display:inline-block;flex-shrink:0"></span>';
        html += compSelect;
        html += '<button onclick="_tcConfirmRemove(' + idx + ')" style="background:none;border:none;color:var(--muted2);font-size:18px;cursor:pointer;padding:2px 4px;flex-shrink:0;line-height:1">✕</button>';
        html += '</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">';
        html += '<div><div style="' + lSty + '">DOSE (mg)</div>';
        html += '<input type="number" min="0" max="9999" step="1" value="' + _esc(String(entry.doseMg || '')) + '" placeholder="e.g. 100" onchange="_tcSetManualField(' + idx + ',\'doseMg\',+this.value)" style="' + iSty + ';font-size:14px"></div>';
        html += '<div><div style="' + lSty + '">DATE</div>';
        html += '<input type="date" value="' + _esc(entry.date || '') + '" onchange="_tcSetManualField(' + idx + ',\'date\',this.value)" style="' + iSty + ';font-size:14px"></div>';
        html += '</div></div>';
      }
    });
  }
  html += '</div></div>';

  // ── 3. BLOODWORK (collapsible) ────────────────────────────────────────────────
  var bwSummary = mftNum > 0
    ? 'Calibrated · ' + Math.round(mftNum) + ' pmol/L Free T'
    : (parseFloat(_tcp.totalT) > 0
        ? 'Total T ' + _tcp.totalT + ' nmol/L · no Free T'
        : 'Not calibrated — tap to add');

  html += '<div class="card">';
  html += '<div class="card-header" onclick="_tcToggleBw()" style="cursor:pointer;user-select:none">';
  html += '<div class="card-title-wrap">';
  html += '<div class="card-dot" style="background:#cc8844"></div>';
  html += '<div class="card-title">BLOODWORK</div></div>';
  html += '<div style="display:flex;align-items:center;gap:8px">';
  if (!_tcBwOpen) {
    html += '<span style="font-size:11px;color:var(--muted2)">' + _esc(bwSummary) + '</span>';
  }
  html += '<span style="font-size:14px;color:var(--muted2);line-height:1">' + (_tcBwOpen ? '▲' : '▼') + '</span>';
  html += '</div></div>';

  if (_tcBwOpen) {
    html += '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:16px">';

    // Age display (prefilled from /user-settings via _tcp.birthYear)
    if (_tcp.birthYear) {
      var _bwAge = new Date().getFullYear() - parseInt(_tcp.birthYear);
      html += '<div style="background:var(--surface2);border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center">';
      html += '<span style="font-size:12px;color:var(--muted)">Age (from profile)</span>';
      html += '<span style="font-size:15px;font-weight:700;color:var(--text)">' + _bwAge + ' yrs</span>';
      html += '</div>';
    } else if (_tcAgeMissing) {
      html += '<div style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.4);border-radius:8px;padding:10px 14px;font-size:12px;color:#f59e0b;">⚠ Age not set — go to Body Comp → Age to enable age-stratified reference ranges.</div>';
    }

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';
    html += '<div><label style="' + lSty + '">Total T (nmol/L)</label>';
    html += '<input type="number" min="0" max="200" step="0.1" value="' + _esc(_tcp.totalT) + '" placeholder="e.g. 16.2" oninput="_tcp.totalT=this.value;_tcSaveProfile()" onchange="buildTCalc()" style="' + iSty + '"></div>';
    html += '<div><label style="' + lSty + '">SHBG (nmol/L)</label>';
    html += '<input type="number" min="0" max="300" step="1" value="' + _esc(_tcp.shbg) + '" placeholder="e.g. 45" oninput="_tcp.shbg=this.value;_tcSaveProfile()" onchange="buildTCalc()" style="' + iSty + '"></div>';
    html += '</div>';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';
    html += '<div><label style="' + lSty + '">Free T measured (pmol/L)</label>';
    html += '<input type="number" min="0" max="10000" step="1" value="' + _esc(_tcp.measuredFT) + '" placeholder="e.g. 223" oninput="_tcp.measuredFT=this.value;_tcSaveProfile()" onchange="buildTCalc()" style="' + iSty + '"></div>';
    html += '<div><label style="' + lSty + '">Dose at bloodwork (mg/wk)</label>';
    html += '<input type="number" min="0" max="2000" step="10" value="' + _esc(_tcp.currentDoseMgWk) + '" placeholder="e.g. 150" oninput="_tcp.currentDoseMgWk=this.value;_tcSaveProfile()" onchange="buildTCalc()" style="' + iSty + '"></div>';
    html += '</div>';

    html += '<div><label style="' + lSty + '">Target free T (pmol/L)</label>';
    html += '<input type="number" min="0" max="10000" step="10" value="' + _esc(_tcp.targetFT) + '" placeholder="225–675 optimal · 600–1000 high-normal TRT" oninput="_tcp.targetFT=this.value;_tcSaveProfile()" onchange="buildTCalc()" style="' + iSty + '"></div>';

    // Calculated outputs from entered values
    var _bwTT    = parseFloat(_tcp.totalT)          || 0;
    var _bwSHBG  = parseFloat(_tcp.shbg)            || 0;
    var _bwMFT   = parseFloat(_tcp.measuredFT)      || 0;
    var _bwDose  = parseFloat(_tcp.currentDoseMgWk) || 0;
    var _bwTgt   = parseFloat(_tcp.targetFT)        || 0;
    var _bwVerm  = (_bwTT > 0 && _bwSHBG > 0) ? _tcVermeulenFT(_bwTT, _bwSHBG) : null;
    var _bwFrac  = _bwMFT > 0 && _bwTT > 0 ? _bwMFT / (_bwTT * 1000)
                 : (_bwVerm !== null && _bwTT > 0 ? _bwVerm / (_bwTT * 1000) : null);
    var _bwTgtTT = (_bwTgt > 0 && _bwFrac > 0) ? (_bwTgt / _bwFrac / 1000) : null;
    var _bwMgNm  = (_bwDose > 0 && _bwTT > 0) ? (_bwTT / _bwDose) : null;

    if (_bwVerm !== null || _bwTgtTT !== null) {
      html += '<div style="background:var(--surface2);border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;gap:8px">';
      if (_bwVerm !== null) {
        html += '<div style="display:flex;justify-content:space-between;align-items:baseline">';
        html += '<span style="font-size:13px;color:var(--muted)">Vermeulen est. free T</span>';
        html += '<span style="font-size:15px;font-weight:700;color:var(--text)">' + Math.round(_bwVerm) + ' pmol/L</span></div>';
      }
      if (_bwFrac !== null) {
        html += '<div style="display:flex;justify-content:space-between;align-items:baseline">';
        html += '<span style="font-size:13px;color:var(--muted)">Free T fraction</span>';
        html += '<span style="font-size:15px;font-weight:700;color:var(--text)">' + (_bwFrac * 100).toFixed(2) + '%</span></div>';
      }
      if (_bwTgtTT !== null) {
        html += '<div style="display:flex;justify-content:space-between;align-items:baseline">';
        html += '<span style="font-size:13px;color:var(--muted)">Total T needed</span>';
        html += '<span style="font-size:15px;font-weight:700;color:var(--accent)">' + _bwTgtTT.toFixed(1) + ' nmol/L</span></div>';
      }
      if (_bwMgNm !== null && _bwTgtTT !== null) {
        html += '<div style="display:flex;justify-content:space-between;align-items:baseline">';
        html += '<span style="font-size:13px;color:var(--muted)">Weekly dose needed</span>';
        html += '<span style="font-size:15px;font-weight:700;color:var(--accent)">' + Math.round(_bwTgtTT / _bwMgNm) + ' mg/wk</span></div>';
      }
      html += '</div>';
    } else {
      html += '<div style="font-size:13px;color:var(--muted2);line-height:1.5">Enter bloodwork values to calibrate the graph and enable dose calculations.<br>Optimal male free T: 225–675 pmol/L · High-normal TRT: 600–1000 pmol/L</div>';
    }

    html += '</div>'; // close padding
  }
  html += '</div>'; // close card

  el.innerHTML = html;

  if (validLog.length > 0) {
    requestAnimationFrame(function() { _tcDrawManualChart('tc-main-chart', validLog); });
  }
}
