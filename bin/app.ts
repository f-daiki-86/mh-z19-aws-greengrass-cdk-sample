#!/usr/bin/env node
import 'source-map-support/register';
import cdk = require('@aws-cdk/core');
import { GreengrassStack } from '../lib/greengrass-stack';
import { GreengrassLambdaStack } from '../lib/greengrass-lambda-stack';
import { ElasticsearchStack } from '../lib/elasticsearch-stack';
import { IotRuleStack } from '../lib/iot-rule-stack';

const app = new cdk.App();

const lambdaStack = new GreengrassLambdaStack(app, 'GreengrassLambdaStack');

const ggStack = new GreengrassStack(app, 'GreengrassStack', {
    greengrassLambdaAlias: lambdaStack.greengrassLambdaAlias
});

const esStack = new ElasticsearchStack(app, 'ElasticSearchStack');

const iotRuleStack = new IotRuleStack(app, 'IoTRuleStack', {
    esDomainArn: esStack.arn,
    esDomainEndpoint: esStack.endpoint
});