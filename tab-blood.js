// Blood Levels tab — PK plasma concentration curves for TRT & Enhanced compounds

function _parseHalfLifeDays(str) {
  if (!str) return null;
  var s = str.toLowerCase();
  // "X–Y days" or "X-Y days" → average of range
  var m = s.match(/~?(\d+(?:\.\d+)?)[–\-](\d+(?:\.\d+)?)\s*days?/);
  if (m) return (parseFloat(m[1]) + parseFloat(m[2])) / 2;
  // "~X.X days" or "X days"
  m = s.match(/~?(\d+(?:\.\d+)?)\s*days?/);
  if (m) return parseFloat(m[1]);
  // "~X hours" or "X h"
  m = s.match(/~?(\d+(?:\.\d+)?)\s*h(?:ours?)?(?:\s|$)/);
  if (m) return parseFloat(m[1]) / 24;
  // "~X min"
  m = s.match(/~?(\d+(?:\.\d+)?)\s*min/);
  if (m) return parseFloat(m[1]) / 60 / 24;
  return null;
}

function _pkInjectionDays(c, cycleLen, cycleStartDow) {
  if (!c.days || !c.days.length) {
    // Nebido-style: every freqVal weeks (or days)
    var freqDays = c.freqUnit === 'weeks' ? (c.freqVal || 1) * 7 : (c.freqVal || 1);
    var days = [];
    for (var d = 0; d < cycleLen; d += freqDays) days.push(Math.round(d));
    return days;
  }
  var days = [];
  for (var d = 0; d < cycleLen; d++) {
    if (c.days.indexOf((cycleStartDow + d) % 7) !== -1) days.push(d);
  }
  return days;
}

function _pkCurve(injDays, dosePerInj, halfLifeDays, cycleDays) {
  var curve = new Float64Array(cycleDays + 1);
  var k = Math.LN2 / halfLifeDays;
  for (var t = 0; t <= cycleDays; t++) {
    var c = 0;
    for (var j = 0; j < injDays.length; j++) {
      if (injDays[j] <= t) c += dosePerInj * Math.exp(-k * (t - injDays[j]));
    }
    curve[t] = c;
  }
  return curve;
}

function _drawPkChart(canvas, curve, color, unit, cycleLen) {
  var dpr = window.devicePixelRatio || 1;
  var cssW = canvas.offsetWidth || 300;
  var cssH = 110;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  var PAD = {top: 12, right: 14, bottom: 26, left: 50};
  var cW = cssW - PAD.left - PAD.right;
  var cH = cssH - PAD.top - PAD.bottom;

  var maxV = 0;
  for (var i = 0; i <= cycleLen; i++) if (curve[i] > maxV) maxV = curve[i];
  if (!maxV) {
    ctx.fillStyle = '#555';
    ctx.font = '11px DM Sans,sans-serif';
    ctx.fillText('No data', 10, 40);
    return;
  }

  var vMax = maxV * 1.1;
  function xOf(t) { return PAD.left + (t / cycleLen) * cW; }
  function yOf(v) { return PAD.top + cH - (v / vMax) * cH; }

  // Vertical week grid
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 0.5;
  var totalWeeks = Math.ceil(cycleLen / 7);
  for (var w = 0; w <= totalWeeks; w++) {
    var gx = xOf(w * 7);
    if (gx > PAD.left + cW + 1) break;
    ctx.beginPath();
    ctx.moveTo(gx, PAD.top);
    ctx.lineTo(gx, PAD.top + cH);
    ctx.stroke();
  }

  // Horizontal grid + Y labels
  var nTicks = 3;
  ctx.fillStyle = '#555';
  ctx.font = '9px DM Sans,sans-serif';
  ctx.textAlign = 'right';
  for (var ti = 0; ti <= nTicks; ti++) {
    var ty = PAD.top + (cH / nTicks) * ti;
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(PAD.left, ty);
    ctx.lineTo(PAD.left + cW, ty);
    ctx.stroke();
    var tv = maxV * (1 - ti / nTicks);
    var lbl = tv >= 100 ? Math.round(tv) : tv >= 10 ? tv.toFixed(1) : tv.toFixed(2);
    ctx.fillText(lbl, PAD.left - 4, ty + 3);
  }

  // Y-axis unit label (rotated)
  ctx.save();
  ctx.translate(10, PAD.top + cH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#444';
  ctx.font = '8px DM Sans,sans-serif';
  ctx.fillText(unit, 0, 0);
  ctx.restore();

  // Area fill
  var grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + cH);
  grad.addColorStop(0, color + '55');
  grad.addColorStop(1, color + '00');
  ctx.beginPath();
  ctx.moveTo(xOf(0), PAD.top + cH);
  for (var t = 0; t <= cycleLen; t++) {
    ctx.lineTo(xOf(t), yOf(curve[t] || 0));
  }
  ctx.lineTo(xOf(cycleLen), PAD.top + cH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(xOf(0), yOf(curve[0] || 0));
  for (var t = 1; t <= cycleLen; t++) {
    ctx.lineTo(xOf(t), yOf(curve[t] || 0));
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // X week labels
  ctx.fillStyle = '#555';
  ctx.font = '9px DM Sans,sans-serif';
  ctx.textAlign = 'center';
  var labelEvery = totalWeeks <= 8 ? 1 : totalWeeks <= 16 ? 2 : 4;
  for (var w = 0; w <= totalWeeks; w += labelEvery) {
    var lx = xOf(w * 7);
    if (lx > PAD.left + cW + 8) break;
    ctx.fillText('W' + w, lx, PAD.top + cH + 18);
  }
}

function _updateBloodTabVis() {
  var hasTier23 = false;
  _userStacks.forEach(function(st, si) {
    if (!_isActiveStack(si)) return;
    if ((st.trt && st.trt.enabled && (st.trt.compounds || []).length) ||
        (st.enhanced && st.enhanced.enabled && (st.enhanced.compounds || []).length)) {
      hasTier23 = true;
    }
  });
  var btn = document.getElementById('tab-btn-blood');
  if (!btn) return;
  btn.style.display = hasTier23 ? '' : 'none';
  if (!hasTier23 && typeof _currentTab !== 'undefined' && _currentTab === 'blood') {
    var tb = document.getElementById('tab-btn-today');
    if (tb) switchTab('today', tb);
  }
}

function buildBloodLevels() {
  var el = document.getElementById('blood-body');
  if (!el) return;

  var items = [];
  _userStacks.forEach(function(st, si) {
    if (!_isActiveStack(si)) return;
    var cycleLen = (st.cycle_length || 12) * 7;
    var cycleStartDow = st.cycle_start ? parseLocalDate(st.cycle_start).getDay() : 1;
    var stackLabel = st.name || ('Stack ' + (si + 1));

    // TRT compounds
    if (st.trt && st.trt.enabled) {
      (st.trt.compounds || []).forEach(function(c) {
        var guide = TRT_GUIDE[c.id];
        if (!guide) return;
        var halfLife = _parseHalfLifeDays(guide.halfLife);
        if (!halfLife) return;
        var doseNum = parseFloat(c.dose) || 0;
        if (!doseNum) return;
        var injDays = _pkInjectionDays(c, cycleLen, cycleStartDow);
        if (!injDays.length) return;
        var curve = _pkCurve(injDays, doseNum, halfLife, cycleLen);
        var trtEntry = TRT_CAT.find(function(x) { return x.id === c.id; });
        items.push({
          name: c.name,
          unit: c.unit || 'mg',
          dot: trtEntry ? trtEntry.dot : '#e8a020',
          curve: curve,
          cycleLen: cycleLen,
          stackLabel: stackLabel,
          halfLifeStr: guide.halfLife
        });
      });
    }

    // Enhanced compounds
    if (st.enhanced && st.enhanced.enabled) {
      (st.enhanced.compounds || []).forEach(function(c) {
        var ec = ENHANCEMENT_COMPOUNDS.find(function(x) { return x.id === c.id; });
        if (!ec || !ec.cadence) return;
        var halfLifeStr = ec.cadence.halfLife;
        // HGH active half-life is ~20 min (pulse); use IGF-1 proxy of 1 day for meaningful plot
        var halfLife = ec.id === 'hgh' ? 1 : _parseHalfLifeDays(halfLifeStr);
        if (!halfLife) return;
        var doseNum = parseFloat(c.dose) || 0;
        if (!doseNum) return;
        var unit = c.unit || ec.unit || 'mg/week';
        var injDays = _pkInjectionDays(c, cycleLen, cycleStartDow);
        if (!injDays.length) return;
        // Compute per-injection dose from weekly/daily unit
        var injsPerWeek = injDays.filter(function(d) { return d < 7; }).length || 1;
        var dosePerInj;
        if (unit === 'mg/week') dosePerInj = doseNum / injsPerWeek;
        else dosePerInj = doseNum; // mg/day, mg/EOD, IU/day: already per-injection
        var curve = _pkCurve(injDays, dosePerInj, halfLife, cycleLen);
        items.push({
          name: c.name,
          unit: unit,
          dot: c.dot || ec.dot || '#a855f7',
          curve: curve,
          cycleLen: cycleLen,
          stackLabel: stackLabel,
          halfLifeStr: ec.id === 'hgh' ? '~24h IGF-1 effect' : halfLifeStr
        });
      });
    }
  });

  if (!items.length) {
    el.innerHTML = '<div style="padding:48px 20px;text-align:center;"><div style="font-size:32px;margin-bottom:12px;">📈</div><div style="color:var(--muted2);font-size:13px;line-height:1.6">No TRT or enhanced compounds with doses configured.<br>Add compounds in your stack to see plasma concentration curves.</div></div>';
    return;
  }

  var html = '<div style="padding:12px 16px 4px;font-size:10px;color:var(--muted2);text-transform:uppercase;letter-spacing:1px;">Expected plasma concentration over cycle</div>';
  items.forEach(function(item, idx) {
    html += '<div class="card">';
    html += '<div class="card-header"><div class="card-title-wrap"><div class="card-dot" style="background:' + item.dot + '"></div><div class="card-title">' + _esc(item.name.toUpperCase()) + '</div></div>';
    html += '<span style="font-size:10px;color:var(--muted2);padding-right:2px;white-space:nowrap">t½ ' + _esc(item.halfLifeStr) + '</span>';
    html += '</div>';
    html += '<div style="padding:2px 16px 14px"><canvas id="pk-chart-' + idx + '" height="110" style="width:100%;display:block;"></canvas></div>';
    if (items.length > 1) {
      html += '<div style="padding:0 16px 10px;font-size:10px;color:var(--muted2)">' + _esc(item.stackLabel) + ' · ' + item.cycleLen + '-day cycle</div>';
    }
    html += '</div>';
  });

  el.innerHTML = html;

  requestAnimationFrame(function() {
    items.forEach(function(item, idx) {
      var canvas = document.getElementById('pk-chart-' + idx);
      if (canvas) _drawPkChart(canvas, item.curve, item.dot, item.unit, item.cycleLen);
    });
  });
}
