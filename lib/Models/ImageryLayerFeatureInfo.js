"use strict";

import {
  mouse as d3Mouse,
  select as d3Select,
  event as d3Event,
  create as d3Create
} from "d3-selection";
import { axisBottom as d3AxisBottom, axisLeft as d3AxisLeft } from "d3-axis";
import { zoom as d3Zoom, zoomIdentity as d3ZoomIdentity } from "d3-zoom";
import {
  timeParse as d3TimeParse,
  timeFormat as d3TimeFormat
} from "d3-time-format";
import {
  extent as d3Extent,
  max as d3Max,
  min as d3Min,
  bisector as d3Bisector
} from "d3-array";
import {
  scaleLinear as d3ScaleLinear,
  scaleTime as d3ScaleTime
} from "d3-scale";
import { line as d3Line } from "d3-shape";

/*global require*/
var ImageryLayerFeatureInfo = require("terriajs-cesium/Source/Scene/ImageryLayerFeatureInfo")
  .default;
var defined = require("terriajs-cesium/Source/Core/defined").default;

var formatPropertyValue = require("../Core/formatPropertyValue");

/**
 * Configures the description of this feature by creating an HTML table of properties and their values.
 *
 * @param {Object} properties An object literal containing the properties of the feature.
 */
ImageryLayerFeatureInfo.prototype.configureDescriptionFromProperties = function(
  properties
) {
  function plot(properties) {
    // set the dimensions and margins of the graph
    var margin = { top: 35, right: 30, bottom: 50, left: 60 },
      width = 460 - margin.left - margin.right,
      height = 400 - margin.top - margin.bottom;

    // append the svg object to the body of the page
    d3Select(".svg-container").remove();
    var div = d3Create("div").classed("svg-container", true);
    var svg = div
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var data = [];

    //Read the data
    for (var key in properties) {
      if (key.startsWith("D") && properties.hasOwnProperty(key)) {
        var value = properties[key];
        data.push({
          date: d3TimeParse("%Y%m%d")(key.substring(1)),
          value: parseFloat(value)
        });
      }
    }

    // Add X axis --> it is a date format
    var x = d3ScaleTime()
      .domain(
        d3Extent(data, function(d) {
          return d.date;
        })
      )
      .range([0, width]);
    svg
      .append("g")
      .attr("transform", "translate(0," + height + ")")
      .call(d3AxisBottom(x));

    // text label for the x axis
    svg
      .append("text")
      .attr(
        "transform",
        "translate(" + width / 2 + " ," + (height + margin.top) + ")"
      )
      .style("text-anchor", "middle")
      .text("Time (days)");

    // Add Y axis
    var y = d3ScaleLinear()
      .domain([
        d3Min(data, function(d) {
          return +d.value;
        }),
        d3Max(data, function(d) {
          return +d.value;
        })
      ])
      .range([height, 0]);
    svg.append("g").call(d3AxisLeft(y));

    // text label for the y axis
    svg
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", 0 - margin.left)
      .attr("x", 0 - height / 2)
      .attr("dy", "1em")
      .style("text-anchor", "middle")
      .text("Displacement (mm)");

    // Add the line
    svg
      .append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "steelblue")
      .attr("stroke-width", 1.5)
      .attr(
        "d",
        d3Line()
          .x(function(d) {
            return x(d.date);
          })
          .y(function(d) {
            return y(d.value);
          })
      );

    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", 0 - margin.top / 2)
      .attr("text-anchor", "middle")
      .style("font-size", "16px")
      .style("text-decoration", "underline")
      .text("PSP-IFSAR temporal evolution");

    var parseDate = d3TimeFormat("%m/%e/%Y").parse,
      bisectDate = d3Bisector(function(d) {
        return d.date;
      }).left,
      dateFormatter = d3TimeFormat("%m/%d/%y");

    var focus = svg
      .append("g")
      .attr("class", "focus")
      .style("display", "none");

    focus
      .append("circle")
      .attr("r", 5)
      .attr("class", "circle");

    var rectWidth = 100;
    focus
      .append("rect")
      .attr("class", "tooltip")
      .attr("width", rectWidth)
      .attr("height", 50)
      .attr("x", 10)
      .attr("y", -22)
      .attr("rx", 4)
      .attr("ry", 4);

    focus
      .append("text")
      .attr("class", "tooltip-date")
      .attr("x", 18)
      .attr("y", -2);

    focus
      .append("text")
      .attr("x", 18)
      .attr("y", 18)
      .text("Value:");

    focus
      .append("text")
      .attr("class", "tooltip-value")
      .attr("x", 60)
      .attr("y", 18);

    var svgId =
      "id-" +
      Math.random()
        .toString(36)
        .substr(2, 16);

    svg
      .append("rect")
      .attr("class", "overlay")
      .attr("width", width)
      .attr("height", height)
      .attr("id", svgId);

    $on(document.body, "mouseover", "#" + svgId, (evt, matched) => {
      matched.parentElement
        .querySelector(".focus")
        .style.setProperty("display", "block");
    });

    $on(document.body, "mouseout", "#" + svgId, (evt, matched) => {
      matched.parentElement
        .querySelector(".focus")
        .style.setProperty("display", "none");
    });

    $on(document.body, "mousemove", "#" + svgId, (evt, matched) => {
      var x0 = x.invert(evt.layerX - margin.left - 2),
        i = bisectDate(data, x0, 1),
        d0 = data[i - 1],
        d1 = data[i];

      if (d1) {
        var d = x0 - d0.date > d1.date - x0 ? d1 : d0;
        var focus = matched.parentElement.querySelector(".focus");
        var xpos = x(d.date);
        var overflows = xpos + rectWidth > width;
        focus
          .querySelector(".circle")
          .setAttribute("cx", overflows ? rectWidth + 20 : 0);
        focus.setAttribute(
          "transform",
          "translate(" +
            (overflows ? xpos - rectWidth - 20 : xpos) +
            "," +
            y(d.value) +
            ")"
        );
        focus.querySelector(".tooltip-date").innerHTML = dateFormatter(d.date);
        focus.querySelector(".tooltip-value").innerHTML = d.value;
      }
    });

    return div.html();
  }

  function describe(properties) {
    var html = '<table class="cesium-infoBox-defaultTable">';
    for (var key in properties) {
      if (properties.hasOwnProperty(key)) {
        var value = properties[key];
        if (defined(value)) {
          if (typeof value === "object") {
            html +=
              "<tr><td>" + key + "</td><td>" + describe(value) + "</td></tr>";
          } else {
            html +=
              "<tr><td>" +
              key +
              "</td><td>" +
              formatPropertyValue(value) +
              "</td></tr>";
          }
        }
      }
    }
    html += "</table>";

    return html;
  }

  //Check if properties contians dates in the format D20000101
  //then show a plot instead of a table
  try {
    var isnum = false;
    for (var key in properties) {
      if (
        key.startsWith("D") &&
        properties.hasOwnProperty(key) &&
        key.length == 9
      ) {
        isnum = /^\d+$/.test(key.substring(1));
        break;
      }
    }
    if (isnum) {
      this.description = plot(properties);
    } else {
      this.description = describe(properties);
    }
  } catch (error) {
    this.description = describe(properties);
  }
};
