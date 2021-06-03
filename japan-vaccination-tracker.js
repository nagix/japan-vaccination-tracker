const CIO_PORTAL = 'https://cio.go.jp/c19vaccine_opendata';
const GITHUB = 'https://github.com/nagix/japan-vaccination-tracker';

let lastTimeUpdate = 0;
let lastDataUpdate = getLocalTime().startOf('hour').toMillis();
const total = {};
const dict = {};
const dates = {};
let startOfToday;
const touchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
let active;

const time = document.getElementById('time');
const map = L.map('map', {center: [36, 136], zoom: document.body.clientWidth < 600 ? 5 : 6});
const att = `<a href="${CIO_PORTAL}" target="_blank">政府CIOポータル</a> | <a href="${GITHUB}" target="_blank">&copy; Akihiko Kusanagi</a>`;
map.zoomControl.setPosition('topright');
L.control.scale({imperial: false}).addTo(map);

function loadJSON(url) {
  return fetch(url).then(async response => response.json());
}

function getLocalTime() {
  return luxon.DateTime.fromObject({zone: 'Asia/Tokyo'});
}

function stopPropagation(event) {
  if (event instanceof MouseEvent) {
    event.stopPropagation();
  }
}

function refreshDict(vaccination) {
  total.base = [0, 0];
  total.rate = [0, 0];
  for (const key of Object.keys(dict)) {
    const item = dict[key];
    item.base = [0, 0];
    item.rate = [0, 0];
    item.daily = {};
  }
  for (const key of Object.keys(dates)) {
    delete dates[key];
  }
  for (const {date, prefecture, status, count} of vaccination) {
    const item = dict[prefecture];
    let daily = item.daily[date];
    if (!daily) {
      daily = item.daily[date] = [0, 0];
    }
    item.base[status - 1] += count;
    total.base[status - 1] += count;
    daily[status - 1] += count;
    dates[date] = true;
  }
  const week = Object.keys(dates).sort().slice(-7);
  const lastDay = luxon.DateTime.fromISO(week[6], {zone: 'Asia/Tokyo'});
  startOfToday = lastDay.plus({days: 1}).startOf('day').toMillis();
  const t = ease((getLocalTime().toMillis() - startOfToday) / 86400000);
  for (const key of Object.keys(dict)) {
    const item = dict[key];
    for (const date of week) {
      const daily = item.daily[date];
      if (daily) {
        item.rate[0] += daily[0] / 7;
        item.rate[1] += daily[1] / 7;
        total.rate[0] += daily[0] / 7;
        total.rate[1] += daily[1] / 7;
      }
    }
    item.count = [
      Math.floor(item.base[0] + item.rate[0] * t),
      Math.floor(item.base[1] + item.rate[1] * t)
    ];
  }
  total.count = [
    Math.floor(total.base[0] + total.rate[0] * t),
    Math.floor(total.base[1] + total.rate[1] * t)
  ];
}

function setOdometerDuration(selectors, duration) {
  const style = document.head.querySelector('style:last-child');
  style.appendChild(document.createTextNode([
    `${selectors} .odometer-ribbon-inner`,
    `{transition-duration: ${Math.min(duration, 2000)}ms; transition-property: transform}`
  ].join(' ')));
}

function refreshOdometerDuration() {
  document.head.querySelector('style:last-child').innerHTML = '';
  for (const key of Object.keys(dict)) {
    setOdometerDuration(`#label-${key}`, 86400000 / dict[key].rate[0] / 2);
  }
  setOdometerDuration('#total-count', 86400000 / total.rate[0] / 2);
}

function changeStyle(item, activate) {
  if (activate) {
    item.layer.setStyle({color: '#f00', fillColor: '#f00'});
    item.leader.setStyle({color: '#f00'});
    item.label.classList.add('active');
  } else {
    item.layer.setStyle({color: '#00f', fillColor: '#00f'});
    item.leader.setStyle({color: '#999'});
    item.label.classList.remove('active');
  }
}

function onMouseOver(prefecture) {
  return touchDevice ? () => {} : () => {
    changeStyle(dict[prefecture], true);
  };
}

function onMouseOut(prefecture) {
  return touchDevice ? () => {} : () => {
    changeStyle(dict[prefecture]);
  };
}

function onClick(prefecture) {
  return touchDevice ? e => {
    const item = dict[prefecture];
    if (active) {
      changeStyle(active);
    }
    active = item;
    if (active) {
      changeStyle(active, true);
      showChart(active);
      stopPropagation(e);
    }
  } : e => {
    const item = dict[prefecture];
    if (item) {
      showChart(item);
      stopPropagation(e);
    }
  };
}

function changeElementScale(element, factor) {
  const style = element.style;
  style.padding = `0 ${10 * factor}px`;
  style.width = `${200 * factor}px`;
  style.height = `${22 * factor}px`;
  style.fontSize = `${14 * factor}px`;
}

function showChart(item) {
  const id = `chart-${Date.now()}`;
  const popup = L.popup({autoPanPaddingTopLeft: [5, 155]})
    .setLatLng(item.latLng)
    .setContent([
      '<div>',
      `<div class="chart-title">${item.name}</div>`,
      `<div id="${id}-select" class="chart-select">`,
      '<div id="chart-total" class="chart-select-item active">累計人数</div>',
      '<div id="chart-count" class="chart-select-item">接種回数</div>',
      '<div id="chart-ratio" class="chart-select-item">接種率</div>',
      '</div></div>',
      `<div class="chart-body"><canvas id="${id}"></canvas></div>`
    ].join(''))
    .openOn(map);
  const dates = Object.keys(item.daily).sort();
  const chart = new Chart(document.getElementById(id), {
    type: 'bar',
    data: {
      labels: dates,
      datasets: [{
        order: 1,
        backgroundColor: 'rgb(78, 121, 167)',
        pointRadius: 0,
        data: dates.map(() => 0)
      }, {
        order: 0,
        backgroundColor: 'rgb(242, 142, 43)',
        pointRadius: 0,
        data: dates.map(() => 0)
      }]
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'category',
          stacked: true,
          grid: {
            offset: false
          },
          ticks: {
            maxRotation: 0,
            callback: function(value) {
              const label = this.getLabelForValue(value);
              return luxon.DateTime.fromISO(label).toFormat('M/d');
            }
          }
        },
        y: {
          stacked: true
        }
      },
      interaction: {
        intersect: false
      },
      plugins: {
        legend: {
          reverse: true,
          labels: {
            pointStyle: 'rect',
            usePointStyle: true
          }
        },
        tooltip: {
          itemSort: (a, b) => a.datasetIndex - b.datasetIndex
        }
      }
    }
  });
  refreshChart(chart, 'chart-total', item);
  popup.on('remove', () => {
    chart.destroy();
  });
  const select = document.getElementById(`${id}-select`);
  select.querySelectorAll('.chart-select-item').forEach(element => {
    element.addEventListener('click', e => {
      select.querySelector('.chart-select-item.active').classList.remove('active');
      refreshChart(chart, e.target.id, item);
      e.target.classList.add('active');
    });
  });
}

function refreshChart(chart, type, item) {
  const {labels, datasets} = chart.data;
  const yScale = chart.options.scales.y;
  const daily = [0, 0];
  if (type === 'chart-total') {
    datasets[0].type = 'bar';
    datasets[0].label = '一般接種';
    datasets[0].borderColor = 'transparent';
    datasets[1].type = 'bar';
    datasets[1].label = 'うち2回目完了';
    datasets[1].borderColor = 'transparent';
    for (let i = 0; i < labels.length; i++) {
      datasets[0].data[i] = daily[0] += item.daily[labels[i]][0];
      datasets[1].data[i] = daily[1] += item.daily[labels[i]][1];
    }
    yScale.stacked = false;
    yScale.ticks.callback = Chart.Ticks.formatters.numeric;
  } else if (type === 'chart-count') {
    datasets[0].type = 'bar';
    datasets[0].label = '一般接種1回目';
    datasets[0].borderColor = 'transparent';
    datasets[1].type = 'bar';
    datasets[1].label = '一般接種2回目';
    datasets[1].borderColor = 'transparent';
    for (let i = 0; i < labels.length; i++) {
      datasets[0].data[i] = item.daily[labels[i]][0];
      datasets[1].data[i] = item.daily[labels[i]][1];
    }
    yScale.stacked = true;
    yScale.ticks.callback = Chart.Ticks.formatters.numeric;
  } else {
    datasets[0].type = 'line';
    datasets[0].label = '一般接種1回目';
    datasets[0].borderColor = 'rgb(78, 121, 167)';
    datasets[1].type = 'line';
    datasets[1].label = '一般接種2回目';
    datasets[1].borderColor = 'rgb(242, 142, 43)';
    for (let i = 0; i < labels.length; i++) {
      daily[0] += item.daily[labels[i]][0];
      daily[1] += item.daily[labels[i]][1];
      datasets[0].data[i] = daily[0] / item.population * 100;
      datasets[1].data[i] = daily[1] / item.population * 100;
    }
    yScale.stacked = false;
    yScale.ticks.callback = v => `${v}%`;
  }
  chart.update();
}

function ease(t) {
  const t0 = t % 1;
  let v = 0;
  if (t0 > 0.25 && t0 <= 0.5) {
    v = 4 * t0 * t0 - 2 * t0 + 0.25;
  } else if (t0 > 0.5 && t0 <= 0.75) {
    v = 2 * t - 0.75;
  } else if (t0 > 0.75) {
    v = -4 * t0 * t0 + 8 * t0 - 3;
  }
  return Math.floor(t) + v;
}

Promise.all([
  'prefectures.geojson',
  'prefectures.json',
  'https://nagi-p.com/vaccination/prefecture.json'
].map(loadJSON)).then(([geojson, data, vaccination]) => {
  const frontera = L.geoJson(geojson, {
    attribution: att,
    bubblingMouseEvents: false,
    style: {color: '#00f', weight: 2, opacity: 0.6, fillOpacity: 0.1, fillColor: '#00f'},
    onEachFeature: (feat, layer) => {
      layer.on({
        mouseover: onMouseOver(feat.properties.prefecture),
        mouseout: onMouseOut(feat.properties.prefecture),
        click: onClick(feat.properties.prefecture)
      });
    }
  }).addTo(map);

  map.on({
    zoomstart: () => {
      document.querySelectorAll('.label').forEach(element => {
        element.style.visibility = 'hidden';
      });
    },
    zoomend: () => {
      document.querySelectorAll('.label').forEach(element => {
        changeElementScale(element, Math.pow(2, map.getZoom() - 6));
        element.style.visibility = 'visible';
      });
    },
    click: onClick()
  });

  for (const {prefecture, name, population, lat, lng, lr, ll} of data) {
    const item = dict[prefecture] = {flash: 0};
    const latLng = item.latLng = L.latLng(lat, lng);
    const {x: x1, y: y1} = map.project(latLng);
    const factor = Math.pow(2, map.getZoom() - 6);
    const x2 = x1 + ll * Math.sin(lr * Math.PI / 180) * factor;
    const y2 = y1 - ll * Math.cos(lr * Math.PI / 180) * factor;
    const anchor = map.unproject([x2, y2]);
    const anchorEnd = map.unproject([x2 + (lr < 0 ? -200 : 200) * factor, y2]);
    item.leader = L.polyline([latLng, anchor, anchorEnd], {color: '#999', opacity: 0.6, weight: 1, interactive: false}).addTo(map);
    item.name = name;
    item.population = population;
    const icon = L.divIcon({
      className: '',
      iconSize: [0, 0],
      html: [
        `<div id="label-${prefecture}" class="label ${lr < 0 ? 'left' : 'right'}">`,
        '<div class="label-group">',
        `<span class="prefecture-name">${name}</span>`,
        '<span class="prefecture-count odometer"></span>',
        '</div></div>'
      ].join('')});
    const marker = L.marker(anchor, {icon}).addTo(map);
    const element = document.querySelector(`#label-${prefecture}`);
    changeElementScale(element, factor);
    item.label = element;
    for (const layer of frontera.getLayers()) {
      if (layer.feature.properties.prefecture === prefecture) {
        item.layer = layer;
        break;
      }
    }
    const group = element.querySelector('.label-group');
    group.addEventListener('mouseover', onMouseOver(prefecture));
    group.addEventListener('mouseout', onMouseOut(prefecture));
    group.addEventListener('click', onClick(prefecture));
  }

  refreshDict(vaccination);
  refreshOdometerDuration();

  for (const key of Object.keys(dict)) {
    const item = dict[key];
    item.odometer = new Odometer({
      el: document.querySelector(`#label-${key} .odometer`),
      value: item.count[0]
    });
  }
  total.odometer = new Odometer({
    el: document.querySelector('#total-count'),
    value: total.count[0]
  });

  var nextFrame;
  (function frameRefresh() {
    const now = performance.now();
    const localTime = getLocalTime();
    const t = ease((localTime.toMillis() - startOfToday) / 86400000);
    if (!(nextFrame > now)) {
      for (const key of Object.keys(dict)) {
        const item = dict[key];
        const estimate = Math.floor(item.base[0] + item.rate[0] * t);
        if (item.count[0] < estimate) {
          item.count[0] = estimate;
          item.odometer.update(estimate);
          item.flash = 7;
        }
        if (item.flash > 0) {
          item.flash--;
          item.layer.setStyle({fillOpacity: 0.1 + item.flash * 0.1});
        }
      }
      nextFrame = Math.max((nextFrame || 0) + 1000 / 6, now);
    }
    const estimate = Math.floor(total.base[0] + total.rate[0] * t);
    if (total.count[0] < estimate) {
      total.count[0] = estimate;
      total.odometer.update(estimate);
    }
    const timeUpdate = localTime.startOf('second').toMillis();
    if (lastTimeUpdate !== timeUpdate) {
      time.textContent = localTime.toFormat('yyyy年M月d日 HH:mm:ss');
      lastTimeUpdate = timeUpdate;
    }
    const dataUpdate = localTime.startOf('hour').toMillis();
    if (lastDataUpdate !== dataUpdate) {
      loadJSON('https://nagi-p.com/vaccination/prefecture.json').then(vaccination => {
        refreshDict(vaccination);
        refreshOdometerDuration();
      });
      lastDataUpdate = dataUpdate;
    }
    window.requestAnimationFrame(frameRefresh);
  })();

});
