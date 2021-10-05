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
var GltfCatalogItem = require("./GltfCatalogItem");
var ArchesPointCloudsCatalogGroup = require("./ArchesPointCloudsCatalogGroup");
var i18next = require("i18next").default;
var loadJson = require("../Core/loadJson");
var DeveloperError = require("terriajs-cesium/Source/Core/DeveloperError")
  .default;

/**
 * A {@link CatalogGroup} representing a collection of BIMs from Arches
 *
 * @alias ArchesBIMCatalogGroup
 * @constructor
 * @extends ArchesPointCloudsCatalogGroup
 *
 * @param {Terria} terria The Terria instance.
 */
var ArchesBIMCatalogGroup = function(terria) {
  ArchesPointCloudsCatalogGroup.call(this, terria, "bim-arches");

  this.positionId = undefined;

  this.scaleId = undefined;

  this.scale = 1.0;
};

inherit(ArchesPointCloudsCatalogGroup, ArchesBIMCatalogGroup);

Object.defineProperties(ArchesBIMCatalogGroup.prototype, {
  /**
   * Gets the type of data member represented by this instance.
   * @memberOf ArchesBIMCatalogGroup.prototype
   * @type {String}
   */
  type: {
    get: function() {
      return "bim-arches";
    }
  },

  /**
   * Gets a human-readable name for this type of data source.
   * @memberOf ArchesBIMCatalogGroup.prototype
   * @type {String}
   */
  typeName: {
    get: function() {
      return "BIM";
    }
  },

  /**
   * Gets the set of functions used to serialize individual properties in {@link CatalogMember#serializeToJson}.
   * When a property name on the model matches the name of a property in the serializers object literal,
   * the value will be called as a function and passed a reference to the model, a reference to the destination
   * JSON object literal, and the name of the property.
   * @memberOf ArchesBIMCatalogGroup.prototype
   * @type {Object}
   */
  serializers: {
    get: function() {
      return ArchesBIMCatalogGroup.defaultSerializers;
    }
  }
});

/**
 * Gets or sets the set of default serializer functions to use in {@link CatalogMember#serializeToJson}.  Types derived from this type
 * should expose this instance - cloned and modified if necesary - through their {@link CatalogMember#serializers} property.
 * @type {Object}
 */
ArchesBIMCatalogGroup.defaultSerializers = clone(
  ArchesPointCloudsCatalogGroup.defaultSerializers
);

ArchesBIMCatalogGroup.defaultSerializers.items =
  ArchesPointCloudsCatalogGroup.enabledShareableItemsSerializer;

ArchesBIMCatalogGroup.defaultSerializers.isLoading = function(
  wfsGroup,
  json,
  propertyName,
  options
) {};

Object.freeze(ArchesBIMCatalogGroup.defaultSerializers);

ArchesBIMCatalogGroup.prototype._getValuesThatInfluenceLoad = function() {
  return [this.url];
};

ArchesBIMCatalogGroup.prototype._createCatalogItem = function(result) {
  if (!this.positionId) {
    throw new DeveloperError("positionId must be defined.");
  }

  if (result._source.tiles.length > 0) {
    var url = result._source.tiles[0].data[this.itemURLId];

    var that = this;

    var http = new XMLHttpRequest();
    http.open("HEAD", url);
    http.onreadystatechange = function() {
      if (this.readyState == this.DONE && this.status != 404) {
        var catalogItem = new GltfCatalogItem(that.terria, url);

        //position
        var geojson = result._source.tiles[0].data[that.positionId];
        try {
          if (geojson) {
            var coords = geojson.features[0].geometry.coordinates;
            var origin = {};
            origin.longitude = coords[0];
            origin.latitude = coords[1];
            origin.height = 0.0;
            catalogItem.origin = origin;

            var scale = that.scale;
            if (that.scaleId) {
              var _scale = result._source.tiles[0].data[that.scaleId];
              if (_scale) {
                scale = _scale;
              }
            }
            catalogItem.scale = scale;
            catalogItem.upAxis = "Y";

            catalogItem.name = result._source.tiles[0].data[that.itemNameId];

            if (typeof that.itemProperties === "object") {
              catalogItem.updateFromJson(that.itemProperties);
            }

            that.items.push(catalogItem);
          }
        } catch (e) {
          return null;
        }
      }
    };
    http.send();
  }
};

module.exports = ArchesBIMCatalogGroup;
