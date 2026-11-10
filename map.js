// Import Mapbox and D3 as ES modules
import mapboxgl from "https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

// Your public Mapbox token
mapboxgl.accessToken = "pk.eyJ1Ijoibm1pcmJla292YSIsImEiOiJjbXdiNng0eGEwMDdwMnhwdmJqdG5wdXRxIn0.uJQ5vxNbKR2un7oRZ91pLA";

// Create the map
const map = new mapboxgl.Map({
  container: "map", // id of the div that holds the map
  style: "mapbox://styles/mapbox/light-v11", // basemap style
  center: [-71.09415, 42.36027], // [longitude, latitude], near MIT
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

// Step 2.3: one shared style for both cities' bike lanes
const bikeLaneStyle = {
  "line-color": "#32D400",
  "line-width": 4,
  "line-opacity": 0.5,
};

// Step 5.4: 1440 "buckets", one per minute of the day.
// Each bucket holds the trips that started (or ended) in that minute.
let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

// Step 6.1: turn the share of departures (0 to 1) into just 3 values:
// 0 = mostly arrivals, 0.5 = balanced, 1 = mostly departures
let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

// Stations with no trips count as balanced (avoids dividing by 0)
function departureRatio(station) {
  return station.totalTraffic ? stationFlow(station.departures / station.totalTraffic) : 0.5;
}

// Step 3.3: turn a station's longitude/latitude into pixel x/y on the map
function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat);
  const { x, y } = map.project(point);
  return { cx: x, cy: y };
}

// Step 5.2: minutes since midnight -> "8:30 AM"
function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);
  return date.toLocaleString("en-US", { timeStyle: "short" });
}

// Step 5.3: a Date -> minutes since midnight (e.g. 8:30 AM -> 510)
function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// Step 5.4: get the trips within 60 minutes of the selected time,
// using the buckets instead of checking all 260,000 trips
function filterByMinute(tripsByMinute, minute) {
  if (minute === -1) {
    return tripsByMinute.flat(); // no filter: all trips
  }

  // Wrap around midnight, e.g. 12:30 AM - 60 min = 11:30 PM
  let minMinute = (minute - 60 + 1440) % 1440;
  let maxMinute = (minute + 60) % 1440;

  if (minMinute > maxMinute) {
    // The window crosses midnight: take the end of the day + the start
    let beforeMidnight = tripsByMinute.slice(minMinute);
    let afterMidnight = tripsByMinute.slice(0, maxMinute);
    return beforeMidnight.concat(afterMidnight).flat();
  } else {
    return tripsByMinute.slice(minMinute, maxMinute).flat();
  }
}

// Step 4.2 + 5.4: count arrivals, departures, and total trips per station
// for the selected time (-1 means all day)
function computeStationTraffic(stations, timeFilter = -1) {
  const departures = d3.rollup(
    filterByMinute(departuresByMinute, timeFilter),
    (v) => v.length,
    (d) => d.start_station_id,
  );

  const arrivals = d3.rollup(
    filterByMinute(arrivalsByMinute, timeFilter),
    (v) => v.length,
    (d) => d.end_station_id,
  );

  // Add the counts to each station (0 if a station had no trips)
  return stations.map((station) => {
    let id = station.short_name;
    station.arrivals = arrivals.get(id) ?? 0;
    station.departures = departures.get(id) ?? 0;
    station.totalTraffic = station.arrivals + station.departures;
    return station;
  });
}

// Wait for the map to finish loading before adding data
map.on("load", async () => {
  // Step 2.1: Boston bike lanes
  map.addSource("boston_route", {
    type: "geojson",
    data: "https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson",
  });

  map.addLayer({
    id: "boston-bike-lanes",
    type: "line",
    source: "boston_route",
    paint: bikeLaneStyle,
  });

  // Step 2.3: Cambridge bike lanes
  map.addSource("cambridge_route", {
    type: "geojson",
    data: "https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson",
  });

  map.addLayer({
    id: "cambridge-bike-lanes",
    type: "line",
    source: "cambridge_route",
    paint: bikeLaneStyle,
  });

  // Step 3.1: load the Bluebikes stations
  let jsonData;
  try {
    jsonData = await d3.json("https://dsc106.com/labs/lab07/data/bluebikes-stations.json");
    console.log("Loaded JSON Data:", jsonData);
  } catch (error) {
    console.error("Error loading JSON:", error);
    return;
  }

  // Step 4.1 + 5.3: load the trips, turn the time text into Dates,
  // and drop each trip into its start and end minute buckets
  await d3.csv("https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv", (trip) => {
    trip.started_at = new Date(trip.started_at);
    trip.ended_at = new Date(trip.ended_at);

    departuresByMinute[minutesSinceMidnight(trip.started_at)].push(trip);
    arrivalsByMinute[minutesSinceMidnight(trip.ended_at)].push(trip);

    return trip;
  });

  // Step 4.2: add arrivals, departures, and total traffic to each station
  const stations = computeStationTraffic(jsonData.data.stations);

  // Step 4.3: circle AREA matches traffic, so use a square root scale
  const radiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(stations, (d) => d.totalTraffic)])
    .range([0, 25]);

  // Step 3.3: one circle per station, drawn in the SVG on top of the map.
  // The key (short_name) lets D3 match each station to its own circle on updates.
  const svg = d3.select("#map").select("svg");

  const circles = svg
    .selectAll("circle")
    .data(stations, (d) => d.short_name)
    .enter()
    .append("circle")
    .attr("r", (d) => radiusScale(d.totalTraffic))
    .style("--departure-ratio", (d) => departureRatio(d));

  // Step 4.4: browser tooltip with exact numbers
  circles.append("title");

  function updateTooltips() {
    circles
      .select("title")
      .text((d) => `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
  }

  updateTooltips();

  // Put each circle where its station is on the map right now
  function updatePositions() {
    circles
      .attr("cx", (d) => getCoords(d).cx)
      .attr("cy", (d) => getCoords(d).cy);
  }

  updatePositions();

  // Move the circles whenever the map moves
  map.on("move", updatePositions);
  map.on("zoom", updatePositions);
  map.on("resize", updatePositions);
  map.on("moveend", updatePositions);

  // Step 5.2: connect the slider
  const timeSlider = document.getElementById("time-slider");
  const selectedTime = document.getElementById("selected-time");
  const anyTimeLabel = document.getElementById("any-time");

  // Step 5.3: resize circles for the selected time
  function updateScatterPlot(timeFilter) {
    const filteredStations = computeStationTraffic(stations, timeFilter);

    // Fewer trips when filtering, so allow bigger circles
    timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);

    circles
      .data(filteredStations, (d) => d.short_name)
      .join("circle")
      .attr("r", (d) => radiusScale(d.totalTraffic))
      .style("--departure-ratio", (d) => departureRatio(d));

    updateTooltips();
  }

  function updateTimeDisplay() {
    let timeFilter = Number(timeSlider.value);

    if (timeFilter === -1) {
      selectedTime.textContent = "";
      anyTimeLabel.style.display = "block";
    } else {
      selectedTime.textContent = formatTime(timeFilter);
      anyTimeLabel.style.display = "none";
    }

    updateScatterPlot(timeFilter);
  }

  timeSlider.addEventListener("input", updateTimeDisplay);
  updateTimeDisplay();
});