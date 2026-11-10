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

  let stations = jsonData.data.stations;
  console.log("Stations Array:", stations);

  // Step 3.3: one circle per station, drawn in the SVG on top of the map
  const svg = d3.select("#map").select("svg");

  const circles = svg
    .selectAll("circle")
    .data(stations)
    .enter()
    .append("circle")
    .attr("r", 5);

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