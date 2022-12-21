import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import * as AWSXRay from 'aws-xray-sdk';
import { DynamoDB } from 'aws-sdk';

import { nanoid } from 'nanoid';

AWSXRay.captureAWS(require('aws-sdk'));

const APP_URL = process.env.APP_URL;
const SIZE = process.env.SIZE;
const URL_SHORTENER_TABLE = process.env.URL_SHORTENER_TABLE;

const ddbClient = new DynamoDB.DocumentClient();

function validateURL(raw: string) {
    try {
        new URL(raw);
        return true;
    } catch {
        return false;
    }
}

export async function handler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    try {
        const lambdaRequestId = context.awsRequestId;
        const apiRequestId = event.requestContext.requestId;

        console.log(`API Gateway RequestId: ${apiRequestId} - Lambda RequestId: ${lambdaRequestId}`);

        if (!APP_URL) throw new Error('APP_URL not found');
        if (!SIZE) throw new Error('SIZE not found');
        if (!URL_SHORTENER_TABLE) throw new Error('URL_SHORTENER_TABLE not found');

        if (!event.body) throw new Error('Body not found');

        const shortId = nanoid(parseInt(SIZE, 10));
        const shortUrl = APP_URL + shortId;
        const { longUrl } = JSON.parse(event.body) as { longUrl: string };
        const timestamp = Date.now();
        const ttl = ~~(timestamp / 1000 + 60 * 365 * 5 * 60); // 5 years

        if (!validateURL(longUrl)) throw new Error('Invalid URL');

        await ddbClient
            .put({
                TableName: URL_SHORTENER_TABLE,
                Item: {
                    short_id: shortId,
                    short_url: shortUrl,
                    long_url: longUrl,
                    ttl,
                    created_at: timestamp,
                },
            })
            .promise();

        return {
            statusCode: 201,
            body: JSON.stringify({
                shortUrl,
                longUrl,
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
