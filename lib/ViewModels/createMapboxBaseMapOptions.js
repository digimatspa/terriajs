"use strict";

/*global require*/
const BaseMapViewModel = require("./BaseMapViewModel");
const MapboxCatalogItem = require("../Models/MapboxMapCatalogItem");
const MapboxStyleCatalogItem = require("../Models/MapboxStyleCatalogItem");

function createMapboxBaseMapOptions(terria, mapboxKey) {
  const result = [];

  if (mapboxKey) {
    var mapboxSatellite = new MapboxCatalogItem(terria);
    mapboxSatellite.name = "Mapbox satellite";
    mapboxSatellite.url = "https://api.mapbox.com/v4/";
    mapboxSatellite.mapId = "mapbox.satellite";
    mapboxSatellite.accessToken = mapboxKey;
    mapboxSatellite.opacity = 1.0;
    result.push(
      new BaseMapViewModel({
        image: require("../../wwwroot/images/bing-aerial.png"),
        catalogItem: mapboxSatellite
      })
    );

    var mapboxLight = new MapboxStyleCatalogItem(terria);
    mapboxLight.name = "Mapbox light";
    mapboxLight.styleId = "light-v10";
    mapboxLight.accessToken = mapboxKey;
    mapboxLight.opacity = 1.0;
    result.push(
      new BaseMapViewModel({
        image: require("../../wwwroot/images/mapbox-light.png"),
        catalogItem: mapboxLight
      })
    );

    /*var mapboxStreets = new MapboxStyleCatalogItem(terria);
    mapboxStreets.name = "Mapbox streets";
    mapboxStreets.styleId = "streets-v11";
    mapboxStreets.accessToken = mapboxKey;
    mapboxStreets.opacity = 1.0;
    result.push(
      new BaseMapViewModel({
        image: require("../../wwwroot/images/mapbox-streets.png"),
        catalogItem: mapboxStreets
      })
    );*/

    var mapboxDark = new MapboxStyleCatalogItem(terria);
    mapboxDark.name = "Mapbox dark";
    mapboxDark.styleId = "dark-v10";
    mapboxDark.accessToken = mapboxKey;
    mapboxDark.opacity = 1.0;
    result.push(
      new BaseMapViewModel({
        image: require("../../wwwroot/images/mapbox-dark.png"),
        catalogItem: mapboxDark
      })
    );
  }

  return result;
}

module.exports = createMapboxBaseMapOptions;
