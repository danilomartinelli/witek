import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import * as AWSXRay from 'aws-xray-sdk';
import { DynamoDB } from 'aws-sdk';

import { nanoid } from 'nanoid';

AWSXRay.captureAWS(require('aws-sdk'));

const URL_SHORTENER_TABLE = process.env.URL_SHORTENER_TABLE;

const ddbClient = new DynamoDB.DocumentClient();

export async function handler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    try {
        const lambdaRequestId = context.awsRequestId;
        const apiRequestId = event.requestContext.requestId;

        console.log(`API Gateway RequestId: ${apiRequestId} - Lambda RequestId: ${lambdaRequestId}`);

        if (!URL_SHORTENER_TABLE) throw new Error('URL_SHORTENER_TABLE not found');

        if (!event.pathParameters?.shortUrl) throw new Error('Short URL not found');

        const data = await ddbClient
            .get({
                TableName: URL_SHORTENER_TABLE,
                Key: {
                    short_id: event.pathParameters.shortUrl,
                },
            })
            .promise();

        if (!data.Item) {
            return {
                statusCode: 302,
                headers: {
                    location: 'https://witek.com.br/404',
                },
                body: JSON.stringify({
                    message: 'Data not found, Redirect to 404 page.',
                }),
            };
        }

        return {
            statusCode: 301,
            headers: {
                location: data.Item.long_url,
            },
            body: JSON.stringify({
                message: 'Redirect...',
            }),
        };
    } catch (err: any) {
        return {
            statusCode: 201,
            body: JSON.stringify({
                message: err?.message ?? 'an error occurred',
            }),
        };
    }
}
