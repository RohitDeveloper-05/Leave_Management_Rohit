import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';

// AWS SDK v3 modular imports
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';

// keep your constants as before
const USERS_TABLE = process.env.USERS_TABLE;
const LEAVE_REQUESTS_TABLE = process.env.LEAVE_REQUESTS_TABLE;
const STEP_FUNCTION_ARN = process.env.STEP_FUNCTION_ARN;

// instantiate v3 clients
const ddbClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(ddbClient);
const stepFunctions = new SFNClient({});

interface ApplyLeaveRequest {
    startDate: string;
    endDate: string;
    reason: string;
}

export const applyLeaveHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log('Printing the Event Object', event);

    const { userId, role } = event.requestContext.authorizer || {};
    console.log('userId-->', userId, 'role-->', role);
    if (role !== 'employee') {
        return { statusCode: 403, body: JSON.stringify({ message: 'Forbidden' }) };
    }

    const body: ApplyLeaveRequest = JSON.parse(event.body || '{}');
    if (!body.startDate || !body.endDate || !body.reason) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Invalid input' }),
        };
    }

    // fetch user to get managerId
    console.log('Printing the userId', userId);
    console.log('Type of userId', typeof userId);

    const getRes = await dynamoDb.send(new GetCommand({ TableName: USERS_TABLE, Key: { userId } }));
    if (!getRes.Item?.managerId) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Manager not found' }),
        };
    }

    const leaveRequestId = uuidv4();
    const leaveRequest = {
        leaveRequestId,
        userId,
        approverId: getRes.Item.managerId,
        startDate: body.startDate,
        endDate: body.endDate,
        reason: body.reason,
        status: 'Pending',
    };

    // save leave request
    await dynamoDb.send(new PutCommand({ TableName: LEAVE_REQUESTS_TABLE, Item: leaveRequest }));

    // start the state machine
    await stepFunctions.send(
        new StartExecutionCommand({
            stateMachineArn: STEP_FUNCTION_ARN,
            input: JSON.stringify({ leaveRequestId }),
        }),
    );

    return { statusCode: 200, body: JSON.stringify({ leaveRequestId }) };
};
