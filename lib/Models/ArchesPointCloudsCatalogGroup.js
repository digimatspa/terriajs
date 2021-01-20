"use strict";

/*global require*/
var URI = require("urijs");

var clone = require("terriajs-cesium/Source/Core/clone").default;
var defined = require("terriajs-cesium/Source/Core/defined").default;

var knockout = require("terriajs-cesium/Source/ThirdParty/knockout").default;
var loadJson = require("../Core/loadJson");
var Rectangle = require("terriajs-cesium/Source/Core/Rectangle").default;

var TerriaError = require("../Core/TerriaError");
var CatalogGroup = require("./CatalogGroup");
var inherit = require("../Core/inherit");
var proxyCatalogItemUrl = require("./proxyCatalogItemUrl");
var unionRectangles = require("../Map/unionRectangles");
//var GltfCatalogItem = require("./GltfCatalogItem");
var Cesium3DTilesCatalogItem = require("./Cesium3DTilesCatalogItem");
var i18next = require("i18next").default;
var loadJson = require("../Core/loadJson");

/**
 * A {@link CatalogGroup} representing a collection of point clouds from Arches
 *
 * @alias ArchesPointCloudsCatalogGroup
 * @constructor
 * @extends CatalogGroup
 *
 * @param {Terria} terria The Terria instance.
 */
var ArchesPointCloudsCatalogGroup = function(terria) {
  CatalogGroup.call(this, terria, "pointcloud-arches");

  /**
   * Gets or sets the URL of the Arches server.  This property is observable.
   * @type {String}
   */
  this.url = "";

  knockout.track(this, ["url"]);
};

inherit(CatalogGroup, ArchesPointCloudsCatalogGroup);

Object.defineProperties(ArchesPointCloudsCatalogGroup.prototype, {
  /**
   * Gets the type of data member represented by this instance.
   * @memberOf ArchesPointCloudsCatalogGroup.prototype
   * @type {String}
   */
  type: {
    get: function() {
      return "pointcloud-arches";
    }
  },

  /**
   * Gets a human-readable name for this type of data source.
   * @memberOf ArchesPointCloudsCatalogGroup.prototype
   * @type {String}
   */
  typeName: {
    get: function() {
      return "Nuvole di punti";
    }
  },

  /**
   * Gets the set of functions used to serialize individual properties in {@link CatalogMember#serializeToJson}.
   * When a property name on the model matches the name of a property in the serializers object literal,
   * the value will be called as a function and passed a reference to the model, a reference to the destination
   * JSON object literal, and the name of the property.
   * @memberOf ArchesPointCloudsCatalogGroup.prototype
   * @type {Object}
   */
  serializers: {
    get: function() {
      return ArchesPointCloudsCatalogGroup.defaultSerializers;
    }
  }
});

/**
 * Gets or sets the set of default serializer functions to use in {@link CatalogMember#serializeToJson}.  Types derived from this type
 * should expose this instance - cloned and modified if necesary - through their {@link CatalogMember#serializers} property.
 * @type {Object}
 */
ArchesPointCloudsCatalogGroup.defaultSerializers = clone(
  CatalogGroup.defaultSerializers
);

ArchesPointCloudsCatalogGroup.defaultSerializers.items =
  CatalogGroup.enabledShareableItemsSerializer;

ArchesPointCloudsCatalogGroup.defaultSerializers.isLoading = function(
  wfsGroup,
  json,
  propertyName,
  options
) {};

Object.freeze(ArchesPointCloudsCatalogGroup.defaultSerializers);

ArchesPointCloudsCatalogGroup.prototype._getValuesThatInfluenceLoad = function() {
  return [this.url];
};

ArchesPointCloudsCatalogGroup.prototype._load = function() {
  var url =
    cleanAndProxyUrl(this, this.url) +
    'search/resources?format=tilecsv&precision=6&resource-type-filter=[{"graphid":"9b591814-c0f2-11e8-9c8c-0242ac120004","inverted":false}]&tiles=true';

  var that = this;
  return loadJson(url).then(function(json) {
    if (!defined(json.total_results)) {
      return;
    }

    if (json.total_results == 0) {
      return;
    }

    var results = json.results.hits.hits;
    if (!defined(results)) {
      return;
    }

    for (var i = 0; i < results.length; ++i) {
      var result = results[i];

      var url =
        result._source.tiles[0].data["bf019f16-6afb-11ea-8a06-08002713135a"];
      url = url.replace("cloud.js", "3dtiles/tileset.json");
      var catalogItem = new Cesium3DTilesCatalogItem(that.terria);
      catalogItem.url = url;
      catalogItem.clampToGround = true;
      catalogItem.pointSize = 2.0;

      /*var catalogItem = new GltfCatalogItem(
        that.terria,
        url
      );*/

      catalogItem.name =
        result._source.tiles[0].data["790704c4-6afb-11ea-8a06-08002713135a"];

      if (typeof that.itemProperties === "object") {
        catalogItem.updateFromJson(that.itemProperties);
      }

      that.items.push(catalogItem);
    }
  });
};

function cleanAndProxyUrl(catalogGroup, url) {
  // Strip off the search portion of the URL
  var uri = new URI(url);
  uri.search("");

  var cleanedUrl = uri.toString();
  return proxyCatalogItemUrl(catalogGroup, cleanedUrl, "1d");
}

module.exports = ArchesPointCloudsCatalogGroup;
