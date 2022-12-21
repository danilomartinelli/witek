#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';

import { ShorUrlStack } from '../lib/shortUrl-stack';

const app = new cdk.App();

const env: cdk.Environment = {
    account: '187414339221',
    region: 'us-east-1',
};

new ShorUrlStack(app, 'ShortUrl', {
    tags: {
        cost: 'short-url',
        team: 'Witek',
    },
    env: env,
});
