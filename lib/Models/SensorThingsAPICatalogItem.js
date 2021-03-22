"use strict";

/*global require*/
var i18next = require("i18next").default;
var Mustache = require("mustache");

var clone = require("terriajs-cesium/Source/Core/clone").default;
var defaultValue = require("terriajs-cesium/Source/Core/defaultValue").default;
var defined = require("terriajs-cesium/Source/Core/defined").default;
var DeveloperError = require("terriajs-cesium/Source/Core/DeveloperError")
  .default;

var JulianDate = require("terriajs-cesium/Source/Core/JulianDate").default;
var knockout = require("terriajs-cesium/Source/ThirdParty/knockout").default;
var loadWithXhr = require("../Core/loadWithXhr");
var when = require("terriajs-cesium/Source/ThirdParty/when").default;

var DisplayVariablesConcept = require("../Map/DisplayVariablesConcept");
var inherit = require("../Core/inherit");
var featureDataToGeoJson = require("../Map/featureDataToGeoJson");
var GeoJsonCatalogItem = require("./GeoJsonCatalogItem");
var overrideProperty = require("../Core/overrideProperty");
var proxyCatalogItemUrl = require("./proxyCatalogItemUrl");
var raiseErrorToUser = require("./raiseErrorToUser");
var TableCatalogItem = require("./TableCatalogItem");
var TableColumn = require("../Map/TableColumn");
var TableStructure = require("../Map/TableStructure");
var TerriaError = require("../Core/TerriaError");
var VariableConcept = require("../Map/VariableConcept");
var xml2json = require("../ThirdParty/xml2json");
var zoomRectangleFromPoint = require("../Map/zoomRectangleFromPoint");

/**
 * A {@link CatalogItem} representing data obtained from a Sensor Thing API (STA) server.
 *
 * @alias SensorThingsAPICatalogItem
 * @constructor
 * @extends TableCatalogItem
 *
 * @param {Terria} terria The Terria instance.
 * @param {String} [url] The base URL from which to retrieve the data.
 */
var SensorThingsAPICatalogItem = function(terria, url) {
  TableCatalogItem.call(this, terria, url);

  this._concepts = [];

  this._datastreamMapping = undefined;

  // A bunch of variables used to manage changing the active concepts (procedure and/or observable property),
  // so they can handle errors in the result, and so you cannot change active concepts while in the middle of loading observations.
  this._previousProcedureIdentifier = undefined;
  this._previousObservablePropertyIdentifier = undefined;
  this._loadingProcedureIdentifier = undefined;
  this._loadingObservablePropertyIdentifier = undefined;
  this._revertingConcepts = false;
  this._loadingFeatures = false;

  // Set during changedActiveItems, so tests can access the promise.
  this._observationDataPromise = undefined;

  /**
   * Gets or sets the name seen by the user for the list of procedures.
   * Defaults to "Procedure", but eg. for BoM, "Frequency" would be better.
   * @type {String}
   */
  this.datastreamsName = i18next.t("models.sensorObservationService.procedure");

  /**
   * Gets or sets the name seen by the user for the list of observable properties.
   * Defaults to "Property", but eg. for BoM, "Observation type" would be better.
   * @type {String}
   */
  this.observablePropertiesName = i18next.t(
    "models.sensorObservationService.property"
  );

  /**
   * Gets or sets the sensor observation service procedures that the user can choose from for this catalog item.
   * An array of objects with keys 'identifier', 'title' and (optionally) 'defaultDuration' and 'units', eg.
   *     [{
   *        identifier: 'http://bom.gov.au/waterdata/services/tstypes/Pat7_C_B_1_YearlyMean',
   *        title: 'Annual Mean',
   *        defaultDuration: '20y'  // Final character must be s, h, d or y for seconds, hours, days or years.
   *     }]
   * The identifier is used for communication with the server, and the title is used for display to the user.
   * If there is only one object, the user is not presented with a choice.
   * @type {Object[]}
   */
  this.datastreams = undefined;

  this.defaultDuration = undefined;

  /**
   * Gets or sets the sensor observation service observableProperties that the user can choose from for this catalog item.
   * An array of objects with keys 'identifier', 'title' and (optionally) 'defaultDuration' and 'units', eg.
   *     [{
   *        identifier: 'http://bom.gov.au/waterdata/services/parameters/Storage Level',
   *        title: 'Storage Level',
   *        units: 'metres'
   *     }]
   * The identifier is used for communication with the server, and the title is used for display to the user.
   * If there is only one object, the user is not presented with a choice.
   * @type {Object[]}
   */
  this.observableProperties = undefined;

  /**
   * Gets or sets the index of the initially selected procedure. Defaults to 0.
   * @type {Number}
   */
  this.initialProcedureIndex = 0;

  /**
   * Gets or sets the index of the initially selected observable property. Defaults to 0.
   * @type {Number}
   */
  this.initialObservablePropertyIndex = 0;

  /**
   * A start date in ISO8601 format. All requests filter to this start date. Set to undefined for no temporal filter.
   * @type {String}
   */
  this.startDate = undefined;

  /**
   * An end date in ISO8601 format. All requests filter to this end date. Set to undefined to use the current date.
   * @type {String}
   */
  this.endDate = undefined;

  /**
   * A flag to choose between representing the underlying data as a TableStructure or as GeoJson.
   * Geojson representation is not fully implemented - eg. currently only points are supported.
   * Set to true for geojson. This can allow for non-point data (once the code is written).
   * Set to false (the default) for table structure. This allows all the TableStyle options, and a better legend.
   */
  this.representAsGeoJson = false;

  /**
   * Whether to include the list of procedures in GetFeatureOfInterest calls, so that only locations that support
   * those procedures are returned. For some servers (such as BoM's Water Data Online), this causes the request to time out.
   * @default true
   */
  this.filterByDatastreams = true;

  this.filterByObservedProperties = true;

  /**
   * If set, an array of IDs. Only station IDs that match these will be included.
   */
  this.stationIdWhitelist = undefined;

  /**
   * If set, an array of IDs. Only station IDs that don't match these will be included.
   */
  this.stationIdBlacklist = undefined;

  // Which columns of the tableStructure define a unique feature.
  // Use both because sometimes identifier is not unique (!).
  this._idColumnNames = ["identifier", "id"];

  this._geoJsonItem = undefined;

  //Base url to external application linked to each datastream
  this.externalLinkBase = null;

  knockout.track(this, ["_concepts"]);

  overrideProperty(this, "concepts", {
    get: function() {
      return this._concepts;
    }
  });

  // See explanation in the comments for TableCatalogItem.
  overrideProperty(this, "dataViewId", {
    get: function() {
      // We need an id that depends on the selected concepts.
      if (
        defined(this.datastreams) /* && defined(this.observableProperties)*/
      ) {
        var procedure = getObjectCorrespondingToSelectedConcept(
          this,
          "datastreams"
        );
        /*var observableProperty = getObjectCorrespondingToSelectedConcept(
          this,
          "observableProperties"
        );*/
        return; //[
        (procedure && procedure.identifier) || ""; //,
        /*(observableProperty && observableProperty.identifier) || ""
        ].join("-")*/
      }
    }
  });

  knockout.defineProperty(this, "activeConcepts", {
    get: function() {
      return this._concepts.map(function(parent) {
        return parent.items.filter(function(concept) {
          return concept.isActive;
        });
      });
    }
  });

  knockout.getObservable(this, "activeConcepts").subscribe(function() {
    // If we are in the middle of reverting concepts back to previous values, just ignore.
    if (this._revertingConcepts) {
      return;
    }
    // If we are in the middle of loading the features themselves, a change is fine and will happen with no further intervention.
    if (this._loadingFeatures) {
      return;
    }
    // If either of these names is not available, the user is probably in the middle of a change
    // (when for a brief moment either 0 or 2 items are selected). So ignore.
    var procedure = getObjectCorrespondingToSelectedConcept(
      this,
      "datastreams"
    );
    /*var observableProperty = getObjectCorrespondingToSelectedConcept(
      this,
      "observableProperties"
    );*/
    if (!defined(procedure) /*|| !defined(observableProperty)*/) {
      return;
    }
    // If we are loading data (other than the feature data), do not allow a change.
    if (this.isLoading) {
      revertConceptsToPrevious(
        this,
        this._loadingProcedureIdentifier,
        this._loadingObservablePropertyIdentifier
      );
      var error = new TerriaError({
        sender: this,
        title: i18next.t("models.sensorObservationService.alreadyLoadingTitle"),
        message: i18next.t(
          "models.sensorObservationService.alreadyLoadingMessage"
        )
      });
      raiseErrorToUser(this.terria, error);
    } else {
      changedActiveItems(this);
    }
  }, this);
};

inherit(TableCatalogItem, SensorThingsAPICatalogItem);

Object.defineProperties(SensorThingsAPICatalogItem.prototype, {
  /**
   * Gets the type of data member represented by this instance.
   * @memberOf SensorThingsAPICatalogItem.prototype
   * @type {String}
   */
  type: {
    get: function() {
      return "sta";
    }
  },

  /**
   * Gets a human-readable name for this type of data source, 'GPX'.
   * @memberOf SensorThingsAPICatalogItem.prototype
   * @type {String}
   */
  typeName: {
    get: function() {
      return i18next.t("models.sensorObservationService.sos");
    }
  },

  /**
   * Gets the set of names of the properties to be serialized for this object for a share link.
   * @memberOf ImageryLayerCatalogItem.prototype
   * @type {String[]}
   */
  propertiesForSharing: {
    get: function() {
      return SensorThingsAPICatalogItem.defaultPropertiesForSharing;
    }
  },

  /**
   * Gets the set of functions used to serialize individual properties in {@link CatalogMember#serializeToJson}.
   * When a property name on the model matches the name of a property in the serializers object lieral,
   * the value will be called as a function and passed a reference to the model, a reference to the destination
   * JSON object literal, and the name of the property.
   * @memberOf SensorThingsAPICatalogItem.prototype
   * @type {Object}
   */
  serializers: {
    get: function() {
      return SensorThingsAPICatalogItem.defaultSerializers;
    }
  },

  /**
   * Gets the data source associated with this catalog item. Might be a TableDataSource or a GeoJsonDataSource.
   * @memberOf SensorThingsAPICatalogItem.prototype
   * @type {DataSource}
   */
  dataSource: {
    get: function() {
      if (defined(this._geoJsonItem)) {
        return this._geoJsonItem.dataSource;
      } else if (defined(this._dataSource)) {
        return this._dataSource;
      }
    }
  }
});

/**
 * Gets or sets the default set of properties that are serialized when serializing a {@link CatalogItem}-derived for a
 * share link.
 * @type {String[]}
 */
SensorThingsAPICatalogItem.defaultPropertiesForSharing = clone(
  TableCatalogItem.defaultPropertiesForSharing
);
SensorThingsAPICatalogItem.defaultPropertiesForSharing.push(
  "initialProcedureIndex"
);
SensorThingsAPICatalogItem.defaultPropertiesForSharing.push(
  "initialObservablePropertyIndex"
);
Object.freeze(SensorThingsAPICatalogItem.defaultPropertiesForSharing);

SensorThingsAPICatalogItem.defaultSerializers = clone(
  TableCatalogItem.defaultSerializers
);
SensorThingsAPICatalogItem.defaultSerializers.activeConcepts = function() {
  // Don't serialize.
};
Object.freeze(SensorThingsAPICatalogItem.defaultSerializers);

// Just the items that would influence the load from the abs server or the file
SensorThingsAPICatalogItem.prototype._getValuesThatInfluenceLoad = function() {
  return [this.url];
};

SensorThingsAPICatalogItem.prototype._load = function() {
  var that = this;
  if (!that.url) {
    return undefined;
  }
  that._loadingFeatures = true;
  return loadLocations(that)
    .then(function() {
      that._concepts = buildConcepts(that);
      that._loadingFeatures = false;

      return loadObservationData(that);
    })
    .catch(function(e) {
      throw e;
    });
};

/**
 * Return the Mustache template context "temporalFilters" for this item.
 * If a "defaultDuration" parameter (eg. 60d or 12h) exists on either
 * procedure or observableProperty, restrict to that duration from item.endDate.
 * @param  {SensorThingsAPICatalogItem} item This catalog item.
 * @param  {Object} [procedure] An element from the item.datastreams array.
 * @param  {Object} [observableProperty] An element from the item.observableProperties array.
 * @return {Object[]} An array of {index, startDate, endDate}, or undefined.
 */
function getTemporalFiltersContext(item, procedure, observableProperty) {
  var defaultDuration =
    (procedure && procedure.defaultDuration) ||
    (observableProperty && observableProperty.defaultDuration) ||
    item.defaultDuration;
  // If the item has no endDate, use the current datetime (to nearest second).
  var endDateIso8601 =
    item.endDate || JulianDate.toIso8601(JulianDate.now(), 0);

  if (!defined(defaultDuration) && !defined(item.startDate)) {
    defaultDuration = "1d";
  }

  if (defined(defaultDuration)) {
    var startDateIso8601 = addDurationToIso8601(
      endDateIso8601,
      "-" + defaultDuration
    );
    // This is just a string-based comparison, so timezones could make it up to 1 day wrong.
    // That much error is fine here.
    if (startDateIso8601 < item.startDate) {
      startDateIso8601 = item.startDate;
    }
    return { index: 1, startDate: startDateIso8601, endDate: endDateIso8601 };
  } else {
    // If there is no procedure- or property-specific duration, use the item's start and end dates, if any.
    if (item.startDate) {
      return { index: 1, startDate: item.startDate, endDate: endDateIso8601 };
    }
  }
}

SensorThingsAPICatalogItem.getObjectCorrespondingToSelectedConcept = function(
  item,
  conceptIdAndItemKey
) {
  if (item[conceptIdAndItemKey].length === 1) {
    return item[conceptIdAndItemKey][0];
  } else {
    var parentConcept = item._concepts.filter(
      concept => concept.id === conceptIdAndItemKey
    )[0];
    var activeConceptIndices = parentConcept.items.filter(
      concept => concept.isActive
    );
    if (activeConceptIndices.length === 1) {
      var identifier = activeConceptIndices[0].id;
      var matches = item[conceptIdAndItemKey].filter(
        element => element.identifier === identifier
      );
      return matches[0];
    }
  }
};

function getObjectCorrespondingToSelectedConcept(item, conceptIdAndItemKey) {
  return SensorThingsAPICatalogItem.getObjectCorrespondingToSelectedConcept(
    item,
    conceptIdAndItemKey
  );
}

function getConceptIndexOfIdentifier(item, conceptIdAndItemKey, identifier) {
  if (item[conceptIdAndItemKey].length === 1) {
    return 0;
  } else {
    var parentConcept = item._concepts.filter(
      concept => concept.id === conceptIdAndItemKey
    )[0];
    return parentConcept.items.map(concept => concept.id).indexOf(identifier);
  }
}

function observationResponseToTableStructure(
  item,
  identifier,
  procedure,
  observableProperty,
  units,
  response
) {
  // Iterate over all the points in all the time series in all the observations in all the bodies to get individual result rows.
  function extractValues(response) {
    if (defined(response.value)) {
      var observations = response.value;

      if (!Array.isArray(response.value)) {
        observations = [response.value];
      }

      observations.forEach(observation => {
        if (!defined(observation)) {
          return;
        }

        var measurements = [];
        measurements.push({
          time: observation.phenomenonTime,
          value: parseFloat(observation.result)
        });

        dateValues.push(
          ...measurements.map(measurement =>
            typeof measurement.time === "object" ? null : measurement.time
          )
        );
        valueValues.push(
          ...measurements.map(measurement =>
            typeof measurement.value === "object"
              ? null
              : parseFloat(measurement.value)
          )
        );
        // These 5 arrays constitute columns in the table, some of which (like this one) have the same
        // value in each row.
        featureValues.push(...measurements.map(_ => identifier));
        procedureValues.push(...measurements.map(_ => procedure));
        observedPropertyValues.push(
          ...measurements.map(_ => observableProperty)
        );
      });
    }
  }
  var dateValues = [],
    valueValues = [],
    featureValues = [],
    procedureValues = [],
    observedPropertyValues = [];

  // extract columns from response
  //responses.forEach(extractValues);
  extractValues(response);

  // Now turn all the columns of dates, values etc into a single table structure
  var observationTableStructure = new TableStructure("observations");
  var columnOptions = { tableStructure: observationTableStructure };
  var timeColumn = new TableColumn("date", dateValues, columnOptions);

  var valueTitle =
    observableProperty +
    " " +
    procedure +
    (defined(units) ? " (" + units + ")" : "");
  var valueColumn = new TableColumn(valueTitle, valueValues, columnOptions);
  valueColumn.id = "value";
  valueColumn.units = units;

  var featureColumn = new TableColumn(
    "identifier",
    featureValues,
    columnOptions
  ); // featureColumn.id must be 'identifier', used as an idColumn.

  var procedureColumn = new TableColumn(
    item.datastreamsName,
    procedureValues,
    columnOptions
  );

  var observedPropertyColumn = new TableColumn(
    item.observablePropertiesName,
    observedPropertyValues,
    columnOptions
  );

  observationTableStructure.columns = [
    timeColumn,
    valueColumn,
    featureColumn,
    procedureColumn,
    observedPropertyColumn
  ];
  return observationTableStructure;
}

function isNumeric(val) {
  return !(val instanceof Array) && val - parseFloat(val) + 1 >= 0;
}

/**
 * Returns a promise to a table structure of sensor observation data, given one/multiple featureOfInterest identifiers.
 * Uses the currently active concepts to determine the procedure and observedProperty filter.
 * Then batches GetObservation requests to actually fetch the values for that procedure and property at that site(s).
 * This is required by Chart.jsx for any non-csv format (which passes the chart's source url as the sole argument.)
 * @param  {String|String[]} featureOfInterestIdentifiers The featureOfInterest identifier, or array thereof.
 * @param {Object} options Object with the following properties:
 * @param {Object} [options.procedure] An object overriding the selected procedure, for instance from chart generated items being regenerated.
 * @return {Promise} A promise which resolves to a TableStructure.
 */
SensorThingsAPICatalogItem.prototype.loadIntoTableStructure = function(
  locationIdentifier,
  options = {}
) {
  var item = this;
  var location = this._datastreamMapping[locationIdentifier];

  var temporalFilter = getTemporalFiltersContext(
    item,
    location.name,
    location.observedProperty
  );
  var filter =
    "$orderby=phenomenonTime&$filter=phenomenonTime ge " +
    temporalFilter.startDate +
    " and phenomenonTime le " +
    temporalFilter.endDate +
    "&$top=200";

  if (!isNumeric(locationIdentifier)) {
    locationIdentifier = "'" + locationIdentifier + "'";
  }

  return loadWithXhr({
    url: proxyCatalogItemUrl(
      item,
      item.url +
        "Datastreams(" +
        locationIdentifier +
        ")/Observations?" +
        filter,
      "0d"
    ),
    responseType: "json",
    method: "GET",
    overrideMimeType: "application/json",
    headers: { "Content-Type": "application/json" }
  })
    .then(jsonObj =>
      observationResponseToTableStructure(
        item,
        location.identifier,
        location.name, //procedure,
        location.observedProperty, //observableProperty,
        location.unit,
        jsonObj
      )
    )
    .otherwise(function(e) {
      throw new TerriaError({
        sender: item,
        title: "Errore",
        message: e
      });
    });
};

// It's OK to override TableCatalogItem's enable, disable, because for lat/lon tables, they don't do anything.
SensorThingsAPICatalogItem.prototype._enable = function() {
  if (defined(this._geoJsonItem)) {
    this._geoJsonItem._enable();
  }
};

SensorThingsAPICatalogItem.prototype._disable = function() {
  if (defined(this._geoJsonItem)) {
    this._geoJsonItem._disable();
  }
};

// However show and hide need to become a combination of both the geojson and the lat/lon table catalog item versions.
SensorThingsAPICatalogItem.prototype._show = function() {
  if (defined(this._geoJsonItem)) {
    this._geoJsonItem._show();
  } else if (defined(this._dataSource)) {
    var dataSources = this.terria.dataSources;
    if (dataSources.contains(this._dataSource)) {
      if (console && console.log) {
        console.log(new Error("This data source is already shown."));
      }
      return;
    }
    dataSources.add(this._dataSource);
  }
};

SensorThingsAPICatalogItem.prototype._hide = function() {
  if (defined(this._geoJsonItem)) {
    this._geoJsonItem._hide();
  } else if (defined(this._dataSource)) {
    var dataSources = this.terria.dataSources;
    if (!dataSources.contains(this._dataSource)) {
      throw new DeveloperError("This data source is not shown.");
    }
    dataSources.remove(this._dataSource, false);
  }
};

SensorThingsAPICatalogItem.prototype.showOnSeparateMap = function(globeOrMap) {
  if (defined(this._geoJsonItem)) {
    return this._geoJsonItem.showOnSeparateMap(globeOrMap);
  } else {
    return TableCatalogItem.prototype.showOnSeparateMap.bind(this)(globeOrMap);
  }
};

/*
 * Performs the GetFeatureOfInterest request to obtain the locations of sources of data that match the required
 * observed properties and procedures.
 * @param {SensorThingsAPICatalogItem} item
 * @return Promise for the request.
 */
function loadLocations(item) {
  const filter = {};

  if (item.filterByDatastreams) {
    filter.procedure = item.datastreams.map(
      datastream => datastream.identifier
    ); // eg. 'http://bom.gov.au/waterdata/services/tstypes/Pat7_C_B_1_YearlyMean',
  }

  if (item.filterByObservedProperties) {
    filter.observedProperty = item.observableProperties.map(
      observable => observable.identifier
    ); // eg. 'http://bom.gov.au/waterdata/services/parameters/Storage Level'
  }

  return fetch(
    proxyCatalogItemUrl(
      item,
      item.url + "Locations?$expand=Things/Datastreams/ObservedProperty",
      "0d"
    )
  )
    .then(response => {
      if (!response.ok) {
        throw new Error("HTTP error " + response.status);
      }
      return response.json();
    })
    .then(locations => {
      // var locations = featuresResponse.featureMember.map(x=>x.MonitoringPoint.shape.Point.pos.text);
      if (!locations) {
        throw new TerriaError({
          sender: item,
          title: item.name,
          message: i18next.t("models.sensorObservationService.noFeatures")
        });
      }
      if (!defined(locations.value)) {
        throw new TerriaError({
          sender: item,
          title: item.name,
          message: i18next.t("models.sensorObservationService.unknownFormat")
        });
      }
      var locationMembers = locations.value;
      if (!Array.isArray(locationMembers)) {
        locationMembers = [locationMembers];
      }
      if (item.stationIdWhitelist) {
        locationMembers = locationMembers.filter(
          m =>
            m.location &&
            item.stationIdWhitelist.indexOf(String(m["@iot.id"])) >= 0
        );
      }
      if (item.stationIdBlacklist) {
        locationMembers = locationMembers.filter(
          m =>
            m.location &&
            !item.stationIdBlacklist.indexOf(String(m["@iot.id"])) >= 0
        );
      }

      if (defined(filter.procedure)) {
        locationMembers.forEach(member => {
          member.Things.forEach(function(thing) {
            thing.Datastreams = thing.Datastreams.filter(datastream => {
              return filter.procedure.includes(datastream["@iot.id"]);
            });
          });
        });
      }

      if (defined(filter.observedProperty)) {
        locationMembers.forEach(member => {
          member.Things.forEach(function(thing) {
            thing.Datastreams = thing.Datastreams.filter(datastream => {
              return datastream.ObservedProperty
                ? filter.observedProperty.includes(
                    datastream.ObservedProperty["@iot.id"]
                  )
                : false;
            });
          });
        });
      }

      if (item.representAsGeoJson) {
        item._geoJsonItem = createGeoJsonItemFromLocationMembers(
          item,
          locationMembers
        );
        return item._geoJsonItem.load().then(function() {
          item.rectangle = item._geoJsonItem.rectangle;
          return;
        });
      } else {
        item._datastreamMapping = createMappingFromLocationMembers(
          locationMembers,
          item
        );
      }
    })
    .catch(e => {
      throw e;
    });
}

/**
 * Given the features already loaded into item._featureMap, this loads the observations according to the user-selected concepts,
 * and puts them into item._tableStructure.
 * If there are too many features, fall back to a tableStructure without the observation data.
 * @param  {SensorThingsAPICatalogItem} item This catalog item.
 * @return {Promise} A promise which, when it resolves, sets item._tableStructure.
 * @private
 */
function loadObservationData(item) {
  if (!item._datastreamMapping) {
    return;
  }

  // MODE 1. Do not load observation data for the features.
  // Just show where the features are, and when the feature info panel is opened, then load the feature's observation data
  // (via the 'chart' column in _tableStructure, which generates a call to item.loadIntoTableStructure).
  var tableStructure = item._tableStructure;
  if (!defined(tableStructure)) {
    tableStructure = new TableStructure(item.name);
  }
  var columns = createColumnsFromMapping(item, tableStructure);
  tableStructure.columns = columns;
  if (!defined(item._tableStructure)) {
    item._tableStyle.dataVariable = null; // Turn off the legend and give all the points a single colour.
    item.initializeFromTableStructure(tableStructure);
  } else {
    item._tableStructure.columns = tableStructure.columns;
  }
  return when();

  // MODE 2. Create a big time-varying tableStructure with all the observations for all the features.
  // In this mode, the feature info panel shows a chart through as a standard time-series, like it would for any time-varying csv.
  /*var procedure = getObjectCorrespondingToSelectedConcept(item, "datastreams");

  return item
    .loadIntoTableStructure(procedure.identifier)
    .then(function(observationTableStructure) {
      if (
        !defined(observationTableStructure) ||
        observationTableStructure.columns[0].values.length === 0
      ) {
        throw new TerriaError({
          sender: item,
          title: item.name,
          message: i18next.t(
            "models.sensorObservationService.noMatchingFeatures"
          )
        });
      }
      // Add the extra columns from the mapping into the table.
      var identifiers = observationTableStructure.getColumnWithName(
        "identifier"
      ).values;
      var newColumns = createColumnsFromMapping(
        item,
        observationTableStructure,
        identifiers
      );
      observationTableStructure.activeTimeColumnNameIdOrIndex = undefined;
      observationTableStructure.columns = observationTableStructure.columns.concat(
        newColumns
      );
      observationTableStructure.idColumnNames = item._idColumnNames;
      if (item.showFeaturesAtAllTimes) {
        // Set finalEndJulianDate so that adding new null-valued feature rows doesn't mess with the final date calculations.
        // To do this, we need to set the active time column, so that finishJulianDates is calculated.
        observationTableStructure.setActiveTimeColumn(
          item.tableStyle.timeColumn
        );
        var finishDates = observationTableStructure.finishJulianDates.map(d =>
          Number(JulianDate.toDate(d))
        );
        // I thought we'd need to unset the time column, because we're about to change the columns again, and there can be interactions
        // - but it works without unsetting it.
        // observationTableStructure.setActiveTimeColumn(undefined);
        observationTableStructure.finalEndJulianDate = JulianDate.fromDate(
          new Date(Math.max.apply(null, finishDates))
        );
        observationTableStructure.columns = observationTableStructure.getColumnsWithFeatureRowsAtStartAndEndDates(
          "date",
          "value"
        );
      }
      if (!defined(item._tableStructure)) {
        observationTableStructure.name = item.name;
        item.initializeFromTableStructure(observationTableStructure);
      } else {
        observationTableStructure.setActiveTimeColumn(
          item.tableStyle.timeColumn
        );
        // Moving this isActive statement earlier stops all points appearing on the map/globe.
        observationTableStructure.columns.filter(
          column => column.id === "value"
        )[0].isActive = true;
        item._tableStructure.columns = observationTableStructure.columns; // TODO: doesn't do anything.
        // Force the timeline (terria.clock) to update by toggling "isShown" (see CatalogItem's isShownChanged).
        if (item.isShown) {
          item.isShown = false;
          item.isShown = true;
        }
        // Changing the columns triggers a knockout change of the TableDataSource that uses this table.
      }
    });*/
}

/**
 * Returns an array of procedure and/or observableProperty concepts,
 * and sets item._previousProcedureIdentifier and _previousObservablePropertyIdentifier.
 * @private
 */
function buildConcepts(item) {
  var concepts = [];
  /*if (!defined(item.datastreams) || !defined(item.observableProperties)) {
    throw new DeveloperError(
      "Both `procedures` and `observableProperties` arrays must be defined on the catalog item."
    );
  }*/
  if (!defined(item.datastreams)) {
    item.datastreams = [];
    for (let value of Object.values(item._datastreamMapping)) {
      item.datastreams.push({
        identifier: value.identifier,
        title: value.name,
        defaultDuration: item.defaultDuration
      });
    }
  }

  if (item.datastreams.length > 1) {
    var concept = new DisplayVariablesConcept(item.datastreamsName);
    concept.id = "datastreams"; // must match the key of item['procedures']
    concept.requireSomeActive = true;
    concept.isOpen = false;
    concept.items = item.datastreams.map((value, index) => {
      return new VariableConcept(value.title || value.identifier, {
        parent: concept,
        id: value.identifier, // used in the SOS request to identify the procedure.
        active: index === item.initialProcedureIndex
      });
    });
    concepts.push(concept);
    item._previousProcedureIdentifier =
      concept.items[item.initialProcedureIndex].id;
    item._loadingProcedureIdentifier =
      concept.items[item.initialProcedureIndex].id;
  }
  /*if (item.observableProperties.length > 1) {
    concept = new DisplayVariablesConcept(item.observablePropertiesName);
    concept.id = "observableProperties";
    concept.requireSomeActive = true;
    concept.items = item.observableProperties.map((value, index) => {
      return new VariableConcept(value.title || value.identifier, {
        parent: concept,
        id: value.identifier, // used in the SOS request to identify the procedure.
        active: index === item.initialObservablePropertyIndex
      });
    });
    concepts.push(concept);
    item._previousObservablePropertyIdentifier =
      concept.items[item.initialObservablePropertyIndex].id;
    item._loadingObservablePropertyIdentifier =
      concept.items[item.initialObservablePropertyIndex].id;
  }*/
  return concepts;
}

function getChartTagFromFeatureIdentifier(identifier, chartId) {
  // Including a chart id which depends on the frequency serves an important purpose: it means that something about the chart has changed,
  // which tells the FeatureInfoSection React component to re-render.
  // The feature's definitionChanged event triggers when the feature's properties change, but if this chart tag doesn't change,
  // React does not know to re-render the chart.
  if (defined(chartId)) {
    chartId = ' id="' + encodeURIComponent(chartId) + '"';
  } else {
    chartId = "";
  }
  return (
    '<chart src="' +
    identifier +
    '" can-download="false"' +
    chartId +
    "></chart>"
  );
}

/**
 * Converts the locationMembers into a mapping from datastream identifier to its lat/lon and other info.
 * @param  {Object[]} locationMembers An array of location members
 * @return {Object} Keys = identifier, values = {lat, lon, name, observedProperty, unit, id, identifier, type, chart}.
 * @private
 */
function createMappingFromLocationMembers(locationMembers, item) {
  var mapping = {};
  locationMembers.forEach(member => {
    var monitoringPoint = null;

    if (defined(member.location)) {
      monitoringPoint = member.location;
    } else {
      throw new DeveloperError(
        "Unknown member result: " + JSON.stringify(member)
      );
    }

    var shape = monitoringPoint.type;

    if (shape == "Point") {
      var coords = monitoringPoint.coordinates;

      var serviceURL = item.url.endsWith("/") ? item.url : item.url + "/";

      member.Things.forEach(function(thing) {
        thing.Datastreams.forEach(function(datastream) {
          //Create link to helgoland
          var identifier = datastream["@iot.id"];
          var linkUrl = null;
          if (item.externalLinkBase) {
            linkUrl = encodeURI(
              item.externalLinkBase + "?sid=" + serviceURL + "__" + identifier
            );
          }

          mapping[identifier] = {
            lat: coords[1],
            lon: coords[0],
            name: datastream.name,
            observedProperty: datastream.ObservedProperty.name,
            unit: datastream.unitOfMeasurement.name,
            id: identifier,
            identifier: identifier,
            type: '<a href="' + linkUrl + '">Dati</a>'
          };
        });
      });

      //return mapping[identifier];
    } else {
      throw new DeveloperError(
        "Non-point feature not shown. You may want to implement `representAsGeoJson`. " +
          JSON.stringify(shape)
      );
    }
  });
  return mapping;
}

/**
 * Converts the featureMapping output by createMappingFromFeatureMembers into columns for a TableStructure.
 * @param  {SensorThingsAPICatalogItem} item This catalog item.
 * @param  {TableStructure} [tableStructure] Used to set the columns' tableStructure (parent). If identifiers given, output columns line up with them.
 * @param  {String[]} identifiers An array of identifier values from tableStructure. Defaults to all available identifiers.
 * @return {TableColumn[]} An array of columns to add to observationTableStructure. Only include 'identifier' and 'chart' columns if no identifiers provided.
 * @private
 */
function createColumnsFromMapping(item, tableStructure, identifiers) {
  var featureMapping = item._datastreamMapping;

  if (!defined(identifiers)) {
    identifiers = Object.keys(featureMapping);
  }
  var rows = identifiers.map(identifier => featureMapping[identifier]);
  var columnOptions = { tableStructure: tableStructure };
  var chartColumnOptions = { tableStructure: tableStructure, id: "chart" }; // So the chart column can be referred to in the FeatureInfoTemplate as 'chart'.
  var result = [
    new TableColumn("Link", rows.map(row => row.type), columnOptions),
    new TableColumn("Nome", rows.map(row => row.name), columnOptions),
    new TableColumn(
      "Grandezza",
      rows.map(row => row.observedProperty),
      columnOptions
    ),
    new TableColumn("Unità", rows.map(row => row.unit), columnOptions),
    new TableColumn("id", rows.map(row => row.id), columnOptions),
    new TableColumn("Lat", rows.map(row => row.lat), columnOptions),
    new TableColumn("Lon", rows.map(row => row.lon), columnOptions)
  ];

  // add chart column
  var chartName = "Grafico";
  var charts = rows.map(row => {
    var procedure = row.name; //getObjectCorrespondingToSelectedConcept(item, "datastreams");
    var observableProperty = row.name;

    var chartId = procedure + "_" + observableProperty;
    return getChartTagFromFeatureIdentifier(row.identifier, chartId);
  });
  result.push(
    new TableColumn(
      "identifier",
      rows.map(row => row.identifier),
      columnOptions
    ),
    new TableColumn(chartName, charts, chartColumnOptions)
  );

  return result;
}

function createGeoJsonItemFromLocationMembers(item, locationMembers) {
  var features = [];
  item._datastreamMapping = {};

  var serviceURL = item.url.endsWith("/") ? item.url : item.url + "/";
  locationMembers.forEach(member => {
    member.Things.forEach(function(thing) {
      thing.Datastreams.forEach(function(datastream) {
        var monitoringPoint = member.location;
        var shape = monitoringPoint.type;
        var geometry;
        if (shape == "Point") {
          var coords = monitoringPoint.coordinates;

          geometry = {
            type: "Point",
            coordinates: [coords[0], coords[1]]
          };
        } else if (
          shape == "Feature" &&
          monitoringPoint.geometry &&
          monitoringPoint.geometry.type &&
          monitoringPoint.geometry.type == "Point"
        ) {
          var coords = monitoringPoint.geometry.coordinates;

          geometry = {
            type: "Point",
            coordinates: [coords[0], coords[1]]
          };
        } else {
          throw new DeveloperError(
            "Feature shape type not implemented. " + JSON.stringify(shape)
          );
        }
        var identifier = datastream["@iot.id"];
        //Create link to helgoland
        var linkUrl = null;
        if (item.externalLinkBase) {
          linkUrl = encodeURI(
            item.externalLinkBase + "?sid=" + serviceURL + "__" + identifier
          );
        }

        //create datastream mapping
        item._datastreamMapping[identifier] = {
          lat: coords[1],
          lon: coords[0],
          name: datastream.name,
          observedProperty: datastream.ObservedProperty.name,
          unit: datastream.unitOfMeasurement.name,
          id: identifier,
          identifier: identifier,
          type: '<a href="' + linkUrl + '">Dati</a>'
        };

        features.push({
          type: "Feature",
          geometry: geometry,
          properties: {
            ID: identifier,
            Lat: coords[1],
            Lon: coords[0],
            Nome: datastream.name,
            Grandezza: datastream.ObservedProperty.name,
            Unita: datastream.unitOfMeasurement.name,
            Link: '<a href="' + linkUrl + '">Dati</a>',
            "marker-symbol": "marker",
            "marker-color": "#803e75",
            "marker-size": "medium"
          }
        });
      });
    });
  });

  var geojson = {
    type: "FeatureCollection",
    features: features
  };
  var geoJsonItem = new GeoJsonCatalogItem(item.terria);
  geoJsonItem.data = featureDataToGeoJson(geojson);
  geoJsonItem.style = item.style; // For the future...
  return geoJsonItem;
}

function revertConceptsToPrevious(
  item,
  previousProcedureIdentifier,
  previousObservablePropertyIdentifier
) {
  var parentConcept;
  item._revertingConcepts = true;
  // Use the flag above to signify that we do not want to trigger a reload.
  if (defined(previousProcedureIdentifier)) {
    parentConcept = item._concepts.filter(
      concept => concept.id === "datastreams"
    )[0];
    // Toggle the old value on again (unless it is already on). This auto-toggles-off the new value.
    var old =
      parentConcept &&
      parentConcept.items.filter(
        concept =>
          !concept.isActive && concept.id === previousProcedureIdentifier
      )[0];
    if (defined(old)) {
      old.toggleActive();
    }
  }
  if (defined(previousObservablePropertyIdentifier)) {
    parentConcept = item._concepts.filter(
      concept => concept.id === "observableProperties"
    )[0];
    old =
      parentConcept &&
      parentConcept.items.filter(
        concept =>
          !concept.isActive &&
          concept.id === previousObservablePropertyIdentifier
      )[0];
    if (defined(old)) {
      old.toggleActive();
    }
  }
  item._revertingConcepts = false;
}

function changedActiveItems(item) {
  // If either of these names is not available, the user is probably in the middle of a change
  // (when for a brief moment either 0 or 2 items are selected). So ignore.
  var datastream = getObjectCorrespondingToSelectedConcept(item, "datastreams");
  /*var observableProperty = getObjectCorrespondingToSelectedConcept(
    item,
    "observableProperties"
  );*/
  if (!defined(datastream) /*|| !defined(observableProperty)*/) {
    return;
  }
  item.isLoading = true;
  /*
  item._loadingProcedureIdentifier = procedure.identifier;
  //item._loadingObservablePropertyIdentifier = observableProperty.identifier;
  item._observationDataPromise = loadObservationData(item)
    .then(function() {
      item.isLoading = false;
      // Save the current values of these concepts so we can fall back to them if there's an error moving to a new set.
      item._previousProcedureIdentifier = procedure.identifier;
      //item._previousObservablePropertyIdentifier =
       // observableProperty.identifier;
      // And save them for sharing.
      item.initialProcedureIndex = getConceptIndexOfIdentifier(
        item,
        "datastreams",
        procedure.identifier
      );*/
  /*item.initialObservablePropertyIndex = getConceptIndexOfIdentifier(
        item,
        "observableProperties",
        observableProperty.identifier
      );*/
  /*})
    .otherwise(function(e) {
      revertConceptsToPrevious(
        item,
        item._previousProcedureIdentifier,
        item._previousObservablePropertyIdentifier
      );
      item.isLoading = false;
      raiseErrorToUser(item.terria, e);
    });*/

  // zoom to datastream position
  var datastream = item._datastreamMapping[datastream.identifier];
  var rectangle = zoomRectangleFromPoint(datastream.lat, datastream.lon, 0.001);
  item.terria.currentViewer.zoomTo(rectangle, 1.5);
  item.isLoading = false;
}

/**
 * Converts parameters {x: 'y'} into an array of {name: 'x', value: 'y'} objects.
 * Converts {x: [1, 2, ...]} into multiple objects:
 *   {name: 'x', value: 1}, {name: 'x', value: 2}, ...
 * @param  {Object} parameters eg. {a: 3, b: [6, 8]}
 * @return {Object[]} eg. [{name: 'a', value: 3}, {name: 'b', value: 6}, {name: 'b', value: 8}]
 * @private
 */
function convertObjectToNameValueArray(parameters) {
  return Object.keys(parameters).reduce((result, key) => {
    var values = parameters[key];
    if (!Array.isArray(values)) {
      values = [values];
    }
    return result.concat(
      values.map(value => {
        return {
          name: key,
          value: value
        };
      })
    );
  }, []);
}

var scratchJulianDate = new JulianDate();
/**
 * Adds a period to an iso8601-formatted date.
 * Periods must be (positive or negative) numbers followed by a letter:
 * s (seconds), h (hours), d (days), y (years).
 * To avoid confusion between minutes and months, do not use m.
 * @param  {String} dateIso8601 The date in ISO8601 format.
 * @param  {String} durationString The duration string, in the format described.
 * @return {String} A date string in ISO8601 format.
 * @private
 */
function addDurationToIso8601(dateIso8601, durationString) {
  if (!defined(dateIso8601) || dateIso8601.length < 3) {
    throw new DeveloperError("Bad date " + dateIso8601);
  }
  var duration = parseFloat(durationString);
  if (isNaN(duration) || duration === 0) {
    throw new DeveloperError("Bad duration " + durationString);
  }
  var julianDate = JulianDate.fromIso8601(dateIso8601, scratchJulianDate);
  var units = durationString.slice(durationString.length - 1);
  if (units === "s") {
    julianDate = JulianDate.addSeconds(julianDate, duration, scratchJulianDate);
  } else if (units === "h") {
    julianDate = JulianDate.addHours(julianDate, duration, scratchJulianDate);
  } else if (units === "d") {
    // Use addHours on 24 * numdays - on my casual reading of addDays, it needs an integer.
    julianDate = JulianDate.addHours(
      julianDate,
      duration * 24,
      scratchJulianDate
    );
  } else if (units === "y") {
    var days = Math.round(duration * 365);
    julianDate = JulianDate.addDays(julianDate, days, scratchJulianDate);
  } else {
    throw new DeveloperError(
      'Unknown duration type "' + durationString + '" (use s, h, d or y)'
    );
  }
  return JulianDate.toIso8601(julianDate);
}

module.exports = SensorThingsAPICatalogItem;
