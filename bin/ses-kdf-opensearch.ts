#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { SesKdfOpensearchStack } from '../lib/ses-kdf-opensearch-stack';

const app = new App();
new SesKdfOpensearchStack(app, 'SesKdfOpensearchStack', {
  appName: 'test2',
  indexName: 'test-ses-kdf-opensearch',
});
