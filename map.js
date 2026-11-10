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

// Step 3.3: turn a station's longitude/latitude into pixel x/y on the map
function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat);
  const { x, y } = map.project(point);
  return { cx: x, cy: y };
}

// Step 4.2: count arrivals, departures, and total trips for each station
function computeStationTraffic(stations, trips) {
  // Trips that started at each station
  const departures = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.start_station_id,
  );

  // Trips that ended at each station
  const arrivals = d3.rollup(
    trips,
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

  // Step 4.1: load the March 2024 trips (about 260,000 rows)
  const trips = await d3.csv("https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv");

  // Step 4.2: add arrivals, departures, and total traffic to each station
  const stations = computeStationTraffic(jsonData.data.stations, trips);
  console.log("Stations with traffic:", stations);

  // Step 4.3: circle AREA matches traffic, so use a square root scale
  const radiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(stations, (d) => d.totalTraffic)])
    .range([0, 25]);

  // Step 3.3: one circle per station, drawn in the SVG on top of the map
  const svg = d3.select("#map").select("svg");

  const circles = svg
    .selectAll("circle")
    .data(stations)
    .enter()
    .append("circle")
    .attr("r", (d) => radiusScale(d.totalTraffic))
    // Step 4.4: browser tooltip with exact numbers
    .each(function (d) {
      d3.select(this)
        .append("title")
        .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
    });

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
});