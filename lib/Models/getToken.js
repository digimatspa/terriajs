const defined = require("terriajs-cesium/Source/Core/defined").default;
const loadWithXhr = require("../Core/loadWithXhr");
const TerriaError = require("../Core/TerriaError");
var i18next = require("i18next").default;

function getCookie(cname) {
  var name = cname + "=";
  var decodedCookie = decodeURIComponent(document.cookie);
  var ca = decodedCookie.split(";");
  for (var i = 0; i < ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == " ") {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}

function getToken(terria, tokenUrl, url) {
  var csrf_token = getCookie("csrftoken");
  const options = {
    url: tokenUrl,
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRFTOKEN": csrf_token },
    data: JSON.stringify({
      url: url
    })
  };

  return loadWithXhr(options)
    .then(function(result) {
      const tokenResponse = JSON.parse(result);
      if (!defined(tokenResponse.token)) {
        throw new TerriaError({
          title: i18next.t("models.getToken.errorTitle"),
          message: i18next.t("models.getToken.invalidToken", {
            email:
              '<a href="mailto:' +
              terria.supportEmail +
              '">' +
              terria.supportEmail +
              "</a>."
          })
        });
      }

      return tokenResponse.token;
    })
    .otherwise(() => {
      throw new TerriaError({
        title: i18next.t("models.getToken.errorTitle"),
        message: i18next.t("models.getToken.unableToRequest", {
          email:
            '<a href="mailto:' +
            terria.supportEmail +
            '">' +
            terria.supportEmail +
            "</a>."
        })
      });
    });
}

module.exports = getToken;
