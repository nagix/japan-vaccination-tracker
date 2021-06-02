const CIO_PORTAL = 'https://cio.go.jp/c19vaccine_opendata';
const GITHUB = 'https://github.com/nagix/japan-vaccination-tracker';

let lastTimeUpdate = 0;
const total = {};
const dict = {};
const dates = {};
let lastDay;
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

function getMillisOfDay(lastDay) {
  const localTime = luxon.DateTime.fromISO(lastDay, {zone: 'Asia/Tokyo'});
  return Date.now() - localTime.plus({days: 1}).startOf('day').toMillis();
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
  lastDay = week[6];
  const millis = getMillisOfDay(lastDay);
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
      Math.floor(item.base[0] + item.rate[0] * ease(millis / 86400000)),
      Math.floor(item.base[1] + item.rate[1] * ease(millis / 86400000))
    ];
  }
  total.count = [
    Math.floor(total.base[0] + total.rate[0] * ease(millis / 86400000)),
    Math.floor(total.base[1] + total.rate[1] * ease(millis / 86400000))
  ];
}

function setOdometerDuration(selectors, duration) {
  const style = document.head.querySelector('style:last-child');
  style.appendChild(document.createTextNode([
    `${selectors} .odometer-ribbon-inner`,
    `{transition-duration: ${Math.min(duration, 2000)}ms; transition-property: transform}`
  ].join(' ')));
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
      `<span class="chart-title">${item.name}</span>`,
      '<span class="chart-subtitle">接種数日次推移</span>',
      '</div>',
      `<div class="chart-body"><canvas id="${id}"></canvas></div>`
    ].join(''))
    .openOn(map);
  const dates = Object.keys(item.daily).sort();
  const chart = new Chart(document.querySelector(`#${id}`), {
    type: 'bar',
    data: {
      datasets: [{
        order: 1,
        label: '一般接種1回目',
        data: dates.map(x => ({x, y: item.daily[x][0]})),
        backgroundColor: 'rgb(78, 121, 167)'
      }, {
        order: 0,
        label: '一般接種2回目',
        data: dates.map(x => ({x, y: item.daily[x][1]})),
        backgroundColor: 'rgb(242, 142, 43)'
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
  popup.on('remove', () => {
    chart.destroy();
  });
}

function ease(t) {
  const t0 = t % 1;
  let v;
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

  for (const {prefecture, name, lat, lng, lr, ll} of data) {
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

  for (const key of Object.keys(dict)) {
    const item = dict[key];
    item.odometer = new Odometer({
      el: document.querySelector(`#label-${key} .odometer`),
      value: item.count[0]
    });
    setOdometerDuration(`#label-${key}`, 86400000 / item.rate[0] / 2);
  }
  total.odometer = new Odometer({
    el: document.querySelector('#total-count'),
    value: total.count[0]
  });
  setOdometerDuration('#total-count', 86400000 / total.rate[0] / 2);

  (function frameRefresh() {
    const millis = getMillisOfDay(lastDay);
    for (const key of Object.keys(dict)) {
      const item = dict[key];
      const estimate = Math.floor(item.base[0] + item.rate[0] * ease(millis / 86400000));
      if (item.count[0] < estimate) {
        item.count[0] = estimate;
        item.odometer.update(estimate);
        item.flash = 61;
      }
      if (item.flash > 0) {
        item.flash--;
        if (item.flash % 10 === 0) {
          item.layer.setStyle({fillOpacity: 0.1 + item.flash / 100});
        }
      }
    }
    const estimate = Math.floor(total.base[0] + total.rate[0] * ease(millis / 86400000));
    if (total.count[0] < estimate) {
      total.count[0] = estimate;
      total.odometer.update(estimate);
    }
    if (lastTimeUpdate !== Date.now() % 1000 * 1000) {
      time.textContent = getLocalTime().toFormat('yyyy年M月d日 HH:mm:ss');
      lastTimeUpdate = Date.now() % 1000 * 1000;
    }
    window.requestAnimationFrame(frameRefresh);
  })();

});
