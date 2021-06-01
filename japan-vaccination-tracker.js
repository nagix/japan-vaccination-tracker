const SVG_NS = 'http://www.w3.org/2000/svg';

let lastTimeUpdate = 0;
const time = document.getElementById('time');
const svg = document.getElementById('info');
const map = L.map('map', {center: [36, 136], zoom: svg.clientWidth < 600 ? 5 : 6});
const att = '<a href="https://cio.go.jp/c19vaccine_opendata" target="_blank">政府CIOポータル</a> | <a href="https://github.com/nagix/japan-vaccination-tracker">&copy; Akihiko Kusanagi</a>';
map.zoomControl.setPosition('topright');
L.control.scale({imperial: false}).addTo(map);

function loadJSON(url) {
  return fetch(url).then(async response => response.json());
}

function getLocalTime() {
  return luxon.DateTime.fromObject({zone: 'Asia/Tokyo'});
}

function getMillisOfDay(lastDay) {
  const localTime = luxon.DateTime.fromFormat(lastDay, 'yyyy-MM-dd', {zone: 'Asia/Tokyo'});
  return Date.now() - localTime.plus({days: 1}).startOf('day').toMillis();
}

function setOdometerDuration(selectors, duration) {
  const style = document.head.querySelector('style:last-child');
  style.appendChild(document.createTextNode([
    `${selectors} .odometer-ribbon-inner`,
    `{transition-duration: ${Math.min(duration, 2000)}ms; transition-property: transform}`
  ].join(' ')));
}

function changeStyle(item, active) {
  if (active) {
    item.layer.setStyle({color: '#f00', fillColor: '#f00'});
    item.leader.setStyle({color: '#f00'});
    item.label.classList.add('active');
  } else {
    item.layer.setStyle({color: '#00f', fillColor: '#00f'});
    item.leader.setStyle({color: '#999'});
    item.label.classList.remove('active');
  }
}

function changeElementScale(element, factor) {
  const style = element.style;
  style.padding = `0 ${10 * factor}px`;
  style.width = `${200 * factor}px`;
  style.height = `${22 * factor}px`;
  style.fontSize = `${14 * factor}px`;
}

function showChart(map, item) {
  const id = `chart-${Date.now()}`;
  map.openPopup([
    `<div class="chart-title">${item.name}</div>`,
    `<div class="chart-body"><canvas id="${id}"></canvas></div>`
  ].join(''), item.latLng);

  const dates = Object.keys(item.daily).sort();
  const chart = new Chart(document.querySelector(`#${id}`), {
    type: 'bar',
    data: {
      datasets: [{
        label: '一般接種1回目',
        data: dates.map(x => ({x, y: item.daily[x][0]})),
        backgroundColor: 'rgb(78, 121, 167)'
      }]
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'category',
          grid: {
            offset: false
          },
          ticks: {
            maxRotation: 0,
            callback: function(value) {
              const label = this.getLabelForValue(value);
              return luxon.DateTime.fromFormat(label, 'yyyy-MM-dd').toFormat('M/d');
            }
          }
        }
      }
    }
  });
}

Promise.all([
  'prefectures.geojson',
  'prefectures.json',
  'https://nagi-p.com/vaccination/prefecture.json'
].map(loadJSON)).then(([geojson, data, vaccination]) => {
  const frontera = L.geoJson(geojson, {
    attribution: att,
    style: {color: '#00f', weight: 2, opacity: 0.6, fillOpacity: 0.1, fillColor: '#00f'},
    onEachFeature: function (feat, layer) {
      layer.on({
        mouseover: () => {
          changeStyle(dict[feat.properties.prefecture], true);
        },
        mouseout: () => {
          changeStyle(dict[feat.properties.prefecture]);
        },
        click: () => {
          showChart(map, dict[feat.properties.prefecture]);
        }
      });
    }
  }).addTo(map);

  map.on('zoomstart', () => {
    document.querySelectorAll('.label').forEach(element => {
      element.style.visibility = 'hidden';
    });
  });
  map.on('zoomend', () => {
    document.querySelectorAll('.label').forEach(element => {
      changeElementScale(element, Math.pow(2, map.getZoom() - 6));
      element.style.visibility = 'visible';
    });
  });

  const dict = {};
  const dates = {};
  const total = {base: [0, 0], rate: [0, 0]};
  for (const {date, prefecture, status, count} of vaccination) {
    let item = dict[prefecture];
    if (!item) {
      item = dict[prefecture] = {base: [0, 0], rate: [0, 0], daily: {}, flash: 0};
    }
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
  const millis = getMillisOfDay(week[6]);
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
      Math.floor(item.base[0] + item.rate[0] * millis / 86400000),
      Math.floor(item.base[1] + item.rate[1] * millis / 86400000)
    ];
    frontera.eachLayer(layer => {
      if (layer.feature.properties.prefecture === key) {
        item.layer = layer;
      }
    });
  }
  total.count = [
    Math.floor(total.base[0] + total.rate[0] * millis / 86400000),
    Math.floor(total.base[1] + total.rate[1] * millis / 86400000)
  ];
  total.odometer = new Odometer({
    el: document.querySelector('#total-count'),
    value: total.count[0]
  });
  setOdometerDuration('#total-count', 86400000 / total.rate[0]);

  for (const {prefecture, name, lat, lng, lr, ll} of data) {
    const item = dict[prefecture];
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
        '<span class="label-group">',
        `<span class="prefecture-name">${name}</span>`,
        `<span class="prefecture-count odometer">${item.count[0]}</span>`,
        '</span></div>'
      ].join('')});
    const marker = L.marker(anchor, {icon}).addTo(map);
    const element = document.querySelector(`#label-${prefecture}`);
    changeElementScale(element, factor);
    item.label = element;
    item.odometer = new Odometer({
      el: element.querySelector('.odometer'),
      value: item.count[0],
    });
    setOdometerDuration(`#label-${prefecture}`, 86400000 / item.rate[0]);
    const group = element.querySelector('.label-group');
    group.addEventListener('mouseover', () => {
      changeStyle(item, true);
    });
    group.addEventListener('mouseout', () => {
      changeStyle(item);
    });
    group.addEventListener('click', e => {
      showChart(map, item);
      e.stopPropagation();
    });
  }

  (function frameRefresh() {
    const millis = getMillisOfDay(week[6]);
    for (const key of Object.keys(dict)) {
      const item = dict[key];
      const estimate = Math.floor(item.base[0] + item.rate[0] * millis / 86400000);
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
    const estimate = Math.floor(total.base[0] + total.rate[0] * millis / 86400000);
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
