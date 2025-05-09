import { applyLeaveHandler } from '../../lambdas/applyLeave';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { mockClient } from 'aws-sdk-client-mock';

process.env.USERS_TABLE = 'UsersTable';
process.env.LEAVE_REQUESTS_TABLE = 'LeaveRequestsTable';
process.env.STEP_FUNCTION_ARN = 'arn:aws:states:us-east-1:123456789012:stateMachine:myStateMachine';

const ddbMock = mockClient(DynamoDBDocumentClient);
const sfnMock = mockClient(SFNClient);

// Helper to build event
function createEvent(body: any, authorizer: any): APIGatewayProxyEvent {
    return {
        body: body ? JSON.stringify(body) : null,
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/apply-leave',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {
            accountId: '',
            apiId: '',
            authorizer,
            protocol: '',
            httpMethod: 'POST',
            identity: {
                accessKey: null,
                accountId: null,
                apiKey: null,
                apiKeyId: null,
                caller: null,
                clientCert: null,
                cognitoAuthenticationProvider: null,
                cognitoAuthenticationType: null,
                cognitoIdentityId: null,
                cognitoIdentityPoolId: null,
                principalOrgId: null,
                sourceIp: '',
                user: null,
                userAgent: null,
                userArn: null,
            },
            path: '',
            stage: '',
            requestId: '',
            requestTimeEpoch: 0,
            resourceId: '',
            resourcePath: '',
        },
        resource: '',
    } as any;
}

describe('applyLeaveHandler', () => {
    beforeEach(() => {
        ddbMock.reset();
        sfnMock.reset();
    });

    it('returns 403 if role is not employee', async () => {
        const event = createEvent(
            { startDate: '2025-05-10', endDate: '2025-05-11', reason: 'vacation' },
            { userId: 'user1', role: 'manager' },
        );
        const result = await applyLeaveHandler(event);
        expect(result.statusCode).toBe(403);
        expect(JSON.parse(result.body)).toEqual({ message: 'Forbidden' });
    });

    it('returns 400 if body is missing fields', async () => {
        const event = createEvent({ startDate: '2025-05-10' }, { userId: 'user1', role: 'employee' });
        const result = await applyLeaveHandler(event);
        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body)).toEqual({ message: 'Invalid input' });
    });

    it('returns 400 if manager not found', async () => {
        ddbMock.on(GetCommand).resolves({ Item: { userId: 'user1' } });
        const event = createEvent(
            { startDate: '2025-05-10', endDate: '2025-05-11', reason: 'vacation' },
            { userId: 'user1', role: 'employee' },
        );
        const result = await applyLeaveHandler(event);
        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body)).toEqual({ message: 'Manager not found' });
    });

    it('applies leave and returns 200 with leaveRequestId', async () => {
        ddbMock.on(GetCommand).resolves({ Item: { managerId: 'manager1' } });
        ddbMock.on(PutCommand).resolves({});
        sfnMock.on(StartExecutionCommand).resolves({});

        const event = createEvent(
            { startDate: '2025-05-10', endDate: '2025-05-11', reason: 'vacation' },
            { userId: 'user1', role: 'employee' },
        );
        const result = await applyLeaveHandler(event);

        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body).toHaveProperty('leaveRequestId');
        expect(typeof body.leaveRequestId).toBe('string');
        expect(body.leaveRequestId.length).toBeGreaterThan(0);

        expect(ddbMock.calls()).toHaveLength(2);
        expect(sfnMock.calls()).toHaveLength(1);
    });

    it('returns 500 if DynamoDB get throws error', async () => {
        ddbMock.on(GetCommand).rejects(new Error('DB Error'));
        const event = createEvent(
            { startDate: '2025-05-10', endDate: '2025-05-11', reason: 'vacation' },
            { userId: 'user1', role: 'employee' },
        );
        const result = await applyLeaveHandler(event);
        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toEqual({ message: 'Internal server error' });
    });

    it('returns 500 if Step Functions startExecution throws error', async () => {
        ddbMock.on(GetCommand).resolves({ Item: { managerId: 'manager1' } });
        ddbMock.on(PutCommand).resolves({});
        sfnMock.on(StartExecutionCommand).rejects(new Error('SFN Error'));

        const event = createEvent(
            { startDate: '2025-05-10', endDate: '2025-05-11', reason: 'vacation' },
            { userId: 'user1', role: 'employee' },
        );
        const result = await applyLeaveHandler(event);
        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toEqual({ message: 'Internal server error' });
    });
});
