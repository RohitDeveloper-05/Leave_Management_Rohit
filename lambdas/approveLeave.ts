import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as querystring from 'querystring';

// AWS SDK v3 imports
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
// import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
// import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const stepFunctions = new SFNClient({});
// const ddbClient = new DynamoDBClient({});
// const dynamoDb = DynamoDBDocumentClient.from(ddbClient);

const LEAVE_REQUESTS_TABLE = process.env.LEAVE_REQUESTS_TABLE;

export const approveLeaveHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log('Raw event.body:', event.body);

    // 1) Parse the URL-encoded body into an object
    const parsedBody = querystring.parse(event.body || '');
    const leaveRequestId = parsedBody.leaveRequestId as string;
    const action = parsedBody.action as 'approve' | 'reject';
    const taskToken = parsedBody.taskToken as string;

    // 2) (Optionally) validate
    if (!leaveRequestId || !action || !taskToken) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: 'Missing leaveRequestId, action or taskToken',
            }),
        };
    }

    // 3) Send the result back to Step Functions
    await stepFunctions.send(
        new SendTaskSuccessCommand({
            taskToken,
            output: JSON.stringify({ status: action, leaveRequestId }),
        }),
    );

    // 4) Return a nice JSON response
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: 'Action submitted',
            data: { leaveRequestId, action },
        }),
    };
};
