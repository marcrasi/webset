var fs = require('fs');
var configuration = JSON.parse(fs.readFileSync('application_config.json'));
var gcs = require('@google-cloud/storage')({
  projectId: configuration.googleCloudProjectId,
  keyFilename: configuration.googleCloudKeyFilename
});

module.exports = gcs.bucket(configuration.googleCloudStorageBucket);
