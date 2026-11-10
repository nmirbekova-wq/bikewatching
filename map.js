// Import Mapbox as an ES module
import mapboxgl from "https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm";

// Check that Mapbox GL JS loaded
console.log("Mapbox GL JS Loaded:", mapboxgl);

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