import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cwlogs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

export class ShorUrlStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: cdk.StackProps) {
        super(scope, id, props);

        const rootDomain = 'witek.com.br';

        const zone = route53.HostedZone.fromLookup(this, 'baseZone', {
            domainName: rootDomain,
        });

        const logGroup = new cwlogs.LogGroup(this, 'ShortUrlLogs');
        const api = new apigateway.RestApi(this, 'ShortUrlApi', {
            restApiName: 'ShortUrlApi',
            deployOptions: {
                accessLogDestination: new apigateway.LogGroupLogDestination(logGroup),
                accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
                    httpMethod: true,
                    ip: true,
                    protocol: true,
                    requestTime: true,
                    resourcePath: true,
                    responseLength: true,
                    status: true,
                    caller: true,
                    user: true,
                }),
            },
            domainName: {
                domainName: `short.${rootDomain}`,
                certificate: acm.Certificate.fromCertificateArn(
                    this,
                    'cerfiticateWitek',
                    'arn:aws:acm:us-east-1:187414339221:certificate/5611a432-c890-4054-9feb-b6903a4e772a',
                ),
                endpointType: apigateway.EndpointType.EDGE,
            },
        });

        new route53.ARecord(this, 'apiShorturlDNS', {
            zone: zone,
            recordName: 'short',
            target: route53.RecordTarget.fromAlias(new route53Targets.ApiGateway(api)),
        });

        const urlShortenerTable = new dynamodb.Table(this, 'UrlShortenerTable', {
            tableName: 'urlShortenerTable',
            partitionKey: {
                name: 'short_id',
                type: dynamodb.AttributeType.STRING,
            },
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            timeToLiveAttribute: 'ttl',
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 1,
            writeCapacity: 1,
        });

        const urlRetrieve = new lambdaNodeJS.NodejsFunction(this, 'UrlRetrieve', {
            functionName: 'UrlRetrieve',
            entry: 'lambda/shorturl/UrlRetrieveFunction.ts',
            handler: 'handler',
            memorySize: 128,
            timeout: cdk.Duration.seconds(2),
            bundling: {
                minify: true,
                sourceMap: false,
            },
            environment: {
                URL_SHORTENER_TABLE: urlShortenerTable.tableName,
            },
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
        });

        const urlShortenerCreate = new lambdaNodeJS.NodejsFunction(this, 'UrlShortenerCreate', {
            functionName: 'UrlShortenerCreate',
            entry: 'lambda/shorturl/urlShortenerCreateFunction.ts',
            handler: 'handler',
            memorySize: 128,
            timeout: cdk.Duration.seconds(2),
            bundling: {
                minify: true,
                sourceMap: false,
            },
            environment: {
                APP_URL: `https://short.${rootDomain}/t/`,
                SIZE: '12',
                URL_SHORTENER_TABLE: urlShortenerTable.tableName,
            },
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
        });

        urlShortenerTable.grantWriteData(urlShortenerCreate);
        urlShortenerTable.grantReadData(urlRetrieve);

        const shortUrlCreateIntegration = new apigateway.LambdaIntegration(urlShortenerCreate);
        const urlRetrieveIntegration = new apigateway.LambdaIntegration(urlRetrieve);

        // "/c"
        const shortUrlValidator = new apigateway.RequestValidator(this, 'ShortUrlValidator', {
            restApi: api,
            requestValidatorName: 'Short URL request validator',
            validateRequestBody: true,
        });
        const shortUrlModel = new apigateway.Model(this, 'ShortUrlModel', {
            modelName: 'ShortUrlModel',
            restApi: api,
            contentType: 'application/json',
            schema: {
                type: apigateway.JsonSchemaType.OBJECT,
                properties: {
                    longUrl: {
                        type: apigateway.JsonSchemaType.STRING,
                    },
                },
                required: ['longUrl'],
            },
        });

        const shortUrlResource = api.root.addResource('c');
        shortUrlResource.addMethod('POST', shortUrlCreateIntegration, {
            requestValidator: shortUrlValidator,
            requestModels: {
                'application/json': shortUrlModel,
            },
        });

        shortUrlResource.addCorsPreflight({
            allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
            allowMethods: ['OPTIONS', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
            allowCredentials: true,
            allowOrigins: ['https://witek.com.br'], // Filter only my own domain to do requests
        });

        // "/t/{shortUrl}"
        const retrieveUrlWithoutParamResource = api.root.addResource('t');
        const retrieveUrlResource = retrieveUrlWithoutParamResource.addResource('{shortUrl}');
        retrieveUrlResource.addMethod('GET', urlRetrieveIntegration);

        retrieveUrlResource.addCorsPreflight({
            allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
            allowMethods: ['OPTIONS', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
            allowCredentials: true,
            allowOrigins: ['https://witek.com.br'], // Filter only my own domain to do requests
        });
    }
}
