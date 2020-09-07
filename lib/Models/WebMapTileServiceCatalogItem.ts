import i18next from "i18next";
import { computed, runInAction } from "mobx";
import defined from "terriajs-cesium/Source/Core/defined";
import Rectangle from "terriajs-cesium/Source/Core/Rectangle";
import WebMercatorTilingScheme from "terriajs-cesium/Source/Core/WebMercatorTilingScheme";
import WebMapTileServiceImageryProvider from "terriajs-cesium/Source/Scene/WebMapTileServiceImageryProvider";
import URI from "urijs";
import isDefined from "../Core/isDefined";
import TerriaError from "../Core/TerriaError";
import CatalogMemberMixin from "../ModelMixins/CatalogMemberMixin";
import GetCapabilitiesMixin from "../ModelMixins/GetCapabilitiesMixin";
import UrlMixin from "../ModelMixins/UrlMixin";
import LegendTraits from "../Traits/LegendTraits";
import { RectangleTraits } from "../Traits/MappableTraits";
import WebMapTileServiceCatalogItemTraits, {
  WebMapTileServiceAvailableLayerStylesTraits
} from "../Traits/WebMapTileServiceCatalogItemTraits";
import isReadOnlyArray from "./../Core/isReadOnlyArray";
import CreateModel from "./CreateModel";
import createStratumInstance from "./createStratumInstance";
import LoadableStratum from "./LoadableStratum";
import Mappable from "./Mappable";
import { BaseModel } from "./Model";
import { CapabilitiesLegend, ServiceProvider } from "./OwsInterfaces";
import proxyCatalogItemUrl from "./proxyCatalogItemUrl";
import StratumFromTraits from "./StratumFromTraits";
import WebMapTileServiceCapabilities, {
  CapabilitiesStyle,
  ResourceUrl,
  TileMatrixSetLink,
  WmtsLayer
} from "./WebMapTileServiceCapabilities";
import { InfoSectionTraits } from "../Traits/CatalogMemberTraits";
import containsAny from "../Core/containsAny";

interface UsableTileMatrixSets {
  identifiers: string[];
  tileWidth: number;
  tileHeight: number;
}

class WmtsCapabilitiesStratum extends LoadableStratum(
  WebMapTileServiceCatalogItemTraits
) {
  static stratumName = "wmtsServer";

  static load(
    catalogItem: WebMapTileServiceCatalogItem
  ): Promise<WmtsCapabilitiesStratum> {
    console.log("Loading GetCapabilities");
    if (catalogItem.getCapabilitiesUrl === undefined) {
      return Promise.reject(
        new TerriaError({
          title: i18next.t(
            "models.webMapTileServiceCatalogItem.missingUrlTitle"
          ),
          message: i18next.t(
            "models.webMapTileServiceCatalogItem.missingUrlMessage"
          )
        })
      );
    }

    const proxiedUrl = proxyCatalogItemUrl(
      catalogItem,
      catalogItem.getCapabilitiesUrl,
      catalogItem.getCapabilitiesCacheDuration
    );
    return WebMapTileServiceCapabilities.fromUrl(proxiedUrl).then(
      capabilities => {
        return new WmtsCapabilitiesStratum(catalogItem, capabilities);
      }
    );
  }

  constructor(
    readonly catalogItem: WebMapTileServiceCatalogItem,
    readonly capabilities: WebMapTileServiceCapabilities
  ) {
    super();
  }

  duplicateLoadableStratum(model: BaseModel): this {
    return new WmtsCapabilitiesStratum(
      model as WebMapTileServiceCatalogItem,
      this.capabilities
    ) as this;
  }

  @computed
  get supportsReordering() {
    return !this.keepOnTop;
  }

  @computed
  get layer(): string | undefined {
    let layer: string | undefined;

    if (this.catalogItem.uri !== undefined) {
      const query: any = this.catalogItem.uri.query(true);
      layer = query.layer;
    }

    return layer;
  }

  @computed
  get info(): StratumFromTraits<InfoSectionTraits>[] {
    const result: StratumFromTraits<InfoSectionTraits>[] = [
      createStratumInstance(InfoSectionTraits, {
        name: i18next.t(
          "models.webMapTileServiceCatalogItem.getCapabilitiesUrl"
        ),
        content: this.catalogItem.getCapabilitiesUrl
      })
    ];
    let layerAbstract: string | undefined;
    const layer = this.capabilitiesLayer;
    if (
      layer &&
      layer.Abstract &&
      !containsAny(
        layer.Abstract,
        WebMapTileServiceCatalogItem.abstractsToIgnore
      )
    ) {
      result.push(
        createStratumInstance(InfoSectionTraits, {
          name: i18next.t(
            "models.webMapTileServiceCatalogItem.dataDescription"
          ),
          content: layer.Abstract
        })
      );
      layerAbstract = layer.Abstract;
    }

    const serviceIdentification =
      this.capabilities && this.capabilities.ServiceIdentification;
    if (serviceIdentification) {
      if (
        serviceIdentification.Abstract &&
        !containsAny(
          serviceIdentification.Abstract,
          WebMapTileServiceCatalogItem.abstractsToIgnore
        ) &&
        serviceIdentification.Abstract !== layerAbstract
      ) {
        result.push(
          createStratumInstance(InfoSectionTraits, {
            name: i18next.t(
              "models.webMapTileServiceCatalogItem.serviceDescription"
            ),
            content: serviceIdentification.Abstract
          })
        );
      }

      // Show the Access Constraints if it isn't "none" (because that's the default, and usually a lie).
      if (
        serviceIdentification.AccessConstraints &&
        !/^none$/i.test(serviceIdentification.AccessConstraints)
      ) {
        result.push(
          createStratumInstance(InfoSectionTraits, {
            name: i18next.t(
              "models.webMapTileServiceCatalogItem.accessConstraints"
            ),
            content: serviceIdentification.AccessConstraints
          })
        );
      }

      // Show the Access Constraints if it isn't "none" (because that's the default, and usually a lie).
      if (
        serviceIdentification.Fees &&
        !/^none$/i.test(serviceIdentification.Fees)
      ) {
        result.push(
          createStratumInstance(InfoSectionTraits, {
            name: i18next.t("models.webMapTileServiceCatalogItem.fees"),
            content: serviceIdentification.Fees
          })
        );
      }
    }

    const serviceProvider =
      this.capabilities && this.capabilities.ServiceProvider;
    if (serviceProvider) {
      result.push(
        createStratumInstance(InfoSectionTraits, {
          name: i18next.t("models.webMapTileServiceCatalogItem.serviceContact"),
          content: getServiceContactInformation(serviceProvider) || ""
        })
      );
    }
    return result;
  }

  @computed
  get legend(): StratumFromTraits<LegendTraits> | undefined {
    const availableStyles = this.catalogItem.availableStyles || [];
    const layer = this.catalogItem.layer;
    const style = this.catalogItem.defaultStyle;

    let result: StratumFromTraits<LegendTraits> | undefined;
    const layerAvailableStyles = availableStyles.find(
      candidate => candidate.layerName === layer
    )?.styles;

    const layerStyle = layerAvailableStyles?.find(
      candidate => candidate.identifier
    );
    if (layerStyle !== undefined && layerStyle.legend !== undefined) {
      result = <StratumFromTraits<LegendTraits>>(<unknown>layerStyle.legend);
    }

    return result;
  }

  @computed
  get capabilitiesLayer(): Readonly<WmtsLayer | undefined> {
    let result = this.catalogItem.layer
      ? this.capabilities.findLayer(this.catalogItem.layer)
      : undefined;
    return result;
  }

  @computed
  get availableStyles(): StratumFromTraits<
    WebMapTileServiceAvailableLayerStylesTraits
  >[] {
    const result: any = [];
    if (!this.capabilities) {
      return result;
    }
    const layer = this.capabilitiesLayer;
    if (!layer) {
      return result;
    }
    const styles: ReadonlyArray<CapabilitiesStyle> =
      layer && layer.Style
        ? Array.isArray(layer.Style)
          ? layer.Style
          : [layer.Style]
        : [];
    result.push({
      layerName: layer?.Identifier,
      styles: styles.map((style: CapabilitiesStyle) => {
        let wmtsLegendUrl: CapabilitiesLegend | undefined = isReadOnlyArray(
          style.LegendURL
        )
          ? style.LegendURL[0]
          : style.LegendURL;
        let legendUri, legendMimeType;
        if (
          wmtsLegendUrl &&
          wmtsLegendUrl.OnlineResource &&
          wmtsLegendUrl.OnlineResource["xlink:href"]
        ) {
          legendUri = new URI(
            decodeURIComponent(wmtsLegendUrl.OnlineResource["xlink:href"])
          );
          legendMimeType = wmtsLegendUrl.Format;
        }
        const legend = !legendUri
          ? undefined
          : createStratumInstance(LegendTraits, {
              url: legendUri.toString(),
              urlMimeType: legendMimeType,
              title: layer?.Identifier
            });
        return {
          identifier: style.Identifier,
          isDefault: style.isDefault,
          abstract: style.Abstract,
          legend: legend
        };
      })
    });

    return result;
  }

  @computed
  get usableTileMatrixSets() {
    const usableTileMatrixSets: { [key: string]: UsableTileMatrixSets } = {
      "urn:ogc:def:wkss:OGC:1.0:GoogleMapsCompatible": {
        identifiers: ["0"],
        tileWidth: 256,
        tileHeight: 256
      }
    };

    const standardTilingScheme = new WebMercatorTilingScheme();

    const matrixSets = this.capabilities.tileMatrixSets;
    if (matrixSets === undefined) {
      return;
    }
    for (let i = 0; i < matrixSets.length; i++) {
      const matrixSet = matrixSets[i];
      if (
        matrixSet.SupportedCRS !== "urn:ogc:def:crs:EPSG::900913" &&
        matrixSet.SupportedCRS !== "urn:ogc:def:crs:EPSG:6.18:3:3857" &&
        matrixSet.SupportedCRS !== "urn:ogc:def:crs:EPSG:6.18.3:3857" && // found in esri wmts
        matrixSet.SupportedCRS !== "urn:ogc:def:crs:EPSG::3857"
      ) {
        continue;
      }
      // Usable tile matrix sets must have a single 256x256 tile at the root.
      const matrices = matrixSet.TileMatrix;
      if (!isDefined(matrices) || matrices.length < 1) {
        continue;
      }

      const levelZeroMatrix = matrices[0];
      /* if (
        (levelZeroMatrix.TileWidth | 0) !== 256 ||
        (levelZeroMatrix.TileHeight | 0) !== 256 ||
        (levelZeroMatrix.MatrixWidth | 0) !== 1 ||
        (levelZeroMatrix.MatrixHeight | 0) !== 1
      ) {
        continue;
      }

      const levelZeroScaleDenominator = 559082264.0287178; // from WMTS 1.0.0 spec section E.4.
      if (
        Math.abs(levelZeroMatrix.ScaleDenominator - levelZeroScaleDenominator) >
        1
      ) {
        continue;
      } */

      if (!isDefined(levelZeroMatrix.TopLeftCorner)) {
        continue;
      }

      var levelZeroTopLeftCorner = levelZeroMatrix.TopLeftCorner.split(" ");
      var startX = parseFloat(levelZeroTopLeftCorner[0]);
      var startY = parseFloat(levelZeroTopLeftCorner[1]);
      const rectangleInMeters = standardTilingScheme.rectangleToNativeRectangle(
        standardTilingScheme.rectangle
      );
      if (
        Math.abs(startX - rectangleInMeters.west) > 1 ||
        Math.abs(startY - rectangleInMeters.north) > 1
      ) {
        continue;
      }

      if (defined(matrixSet.TileMatrix) && matrixSet.TileMatrix.length > 0) {
        const ids = matrixSet.TileMatrix.map(function(item) {
          return item.Identifier;
        });
        const firstTile = matrixSet.TileMatrix[0];
        usableTileMatrixSets[matrixSet.Identifier] = {
          identifiers: ids,
          tileWidth: firstTile.TileWidth,
          tileHeight: firstTile.TileHeight
        };
      }
    }

    return usableTileMatrixSets;
  }

  @computed
  get rectangle(): StratumFromTraits<RectangleTraits> | undefined {
    const layer: WmtsLayer | undefined = this.capabilitiesLayer;
    if (!layer) {
      return;
    }
    const bbox = layer.WGS84BoundingBox;
    if (bbox) {
      const lowerCorner = bbox.LowerCorner.split(" ");
      const upperCorner = bbox.UpperCorner.split(" ");
      return {
        west: parseFloat(lowerCorner[0]),
        south: parseFloat(lowerCorner[1]),
        east: parseFloat(upperCorner[0]),
        north: parseFloat(upperCorner[1])
      };
    }
  }
}

class WebMapTileServiceCatalogItem
  extends GetCapabilitiesMixin(
    UrlMixin(
      CatalogMemberMixin(CreateModel(WebMapTileServiceCatalogItemTraits))
    )
  )
  implements Mappable {
  /**
   * The collection of strings that indicate an Abstract property should be ignored.  If these strings occur anywhere
   * in the Abstract, the Abstract will not be used.  This makes it easy to filter out placeholder data like
   * Geoserver's "A compliant implementation of WMTS..." stock abstract.
   */
  static abstractsToIgnore = [
    "A compliant implementation of WMTS service.",
    "This is the reference implementation of WMTS 1.0.0"
  ];

  // hide elements in the info section which might show information about the datasource
  _sourceInfoItemNames = [
    i18next.t("models.webMapTileServiceCatalogItem.getCapabilitiesUrl")
  ];

  static readonly type = "wmts";
  readonly canZoomTo = true;

  get type() {
    return WebMapTileServiceCatalogItem.type;
  }

  // TODO
  get isMappable() {
    return true;
  }

  protected forceLoadMetadata(): Promise<void> {
    return WmtsCapabilitiesStratum.load(this).then(stratum => {
      runInAction(() => {
        this.strata.set(
          GetCapabilitiesMixin.getCapabilitiesStratumName,
          stratum
        );
      });
    });
  }

  loadMapItems(): Promise<void> {
    return this.loadMetadata();
  }

  @computed get cacheDuration(): string {
    if (isDefined(super.cacheDuration)) {
      return super.cacheDuration;
    }
    return "1d";
  }

  @computed get defaultStyle(): string {
    let defaultStyle = this.style;
    if (defaultStyle) {
      return defaultStyle;
    }

    const availableStyles = this.availableStyles;
    const layerAvailableStyles = availableStyles.find(
      candidate => candidate.layerName === this.layer
    )?.styles;
    if (!layerAvailableStyles) {
      return defaultStyle || "";
    }
    for (let i = 0; i < layerAvailableStyles.length; ++i) {
      const style = layerAvailableStyles[i];
      if (style.isDefault) {
        defaultStyle = style.identifier;
      }
    }

    if (!defaultStyle && layerAvailableStyles.length > 0) {
      defaultStyle = layerAvailableStyles[0].identifier;
    }

    return defaultStyle || "";
  }

  @computed
  get imageryProvider() {
    const stratum = <WmtsCapabilitiesStratum>(
      this.strata.get(GetCapabilitiesMixin.getCapabilitiesStratumName)
    );

    if (!isDefined(this.layer) || !isDefined(this.url) || !isDefined(stratum)) {
      return;
    }

    const layer = stratum.capabilities.findLayer(this.layer);
    const layerIdentifier = layer?.Identifier;
    if (!isDefined(layer) || !isDefined(layerIdentifier)) {
      return;
    }

    let format: string = "image/png";
    const formats = layer.Format;
    if (
      formats &&
      formats?.indexOf("image/png") < 0 &&
      formats?.indexOf("image/jpeg")
    ) {
      format = "image/jpeg";
    }

    // if layer has defined ResourceURL we should use it because some layers support only Restful encoding. See #2927
    const resourceUrl: ResourceUrl | ResourceUrl[] | undefined =
      layer.ResourceURL;
    let baseUrl: string = new URI(this.url).search("").toString();
    if (resourceUrl) {
      if (Array.isArray(resourceUrl)) {
        for (let i = 0; i < resourceUrl.length; i++) {
          const url: ResourceUrl = resourceUrl[i];
          if (url.format.indexOf(format) || url.format.indexOf("png")) {
            baseUrl = url.template;
          }
        }
      } else {
        if (
          format === resourceUrl.format ||
          resourceUrl.format.indexOf("png")
        ) {
          baseUrl = resourceUrl.template;
        }
      }
    }

    const tileMatrixSet = this.tileMatrixSet;
    if (!isDefined(tileMatrixSet)) {
      return;
    }
    let rectangle: Rectangle;
    if (
      this.rectangle !== undefined &&
      this.rectangle.west !== undefined &&
      this.rectangle.south !== undefined &&
      this.rectangle.east !== undefined &&
      this.rectangle.north !== undefined
    ) {
      rectangle = Rectangle.fromDegrees(
        this.rectangle.west,
        this.rectangle.south,
        this.rectangle.east,
        this.rectangle.north
      );
    } else {
      rectangle = Rectangle.MAX_VALUE;
    }

    const imageryProvider = new WebMapTileServiceImageryProvider({
      url: proxyCatalogItemUrl(this, baseUrl),
      layer: layerIdentifier,
      style: this.defaultStyle,
      tileMatrixSetID: tileMatrixSet.id,
      tileMatrixLabels: tileMatrixSet.labels,
      minimumLevel: tileMatrixSet.minLevel,
      maximumLevel: tileMatrixSet.maxLevel,
      tileWidth: tileMatrixSet.tileWidth,
      tileHeight: tileMatrixSet.tileHeight,
      tilingScheme: new WebMercatorTilingScheme(),
      format: format
    });
    return imageryProvider;
  }

  @computed
  get tileMatrixSet():
    | {
        id: string;
        labels: string[];
        maxLevel: number;
        minLevel: number;
        tileWidth: number;
        tileHeight: number;
      }
    | undefined {
    const stratum = <WmtsCapabilitiesStratum>(
      this.strata.get(GetCapabilitiesMixin.getCapabilitiesStratumName)
    );
    if (!this.layer) {
      return;
    }
    const layer = stratum.capabilities.findLayer(this.layer);
    if (!layer) {
      return;
    }

    const usableTileMatrixSets = stratum.usableTileMatrixSets;

    let tileMatrixSetLinks: TileMatrixSetLink[] = [];
    if (layer?.TileMatrixSetLink) {
      if (Array.isArray(layer?.TileMatrixSetLink)) {
        tileMatrixSetLinks = [...layer?.TileMatrixSetLink];
      } else {
        tileMatrixSetLinks = [layer.TileMatrixSetLink];
      }
    }

    let tileMatrixSetId: string =
      "urn:ogc:def:wkss:OGC:1.0:GoogleMapsCompatible";
    let maxLevel: number = 0;
    let minLevel: number = 0;
    let tileWidth: number = 256;
    let tileHeight: number = 256;
    let tileMatrixSetLabels: string[] = [];
    for (let i = 0; i < tileMatrixSetLinks.length; i++) {
      const tileMatrixSet = tileMatrixSetLinks[i].TileMatrixSet;
      if (usableTileMatrixSets && usableTileMatrixSets[tileMatrixSet]) {
        tileMatrixSetId = tileMatrixSet;
        tileMatrixSetLabels = usableTileMatrixSets[tileMatrixSet].identifiers;
        tileWidth = Number(usableTileMatrixSets[tileMatrixSet].tileWidth);
        tileHeight = Number(usableTileMatrixSets[tileMatrixSet].tileHeight);
        break;
      }
    }

    if (Array.isArray(tileMatrixSetLabels)) {
      const levels = tileMatrixSetLabels.map(label => {
        const lastIndex = label.lastIndexOf(":");
        return Math.abs(Number(label.substring(lastIndex + 1)));
      });
      maxLevel = levels.reduce((currentMaximum, level) => {
        return level > currentMaximum ? level : currentMaximum;
      }, 0);
      minLevel = levels.reduce((currentMaximum, level) => {
        return level < currentMaximum ? level : currentMaximum;
      }, 0);
    }

    return {
      id: tileMatrixSetId,
      labels: tileMatrixSetLabels,
      maxLevel: maxLevel,
      minLevel: minLevel,
      tileWidth: tileWidth,
      tileHeight: tileHeight
    };
  }

  @computed
  get mapItems() {
    if (isDefined(this.imageryProvider)) {
      return [
        {
          alpha: this.opacity,
          show: this.show,
          imageryProvider: this.imageryProvider
        }
      ];
    }
    return [];
  }

  protected get defaultGetCapabilitiesUrl(): string | undefined {
    if (this.uri) {
      return this.uri
        .clone()
        .setSearch({
          service: "WMTS",
          version: "1.0.0",
          request: "GetCapabilities"
        })
        .toString();
    } else {
      return undefined;
    }
  }
}

export function getServiceContactInformation(contactInfo: ServiceProvider) {
  let text = "";
  if (contactInfo.ProviderName && contactInfo.ProviderName.length > 0) {
    text += contactInfo.ProviderName + "<br/>";
  }

  if (contactInfo.ProviderSite && contactInfo.ProviderSite["xlink:href"]) {
    text += contactInfo.ProviderSite["xlink:href"] + "<br/>";
  }

  const serviceContact = contactInfo.ServiceContact;
  if (serviceContact) {
    const invidualName = serviceContact.InvidualName;
    if (invidualName && invidualName.length > 0) {
      text += invidualName + "<br/>";
    }
    const contactInfo = serviceContact.ContactInfo?.Address;
    if (
      contactInfo &&
      isDefined(contactInfo.ElectronicMailAddress) &&
      contactInfo.ElectronicMailAddress.length > 0
    ) {
      text += `[${contactInfo.ElectronicMailAddress}](mailto:${contactInfo.ElectronicMailAddress})`;
    }
  }
  return text;
}

export default WebMapTileServiceCatalogItem;
