/* eslint-disable no-console */
/* eslint-disable no-param-reassign */

/**
 *  Run this script from the command line to convert JSON copied
 *  from grpc-web-devtools [1] to the structure expected by ts-proto [2]
 *  [1] https://github.com/SafetyCulture/grpc-web-devtools
 *  [2] https://www.npmjs.com/package/ts-proto
 *
 *  Example usage:
 *    1. Copy some response JSON from grpc-web-devtools into ~/tmp/input.json (use the "Enable clipboard" checkbox in the dev tool)
 *    2. Run the script:
 *         node frontend/src/__mocks__/third_party/mlmd/formatTsProtoMockJson.js ~/tmp/input.json > ~/tmp/output.json
 *    3. Copy the contents of ~/tmp/output.json into your TypeScript mock file as the right-hand of an assignment
 *    4. Give that mock object a type annotation imported from ~/__mocks__/third_party/mlmd, for example:
 *         const mockedArtifact: Artifact = { ... };
 *    5. Run Prettier
 *
 *  See frontend/src/__mocks__/third_party/mlmd/README.md for more details
 */

const fs = require('fs');

fs.readFile(process.argv[2], 'utf8', (error, data) => {
  if (error) {
    console.error('Failed to load JSON file', process.argv[1]);
    return;
  }

  const inputObj = JSON.parse(data);
  const outputObj = { ...inputObj };

  const convertNestedStructures = (obj) => {
    Object.keys(obj).forEach((key) => {
      /*
        Convert from:
            customPropertiesMap: [
              ['key1', { stringValue: 'val1' }],
              ['key2', { stringValue: 'val2' }],
            ]
        To:
            customProperties: {
              key1: { stringValue: 'val1' },
              key2: { stringValue: 'val2' },
            }
      */
      if (
        key.endsWith('Map') &&
        Array.isArray(obj[key]) &&
        (obj[key].length === 0 ||
          (typeof obj[key][0][0] === 'string' && typeof obj[key][0][1] === 'object'))
      ) {
        const convertedMap = {};
        obj[key].forEach(([mapKey, mapVal]) => {
          convertedMap[mapKey] = { ...mapVal };
          convertNestedStructures(convertedMap[mapKey]);
        });
        obj[key.slice(0, -3)] = convertedMap;
        delete obj[key];
        return;
      }

      /*
        Convert from:
            valuesList: [{ ... }]
        To: 
            values: [{ ... }]
      */
      if (key.endsWith('List') && Array.isArray(obj[key])) {
        const list = [...obj[key]];
        list.forEach(convertNestedStructures);
        obj[key.slice(0, -4)] = list;
        delete obj[key];
        return;
      }

      // Recurse on sub-objects
      if (typeof obj[key] === 'object') {
        convertNestedStructures(obj[key]);
      } else if (Array.isArray(obj[key])) {
        obj[key].forEach(convertNestedStructures);
      }
    });
  };

  convertNestedStructures(outputObj);

  console.log(JSON.stringify(outputObj, undefined, 2));
});
