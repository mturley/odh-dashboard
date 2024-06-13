/* eslint-disable no-irregular-whitespace */

import { Message } from 'google-protobuf';
import * as jspb from 'google-protobuf';
import { Struct } from 'google-protobuf/google/protobuf/struct_pb';
import { Artifact, Value } from '~/third_party/mlmd';
import { GetArtifactsByContextResponse } from '~/third_party/mlmd/generated/ml_metadata/proto/metadata_store_service_pb';
import createGrpcResponse, { GrpcResponse } from './utils';

const mockedScalarMetricArtifact: Artifact.AsObject = {
  id: 7,
  typeId: 17,
  type: 'system.Metrics',
  uri: 's3://aballant-pipelines/metrics-visualization-pipeline/f0b586ba-3e7b-4369-8d48-592e83cbbf73/digit-classification/metrics',
  propertiesMap: [],
  customPropertiesMap: [
    [
      'accuracy',
      {
        doubleValue: 92,
        // TODO are these extra values in the real data? they are all required in the Artifact.AsObject type
        intValue: 0,
        stringValue: '',
        boolValue: false,
      },
    ],
    [
      'display_name',
      {
        stringValue: 'metrics',
        // TODO are these extra values in the real data? they are all required in the Artifact.AsObject type
        intValue: 0,
        doubleValue: 0,
        boolValue: false,
      },
    ],
  ],
  state: 2,
  createTimeSinceEpoch: 1711765118976,
  lastUpdateTimeSinceEpoch: 1711765118976,
};

const mockedConfusionMatrixArtifact: Artifact.AsObject = {
  id: 8,
  typeId: 18,
  type: 'system.ClassificationMetrics',
  uri: 's3://aballant-pipelines/metrics-visualization-pipeline/ccdfe85e-06cc-4a63-b10d-a12d688d2ec3/iris-sgdclassifier/metrics',
  propertiesMap: [],
  customPropertiesMap: [
    [
      'confusionMatrix',
      {
        structValue: {
          fieldsMap: [
            [
              'struct',
              {
                nullValue: 0,
                numberValue: 0,
                stringValue: '',
                boolValue: false,
                structValue: {
                  fieldsMap: [
                    [
                      'annotationSpecs',
                      {
                        nullValue: 0,
                        numberValue: 0,
                        stringValue: '',
                        boolValue: false,
                        listValue: {
                          valuesList: [
                            {
                              nullValue: 0,
                              numberValue: 0,
                              stringValue: '',
                              boolValue: false,
                              structValue: {
                                fieldsMap: [
                                  [
                                    'displayName',
                                    {
                                      nullValue: 0,
                                      numberValue: 0,
                                      stringValue: 'Setosa',
                                      boolValue: false,
                                    },
                                  ],
                                ],
                              },
                            },
                            {
                              nullValue: 0,
                              numberValue: 0,
                              stringValue: '',
                              boolValue: false,
                              structValue: {
                                fieldsMap: [
                                  [
                                    'displayName',
                                    {
                                      nullValue: 0,
                                      numberValue: 0,
                                      stringValue: 'Versicolour',
                                      boolValue: false,
                                    },
                                  ],
                                ],
                              },
                            },
                            {
                              nullValue: 0,
                              numberValue: 0,
                              stringValue: '',
                              boolValue: false,
                              structValue: {
                                fieldsMap: [
                                  [
                                    'displayName',
                                    {
                                      nullValue: 0,
                                      numberValue: 0,
                                      stringValue: 'Virginica',
                                      boolValue: false,
                                    },
                                  ],
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                    [
                      'rows',
                      {
                        nullValue: 0,
                        numberValue: 0,
                        stringValue: '',
                        boolValue: false,
                        listValue: {
                          valuesList: [
                            {
                              nullValue: 0,
                              numberValue: 0,
                              stringValue: '',
                              boolValue: false,
                              structValue: {
                                fieldsMap: [
                                  [
                                    'row',
                                    {
                                      nullValue: 0,
                                      numberValue: 0,
                                      stringValue: '',
                                      boolValue: false,
                                      listValue: {
                                        valuesList: [
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
                                  ],
                                ],
                              },
                            },
                            {
                              nullValue: 0,
                              numberValue: 0,
                              stringValue: '',
                              boolValue: false,
                              structValue: {
                                fieldsMap: [
                                  [
                                    'row',
                                    {
                                      nullValue: 0,
                                      numberValue: 0,
                                      stringValue: '',
                                      boolValue: false,
                                      listValue: {
                                        valuesList: [
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
                                  ],
                                ],
                              },
                            },
                            {
                              nullValue: 0,
                              numberValue: 0,
                              stringValue: '',
                              boolValue: false,
                              structValue: {
                                fieldsMap: [
                                  [
                                    'row',
                                    {
                                      nullValue: 0,
                                      numberValue: 0,
                                      stringValue: '',
                                      boolValue: false,
                                      listValue: {
                                        valuesList: [
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
                                  ],
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  ],
                },
              },
            ],
          ],
        },
        // TODO are these extra values in the real data? they are all required in the Artifact.AsObject type
        intValue: 0,
        doubleValue: 0,
        stringValue: '',
        boolValue: false,
      },
    ],
    [
      'display_name',
      {
        stringValue: 'metrics',
        // TODO are these extra values in the real data? they are all required in the Artifact.AsObject type
        intValue: 0,
        doubleValue: 0,
        boolValue: false,
      },
    ],
  ],
  state: 2,
  createTimeSinceEpoch: 1711765608345,
  lastUpdateTimeSinceEpoch: 1711765608345,
};

const mokedRocCurveArtifact: Artifact.AsObject = {
  id: 9,
  typeId: 18,
  type: 'system.ClassificationMetrics',
  uri: 's3://aballant-pipelines/metrics-visualization-pipeline/aa61378c-d507-4bde-aa18-9f8678b2beb6/wine-classification/metrics',
  propertiesMap: [],
  customPropertiesMap: [
    [
      'confidenceMetrics',
      {
        structValue: {
          fieldsMap: [
            [
              'list',
              {
                nullValue: 0,
                numberValue: 0,
                stringValue: '',
                boolValue: false,
                listValue: {
                  valuesList: [
                    {
                      nullValue: 0,
                      numberValue: 0,
                      stringValue: '',
                      boolValue: false,
                      structValue: {
                        fieldsMap: [
                          [
                            'confidenceThreshold',
                            {
                              nullValue: 0,
                              numberValue: 2,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                          [
                            'falsePositiveRate',
                            {
                              nullValue: 0,
                              numberValue: 0,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                          [
                            'recall',
                            {
                              nullValue: 0,
                              numberValue: 0,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                        ],
                      },
                    },
                    {
                      nullValue: 0,
                      numberValue: 0,
                      stringValue: '',
                      boolValue: false,
                      structValue: {
                        fieldsMap: [
                          [
                            'confidenceThreshold',
                            {
                              nullValue: 0,
                              numberValue: 1,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                          [
                            'falsePositiveRate',
                            {
                              nullValue: 0,
                              numberValue: 0,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                          [
                            'recall',
                            {
                              nullValue: 0,
                              numberValue: 0.33962264150943394,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                        ],
                      },
                    },
                    {
                      nullValue: 0,
                      numberValue: 0,
                      stringValue: '',
                      boolValue: false,
                      structValue: {
                        fieldsMap: [
                          [
                            'confidenceThreshold',
                            {
                              nullValue: 0,
                              numberValue: 0.9,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                          [
                            'falsePositiveRate',
                            {
                              nullValue: 0,
                              numberValue: 0,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                          [
                            'recall',
                            {
                              nullValue: 0,
                              numberValue: 0.6037735849056604,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                        ],
                      },
                    },
                    {
                      nullValue: 0,
                      numberValue: 0,
                      stringValue: '',
                      boolValue: false,
                      structValue: {
                        fieldsMap: [
                          [
                            'confidenceThreshold',
                            {
                              nullValue: 0,
                              numberValue: 0.8,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                          [
                            'falsePositiveRate',
                            {
                              nullValue: 0,
                              numberValue: 0,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                          [
                            'recall',
                            {
                              nullValue: 0,
                              numberValue: 0.8490566037735849,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                        ],
                      },
                    },
                    {
                      nullValue: 0,
                      numberValue: 0,
                      stringValue: '',
                      boolValue: false,
                      structValue: {
                        fieldsMap: [
                          [
                            'confidenceThreshold',
                            {
                              nullValue: 0,
                              numberValue: 0.6,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                          [
                            'falsePositiveRate',
                            {
                              nullValue: 0,
                              numberValue: 0,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                          [
                            'recall',
                            {
                              nullValue: 0,
                              numberValue: 0.8867924528301887,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                        ],
                      },
                    },
                    {
                      nullValue: 0,
                      numberValue: 0,
                      stringValue: '',
                      boolValue: false,
                      structValue: {
                        fieldsMap: [
                          [
                            'confidenceThreshold',
                            {
                              nullValue: 0,
                              numberValue: 0.5,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                          [
                            'falsePositiveRate',
                            {
                              nullValue: 0,
                              numberValue: 0.0125,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                          [
                            'recall',
                            {
                              nullValue: 0,
                              numberValue: 0.9245283018867925,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                        ],
                      },
                    },
                    {
                      nullValue: 0,
                      numberValue: 0,
                      stringValue: '',
                      boolValue: false,
                      structValue: {
                        fieldsMap: [
                          [
                            'confidenceThreshold',
                            {
                              nullValue: 0,
                              numberValue: 0.4,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                          [
                            'falsePositiveRate',
                            {
                              nullValue: 0,
                              numberValue: 0.075,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                          [
                            'recall',
                            {
                              nullValue: 0,
                              numberValue: 0.9622641509433962,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                        ],
                      },
                    },
                    {
                      nullValue: 0,
                      numberValue: 0,
                      stringValue: '',
                      boolValue: false,
                      structValue: {
                        fieldsMap: [
                          [
                            'confidenceThreshold',
                            {
                              nullValue: 0,
                              numberValue: 0.3,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                          [
                            'falsePositiveRate',
                            {
                              nullValue: 0,
                              numberValue: 0.0875,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                          [
                            'recall',
                            {
                              nullValue: 0,
                              numberValue: 1,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                        ],
                      },
                    },
                    {
                      nullValue: 0,
                      numberValue: 0,
                      stringValue: '',
                      boolValue: false,
                      structValue: {
                        fieldsMap: [
                          [
                            'confidenceThreshold',
                            {
                              nullValue: 0,
                              numberValue: 0.2,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                          [
                            'falsePositiveRate',
                            {
                              nullValue: 0,
                              numberValue: 0.2375,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                          [
                            'recall',
                            {
                              nullValue: 0,
                              numberValue: 1,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                        ],
                      },
                    },
                    {
                      nullValue: 0,
                      numberValue: 0,
                      stringValue: '',
                      boolValue: false,
                      structValue: {
                        fieldsMap: [
                          [
                            'confidenceThreshold',
                            {
                              nullValue: 0,
                              numberValue: 0.1,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                          [
                            'falsePositiveRate',
                            {
                              nullValue: 0,
                              numberValue: 0.475,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                          [
                            'recall',
                            {
                              nullValue: 0,
                              numberValue: 1,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                        ],
                      },
                    },
                    {
                      nullValue: 0,
                      numberValue: 0,
                      stringValue: '',
                      boolValue: false,
                      structValue: {
                        fieldsMap: [
                          [
                            'confidenceThreshold',
                            {
                              nullValue: 0,
                              numberValue: 0,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                          [
                            'falsePositiveRate',
                            {
                              nullValue: 0,
                              numberValue: 1,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                          [
                            'recall',
                            {
                              nullValue: 0,
                              numberValue: 1,
                              stringValue: '',
                              boolValue: false,
                            },
                          ],
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          ],
        },
        // TODO are these extra values in the real data? they are all required in the Artifact.AsObject type
        intValue: 0,
        doubleValue: 0,
        stringValue: '',
        boolValue: false,
      },
    ],
    [
      'display_name',
      {
        stringValue: 'metrics',
        // TODO are these extra values in the real data? they are all required in the Artifact.AsObject type
        intValue: 0,
        doubleValue: 0,
        boolValue: false,
      },
    ],
  ],
  state: 2,
  createTimeSinceEpoch: 1711766424068,
  lastUpdateTimeSinceEpoch: 1711766424068,
};

const mockedMarkdownArtifact: Artifact.AsObject = {
  id: 16,
  typeId: 19,
  type: 'system.Markdown',
  uri: 's3://aballant-pipelines/metrics-visualization-pipeline/16dbff18-a3d5-4684-90ac-4e6198a9da0f/markdown-visualization/markdown_artifact',
  propertiesMap: [],
  customPropertiesMap: [
    [
      'display_name',
      {
        stringValue: 'markdown_artifact',
        // TODO are these extra values in the real data? they are all required in the Artifact.AsObject type
        intValue: 0,
        doubleValue: 0,
        boolValue: true,
      },
    ],
  ],
  state: 2,
  createTimeSinceEpoch: 1712841455267,
  lastUpdateTimeSinceEpoch: 1712841455267,
};

export const mockArtifact = (displayName: string, mock: Artifact.AsObject): Artifact => {
  const artifact = new Artifact();
  artifact.setId(mock.id);
  artifact.setTypeId(mock.typeId);
  artifact.setType(mock.type);
  artifact.setUri(mock.uri);

  const customPropertiesMap = artifact.getCustomPropertiesMap();

  mock.customPropertiesMap.forEach(([key, value]) => {
    const valueObj = new Value();
    if (value.doubleValue) {
      valueObj.setDoubleValue(value.doubleValue);
    } else if (value.intValue) {
      valueObj.setIntValue(value.intValue);
    } else if (value.stringValue) {
      valueObj.setStringValue(value.stringValue);
    } else if (value.structValue) {
      // TODO does this work as expected?
      valueObj.setStructValue(Struct.fromJavaScript(value.structValue));
    }

    customPropertiesMap.set(key, valueObj);
  });

  artifact.setState(mock.state);
  artifact.setCreateTimeSinceEpoch(mock.createTimeSinceEpoch);
  artifact.setLastUpdateTimeSinceEpoch(mock.lastUpdateTimeSinceEpoch);

  return artifact;
};

export const mockGetArtifactsByContext = (): GrpcResponse => {
  const artifactTypesResponse = new GetArtifactsByContextResponse();

  // TODO add Artifacts
  // artifactTypesResponse.addArtifacts()

  return createGrpcResponse(artifactTypesResponse);
};
