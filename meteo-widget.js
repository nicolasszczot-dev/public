// meteo-widget.js
// Version adaptée pour être chargée depuis un fichier externe (ex : Carrd embed).
// Le code s'initialise au DOMContentLoaded et expose window.checkWeather.

(function() {
  // On expose la fonction au scope global pour que onclick="checkWeather()" fonctionne.
  window.checkWeather = async function() {
    const zipcodeEl = document.getElementById('zipcode');
    const dateEl = document.getElementById('date');
    if (!zipcodeEl || !dateEl) {
      console.warn('Elements zipcode/date non trouvés dans le DOM.');
      return;
    }

    const zipcode = zipcodeEl.value.trim();
    const date = dateEl.value;

    // Reset
    hideError();
    hideWidget();

    // Validation
    if (!zipcode || zipcode.length !== 5 || !/^\d{5}$/.test(zipcode)) {
      showError('Veuillez entrer un code postal valide (5 chiffres)');
      return;
    }

    if (!date) {
      showError('Veuillez sélectionner une date');
      return;
    }

    // Vérifier que la date n'est pas trop lointaine (16 jours max)
    const selectedDate = new Date(date);
    const today = new Date();
    const maxDate = new Date();
    maxDate.setDate(today.getDate() + 16);

    if (selectedDate > maxDate) {
      showError('Les prévisions sont disponibles jusqu\'à 16 jours à l\'avance');
      return;
    }

    // Afficher loading
    showLoading();

    try {
      // Étape 1 : Géocoder le code postal français
      const geoUrl = `https://api-adresse.data.gouv.fr/search/?q=${zipcode}&limit=1`;
      const geoResponse = await fetch(geoUrl);

      if (!geoResponse.ok) {
        throw new Error('Erreur lors du géocodage du code postal');
      }

      const geoData = await geoResponse.json();

      if (!geoData.features || geoData.features.length === 0) {
        throw new Error('Code postal introuvable. Vérifiez le code postal saisi.');
      }

      const coords = geoData.features[0].geometry.coordinates;
      const cityName = geoData.features[0].properties.city || geoData.features[0].properties.label;
      const lon = coords[0];
      const lat = coords[1];

      // Étape 2 : Récupérer les données météo
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max,relative_humidity_2m_max,sunrise,sunset&timezone=auto&forecast_days=16`;
      const weatherResponse = await fetch(weatherUrl);

      if (!weatherResponse.ok) {
        const errorText = await weatherResponse.text();
        throw new Error(`Erreur API (${weatherResponse.status}): ${errorText}`);
      }

      const weatherData = await weatherResponse.json();

      if (!weatherData.daily || !weatherData.daily.time) {
        throw new Error('Les données météo ne sont pas disponibles pour cette localisation');
      }

      const dateIndex = weatherData.daily.time.indexOf(date);

      if (dateIndex === -1) {
        throw new Error('Date non disponible dans les prévisions');
      }

      const startIndex = Math.max(0, dateIndex - 3);
      const endIndex = Math.min(weatherData.daily.time.length - 1, dateIndex + 3);

      const weatherCode = weatherData.daily.weathercode[dateIndex];
      const tempMax = Math.round(weatherData.daily.temperature_2m_max[dateIndex]);
      const tempMin = Math.round(weatherData.daily.temperature_2m_min[dateIndex]);
      const rainProb = weatherData.daily.precipitation_probability_max[dateIndex];
      const windSpeed = Math.round(weatherData.daily.windspeed_10m_max[dateIndex]);
      const humidity = weatherData.daily.relative_humidity_2m_max[dateIndex];
      const sunrise = weatherData.daily.sunrise[dateIndex].split('T')[1];
      const sunset = weatherData.daily.sunset[dateIndex].split('T')[1];

      const snowCodes = [71, 73, 75, 77, 85, 86];
      const hasSnow = snowCodes.includes(weatherCode);
      const snowRisk = hasSnow ? 'OUI' : (tempMax < 3 && rainProb > 30 ? 'POSSIBLE' : 'NON');

      const weekData = [];
      for (let i = startIndex; i <= endIndex; i++) {
        const dayWeatherCode = weatherData.daily.weathercode[i];
        const dayTempMax = Math.round(weatherData.daily.temperature_2m_max[i]);
        const dayRainProb = weatherData.daily.precipitation_probability_max[i];
        const dayWindSpeed = Math.round(weatherData.daily.windspeed_10m_max[i]);
        const dayHumidity = weatherData.daily.relative_humidity_2m_max[i];
        const dayHasSnow = snowCodes.includes(dayWeatherCode);
        const daySnowRisk = dayHasSnow ? 'OUI' : (dayTempMax < 3 && dayRainProb > 30 ? 'POSSIBLE' : 'NON');

        weekData.push({
          date: weatherData.daily.time[i],
          weatherCode: dayWeatherCode,
          tempMax: dayTempMax,
          rainProb: dayRainProb,
          windSpeed: dayWindSpeed,
          humidity: dayHumidity,
          snowRisk: daySnowRisk,
          isSelected: (i === dateIndex)
        });
      }

      displayWeather({
        city: cityName,
        zipcode: zipcode,
        date: formatDate(date),
        weatherCode: weatherCode,
        tempMax: tempMax,
        tempMin: tempMin,
        rainProb: rainProb,
        windSpeed: windSpeed,
        humidity: humidity,
        sunrise: sunrise,
        sunset: sunset,
        snowRisk: snowRisk,
        weekData: weekData,
        lat: lat,
        lon: lon
      });

    } catch (error) {
      hideLoading();
      showError('Erreur lors de la récupération des données : ' + error.message);
    }
  };

  // --- Fonctions d'affichage et utilitaires ---
  function displayWeather(data) {
    hideLoading();
    const loc = document.getElementById('location');
    const wdate = document.getElementById('weather-date');
    if (loc) loc.textContent = `${data.city} (${data.zipcode})`;
    if (wdate) wdate.textContent = data.date;

    const weatherInfo = getWeatherInfo(data.weatherCode);
    const iconEl = document.getElementById('weather-icon');
    const condEl = document.getElementById('condition');
    if (iconEl) iconEl.textContent = weatherInfo.icon;
    if (condEl) condEl.textContent = weatherInfo.description;

    const tempEl = document.getElementById('temperature');
    if (tempEl) tempEl.textContent = `${data.tempMax}°C`;

    const windEl = document.getElementById('wind');
    const humEl = document.getElementById('humidity');
    const rainEl = document.getElementById('rain-prob');
    if (windEl) windEl.textContent = `${data.windSpeed} km/h`;
    if (humEl) humEl.textContent = `${data.humidity}%`;
    if (rainEl) rainEl.textContent = `${data.rainProb}%`;

    const snowEl = document.getElementById('snow-prob');
    if (snowEl) snowEl.textContent = data.snowRisk;

    const sunriseEl = document.getElementById('sunrise');
    const sunsetEl = document.getElementById('sunset');
    if (sunriseEl) sunriseEl.textContent = data.sunrise;
    if (sunsetEl) sunsetEl.textContent = data.sunset;

    showWidget();
    displayWeekForecast(data.weekData, data.lat, data.lon, data.city, data.zipcode);
  }

  function displayWeekForecast(weekData, lat, lon) {
    const daysGrid = document.getElementById('days-grid');
    if (!daysGrid) return;
    daysGrid.innerHTML = '';

    weekData.forEach(day => {
      const weatherInfo = getWeatherInfo(day.weatherCode);
      const dateObj = new Date(day.date + 'T00:00:00');
      const dayName = dateObj.toLocaleDateString('fr-FR', { weekday: 'short' });
      const dayDate = dateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

      const ventuskyUrl = `https://www.ventusky.com/?p=${lat.toFixed(2)};${lon.toFixed(2)};10&l=rain-3h`;

      const link = document.createElement('a');
      link.href = ventuskyUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.style.textDecoration = 'none';
      link.style.color = 'inherit';

      const card = document.createElement('div');
      card.className = `day-card${day.isSelected ? ' selected' : ''}`;
      card.title = 'Cliquez pour voir les prévisions détaillées sur Ventusky';

      card.innerHTML = `
        <div class="day-name">${dayName}</div>
        <div class="day-date">${dayDate}</div>
        <div class="day-icon">${weatherInfo.icon}</div>
        <div class="day-temp">${day.tempMax}°C</div>
        <div class="day-info">
          <div class="day-info-row"><span class="day-info-label">Pluie</span><span class="day-info-value">${day.rainProb}%</span></div>
          <div class="day-info-row"><span class="day-info-label">Vent</span><span class="day-info-value">${day.windSpeed} km/h</span></div>
          <div class="day-info-row"><span class="day-info-label">Humidité</span><span class="day-info-value">${day.humidity}%</span></div>
          <div class="day-info-row"><span class="day-info-label">Neige</span><span class="day-info-value">${day.snowRisk}</span></div>
        </div>
        <div class="day-more-info"><span>▶</span><span>Détails météo</span></div>
        <div class="windy-icon">🌐</div>
      `;

      link.appendChild(card);
      daysGrid.appendChild(link);
    });

    const wf = document.getElementById('week-forecast');
    if (wf) wf.style.display = 'block';
  }

  function getWeatherInfo(code) {
    const weatherCodes = {
      0: { icon: '☀️', description: 'Ciel dégagé' },
      1: { icon: '🌤️', description: 'Principalement dégagé' },
      2: { icon: '⛅', description: 'Partiellement nuageux' },
      3: { icon: '☁️', description: 'Couvert' },
      45: { icon: '🌫️', description: 'Brouillard' },
      48: { icon: '🌫️', description: 'Brouillard givrant' },
      51: { icon: '🌦️', description: 'Bruine légère' },
      53: { icon: '🌦️', description: 'Bruine modérée' },
      55: { icon: '🌧️', description: 'Bruine dense' },
      61: { icon: '🌧️', description: 'Pluie légère' },
      63: { icon: '🌧️', description: 'Pluie modérée' },
      65: { icon: '🌧️', description: 'Pluie forte' },
      71: { icon: '🌨️', description: 'Neige légère' },
      73: { icon: '🌨️', description: 'Neige modérée' },
      75: { icon: '❄️', description: 'Neige forte' },
      77: { icon: '🌨️', description: 'Grains de neige' },
      80: { icon: '🌦️', description: 'Averses légères' },
      81: { icon: '🌧️', description: 'Averses modérées' },
      82: { icon: '⛈️', description: 'Averses violentes' },
      85: { icon: '🌨️', description: 'Averses de neige légères' },
      86: { icon: '❄️', description: 'Averses de neige fortes' },
      95: { icon: '⛈️', description: 'Orage' },
      96: { icon: '⛈️', description: 'Orage avec grêle légère' },
      99: { icon: '⛈️', description: 'Orage avec grêle forte' }
    };

    return weatherCodes[code] || { icon: '🌤️', description: 'Variable' };
  }

  function formatDate(dateString) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('fr-FR', options);
  }

  // Fonctions d'affichage
  function showLoading() {
    const el = document.getElementById('loading');
    if (el) el.classList.add('show');
  }

  function hideLoading() {
    const el = document.getElementById('loading');
    if (el) el.classList.remove('show');
  }

  function showWidget() {
    const el = document.getElementById('weather-widget');
    if (el) el.classList.add('show');
  }

  function hideWidget() {
    const el = document.getElementById('weather-widget');
    if (el) el && el.classList.remove('show');
    const wf = document.getElementById('week-forecast');
    if (wf) wf.style.display = 'none';
  }

  function showError(message) {
    const errorDiv = document.getElementById('error');
    if (!errorDiv) return;
    errorDiv.textContent = '⚠️ ' + message;
    errorDiv.classList.add('show');
  }

  function hideError() {
    const errorDiv = document.getElementById('error');
    if (!errorDiv) return;
    errorDiv.classList.remove('show');
  }

  // Permettre la validation avec Entrée
  function attachEnterKeyListeners() {
    const zip = document.getElementById('zipcode');
    const date = document.getElementById('date');
    if (zip) zip.addEventListener('keypress', function(e) { if (e.key === 'Enter') window.checkWeather(); });
    if (date) date.addEventListener('keypress', function(e) { if (e.key === 'Enter') window.checkWeather(); });
  }

  // Initialisation quand le DOM est prêt
  document.addEventListener('DOMContentLoaded', function() {
    const dateEl = document.getElementById('date');
    if (dateEl) dateEl.min = new Date().toISOString().split('T')[0];
    attachEnterKeyListeners();
  });

})();
