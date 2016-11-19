webset
======

This is an in-browser multiplayer set game. It does stuff like lag compensation. It also has a daily puzzle that ranks users by their times.

This used to run on set.marcrasi.com, but my mongo database crashed after running for a few years, and I never had time to bring it back up.

Please excuse the quality of the code. I wrote this before I knew anything about javascript or deploying things.

# How to run locally

Run the [Google Cloud Datastore Emulator](https://googlecloudplatform.github.io/google-cloud-node/#/docs/datastore/master/datastore). It'll tell you to export an environment variable. Make sure to do that, in the terminal where you're about to run the node server.

Put Google Cloud credentials with access to a Google Cloud Storage Bucket in `gc_credentials.json`.

Change `googleCloudProjectId` and `googleCloudStorageBucket` in `application_config.json` to point at a Google Cloud Storage Bucket that you have access to.

In the terminal where you exported the environment variable, run ./run`.
