var fs = require('fs');
var configuration = JSON.parse(fs.readFileSync('application_config.json'));
var datastore = require('@google-cloud/datastore')({
  projectId: configuration.googleCloudProjectId
});

module.exports = datastore;
