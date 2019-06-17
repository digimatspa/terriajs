import { computed, observable, toJS } from "mobx";
import createGuid from "terriajs-cesium/Source/Core/createGuid";
import JsonValue, { isJsonObject, JsonArray, JsonObject } from "../Core/Json";
import loadJson from "../Core/loadJson";
import makeRealPromise from "../Core/makeRealPromise";
import TerriaError from "../Core/TerriaError";
import CatalogMemberMixin from "../ModelMixins/CatalogMemberMixin";
import ReferenceMixin from "../ModelMixins/ReferenceMixin";
import UrlMixin from "../ModelMixins/UrlMixin";
import MagdaCatalogItemTraits from "../Traits/MagdaCatalogItemTraits";
import MagdaDistributionFormatTraits from "../Traits/MagdaDistributionFormatTraits";
import CatalogMemberFactory from "./CatalogMemberFactory";
import CommonStrata from "./CommonStrata";
import CreateModel from "./CreateModel";
import createStratumInstance from "./createStratumInstance";
import { BaseModel } from "./Model";
import proxyCatalogItemUrl from "./proxyCatalogItemUrl";
import Terria from "./Terria";
import upsertModelFromJson from "./upsertModelFromJson";
import StratumFromTraits from "./StratumFromTraits";
import MagdaMixin from "../ModelMixins/MagdaMixin";
import magdaRecordToCatalogMemberDefinition from "./magdaRecordToCatalogMember";

export default class MagdaCatalogItem extends MagdaMixin(
  ReferenceMixin(
    UrlMixin(CatalogMemberMixin(CreateModel(MagdaCatalogItemTraits)))
  )
) {
  static readonly type = "magda";

  static readonly defaultDistributionFormats: StratumFromTraits<
    MagdaDistributionFormatTraits
  >[] = [
    createStratumInstance(MagdaDistributionFormatTraits, {
      id: "WMS",
      formatRegex: "^wms$",
      definition: {
        type: "wms"
      }
    }),
    createStratumInstance(MagdaDistributionFormatTraits, {
      id: "EsriMapServer",
      formatRegex: "^esri rest$",
      urlRegex: "MapServer",
      definition: {
        type: "esri-mapServer"
      }
    }),
    createStratumInstance(MagdaDistributionFormatTraits, {
      id: "CSV",
      formatRegex: "^csv(-geo-)?",
      definition: {
        type: "csv"
      }
    }),
    createStratumInstance(MagdaDistributionFormatTraits, {
      id: "CZML",
      formatRegex: "^czml$",
      definition: {
        type: "czml"
      }
    }),
    createStratumInstance(MagdaDistributionFormatTraits, {
      id: "KML",
      formatRegex: "^km[lz]$",
      definition: {
        type: "kml"
      }
    }),
    createStratumInstance(MagdaDistributionFormatTraits, {
      id: "GeoJSON",
      formatRegex: "^geojson$",
      definition: {
        type: "geojson"
      }
    }),
    createStratumInstance(MagdaDistributionFormatTraits, {
      id: "WFS",
      formatRegex: "^wfs$",
      definition: {
        type: "wfs"
      }
    }),
    createStratumInstance(MagdaDistributionFormatTraits, {
      id: "EsriFeatureServer",
      formatRegex: "^esri rest$",
      urlRegex: "FeatureServer",
      definition: {
        type: "esri-featureServer"
      }
    })
  ];

  get type() {
    return MagdaCatalogItem.type;
  }

  constructor(id: string, terria: Terria) {
    super(id, terria);

    this.setTrait(
      CommonStrata.defaults,
      "distributionFormats",
      MagdaCatalogItem.defaultDistributionFormats
    );
  }

  protected forceLoadMetadata(): Promise<void> {
    return this.loadReference();
  }

  protected forceLoadReference(previousTarget: BaseModel | undefined): Promise<BaseModel | undefined> {
    const url = this.url;
    if (url === undefined) {
      return Promise.reject(
        new TerriaError({
          sender: this,
          title: "Cannot load Magda record",
          message: "The Magda URL is required."
        })
      );
    }

    const terria = this.terria;
    const id = this.id;
    const name = this.name;
    const distributionId = this.distributionId;
    const definition = toJS(this.definition);
    const distributionFormats = this.preparedDistributionFormats;

    return this.loadMagdaRecord({
      id: this.datasetId,
      optionalAspects: [
        "dcat-dataset-strings",
        "dataset-distributions",
        "terria"
      ],
      dereference: true
    })
      .then(datasetJson => {
        return magdaRecordToCatalogMemberDefinition({
          magdaBaseUrl: url,
          name: name,
          record: datasetJson,
          preferredDistributionId: distributionId,
          definition: definition,
          distributionFormats: distributionFormats
        });
      })
      .then((modelDefinition: JsonObject | undefined): Promise<BaseModel | undefined> => {
        if (modelDefinition === undefined || !modelDefinition.type) {
          return Promise.resolve(undefined);
        }

        const dereferenced =
        previousTarget && previousTarget.type === modelDefinition.type
            ? previousTarget
            : CatalogMemberFactory.create(<string>modelDefinition.type, id, terria);

        const model = upsertModelFromJson(
          CatalogMemberFactory,
          this.terria,
          this.id,
          dereferenced,
          CommonStrata.definition,
          modelDefinition
        );

        if (CatalogMemberMixin.isMixedInto(model)) {
          return model.loadMetadata().then(() => <BaseModel>model);
        }
        return Promise.resolve(model);
      });
  }
}
