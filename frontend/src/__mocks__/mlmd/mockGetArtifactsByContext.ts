import { Artifact, GetArtifactsByContextResponse } from '~/__mocks__/third_party/mlmd';
import createGrpcResponse, { GrpcResponse } from './utils';

const mockedScalarMetricArtifact: Artifact = {
  id: 7,
  typeId: 17,
  type: 'system.Metrics',
  uri: 's3://aballant-pipelines/metrics-visualization-pipeline/f0b586ba-3e7b-4369-8d48-592e83cbbf73/digit-classification/metrics',
  properties: {},
  customProperties: {
    accuracy: { doubleValue: 92 },
    displayName: { stringValue: 'metrics' },
  },
  state: 2,
  createTimeSinceEpoch: 1711765118976,
  lastUpdateTimeSinceEpoch: 1711765118976,
};

const mockedConfusionMatrixArtifact: Artifact = {
  id: 8,
  typeId: 18,
  type: 'system.ClassificationMetrics',
  uri: 's3://aballant-pipelines/metrics-visualization-pipeline/ccdfe85e-06cc-4a63-b10d-a12d688d2ec3/iris-sgdclassifier/metrics',
  properties: {},
  customProperties: {
    confusionMatrix: {
      structValue: {
        fields: {
          struct: {
            nullValue: 0,
            numberValue: 0,
            stringValue: '',
            boolValue: false,
            structValue: {
              fields: {
                annotationSpecs: {
                  nullValue: 0,
                  numberValue: 0,
                  stringValue: '',
                  boolValue: false,
                  listValue: {
                    values: [
                      {
                        nullValue: 0,
                        numberValue: 0,
                        stringValue: '',
                        boolValue: false,
                        structValue: {
                          fields: {
                            displayName: {
                              nullValue: 0,
                              numberValue: 0,
                              stringValue: 'Setosa',
                              boolValue: false,
                            },
                          },
                        },
                      },
                      {
                        nullValue: 0,
                        numberValue: 0,
                        stringValue: '',
                        boolValue: false,
                        structValue: {
                          fields: {
                            displayName: {
                              nullValue: 0,
                              numberValue: 0,
                              stringValue: 'Versicolour',
                              boolValue: false,
                            },
                          },
                        },
                      },
                      {
                        nullValue: 0,
                        numberValue: 0,
                        stringValue: '',
                        boolValue: false,
                        structValue: {
                          fields: {
                            displayName: {
                              nullValue: 0,
                              numberValue: 0,
                              stringValue: 'Virginica',
                              boolValue: false,
                            },
                          },
                        },
                      },
                    ],
                  },
                },
                rows: {
                  nullValue: 0,
                  numberValue: 0,
                  stringValue: '',
                  boolValue: false,
                  listValue: {
                    values: [
                      {
                        nullValue: 0,
                        numberValue: 0,
                        stringValue: '',
                        boolValue: false,
                        structValue: {
                          fields: {
                            row: {
                              nullValue: 0,
                              numberValue: 0,
                              stringValue: '',
                              boolValue: false,
                              listValue: {
                                values: [
                                  {
                                    nullValue: 0,
                                    numberValue: 38,
                                    stringValue: '',
                                    boolValue: false,
                                  },
                                  {
                                    nullValue: 0,
                                    numberValue: 0,
                                    stringValue: '',
                                    boolValue: false,
                                  },
                                  {
                                    nullValue: 0,
                                    numberValue: 0,
                                    stringValue: '',
                                    boolValue: false,
                                  },
                                ],
                              },
                            },
                          },
                        },
                      },
                      {
                        nullValue: 0,
                        numberValue: 0,
                        stringValue: '',
                        boolValue: false,
                        structValue: {
                          fields: {
                            row: {
                              nullValue: 0,
                              numberValue: 0,
                              stringValue: '',
                              boolValue: false,
                              listValue: {
                                values: [
                                  {
                                    nullValue: 0,
                                    numberValue: 2,
                                    stringValue: '',
                                    boolValue: false,
                                  },
                                  {
                                    nullValue: 0,
                                    numberValue: 19,
                                    stringValue: '',
                                    boolValue: false,
                                  },
                                  {
                                    nullValue: 0,
                                    numberValue: 9,
                                    stringValue: '',
                                    boolValue: false,
                                  },
                                ],
                              },
                            },
                          },
                        },
                      },
                      {
                        nullValue: 0,
                        numberValue: 0,
                        stringValue: '',
                        boolValue: false,
                        structValue: {
                          fields: {
                            row: {
                              nullValue: 0,
                              numberValue: 0,
                              stringValue: '',
                              boolValue: false,
                              listValue: {
                                values: [
                                  {
                                    nullValue: 0,
                                    numberValue: 1,
                                    stringValue: '',
                                    boolValue: false,
                                  },
                                  {
                                    nullValue: 0,
                                    numberValue: 17,
                                    stringValue: '',
                                    boolValue: false,
                                  },
                                  {
                                    nullValue: 0,
                                    numberValue: 19,
                                    stringValue: '',
                                    boolValue: false,
                                  },
                                ],
                              },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    },
    displayName: {
      stringValue: 'metrics',
    },
  },
  state: 2,
  createTimeSinceEpoch: 1711765608345,
  lastUpdateTimeSinceEpoch: 1711765608345,
};

const mockedRocCurveArtifact: Artifact = {
  id: 9,
  typeId: 18,
  type: 'system.ClassificationMetrics',
  uri: 's3://aballant-pipelines/metrics-visualization-pipeline/aa61378c-d507-4bde-aa18-9f8678b2beb6/wine-classification/metrics',
  properties: {},
  customProperties: {
    confidenceMetrics: {
      structValue: {
        fields: {
          list: {
            nullValue: 0,
            numberValue: 0,
            stringValue: '',
            boolValue: false,
            listValue: {
              values: [
                {
                  nullValue: 0,
                  numberValue: 0,
                  stringValue: '',
                  boolValue: false,
                  structValue: {
                    fields: {
                      confidenceThreshold: {
                        nullValue: 0,
                        numberValue: 2,
                        stringValue: '',
                        boolValue: false,
                      },
                      falsePositiveRate: {
                        nullValue: 0,
                        numberValue: 0,
                        stringValue: '',
                        boolValue: false,
                      },
                      recall: {
                        nullValue: 0,
                        numberValue: 0,
                        stringValue: '',
                        boolValue: false,
                      },
                    },
                  },
                },
                {
                  nullValue: 0,
                  numberValue: 0,
                  stringValue: '',
                  boolValue: false,
                  structValue: {
                    fields: {
                      confidenceThreshold: {
                        nullValue: 0,
                        numberValue: 1,
                        stringValue: '',
                        boolValue: false,
                      },
                      falsePositiveRate: {
                        nullValue: 0,
                        numberValue: 0,
                        stringValue: '',
                        boolValue: false,
                      },
                      recall: {
                        nullValue: 0,
                        numberValue: 0.33962264150943394,
                        stringValue: '',
                        boolValue: false,
                      },
                    },
                  },
                },
                {
                  nullValue: 0,
                  numberValue: 0,
                  stringValue: '',
                  boolValue: false,
                  structValue: {
                    fields: {
                      confidenceThreshold: {
                        nullValue: 0,
                        numberValue: 0.9,
                        stringValue: '',
                        boolValue: false,
                      },
                      falsePositiveRate: {
                        nullValue: 0,
                        numberValue: 0,
                        stringValue: '',
                        boolValue: false,
                      },
                      recall: {
                        nullValue: 0,
                        numberValue: 0.6037735849056604,
                        stringValue: '',
                        boolValue: false,
                      },
                    },
                  },
                },
                {
                  nullValue: 0,
                  numberValue: 0,
                  stringValue: '',
                  boolValue: false,
                  structValue: {
                    fields: {
                      confidenceThreshold: {
                        nullValue: 0,
                        numberValue: 0.8,
                        stringValue: '',
                        boolValue: false,
                      },
                      falsePositiveRate: {
                        nullValue: 0,
                        numberValue: 0,
                        stringValue: '',
                        boolValue: false,
                      },
                      recall: {
                        nullValue: 0,
                        numberValue: 0.8490566037735849,
                        stringValue: '',
                        boolValue: false,
                      },
                    },
                  },
                },
                {
                  nullValue: 0,
                  numberValue: 0,
                  stringValue: '',
                  boolValue: false,
                  structValue: {
                    fields: {
                      confidenceThreshold: {
                        nullValue: 0,
                        numberValue: 0.6,
                        stringValue: '',
                        boolValue: false,
                      },
                      falsePositiveRate: {
                        nullValue: 0,
                        numberValue: 0,
                        stringValue: '',
                        boolValue: false,
                      },
                      recall: {
                        nullValue: 0,
                        numberValue: 0.8867924528301887,
                        stringValue: '',
                        boolValue: false,
                      },
                    },
                  },
                },
                {
                  nullValue: 0,
                  numberValue: 0,
                  stringValue: '',
                  boolValue: false,
                  structValue: {
                    fields: {
                      confidenceThreshold: {
                        nullValue: 0,
                        numberValue: 0.5,
                        stringValue: '',
                        boolValue: false,
                      },
                      falsePositiveRate: {
                        nullValue: 0,
                        numberValue: 0.0125,
                        stringValue: '',
                        boolValue: false,
                      },
                      recall: {
                        nullValue: 0,
                        numberValue: 0.9245283018867925,
                        stringValue: '',
                        boolValue: false,
                      },
                    },
                  },
                },
                {
                  nullValue: 0,
                  numberValue: 0,
                  stringValue: '',
                  boolValue: false,
                  structValue: {
                    fields: {
                      confidenceThreshold: {
                        nullValue: 0,
                        numberValue: 0.4,
                        stringValue: '',
                        boolValue: false,
                      },
                      falsePositiveRate: {
                        nullValue: 0,
                        numberValue: 0.075,
                        stringValue: '',
                        boolValue: false,
                      },
                      recall: {
                        nullValue: 0,
                        numberValue: 0.9622641509433962,
                        stringValue: '',
                        boolValue: false,
                      },
                    },
                  },
                },
                {
                  nullValue: 0,
                  numberValue: 0,
                  stringValue: '',
                  boolValue: false,
                  structValue: {
                    fields: {
                      confidenceThreshold: {
                        nullValue: 0,
                        numberValue: 0.3,
                        stringValue: '',
                        boolValue: false,
                      },
                      falsePositiveRate: {
                        nullValue: 0,
                        numberValue: 0.0875,
                        stringValue: '',
                        boolValue: false,
                      },
                      recall: {
                        nullValue: 0,
                        numberValue: 1,
                        stringValue: '',
                        boolValue: false,
                      },
                    },
                  },
                },
                {
                  nullValue: 0,
                  numberValue: 0,
                  stringValue: '',
                  boolValue: false,
                  structValue: {
                    fields: {
                      confidenceThreshold: {
                        nullValue: 0,
                        numberValue: 0.2,
                        stringValue: '',
                        boolValue: false,
                      },
                      falsePositiveRate: {
                        nullValue: 0,
                        numberValue: 0.2375,
                        stringValue: '',
                        boolValue: false,
                      },
                      recall: {
                        nullValue: 0,
                        numberValue: 1,
                        stringValue: '',
                        boolValue: false,
                      },
                    },
                  },
                },
                {
                  nullValue: 0,
                  numberValue: 0,
                  stringValue: '',
                  boolValue: false,
                  structValue: {
                    fields: {
                      confidenceThreshold: {
                        nullValue: 0,
                        numberValue: 0.1,
                        stringValue: '',
                        boolValue: false,
                      },
                      falsePositiveRate: {
                        nullValue: 0,
                        numberValue: 0.475,
                        stringValue: '',
                        boolValue: false,
                      },
                      recall: {
                        nullValue: 0,
                        numberValue: 1,
                        stringValue: '',
                        boolValue: false,
                      },
                    },
                  },
                },
                {
                  nullValue: 0,
                  numberValue: 0,
                  stringValue: '',
                  boolValue: false,
                  structValue: {
                    fields: {
                      confidenceThreshold: {
                        nullValue: 0,
                        numberValue: 0,
                        stringValue: '',
                        boolValue: false,
                      },
                      falsePositiveRate: {
                        nullValue: 0,
                        numberValue: 1,
                        stringValue: '',
                        boolValue: false,
                      },
                      recall: {
                        nullValue: 0,
                        numberValue: 1,
                        stringValue: '',
                        boolValue: false,
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    },
    displayName: {
      stringValue: 'metrics',
    },
  },
  state: 2,
  createTimeSinceEpoch: 1711766424068,
  lastUpdateTimeSinceEpoch: 1711766424068,
};

const mockedMarkdownArtifact: Artifact = {
  id: 16,
  typeId: 19,
  type: 'system.Markdown',
  uri: 's3://aballant-pipelines/metrics-visualization-pipeline/16dbff18-a3d5-4684-90ac-4e6198a9da0f/markdown-visualization/markdown_artifact',
  properties: {},
  customProperties: {
    displayName: { stringValue: 'markdown_artifact' },
  },
  state: 2,
  createTimeSinceEpoch: 1712841455267,
  lastUpdateTimeSinceEpoch: 1712841455267,
};

export const mockGetArtifactsByContext = (): GrpcResponse => {
  const binary = GetArtifactsByContextResponse.encode({
    artifacts: [
      mockedScalarMetricArtifact,
      mockedConfusionMatrixArtifact,
      mockedRocCurveArtifact,
      mockedMarkdownArtifact,
    ],
  }).finish();
  return createGrpcResponse(binary);
};
